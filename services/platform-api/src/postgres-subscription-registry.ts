import pg from 'pg';
import type {
  Subscription,
  SubscriptionAssign,
  SubscriptionCreate,
  SubscriptionRenew,
  SubscriptionTransition,
  SubscriptionUpdate,
} from '@acs/contracts';
import {
  SubscriptionRegistryFailure,
  type SubscriptionMutation,
  type SubscriptionRepository,
} from './subscription-registry.js';

const { Pool } = pg;
type Row = Omit<
  Subscription,
  | 'source_contract_revision_number'
  | 'revision_number'
  | 'version'
  | 'effective_from'
  | 'effective_until'
  | 'created_at'
  | 'updated_at'
> & {
  tenant_id: string;
  source_contract_revision_number: string;
  revision_number: string;
  version: string;
  effective_from: Date | string;
  effective_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type ContractOrigin = {
  id: string;
  revision_number: string;
  customer_id: string | null;
  owner_membership_id: string;
  effective_from: Date | string | null;
};
export type SubscriptionTestTransactionPhase =
  | 'after-subscription-mutation'
  | 'after-history'
  | 'after-audit'
  | 'after-outbox'
  | 'after-idempotency'
  | 'before-commit';

const columns =
  'tenant_id,id,source_contract_id,source_contract_revision_number,customer_id,owner_membership_id,created_by_membership_id,status,effective_from,effective_until,revision_number,version,created_at,updated_at';

export class PostgresSubscriptionRegistryRepository implements SubscriptionRepository {
  private readonly pool: pg.Pool;

  constructor(
    url: string,
    private readonly testOnlyTransactionFailure?: (phase: SubscriptionTestTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  async get(token: string, tenantId: string, id: string) {
    return this.transaction(token, 'commercial.subscription.read', async (client) => {
      const result = await client.query<Row>(
        `SELECT ${columns} FROM commercial.subscriptions WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
      );
      return result.rows[0] ? mapRow(result.rows[0]) : null;
    });
  }

  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.transaction(token, 'commercial.subscription.read', async (client) => {
      const result = await client.query<Row>(
        `SELECT ${columns} FROM commercial.subscriptions WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = result.rows.slice(0, limit);
      return {
        subscriptions: rows.map(mapRow),
        nextCursor: result.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }

  async create(input: SubscriptionMutation & SubscriptionCreate) {
    return this.mutate(input, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.contract_id,
      ]);
      const origin = await this.contractOrigin(client, input.tenantId, input.contract_id);
      if (!origin.customer_id)
        throw new SubscriptionRegistryFailure(
          'INVALID_REFERENCE',
          'Active Contract origin is unavailable.',
        );
      const start = new Date(input.effective_from);
      if (origin.effective_from && start < new Date(origin.effective_from))
        throw new SubscriptionRegistryFailure(
          'INVALID_VALUE',
          'Subscription start precedes Contract authority.',
        );
      validateDates(input.effective_from, input.effective_until ?? null);
      const creator = await this.actorMembership(client, input.tenantId, input.actorUserId);
      const owner = input.owner_membership_id ?? origin.owner_membership_id;
      await this.member(client, input.tenantId, owner);
      const inserted = await client.query<Row>(
        `INSERT INTO commercial.subscriptions(tenant_id,source_contract_id,source_contract_revision_number,customer_id,owner_membership_id,created_by_membership_id,effective_from,effective_until,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING ${columns}`,
        [
          input.tenantId,
          origin.id,
          origin.revision_number,
          origin.customer_id,
          owner,
          creator,
          input.effective_from,
          input.effective_until ?? null,
          input.actorUserId,
        ],
      );
      const row = inserted.rows[0]!;
      await client.query(
        `INSERT INTO commercial.subscription_plan_origins(subscription_id,tenant_id,source_contract_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity) SELECT $1,tenant_id,id,plan_id,plan_name_snapshot,description_snapshot,quantity FROM commercial.contract_line_items WHERE contract_id=$2 AND tenant_id=$3`,
        [row.id, origin.id, input.tenantId],
      );
      await this.snapshot(client, row);
      return { row, event: 'commercial.subscription.created', fields: ['source_contract_id'] };
    });
  }

  async update(input: SubscriptionMutation & SubscriptionUpdate & { subscriptionId: string }) {
    return this.mutate(input, async (client) => {
      const old = await this.must(client, input.tenantId, input.subscriptionId);
      this.requireStatus(old, ['DRAFT']);
      this.stale(old, input.expected_version);
      const start = input.effective_from ?? iso(old.effective_from)!;
      const end =
        input.effective_until === undefined ? iso(old.effective_until) : input.effective_until;
      validateDates(start, end);
      const origin = await this.contractOrigin(client, input.tenantId, old.source_contract_id);
      if (origin.effective_from && new Date(start) < new Date(origin.effective_from))
        throw new SubscriptionRegistryFailure(
          'INVALID_VALUE',
          'Subscription start precedes Contract authority.',
        );
      const result = await client.query<Row>(
        `UPDATE commercial.subscriptions SET effective_from=$1,effective_until=$2,revision_number=revision_number+1,version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE id=$4 AND tenant_id=$5 RETURNING ${columns}`,
        [start, end, input.actorUserId, input.subscriptionId, input.tenantId],
      );
      await this.snapshot(client, result.rows[0]!);
      return { row: result.rows[0]!, event: 'commercial.subscription.updated', fields: ['dates'] };
    });
  }

  async assign(input: SubscriptionMutation & SubscriptionAssign & { subscriptionId: string }) {
    return this.mutate(input, async (client) => {
      const old = await this.must(client, input.tenantId, input.subscriptionId);
      this.requireStatus(old, ['DRAFT', 'PENDING_ACTIVATION']);
      this.stale(old, input.expected_version);
      await this.member(client, input.tenantId, input.owner_membership_id);
      const result = await client.query<Row>(
        `UPDATE commercial.subscriptions SET owner_membership_id=$1,revision_number=revision_number+1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 RETURNING ${columns}`,
        [input.owner_membership_id, input.actorUserId, input.subscriptionId, input.tenantId],
      );
      await this.snapshot(client, result.rows[0]!);
      return { row: result.rows[0]!, event: 'commercial.subscription.assigned', fields: ['owner'] };
    });
  }

  async transition(
    input: SubscriptionMutation &
      SubscriptionTransition & { subscriptionId: string; transition: string },
  ) {
    return this.mutate(input, async (client) => {
      const old = await this.must(client, input.tenantId, input.subscriptionId);
      this.stale(old, input.expected_version);
      const transitions: Record<string, { from: string[]; to: string }> = {
        'request-activation': { from: ['DRAFT'], to: 'PENDING_ACTIVATION' },
        activate: { from: ['PENDING_ACTIVATION'], to: 'ACTIVE' },
        suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
        resume: { from: ['SUSPENDED'], to: 'ACTIVE' },
        cancel: { from: ['ACTIVE', 'SUSPENDED'], to: 'CANCELLED' },
        terminate: { from: ['ACTIVE', 'SUSPENDED'], to: 'TERMINATED' },
      };
      const transition = transitions[input.transition];
      if (!transition?.from.includes(old.status)) this.invalidTransition(old);
      if (input.transition === 'activate') {
        const actor = await this.actorMembership(client, input.tenantId, input.actorUserId);
        if (actor === old.created_by_membership_id)
          throw new SubscriptionRegistryFailure(
            'SOD_DENIED',
            'Subscription creator cannot activate the Subscription.',
          );
        validateDates(iso(old.effective_from)!, iso(old.effective_until));
        const origin = await this.contractOrigin(client, input.tenantId, old.source_contract_id);
        if (origin.effective_from && new Date(old.effective_from) < new Date(origin.effective_from))
          throw new SubscriptionRegistryFailure(
            'INVALID_VALUE',
            'Subscription start precedes Contract authority.',
          );
      }
      const result = await client.query<Row>(
        `UPDATE commercial.subscriptions SET status=$1,revision_number=revision_number+1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 RETURNING ${columns}`,
        [transition.to, input.actorUserId, input.subscriptionId, input.tenantId],
      );
      await this.snapshot(client, result.rows[0]!);
      return {
        row: result.rows[0]!,
        event: `commercial.subscription.${input.transition.replace('-', '_')}`,
        fields: ['status'],
      };
    });
  }

  async renew(input: SubscriptionMutation & SubscriptionRenew & { subscriptionId: string }) {
    return this.mutate(input, async (client) => {
      const old = await this.must(client, input.tenantId, input.subscriptionId);
      this.requireStatus(old, ['ACTIVE']);
      this.stale(old, input.expected_version);
      if (!old.effective_until || new Date(input.effective_until) <= new Date(old.effective_until))
        throw new SubscriptionRegistryFailure(
          'INVALID_VALUE',
          'Renewal end must extend the current defined end.',
        );
      const result = await client.query<Row>(
        `UPDATE commercial.subscriptions SET effective_until=$1,revision_number=revision_number+1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 RETURNING ${columns}`,
        [input.effective_until, input.actorUserId, input.subscriptionId, input.tenantId],
      );
      await this.snapshot(client, result.rows[0]!);
      return {
        row: result.rows[0]!,
        event: 'commercial.subscription.renewed',
        fields: ['renewal'],
      };
    });
  }

  private async mutate(
    input: SubscriptionMutation,
    work: (client: pg.PoolClient) => Promise<{ row: Row; event: string | null; fields: string[] }>,
  ) {
    return this.transaction(input.contextToken, input.action, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.idempotencyKey,
      ]);
      const prior = await client.query<{ request_hash: string; result: { row: Row } }>(
        'SELECT request_hash,result FROM commercial.subscription_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new SubscriptionRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used.',
          );
        return { subscription: mapRow(prior.rows[0].result.row), replay: true };
      }
      const result = await work(client);
      this.testOnlyTransactionFailure?.('after-subscription-mutation');
      await client.query(
        `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint,'revision_number',$9::bigint))`,
        [
          input.tenantId,
          input.actorUserId,
          input.action,
          `commercial:subscription:${result.row.id}`,
          input.correlationId,
          input.requestId,
          result.fields,
          result.row.version,
          result.row.revision_number,
        ],
      );
      this.testOnlyTransactionFailure?.('after-audit');
      if (result.event)
        await client.query(
          `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'status',$7::text,'revision_number',$8::bigint,'source_contract_id',$9::uuid))`,
          [
            result.event,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            result.row.id,
            result.row.version,
            result.row.status,
            result.row.revision_number,
            result.row.source_contract_id,
          ],
        );
      this.testOnlyTransactionFailure?.('after-outbox');
      await client.query(
        `INSERT INTO commercial.subscription_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          input.action,
          result.row.id,
          input.requestHash,
          { row: result.row },
        ],
      );
      this.testOnlyTransactionFailure?.('after-idempotency');
      return { subscription: mapRow(result.row), replay: false };
    });
  }

  private async must(client: pg.PoolClient, tenantId: string, id: string) {
    const result = await client.query<Row>(
      `SELECT ${columns} FROM commercial.subscriptions WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenantId, id],
    );
    if (!result.rowCount)
      throw new SubscriptionRegistryFailure('NOT_FOUND', 'Subscription was not found.');
    return result.rows[0]!;
  }

  private async contractOrigin(client: pg.PoolClient, tenantId: string, contractId: string) {
    const result = await client.query<ContractOrigin>(
      `SELECT id,revision_number,customer_id,owner_membership_id,effective_from FROM commercial.contracts WHERE tenant_id=$1 AND id=$2 AND status='ACTIVE'`,
      [tenantId, contractId],
    );
    if (!result.rowCount)
      throw new SubscriptionRegistryFailure(
        'INVALID_REFERENCE',
        'Active Contract origin is unavailable.',
      );
    return result.rows[0]!;
  }

  private async member(client: pg.PoolClient, tenantId: string, membershipId: string) {
    const result = await client.query(
      `SELECT 1 FROM platform.memberships WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
      [membershipId, tenantId],
    );
    if (!result.rowCount)
      throw new SubscriptionRegistryFailure(
        'INVALID_REFERENCE',
        'Subscription reference is unavailable.',
      );
  }

  private async actorMembership(client: pg.PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'`,
      [tenantId, userId],
    );
    if (!result.rowCount)
      throw new SubscriptionRegistryFailure('FORBIDDEN', 'Active membership is required.');
    return result.rows[0]!.id;
  }

  private async snapshot(client: pg.PoolClient, row: Row) {
    await client.query(
      `INSERT INTO commercial.subscription_revisions(subscription_id,tenant_id,revision_number,source_contract_id,source_contract_revision_number,customer_id,owner_membership_id,status,effective_from,effective_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.id,
        row.tenant_id,
        row.revision_number,
        row.source_contract_id,
        row.source_contract_revision_number,
        row.customer_id,
        row.owner_membership_id,
        row.status,
        row.effective_from,
        row.effective_until,
      ],
    );
    this.testOnlyTransactionFailure?.('after-history');
  }

  private stale(row: Row, expected: number) {
    if (Number(row.version) !== expected)
      throw new SubscriptionRegistryFailure('STALE_VERSION', 'Subscription version is stale.');
  }

  private requireStatus(row: Row, allowed: string[]) {
    if (!allowed.includes(row.status)) this.invalidTransition(row);
  }

  private invalidTransition(row: Row): never {
    throw new SubscriptionRegistryFailure(
      ['CANCELLED', 'TERMINATED'].includes(row.status)
        ? 'TERMINAL_SUBSCRIPTION'
        : 'INVALID_TRANSITION',
      'Subscription lifecycle transition is not allowed.',
    );
  }

  private async transaction<T>(
    token: string,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [token, action],
      );
      if (active.rowCount !== 1)
        throw new SubscriptionRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const result = await work(client);
      this.testOnlyTransactionFailure?.('before-commit');
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === '23505')
          throw new SubscriptionRegistryFailure(
            'DUPLICATE_SUBSCRIPTION',
            'A current Subscription already exists for the Contract.',
          );
        if (['22003', '22P02', '23514'].includes(String(error.code)))
          throw new SubscriptionRegistryFailure(
            'INVALID_VALUE',
            'Subscription contains an invalid constrained value.',
          );
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

const validateDates = (start: string, end: string | null) => {
  if (end && new Date(end) <= new Date(start))
    throw new SubscriptionRegistryFailure(
      'INVALID_VALUE',
      'Subscription effective date range is invalid.',
    );
};
const iso = (value: Date | string | null | undefined) =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;
const mapRow = (row: Row): Subscription => ({
  ...row,
  source_contract_revision_number: Number(row.source_contract_revision_number),
  revision_number: Number(row.revision_number),
  version: Number(row.version),
  effective_from: iso(row.effective_from)!,
  effective_until: iso(row.effective_until),
  created_at: iso(row.created_at)!,
  updated_at: iso(row.updated_at)!,
});
