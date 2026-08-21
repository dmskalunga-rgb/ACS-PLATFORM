import pg from 'pg';
import type {
  Plan,
  PlanCreate,
  PlanFeature,
  PlanFeatureCreate,
  PlanFeatureUpdate,
  PlanUpdate,
} from '@acs/contracts';
import {
  PLAN_CREATE,
  PlanCatalogFailure,
  type PlanMutation,
  type PlanRepository,
} from './plan-catalog.js';
const { Pool } = pg;
type PlanRow = Omit<Plan, 'version' | 'created_at' | 'updated_at'> & {
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
};
type FeatureRow = Omit<PlanFeature, 'version' | 'created_at' | 'updated_at'> & {
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
};
const PLAN_COLUMNS = 'id,plan_code,name,description,status,version,created_at,updated_at';
const FEATURE_COLUMNS = 'id,plan_id,feature_code,name,description,version,created_at,updated_at';
export class PostgresPlanCatalogRepository implements PlanRepository {
  private readonly pool: pg.Pool;
  /** Test-only callback used to prove rollback before COMMIT; production callers do not provide it. */
  constructor(
    url: string,
    private readonly testBeforeCommit?: () => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, planId: string) {
    return this.tx(token, 'commercial.plan.read', async (c) => {
      const r = await c.query<PlanRow>(
        `SELECT ${PLAN_COLUMNS} FROM commercial.plans WHERE tenant_id=$1 AND id=$2`,
        [tenantId, planId],
      );
      return r.rows[0] ? plan(r.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.tx(token, 'commercial.plan.read', async (c) => {
      const r = await c.query<PlanRow>(
        `SELECT ${PLAN_COLUMNS} FROM commercial.plans WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return { plans: rows.map(plan), nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null };
    });
  }
  async create(input: PlanMutation & PlanCreate) {
    return this.mutate(input, PLAN_CREATE, async (c) => {
      const r = await c.query<PlanRow>(
        `INSERT INTO commercial.plans(tenant_id,plan_code,name,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING ${PLAN_COLUMNS}`,
        [input.tenantId, input.plan_code, input.name, input.description ?? null, input.actorUserId],
      );
      return {
        entity: r.rows[0]!,
        fields: ['plan_code', 'name', 'description'],
        event: 'commercial.plan.created',
      };
    }).then((r) => ({ plan: plan(r.entity as PlanRow), replay: r.replay }));
  }
  async update(input: PlanMutation & PlanUpdate & { planId: string; action: string }) {
    return this.mutate(input, input.action, async (c) => {
      const cur = await c.query<PlanRow>(
        `SELECT ${PLAN_COLUMNS} FROM commercial.plans WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [input.tenantId, input.planId],
      );
      const old = cur.rows[0];
      if (!old) throw new PlanCatalogFailure('NOT_FOUND', 'Plan was not found.');
      if (Number(old.version) !== input.expected_version)
        throw new PlanCatalogFailure('STALE_VERSION', 'Plan version is stale.');
      const next = {
        plan_code: input.plan_code ?? old.plan_code,
        name: input.name ?? old.name,
        description: input.description === undefined ? old.description : input.description,
        status: input.status ?? old.status,
      };
      const fields = [
        next.plan_code !== old.plan_code ? 'plan_code' : null,
        next.name !== old.name ? 'name' : null,
        next.description !== old.description ? 'description' : null,
        next.status !== old.status ? 'status' : null,
      ].filter((field): field is string => field !== null);
      if (!fields.length) return { entity: old, fields, event: 'commercial.plan.updated' };
      const r = await c.query<PlanRow>(
        `UPDATE commercial.plans SET plan_code=$1,name=$2,description=$3,status=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() WHERE tenant_id=$6 AND id=$7 RETURNING ${PLAN_COLUMNS}`,
        [
          next.plan_code,
          next.name,
          next.description,
          next.status,
          input.actorUserId,
          input.tenantId,
          input.planId,
        ],
      );
      return {
        entity: r.rows[0]!,
        fields,
        event: fields.includes('status')
          ? 'commercial.plan.status_changed'
          : 'commercial.plan.updated',
      };
    }).then((r) => ({ plan: plan(r.entity as PlanRow), replay: r.replay }));
  }
  async getFeature(token: string, tenantId: string, planId: string, featureId: string) {
    return this.tx(token, 'commercial.plan.read', async (c) => {
      const r = await c.query<FeatureRow>(
        `SELECT ${FEATURE_COLUMNS} FROM commercial.plan_features WHERE tenant_id=$1 AND plan_id=$2 AND id=$3`,
        [tenantId, planId, featureId],
      );
      return r.rows[0] ? feature(r.rows[0]) : null;
    });
  }
  async listFeatures(
    token: string,
    tenantId: string,
    planId: string,
    limit: number,
    cursor?: string,
  ) {
    return this.tx(token, 'commercial.plan.read', async (c) => {
      const r = await c.query<FeatureRow>(
        `SELECT ${FEATURE_COLUMNS} FROM commercial.plan_features WHERE tenant_id=$1 AND plan_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,
        [tenantId, planId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        features: rows.map(feature),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async createFeature(input: PlanMutation & PlanFeatureCreate & { planId: string }) {
    return this.mutate(input, PLAN_CREATE, async (c) => {
      const parent = await c.query<{ status: string }>(
        'SELECT status FROM commercial.plans WHERE tenant_id=$1 AND id=$2 FOR SHARE',
        [input.tenantId, input.planId],
      );
      if (!parent.rows[0]) throw new PlanCatalogFailure('NOT_FOUND', 'Plan was not found.');
      if (parent.rows[0].status !== 'ACTIVE')
        throw new PlanCatalogFailure('PLAN_INACTIVE', 'Inactive plans cannot be changed.');
      const r = await c.query<FeatureRow>(
        `INSERT INTO commercial.plan_features(tenant_id,plan_id,feature_code,name,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING ${FEATURE_COLUMNS}`,
        [
          input.tenantId,
          input.planId,
          input.feature_code,
          input.name,
          input.description ?? null,
          input.actorUserId,
        ],
      );
      return {
        entity: r.rows[0]!,
        fields: ['feature_code', 'name', 'description'],
        event: 'commercial.plan_feature.created',
      };
    }).then((r) => ({ feature: feature(r.entity as FeatureRow), replay: r.replay }));
  }
  async updateFeature(
    input: PlanMutation & PlanFeatureUpdate & { planId: string; featureId: string },
  ) {
    return this.mutate(input, 'commercial.plan.update', async (c) => {
      const parent = await c.query<{ status: string }>(
        'SELECT status FROM commercial.plans WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [input.tenantId, input.planId],
      );
      if (!parent.rows[0]) throw new PlanCatalogFailure('NOT_FOUND', 'Plan was not found.');
      if (parent.rows[0].status !== 'ACTIVE')
        throw new PlanCatalogFailure('PLAN_INACTIVE', 'Inactive plans cannot be changed.');
      const cur = await c.query<FeatureRow>(
        `SELECT ${FEATURE_COLUMNS} FROM commercial.plan_features WHERE tenant_id=$1 AND plan_id=$2 AND id=$3 FOR UPDATE`,
        [input.tenantId, input.planId, input.featureId],
      );
      const old = cur.rows[0];
      if (!old) throw new PlanCatalogFailure('NOT_FOUND', 'Plan feature was not found.');
      if (Number(old.version) !== input.expected_version)
        throw new PlanCatalogFailure('STALE_VERSION', 'Plan feature version is stale.');
      const next = {
        feature_code: input.feature_code ?? old.feature_code,
        name: input.name ?? old.name,
        description: input.description === undefined ? old.description : input.description,
      };
      const fields = [
        next.feature_code !== old.feature_code ? 'feature_code' : null,
        next.name !== old.name ? 'name' : null,
        next.description !== old.description ? 'description' : null,
      ].filter((field): field is string => field !== null);
      if (!fields.length) return { entity: old, fields, event: 'commercial.plan_feature.updated' };
      const r = await c.query<FeatureRow>(
        `UPDATE commercial.plan_features SET feature_code=$1,name=$2,description=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp() WHERE tenant_id=$5 AND plan_id=$6 AND id=$7 RETURNING ${FEATURE_COLUMNS}`,
        [
          next.feature_code,
          next.name,
          next.description,
          input.actorUserId,
          input.tenantId,
          input.planId,
          input.featureId,
        ],
      );
      return { entity: r.rows[0]!, fields, event: 'commercial.plan_feature.updated' };
    }).then((r) => ({ feature: feature(r.entity as FeatureRow), replay: r.replay }));
  }
  private async mutate(
    input: PlanMutation,
    action: string,
    change: (
      c: pg.PoolClient,
    ) => Promise<{ entity: PlanRow | FeatureRow; fields: string[]; event: string }>,
  ) {
    return this.tx(input.contextToken, action, async (c) => {
      const prior = await c.query<{
        request_hash: string;
        result: { entity: PlanRow | FeatureRow };
      }>(
        'SELECT request_hash,result FROM commercial.plan_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new PlanCatalogFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { entity: prior.rows[0].result.entity, replay: true };
      }
      const r = await change(c);
      const v = r.entity;
      await c.query(
        "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          action,
          `commercial:plan:${v.id}`,
          input.correlationId,
          input.requestId,
          r.fields,
          Number(v.version),
        ],
      );
      await c.query(
        "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'changed_fields',$7::text[]))",
        [
          r.event,
          input.tenantId,
          input.correlationId,
          input.idempotencyKey,
          v.id,
          Number(v.version),
          r.fields,
        ],
      );
      await c.query(
        'INSERT INTO commercial.plan_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
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
        throw new PlanCatalogFailure('FORBIDDEN', 'Trusted context activation failed.');
      const r = await work(c);
      this.testBeforeCommit?.();
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}
const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);
const plan = (r: PlanRow): Plan => ({
  ...r,
  version: Number(r.version),
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});
const feature = (r: FeatureRow): PlanFeature => ({
  ...r,
  version: Number(r.version),
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});
