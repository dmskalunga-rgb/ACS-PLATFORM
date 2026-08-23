import pg from 'pg';
import type {
  Contract,
  ContractAssign,
  ContractCreate,
  ContractLineCreate,
  ContractLineUpdate,
  ContractTransition,
  ContractUpdate,
} from '@acs/contracts';
import {
  ContractRegistryFailure,
  type ContractMutation,
  type ContractRepository,
} from './contract-registry.js';
const { Pool } = pg;
type Row = Omit<
  Contract,
  | 'lines'
  | 'version'
  | 'revision_number'
  | 'source_proposal_revision_number'
  | 'created_at'
  | 'updated_at'
  | 'effective_from'
  | 'effective_until'
  | 'approved_at'
> & {
  tenant_id: string;
  version: string;
  revision_number: string;
  source_proposal_revision_number: string;
  created_at: Date | string;
  updated_at: Date | string;
  effective_from: Date | string | null;
  effective_until: Date | string | null;
  approved_at: Date | string | null;
};
type Line = Contract['lines'][number] & { created_at: Date | string; updated_at: Date | string };
export type ContractTestTransactionPhase =
  | 'after-aggregate-mutation'
  | 'after-line-mutation'
  | 'after-audit'
  | 'after-outbox'
  | 'after-revision-snapshot'
  | 'before-commit';
const cols =
  'tenant_id,id,source_proposal_id,source_proposal_revision_number,source_proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,status,effective_from,effective_until,revision_number,version,contract_subtotal::text,grand_total::text,approved_by_membership_id,approved_at,created_at,updated_at';

