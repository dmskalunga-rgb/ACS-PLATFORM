import pg from 'pg';
import type {
  Entitlement,
  EntitlementAssign,
  EntitlementCreate,
  EntitlementTransition,
  EntitlementUpdate,
} from '@acs/contracts';
import {
  EntitlementRegistryFailure,
  type EntitlementMutation,
  type EntitlementRepository,
} from './entitlement-registry.js';

const { Pool } = pg;
const columns =
  'id,subscription_id,customer_id,contract_id,source_contract_line_item_id,plan_id,plan_feature_id,content_model,owner_membership_id,created_by_membership_id,status,effective_from,effective_until,version,created_at,updated_at';
type Row = Omit<
  Entitlement,
  'effective_from' | 'effective_until' | 'created_at' | 'updated_at' | 'version'
> & {
  effective_from: Date | string;
  effective_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  version: string;
};

export class PostgresEntitlementRegistryRepository implements EntitlementRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly failureInjection?: (
      phase: 'after-history' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'pre-commit',
    ) => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, id: string) {
    return this.transaction(token, 'commercial.entitlement.read', async (c) => {
      const r = await c.query<Row>(
        `SELECT ${columns} FROM commercial.entitlements WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
      );
      return r.rows[0] ? map(r.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.transaction(token, 'commercial.entitlement.read', async (c) => {
      const r = await c.query<Row>(
        `SELECT ${columns} FROM commercial.entitlements WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        entitlements: rows.map(map),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: EntitlementMutation & EntitlementCreate) {
    return this.mutate(input, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.subscription_id,
      ]);
      const origin = await c.query<{
        id: string;
        customer_id: string;
        source_contract_id: string;
        effective_from: Date | string;
        effective_until: Date | string | null;
        line_id: string;
        plan_id: string;
      }>(
        `SELECT s.id,s.customer_id,s.source_contract_id,s.effective_from,s.effective_until,o.source_contract_line_item_id AS line_id,o.plan_id FROM commercial.subscriptions s JOIN commercial.subscription_plan_origins o ON o.subscription_id=s.id AND o.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND s.id=$2 AND s.status='ACTIVE' LIMIT 1`,
        [input.tenantId, input.subscription_id],
      );
      if (!origin.rows[0])
        throw new EntitlementRegistryFailure(
          'INVALID_REFERENCE',
          'Active Subscription origin is unavailable.',
        );
      const o = origin.rows[0];
      if (
        new Date(input.effective_from) < new Date(o.effective_from) ||
        (o.effective_until &&
          input.effective_until &&
          new Date(input.effective_until) > new Date(o.effective_until))
      )
        throw new EntitlementRegistryFailure(
          'INVALID_VALUE',
          'Entitlement effective dates exceed Subscription authority.',
        );
      const member = await c.query(
        "SELECT 1 FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1",
        [input.tenantId, input.actorUserId],
      );
      if (!member.rowCount)
        throw new EntitlementRegistryFailure('FORBIDDEN', 'Active membership is required.');
      const created = await c.query<Row>(
        `INSERT INTO commercial.entitlements(tenant_id,subscription_id,customer_id,contract_id,source_contract_line_item_id,plan_id,content_model,owner_membership_id,created_by_membership_id,effective_from,effective_until,created_by,updated_by) SELECT $1,$2,$3,$4,$5,$6,'PLAN_LINE_ACCESS',m.id,m.id,$7,$8,$9,$9 FROM platform.memberships m WHERE m.tenant_id=$1 AND m.user_id=$9 AND m.status='ACTIVE' RETURNING ${columns}`,
        [
          input.tenantId,
          o.id,
          o.customer_id,
          o.source_contract_id,
          o.line_id,
          o.plan_id,
          input.effective_from,
          input.effective_until ?? null,
          input.actorUserId,
        ],
      );
      if (!created.rows[0])
        throw new EntitlementRegistryFailure('FORBIDDEN', 'Active membership is required.');
      await this.history(c, input.tenantId, created.rows[0]);
      return { row: created.rows[0], event: 'commercial.entitlement.created' };
    });
  }
  async update(
    input: EntitlementMutation & EntitlementUpdate & { entitlementId: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }> {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.entitlementId);
      this.stale(old, input.expected_version);
      if (old.status !== 'DRAFT')
        throw new EntitlementRegistryFailure(
          old.status === 'CANCELLED' || old.status === 'TERMINATED'
            ? 'TERMINAL_ENTITLEMENT'
            : 'INVALID_TRANSITION',
          'Entitlement lifecycle transition is not allowed.',
        );
      const from = input.effective_from ?? iso(old.effective_from)!;
      const until =
        input.effective_until === undefined ? iso(old.effective_until) : input.effective_until;
      if (until && new Date(until) <= new Date(from))
        throw new EntitlementRegistryFailure(
          'INVALID_VALUE',
          'Entitlement effective date range is invalid.',
        );
      const r = await c.query<Row>(
        `UPDATE commercial.entitlements SET effective_from=$1,effective_until=$2,version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE id=$4 AND tenant_id=$5 AND version=$6 RETURNING ${columns}`,
        [
          from,
          until,
          input.actorUserId,
          input.entitlementId,
          input.tenantId,
          input.expected_version,
        ],
      );
      if (!r.rows[0])
        throw new EntitlementRegistryFailure('STALE_VERSION', 'Entitlement version is stale.');
      await this.history(c, input.tenantId, r.rows[0]);
      return { row: r.rows[0], event: 'commercial.entitlement.updated' };
    });
  }
  async assign(
    input: EntitlementMutation & EntitlementAssign & { entitlementId: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }> {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.entitlementId);
      this.stale(old, input.expected_version);
      if (!['DRAFT', 'PENDING_ACTIVATION'].includes(old.status))
        throw new EntitlementRegistryFailure(
          'INVALID_TRANSITION',
          'Entitlement lifecycle transition is not allowed.',
        );
      const member = await c.query(
        "SELECT 1 FROM platform.memberships WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'",
        [input.owner_membership_id, input.tenantId],
      );
      if (!member.rowCount)
        throw new EntitlementRegistryFailure('NOT_FOUND', 'Entitlement was not found.');
      const r = await c.query<Row>(
        `UPDATE commercial.entitlements SET owner_membership_id=$1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 AND version=$5 RETURNING ${columns}`,
        [
          input.owner_membership_id,
          input.actorUserId,
          input.entitlementId,
          input.tenantId,
          input.expected_version,
        ],
      );
      if (!r.rows[0])
        throw new EntitlementRegistryFailure('STALE_VERSION', 'Entitlement version is stale.');
      await this.history(c, input.tenantId, r.rows[0]);
      return { row: r.rows[0], event: 'commercial.entitlement.assigned' };
    });
  }
  async transition(
    input: EntitlementMutation &
      EntitlementTransition & { entitlementId: string; transition: string },
  ): Promise<{ entitlement: Entitlement; replay: boolean }> {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.entitlementId);
      this.stale(old, input.expected_version);
      const map: Record<string, { from: string[]; to: string }> = {
        'request-activation': { from: ['DRAFT'], to: 'PENDING_ACTIVATION' },
        activate: { from: ['PENDING_ACTIVATION'], to: 'ACTIVE' },
        suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
        resume: { from: ['SUSPENDED'], to: 'ACTIVE' },
        cancel: { from: ['ACTIVE', 'SUSPENDED'], to: 'CANCELLED' },
        terminate: { from: ['ACTIVE', 'SUSPENDED'], to: 'TERMINATED' },
      };
      const rule = map[input.transition];
      if (!rule || !rule.from.includes(old.status))
        throw new EntitlementRegistryFailure(
          ['CANCELLED', 'TERMINATED'].includes(old.status)
            ? 'TERMINAL_ENTITLEMENT'
            : 'INVALID_TRANSITION',
          'Entitlement lifecycle transition is not allowed.',
        );
      if (
        input.transition === 'activate' &&
        old.created_by_membership_id ===
          (await this.actorMembership(c, input.tenantId, input.actorUserId))
      )
        throw new EntitlementRegistryFailure(
          'SOD_DENIED',
          'Creator may not activate the Entitlement.',
        );
      const r = await c.query<Row>(
        `UPDATE commercial.entitlements SET status=$1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 AND version=$5 RETURNING ${columns}`,
        [rule.to, input.actorUserId, input.entitlementId, input.tenantId, input.expected_version],
      );
      if (!r.rows[0])
        throw new EntitlementRegistryFailure('STALE_VERSION', 'Entitlement version is stale.');
      await this.history(c, input.tenantId, r.rows[0]);
      return {
        row: r.rows[0],
        event: `commercial.entitlement.${input.transition.replaceAll('-', '_')}`,
      };
    });
  }
  private async must(c: pg.PoolClient, tenant: string, id: string) {
    const r = await c.query<Row>(
      `SELECT ${columns} FROM commercial.entitlements WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [tenant, id],
    );
    if (!r.rows[0]) throw new EntitlementRegistryFailure('NOT_FOUND', 'Entitlement was not found.');
    return r.rows[0];
  }
  private stale(row: Row, expected: number) {
    if (Number(row.version) !== expected)
      throw new EntitlementRegistryFailure('STALE_VERSION', 'Entitlement version is stale.');
  }
  private async actorMembership(c: pg.PoolClient, tenant: string, user: string) {
    const r = await c.query<{ id: string }>(
      `SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
      [tenant, user],
    );
    if (!r.rows[0])
      throw new EntitlementRegistryFailure('FORBIDDEN', 'Active membership is required.');
    return r.rows[0].id;
  }
  private async mutate(
    input: EntitlementMutation,
    fn: (c: pg.PoolClient) => Promise<{ row: Row; event: string }>,
  ) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.idempotencyKey,
      ]);
      const prior = await c.query<{ request_hash: string; result: Entitlement }>(
        `SELECT request_hash,result FROM commercial.entitlement_operations WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new EntitlementRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key payload conflicts.',
          );
        return { entitlement: prior.rows[0].result, replay: true };
      }
      const value = await fn(c);
      this.failureInjection?.('after-history');
      const entitlement = map(value.row);
      await c.query(
        `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('id',$7::uuid,'version',$8::bigint,'status',$9::text))`,
        [
          input.tenantId,
          input.actorUserId,
          input.action,
          'commercial:entitlement',
          input.correlationId,
          input.requestId,
          entitlement.id,
          entitlement.version,
          entitlement.status,
        ],
      );
      this.failureInjection?.('after-audit');
      await c.query(
        `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'status',$7::text,'subscription_id',$8::uuid))`,
        [
          value.event,
          input.tenantId,
          input.correlationId,
          input.requestId,
          entitlement.id,
          entitlement.version,
          entitlement.status,
          entitlement.subscription_id,
        ],
      );
      this.failureInjection?.('after-outbox');
      await c.query(
        `INSERT INTO commercial.entitlement_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          input.action,
          entitlement.id,
          input.requestHash,
          JSON.stringify(entitlement),
        ],
      );
      this.failureInjection?.('after-idempotency');
      return { entitlement, replay: false };
    });
  }
  private async history(c: pg.PoolClient, tenant: string, row: Row) {
    await c.query(
      `INSERT INTO commercial.entitlement_history(entitlement_id,tenant_id,version,subscription_id,customer_id,contract_id,source_contract_line_item_id,plan_id,plan_feature_id,owner_membership_id,status,effective_from,effective_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        row.id,
        tenant,
        row.version,
        row.subscription_id,
        row.customer_id,
        row.contract_id,
        row.source_contract_line_item_id,
        row.plan_id,
        row.plan_feature_id,
        row.owner_membership_id,
        row.status,
        row.effective_from,
        row.effective_until,
      ],
    );
  }
  private async transaction<T>(
    token: string,
    action: string,
    work: (c: pg.PoolClient) => Promise<T>,
  ) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new EntitlementRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const result = await work(c);
      this.failureInjection?.('pre-commit');
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505')
        throw new EntitlementRegistryFailure(
          'DUPLICATE_ENTITLEMENT',
          'A current Entitlement already exists for the Subscription origin.',
        );
      throw error;
    } finally {
      c.release();
    }
  }
}
const iso = (v: Date | string | null) =>
  v == null ? null : v instanceof Date ? v.toISOString() : v;
const map = (r: Row): Entitlement => ({
  ...r,
  version: Number(r.version),
  effective_from: iso(r.effective_from)!,
  effective_until: iso(r.effective_until),
  created_at: iso(r.created_at)!,
  updated_at: iso(r.updated_at)!,
});
