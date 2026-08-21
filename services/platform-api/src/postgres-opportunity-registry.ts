import pg from 'pg';
import type { Opportunity, OpportunityCreate, OpportunityUpdate } from '@acs/contracts';
import {
  OPPORTUNITY_CREATE,
  OpportunityRegistryFailure,
  type OpportunityMutation,
  type OpportunityRepository,
} from './opportunity-registry.js';
const { Pool } = pg;
type Row = Omit<Opportunity, 'version' | 'created_at' | 'updated_at' | 'expected_close_date'> & {
  version: string;
  expected_close_date: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};
const COLUMNS =
  'id,opportunity_code,title,owner_membership_id,customer_id,lead_id,partner_id,plan_id,probability_percent,expected_close_date,stage,version,created_at,updated_at';
const allowedTransitions: Record<string, readonly string[]> = {
  QUALIFICATION: ['DISCOVERY', 'LOST'],
  DISCOVERY: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export class PostgresOpportunityRegistryRepository implements OpportunityRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly testBeforeCommit?: () => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, opportunityId: string) {
    return this.tx(token, 'commercial.opportunity.read', async (c) => {
      const r = await c.query<Row>(
        `SELECT ${COLUMNS} FROM commercial.opportunities WHERE tenant_id=$1 AND id=$2`,
        [tenantId, opportunityId],
      );
      return r.rows[0] ? map(r.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.tx(token, 'commercial.opportunity.read', async (c) => {
      const r = await c.query<Row>(
        `SELECT ${COLUMNS} FROM commercial.opportunities WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        opportunities: rows.map(map),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: OpportunityMutation & OpportunityCreate) {
    return this.mutate(input, OPPORTUNITY_CREATE, async (c) => {
      await this.references(c, input.tenantId, input);
      const r = await c.query<Row>(
        `INSERT INTO commercial.opportunities(tenant_id,opportunity_code,title,owner_membership_id,customer_id,lead_id,partner_id,plan_id,probability_percent,expected_close_date,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING ${COLUMNS}`,
        [
          input.tenantId,
          input.opportunity_code,
          input.title,
          input.owner_membership_id,
          input.customer_id ?? null,
          input.lead_id ?? null,
          input.partner_id ?? null,
          input.plan_id ?? null,
          input.probability_percent ?? null,
          input.expected_close_date ?? null,
          input.actorUserId,
        ],
      );
      return {
        entity: r.rows[0]!,
        fields: [
          'opportunity_code',
          'title',
          'owner_membership_id',
          'customer_id',
          'lead_id',
          'partner_id',
          'plan_id',
          'probability_percent',
          'expected_close_date',
        ],
        event: 'commercial.opportunity.created',
      };
    }).then((r) => ({ opportunity: map(r.entity), replay: r.replay }));
  }
  async update(
    input: OpportunityMutation & OpportunityUpdate & { opportunityId: string; action: string },
  ) {
    return this.mutate(input, input.action, async (c) => {
      const current = await c.query<Row>(
        `SELECT ${COLUMNS} FROM commercial.opportunities WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [input.tenantId, input.opportunityId],
      );
      const old = current.rows[0];
      if (!old) throw new OpportunityRegistryFailure('NOT_FOUND', 'Opportunity was not found.');
      if (Number(old.version) !== input.expected_version)
        throw new OpportunityRegistryFailure('STALE_VERSION', 'Opportunity version is stale.');
      if (old.stage === 'WON' || old.stage === 'LOST')
        throw new OpportunityRegistryFailure(
          'TERMINAL_OPPORTUNITY',
          'Terminal opportunities cannot be changed.',
        );
      if (
        input.stage !== undefined &&
        input.stage !== old.stage &&
        !allowedTransitions[old.stage]?.includes(input.stage)
      )
        throw new OpportunityRegistryFailure(
          'INVALID_TRANSITION',
          'Opportunity lifecycle transition is not allowed.',
        );
      const next = {
        opportunity_code: input.opportunity_code ?? old.opportunity_code,
        title: input.title ?? old.title,
        owner_membership_id: input.owner_membership_id ?? old.owner_membership_id,
        customer_id: input.customer_id === undefined ? old.customer_id : input.customer_id,
        lead_id: input.lead_id === undefined ? old.lead_id : input.lead_id,
        partner_id: input.partner_id === undefined ? old.partner_id : input.partner_id,
        plan_id: input.plan_id === undefined ? old.plan_id : input.plan_id,
        probability_percent:
          input.probability_percent === undefined
            ? old.probability_percent
            : input.probability_percent,
        expected_close_date:
          input.expected_close_date === undefined
            ? old.expected_close_date
            : input.expected_close_date,
        stage: input.stage ?? old.stage,
      };
      await this.references(c, input.tenantId, next);
      const fields = Object.keys(next).filter(
        (key) => next[key as keyof typeof next] !== old[key as keyof Row],
      );
      if (!fields.length) return { entity: old, fields, event: 'commercial.opportunity.updated' };
      const r = await c.query<Row>(
        `UPDATE commercial.opportunities SET opportunity_code=$1,title=$2,owner_membership_id=$3,customer_id=$4,lead_id=$5,partner_id=$6,plan_id=$7,probability_percent=$8,expected_close_date=$9,stage=$10,version=version+1,updated_by=$11,updated_at=clock_timestamp() WHERE tenant_id=$12 AND id=$13 RETURNING ${COLUMNS}`,
        [
          next.opportunity_code,
          next.title,
          next.owner_membership_id,
          next.customer_id,
          next.lead_id,
          next.partner_id,
          next.plan_id,
          next.probability_percent,
          next.expected_close_date,
          next.stage,
          input.actorUserId,
          input.tenantId,
          input.opportunityId,
        ],
      );
      return {
        entity: r.rows[0]!,
        fields,
        event: fields.includes('stage')
          ? 'commercial.opportunity.stage_changed'
          : 'commercial.opportunity.updated',
      };
    }).then((r) => ({ opportunity: map(r.entity), replay: r.replay }));
  }
  private async references(
    c: pg.PoolClient,
    tenantId: string,
    value: {
      owner_membership_id: string;
      customer_id?: string | null | undefined;
      lead_id?: string | null | undefined;
      partner_id?: string | null | undefined;
      plan_id?: string | null | undefined;
    },
  ) {
    const owner = await c.query(
      `SELECT 1 FROM platform.memberships WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
      [value.owner_membership_id, tenantId],
    );
    if (!owner.rowCount)
      throw new OpportunityRegistryFailure(
        'INVALID_REFERENCE',
        'Opportunity reference is unavailable.',
      );
    for (const [table, id] of [
      ['customers', value.customer_id],
      ['leads', value.lead_id],
      ['partners', value.partner_id],
      ['plans', value.plan_id],
    ] as const)
      if (id) {
        const r = await c.query(`SELECT 1 FROM commercial.${table} WHERE id=$1 AND tenant_id=$2`, [
          id,
          tenantId,
        ]);
        if (!r.rowCount)
          throw new OpportunityRegistryFailure(
            'INVALID_REFERENCE',
            'Opportunity reference is unavailable.',
          );
      }
  }
  private async mutate(
    input: OpportunityMutation,
    action: string,
    change: (c: pg.PoolClient) => Promise<{ entity: Row; fields: string[]; event: string }>,
  ) {
    return this.tx(input.contextToken, action, async (c) => {
      const prior = await c.query<{ request_hash: string; result: { entity: Row } }>(
        'SELECT request_hash,result FROM commercial.opportunity_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new OpportunityRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { entity: prior.rows[0].result.entity, replay: true };
      }
      const r = await change(c),
        v = r.entity;
      await c.query(
        "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          action,
          `commercial:opportunity:${v.id}`,
          input.correlationId,
          input.requestId,
          r.fields,
          Number(v.version),
        ],
      );
      await c.query(
        "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'stage',$7::text))",
        [
          r.event,
          input.tenantId,
          input.correlationId,
          input.idempotencyKey,
          v.id,
          Number(v.version),
          v.stage,
        ],
      );
      await c.query(
        'INSERT INTO commercial.opportunity_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          action,
          v.id,
          input.requestHash,
          { entity: v },
        ],
      );
      return { entity: v, replay: false };
    });
  }
  private async tx<T>(
    token: string,
    action: string,
    work: (c: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new OpportunityRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const r = await work(c);
      this.testBeforeCommit?.();
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      if (typeof e === 'object' && e !== null && 'code' in e && e.code === '23505')
        throw new OpportunityRegistryFailure(
          'DUPLICATE_OPPORTUNITY_CODE',
          'Opportunity code is already registered for this tenant.',
        );
      throw e;
    } finally {
      c.release();
    }
  }
}
const map = (r: Row): Opportunity => ({
  ...r,
  version: Number(r.version),
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
  expected_close_date:
    r.expected_close_date instanceof Date
      ? r.expected_close_date.toISOString().slice(0, 10)
      : r.expected_close_date,
});