export class PostgresContractRegistryRepository implements ContractRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly testOnlyTransactionFailure?: (phase: ContractTestTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, t: string, id: string) {
    return this.tx(token, 'commercial.contract.read', (c) => this.find(c, t, id));
  }
  async list(token: string, t: string, limit: number, cursor?: string) {
    return this.tx(token, 'commercial.contract.read', async (c) => {
      const r = await c.query<Row>(
        `SELECT ${cols} FROM commercial.contracts WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [t, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        contracts: await Promise.all(rows.map((x) => this.withLines(c, x))),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: ContractMutation & ContractCreate) {
    return this.mutate(input, async (c) => {
      const source = await c.query<
        Row & { proposal_subtotal: string; proposal_grand_total: string }
      >(
        `SELECT p.tenant_id,p.id source_proposal_id,p.revision_number source_proposal_revision_number,p.proposal_code source_proposal_code,coalesce($3,p.title) title,p.opportunity_id,p.customer_id,p.partner_id,coalesce($4::uuid,p.owner_membership_id) owner_membership_id,p.created_by_membership_id,p.currency_code,p.proposal_subtotal::text,p.grand_total::text proposal_grand_total FROM commercial.proposals p WHERE p.id=$1 AND p.tenant_id=$2 AND p.status='ACCEPTED'`,
        [
          input.source_proposal_id,
          input.tenantId,
          input.title ?? null,
          input.owner_membership_id ?? null,
        ],
      );
      if (!source.rowCount)
        throw new ContractRegistryFailure(
          'INVALID_REFERENCE',
          'Accepted source proposal is unavailable.',
        );
      const s = source.rows[0]!;
      await this.member(c, input.tenantId, s.owner_membership_id);
      const r = await c.query<Row>(
        `INSERT INTO commercial.contracts(tenant_id,source_proposal_id,source_proposal_revision_number,source_proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,contract_subtotal,grand_total,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING ${cols}`,
        [
          input.tenantId,
          s.source_proposal_id,
          s.source_proposal_revision_number,
          s.source_proposal_code,
          s.title,
          s.opportunity_id,
          s.customer_id,
          s.partner_id,
          s.owner_membership_id,
          await this.actorMembership(c, input.tenantId, input.actorUserId),
          s.currency_code,
          s.proposal_subtotal,
          s.proposal_grand_total,
          input.actorUserId,
        ],
      );
      await c.query(
        `INSERT INTO commercial.contract_line_items(contract_id,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) SELECT $1,tenant_id,line_number,id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal FROM commercial.proposal_line_items WHERE proposal_id=$2 AND tenant_id=$3`,
        [r.rows[0]!.id, s.source_proposal_id, input.tenantId],
      );
      return {
        row: r.rows[0]!,
        event: 'commercial.contract.created',
        fields: ['source_proposal_id', 'title', 'currency_code'],
      };
    });
  }
  async update(input: ContractMutation & ContractUpdate & { contractId: string }) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.contractId);
      this.editable(old);
      this.stale(old, input.expected_version);
      const from =
        input.effective_from === undefined ? date(old.effective_from) : input.effective_from;
      const until =
        input.effective_until === undefined ? date(old.effective_until) : input.effective_until;
      if (from && until && new Date(until) <= new Date(from))
        throw new ContractRegistryFailure('INVALID_VALUE', 'Effective date range is invalid.');
      const r = await c.query<Row>(
        `UPDATE commercial.contracts SET title=$1,effective_from=$2,effective_until=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp() WHERE id=$5 AND tenant_id=$6 RETURNING ${cols}`,
        [
          input.title ?? old.title,
          from,
          until,
          input.actorUserId,
          input.contractId,
          input.tenantId,
        ],
      );
      return { row: r.rows[0]!, event: null, fields: ['draft'] };
    });
  }
  async assign(input: ContractMutation & ContractAssign & { contractId: string }) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.contractId);
      this.stale(old, input.expected_version);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(old.status))
        throw new ContractRegistryFailure('INVALID_TRANSITION', 'Contract owner is locked.');
      await this.member(c, input.tenantId, input.owner_membership_id);
      const r = await c.query<Row>(
        `UPDATE commercial.contracts SET owner_membership_id=$1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 RETURNING ${cols}`,
        [input.owner_membership_id, input.actorUserId, input.contractId, input.tenantId],
      );
      return { row: r.rows[0]!, event: null, fields: ['owner_membership_id'] };
    });
  }
  async line(
    input: ContractMutation &
      (ContractLineCreate | ContractLineUpdate | ContractTransition) & {
        contractId: string;
        lineId?: string;
        operation: 'create' | 'update' | 'delete';
      },
  ) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.contractId);
      this.editable(old);
      this.stale(old, input.expected_version);
      if (input.operation === 'create') {
        const v = input as ContractLineCreate;
        const source = await c.query<Line>(
          `SELECT pli.id source_proposal_line_item_id,pli.plan_id,pli.plan_name_snapshot,pli.description_snapshot FROM commercial.proposal_line_items pli WHERE pli.proposal_id=$1 AND pli.tenant_id=$2 AND pli.plan_id=$3 LIMIT 1`,
          [old.source_proposal_id, input.tenantId, v.plan_id],
        );
        if (!source.rowCount)
          throw new ContractRegistryFailure(
            'INVALID_REFERENCE',
            'Contract line reference is unavailable.',
          );
        const n = await c.query<{ n: number }>(
          'SELECT coalesce(max(line_number),0)+1 n FROM commercial.contract_line_items WHERE contract_id=$1',
          [input.contractId],
        );
        await c.query(
          `INSERT INTO commercial.contract_line_items(contract_id,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,round($8::numeric*$9::numeric,4))`,
          [
            input.contractId,
            input.tenantId,
            n.rows[0]!.n,
            source.rows[0]!.source_proposal_line_item_id,
            v.plan_id,
            source.rows[0]!.plan_name_snapshot,
            source.rows[0]!.description_snapshot,
            v.quantity,
            v.unit_price,
          ],
        );
      } else if (input.operation === 'update') {
        if (!input.lineId)
          throw new ContractRegistryFailure('NOT_FOUND', 'Contract line was not found.');
        const current = await c.query<Line>(
          'SELECT * FROM commercial.contract_line_items WHERE id=$1 AND contract_id=$2 AND tenant_id=$3 FOR UPDATE',
          [input.lineId, input.contractId, input.tenantId],
        );
        if (!current.rowCount)
          throw new ContractRegistryFailure('NOT_FOUND', 'Contract line was not found.');
        const v = input as ContractLineUpdate;
        await c.query(
          'UPDATE commercial.contract_line_items SET quantity=$1,unit_price=$2,line_subtotal=round($1::numeric*$2::numeric,4),updated_at=clock_timestamp() WHERE id=$3',
          [
            v.quantity ?? current.rows[0]!.quantity,
            v.unit_price ?? current.rows[0]!.unit_price,
            input.lineId,
          ],
        );
      } else {
        if (!input.lineId)
          throw new ContractRegistryFailure('NOT_FOUND', 'Contract line was not found.');
        const d = await c.query(
          'DELETE FROM commercial.contract_line_items WHERE id=$1 AND contract_id=$2 AND tenant_id=$3',
          [input.lineId, input.contractId, input.tenantId],
        );
        if (!d.rowCount)
          throw new ContractRegistryFailure('NOT_FOUND', 'Contract line was not found.');
      }
      this.testOnlyTransactionFailure?.('after-line-mutation');
      const row = await this.retotal(c, input);
      return { row, event: null, fields: ['line'] };
    });
  }
  async transition(
    input: ContractMutation & ContractTransition & { contractId: string; transition: string },
  ) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.contractId);
      this.stale(old, input.expected_version);
      const transitions: Record<string, { from: string[]; to: string; event: string | null }> = {
        submit: { from: ['DRAFT'], to: 'PENDING_APPROVAL', event: null },
        'return-to-draft': { from: ['PENDING_APPROVAL'], to: 'DRAFT', event: null },
        approve: {
          from: ['PENDING_APPROVAL'],
          to: 'APPROVED',
          event: 'commercial.contract.approved',
        },
        revise: { from: ['APPROVED'], to: 'DRAFT', event: 'commercial.contract.revision_created' },
        activate: { from: ['APPROVED'], to: 'ACTIVE', event: 'commercial.contract.activated' },
        cancel: { from: ['APPROVED'], to: 'CANCELLED', event: 'commercial.contract.cancelled' },
        terminate: { from: ['ACTIVE'], to: 'TERMINATED', event: 'commercial.contract.terminated' },
      };
      const tr = transitions[input.transition];
      if (!tr?.from.includes(old.status))
        throw new ContractRegistryFailure(
          ['CANCELLED', 'TERMINATED'].includes(old.status)
            ? 'TERMINAL_CONTRACT'
            : 'INVALID_TRANSITION',
          'Contract lifecycle transition is not allowed.',
        );
      const actor = await this.actorMembership(c, input.tenantId, input.actorUserId);
      if (input.transition === 'approve' && actor === old.created_by_membership_id)
        throw new ContractRegistryFailure(
          'SOD_DENIED',
          'Contract creator cannot approve the contract.',
        );
      if (input.transition === 'activate') {
        if (!old.effective_from || new Date(old.effective_from) > new Date())
          throw new ContractRegistryFailure(
            'INVALID_VALUE',
            'Contract cannot activate before its effective date.',
          );
        if (old.effective_until && new Date(old.effective_until) <= new Date(old.effective_from))
          throw new ContractRegistryFailure('INVALID_VALUE', 'Effective date range is invalid.');
      }
      if (input.transition === 'revise') {
        await this.snapshot(c, old);
        this.testOnlyTransactionFailure?.('after-revision-snapshot');
      }
      const clear = ['return-to-draft', 'revise'].includes(input.transition);
      const approver = input.transition === 'approve' ? actor : null;
      const r = await c.query<Row>(
        `UPDATE commercial.contracts SET status=$1,revision_number=revision_number+$2,approved_by_membership_id=CASE WHEN $4 THEN NULL WHEN $3::uuid IS NULL THEN approved_by_membership_id ELSE $3 END,approved_at=CASE WHEN $4 THEN NULL WHEN $3::uuid IS NULL THEN approved_at ELSE clock_timestamp() END,version=version+1,updated_by=$5,updated_at=clock_timestamp() WHERE id=$6 AND tenant_id=$7 RETURNING ${cols}`,
        [
          tr.to,
          input.transition === 'revise' ? 1 : 0,
          approver,
          clear,
          input.actorUserId,
          input.contractId,
          input.tenantId,
        ],
      );
      return { row: r.rows[0]!, event: tr.event, fields: [input.transition] };
    });
  }
  private async mutate(
    input: ContractMutation,
    work: (c: pg.PoolClient) => Promise<{ row: Row; event: string | null; fields: string[] }>,
  ) {
    return this.tx(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.idempotencyKey,
      ]);
      const prior = await c.query<{ request_hash: string; result: { row: Row } }>(
        'SELECT request_hash,result FROM commercial.contract_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new ContractRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used.',
          );
        return { contract: await this.withLines(c, prior.rows[0].result.row), replay: true };
      }
      const result = await work(c);
      this.testOnlyTransactionFailure?.('after-aggregate-mutation');
      const contract = await this.withLines(c, result.row);
      await c.query(
        "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint,'revision_number',$9::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          input.auditAction ?? input.action,
          `commercial:contract:${result.row.id}`,
          input.correlationId,
          input.requestId,
          result.fields,
          Number(result.row.version),
          Number(result.row.revision_number),
        ],
      );
      this.testOnlyTransactionFailure?.('after-audit');
      if (result.event)
        await c.query(
          "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'status',$7::text,'revision_number',$8::bigint,'source_proposal_id',$9::uuid))",
          [
            result.event,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            result.row.id,
            Number(result.row.version),
            result.row.status,
            Number(result.row.revision_number),
            result.row.source_proposal_id,
          ],
        );
      this.testOnlyTransactionFailure?.('after-outbox');
      await c.query(
        'INSERT INTO commercial.contract_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
      return { contract, replay: false };
    });
  }
  private async must(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query<Row>(
      `SELECT ${cols} FROM commercial.contracts WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [t, id],
    );
    if (!r.rowCount) throw new ContractRegistryFailure('NOT_FOUND', 'Contract was not found.');
    return r.rows[0]!;
  }
  private async find(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query<Row>(
      `SELECT ${cols} FROM commercial.contracts WHERE tenant_id=$1 AND id=$2`,
      [t, id],
    );
    return r.rows[0] ? this.withLines(c, r.rows[0]) : null;
  }
  private async withLines(c: pg.PoolClient, row: Row): Promise<Contract> {
    const lines = await c.query<Line>(
      'SELECT id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity::text,unit_price::text,line_subtotal::text,created_at,updated_at FROM commercial.contract_line_items WHERE contract_id=$1 ORDER BY line_number',
      [row.id],
    );
    return {
      ...row,
      version: Number(row.version),
      revision_number: Number(row.revision_number),
      source_proposal_revision_number: Number(row.source_proposal_revision_number),
      effective_from: date(row.effective_from),
      effective_until: date(row.effective_until),
      approved_at: date(row.approved_at),
      created_at: date(row.created_at)!,
      updated_at: date(row.updated_at)!,
      lines: lines.rows.map((x) => ({
        ...x,
        created_at: date(x.created_at)!,
        updated_at: date(x.updated_at)!,
      })),
    };
  }
  private stale(row: Row, v: number) {
    if (Number(row.version) !== v)
      throw new ContractRegistryFailure('STALE_VERSION', 'Contract version is stale.');
  }
  private editable(row: Row) {
    if (row.status !== 'DRAFT')
      throw new ContractRegistryFailure(
        ['CANCELLED', 'TERMINATED'].includes(row.status)
          ? 'TERMINAL_CONTRACT'
          : 'INVALID_TRANSITION',
        'Contract content is locked.',
      );
  }
  private async member(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query(
      "SELECT 1 FROM platform.memberships WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'",
      [id, t],
    );
    if (!r.rowCount)
      throw new ContractRegistryFailure('INVALID_REFERENCE', 'Contract reference is unavailable.');
  }
  private async actorMembership(c: pg.PoolClient, t: string, user: string) {
    const r = await c.query<{ id: string }>(
      "SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
      [t, user],
    );
    if (!r.rowCount)
      throw new ContractRegistryFailure('FORBIDDEN', 'Active membership is required.');
    return r.rows[0]!.id;
  }
  private async retotal(c: pg.PoolClient, input: ContractMutation & { contractId: string }) {
    const r = await c.query<Row>(
      `UPDATE commercial.contracts SET contract_subtotal=(SELECT coalesce(sum(line_subtotal),0) FROM commercial.contract_line_items WHERE contract_id=$1),grand_total=(SELECT coalesce(sum(line_subtotal),0) FROM commercial.contract_line_items WHERE contract_id=$1),version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 AND tenant_id=$3 RETURNING ${cols}`,
      [input.contractId, input.actorUserId, input.tenantId],
    );
    return r.rows[0]!;
  }
  private async snapshot(c: pg.PoolClient, row: Row) {
    const revision = await c.query<{ id: string }>(
      `INSERT INTO commercial.contract_revisions(contract_id,tenant_id,revision_number,source_proposal_id,source_proposal_revision_number,source_proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,status,effective_from,effective_until,contract_subtotal,grand_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [
        row.id,
        row.tenant_id,
        row.revision_number,
        row.source_proposal_id,
        row.source_proposal_revision_number,
        row.source_proposal_code,
        row.title,
        row.opportunity_id,
        row.customer_id,
        row.partner_id,
        row.owner_membership_id,
        row.created_by_membership_id,
        row.currency_code,
        row.status,
        row.effective_from,
        row.effective_until,
        row.contract_subtotal,
        row.grand_total,
      ],
    );
    await c.query(
      `INSERT INTO commercial.contract_revision_line_items(contract_revision_id,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) SELECT $1,tenant_id,line_number,source_proposal_line_item_id,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal FROM commercial.contract_line_items WHERE contract_id=$2`,
      [revision.rows[0]!.id, row.id],
    );
  }
  private async tx<T>(token: string, action: string, work: (c: pg.PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new ContractRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const result = await work(c);
      this.testOnlyTransactionFailure?.('before-commit');
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === '23505')
          throw new ContractRegistryFailure(
            'DUPLICATE_CONTRACT',
            'A Contract already exists for the source Proposal.',
          );
        if (['22003', '22P02', '23514'].includes(String(error.code)))
          throw new ContractRegistryFailure(
            'INVALID_VALUE',
            'Contract contains an invalid constrained value.',
          );
      }
      throw error;
    } finally {
      c.release();
    }
  }
}
const date = (value: Date | string | null | undefined) =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;
