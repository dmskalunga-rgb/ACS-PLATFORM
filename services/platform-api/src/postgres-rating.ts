import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type {
  RatePlan,
  RatePlanCreate,
  RatePlanDraftUpdate,
  RatePlanVersion,
  RatedFact,
  RatingApplicabilityCreate,
  RatingApplicability,
  RateRule,
} from '@acs/contracts';
import { ratePlanSchema, ratedFactSchema, ratingApplicabilitySchema } from '@acs/contracts';
import {
  RatingFailure,
  type RatingExecution,
  type RatingMutation,
  type RatingRepository,
} from './rating.js';
import { calculateRating } from './rating-engine.js';

const { Pool } = pg;
type DbTimestamp = Date | string;
type RatePlanRow = Omit<RatePlan, 'created_at' | 'updated_at' | 'versions'> & {
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
  versions: RatePlanVersionRow[];
};
type RatePlanVersionRow = Omit<
  RatePlanVersion,
  | 'version_number'
  | 'effective_from'
  | 'effective_to'
  | 'expected_version'
  | 'created_at'
  | 'updated_at'
> & {
  version_number: number;
  effective_from: DbTimestamp;
  effective_to: DbTimestamp | null;
  version: string;
  created_at: DbTimestamp;
  updated_at: DbTimestamp;
};
type RatePlanVersionStateRow = Pick<
  RatePlanVersionRow,
  'id' | 'status' | 'version' | 'created_by_membership_id'
>;
type MembershipRow = { id: string };
type RatePlanVersionReferenceRow = { rate_plan_id: string };
type RatingApplicabilityRow = Omit<
  RatingApplicability,
  'effective_from' | 'effective_to' | 'created_at'
> & {
  effective_from: DbTimestamp;
  effective_to: DbTimestamp | null;
  created_at: DbTimestamp;
};
type RatedFactRow = Omit<RatedFact, 'created_at'> & { created_at: DbTimestamp };
type RatingTierRow = {
  lower_bound: string;
  upper_bound: string | null;
  unit_rate: string;
  ordinal: number;
};
type RatingInputRow = {
  usage_id: string;
  subscription_id: string;
  entitlement_id: string;
  time_bucket: RatedFact['usage_window'];
  aggregate_value: string;
  measurement_type: string;
  unit: string;
  rate_plan_id: string;
  rate_plan_version_id: string;
  currency_code: 'USD';
  pricing_model: RateRule['pricing_model'];
  flat_amount: string | null;
  unit_rate: string | null;
  tiers: RatingTierRow[];
};
type IdempotencyRow = { request_hash: string; result: unknown };
type IdRow = { id: string };

const toIsoTimestamp = (value: DbTimestamp) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const mapRatePlanVersion = (row: RatePlanVersionRow): RatePlanVersion => ({
  id: row.id,
  rate_plan_id: row.rate_plan_id,
  tenant_id: row.tenant_id,
  version_number: row.version_number,
  status: row.status,
  currency_code: row.currency_code,
  currency_minor_scale: row.currency_minor_scale,
  effective_from: toIsoTimestamp(row.effective_from),
  effective_to: row.effective_to === null ? null : toIsoTimestamp(row.effective_to),
  created_by_membership_id: row.created_by_membership_id,
  approved_by_membership_id: row.approved_by_membership_id,
  activated_by_membership_id: row.activated_by_membership_id,
  expected_version: Number(row.version),
  created_at: toIsoTimestamp(row.created_at),
  updated_at: toIsoTimestamp(row.updated_at),
});
const mapRatePlanRow = (row: RatePlanRow): RatePlan => ({
  id: row.id,
  tenant_id: row.tenant_id,
  code: row.code,
  name: row.name,
  owner_membership_id: row.owner_membership_id,
  created_at: toIsoTimestamp(row.created_at),
  updated_at: toIsoTimestamp(row.updated_at),
  versions: row.versions.map(mapRatePlanVersion),
});
const mapApplicabilityRow = (row: RatingApplicabilityRow): RatingApplicability => ({
  id: row.id,
  tenant_id: row.tenant_id,
  subscription_id: row.subscription_id,
  rate_plan_id: row.rate_plan_id,
  rate_plan_version_id: row.rate_plan_version_id,
  effective_from: toIsoTimestamp(row.effective_from),
  effective_to: row.effective_to === null ? null : toIsoTimestamp(row.effective_to),
  created_at: toIsoTimestamp(row.created_at),
});
const mapRatedFactRow = (row: RatedFactRow): RatedFact => ({
  ...row,
  created_at: toIsoTimestamp(row.created_at),
});
const parseIdempotencyFact = (result: unknown): RatedFact => {
  const parsed = ratedFactSchema.safeParse(result);
  if (!parsed.success)
    throw new RatingFailure('CONFLICT', 'Stored Rating idempotency result is invalid.');
  return parsed.data;
};
const parseIdempotencyRatePlan = (result: unknown): RatePlan => {
  const parsed = ratePlanSchema.safeParse(result);
  if (!parsed.success)
    throw new RatingFailure('CONFLICT', 'Stored Rate Plan idempotency result is invalid.');
  return parsed.data;
};
const parseIdempotencyApplicability = (result: unknown): RatingApplicability => {
  const parsed = ratingApplicabilitySchema.safeParse(result);
  if (!parsed.success)
    throw new RatingFailure('CONFLICT', 'Stored applicability idempotency result is invalid.');
  return parsed.data;
};
const requireRow = <T>(row: T | undefined, message: string): T => {
  if (!row) throw new RatingFailure('INVALID_REFERENCE', message);
  return row;
};
export type RatingTestTransactionPhase =
  'after-domain-write' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'before-commit';
export class PostgresRatingRepository implements RatingRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly testOnlyFailure?: (phase: RatingTestTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 8 });
  }
  async close() {
    await this.pool.end();
  }
  async create(input: RatingMutation & RatePlanCreate) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      const replay = await this.replay(c, input, parseIdempotencyRatePlan);
      if (replay.found) return replay.value;
      const planId = randomUUID(),
        versionId = randomUUID();
      await c.query(
        "INSERT INTO commercial.rate_plans(id,tenant_id,code,name,owner_membership_id,created_by,updated_by) SELECT $1,$2,$3,$4,m.id,$5,$5 FROM platform.memberships m WHERE m.tenant_id=$2 AND m.user_id=$5 AND m.status='ACTIVE'",
        [planId, input.tenantId, input.code, input.name, input.actorUserId],
      );
      const inserted = await c.query<IdRow>(
        "INSERT INTO commercial.rate_plan_versions(id,tenant_id,rate_plan_id,version_number,status,effective_from,created_by_membership_id) SELECT $1,$2,$3,1,'DRAFT',clock_timestamp(),m.id FROM platform.memberships m WHERE m.tenant_id=$2 AND m.user_id=$4 AND m.status='ACTIVE' RETURNING id",
        [versionId, input.tenantId, planId, input.actorUserId],
      );
      if (!inserted.rows[0]) throw new RatingFailure('FORBIDDEN', 'Active membership is required.');
      this.testOnlyFailure?.('after-domain-write');
      await this.evidence(c, input, planId, 'commercial.rating.rate-plan.created', 'rate_plan');
      const result = requireRow(
        (await this.getInside(c, input.tenantId, planId)) ?? undefined,
        'Rate Plan was not created.',
      );
      await this.saveReplay(c, input, planId, result);
      return result;
    });
  }
  async list(token: string, tenantId: string) {
    return this.transaction(token, 'commercial.rating.read', async (c) => {
      const rows = await c.query<IdRow>(
        'SELECT id FROM commercial.rate_plans WHERE tenant_id=$1 ORDER BY id',
        [tenantId],
      );
      return Promise.all(
        rows.rows.map(async ({ id }) => {
          const plan = await this.getInside(c, tenantId, id);
          return requireRow(plan ?? undefined, 'Rate Plan was not found.');
        }),
      );
    });
  }
  async get(token: string, tenantId: string, id: string) {
    return this.transaction(token, 'commercial.rating.read', (c) =>
      this.getInside(c, tenantId, id),
    );
  }
  async update(input: RatingMutation & RatePlanDraftUpdate & { ratePlanId: string }) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      const replay = await this.replay(c, input, parseIdempotencyRatePlan);
      if (replay.found) return replay.value;
      const v = await c.query<Pick<RatePlanVersionStateRow, 'id' | 'version' | 'status'>>(
        'SELECT id,version,status FROM commercial.rate_plan_versions WHERE tenant_id=$1 AND rate_plan_id=$2 ORDER BY version_number DESC LIMIT 1 FOR UPDATE',
        [input.tenantId, input.ratePlanId],
      );
      if (!v.rows[0]) throw new RatingFailure('NOT_FOUND', 'Rate Plan was not found.');
      if (v.rows[0].status !== 'DRAFT')
        throw new RatingFailure('CONFLICT', 'Only DRAFT Rate Plans can change.');
      if (Number(v.rows[0].version) !== input.expected_version)
        throw new RatingFailure('CONFLICT', 'Expected version is stale.');
      await c.query(
        'UPDATE commercial.rate_plans SET name=COALESCE($1,name),updated_by=$2,updated_at=clock_timestamp() WHERE tenant_id=$3 AND id=$4',
        [input.name ?? null, input.actorUserId, input.tenantId, input.ratePlanId],
      );
      this.testOnlyFailure?.('after-domain-write');
      await c.query(
        'UPDATE commercial.rate_plan_versions SET version=version+1,updated_at=clock_timestamp() WHERE id=$1',
        [v.rows[0].id],
      );
      await this.evidence(c, input, input.ratePlanId, null, 'rate_plan');
      const result = requireRow(
        (await this.getInside(c, input.tenantId, input.ratePlanId)) ?? undefined,
        'Rate Plan was not found.',
      );
      await this.saveReplay(c, input, input.ratePlanId, result);
      return result;
    });
  }
  async transition(
    input: RatingMutation & {
      ratePlanId: string;
      expectedVersion: number;
      transition: 'submit' | 'approve' | 'activate' | 'supersede' | 'retire';
    },
  ) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      const replay = await this.replay(c, input, parseIdempotencyRatePlan);
      if (replay.found) return replay.value;
      const v = await c.query<RatePlanVersionStateRow>(
        'SELECT id,status,version,created_by_membership_id FROM commercial.rate_plan_versions WHERE tenant_id=$1 AND rate_plan_id=$2 ORDER BY version_number DESC LIMIT 1 FOR UPDATE',
        [input.tenantId, input.ratePlanId],
      );
      const row = v.rows[0];
      if (!row) throw new RatingFailure('NOT_FOUND', 'Rate Plan was not found.');
      if (Number(row.version) !== input.expectedVersion)
        throw new RatingFailure('CONFLICT', 'Expected version is stale.');
      const expected: Record<typeof input.transition, string> = {
        submit: 'DRAFT',
        approve: 'PENDING_APPROVAL',
        activate: 'APPROVED',
        supersede: 'ACTIVE',
        retire: 'APPROVED',
      };
      if (
        row.status !== expected[input.transition] &&
        !(input.transition === 'retire' && row.status === 'ACTIVE')
      )
        throw new RatingFailure('CONFLICT', 'Lifecycle transition is unavailable.');
      const actor = await c.query<MembershipRow>(
        "SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [input.tenantId, input.actorUserId],
      );
      if (!actor.rows[0]) throw new RatingFailure('FORBIDDEN', 'Active membership is required.');
      if (
        (input.transition === 'approve' || input.transition === 'activate') &&
        actor.rows[0].id === row.created_by_membership_id
      )
        throw new RatingFailure(
          'SOD_DENIED',
          'Rate Plan creator cannot approve or activate the version.',
        );
      const status: Record<typeof input.transition, string> = {
        submit: 'PENDING_APPROVAL',
        approve: 'APPROVED',
        activate: 'ACTIVE',
        supersede: 'SUPERSEDED',
        retire: 'RETIRED',
      };
      const field =
        input.transition === 'approve'
          ? 'approved_by_membership_id'
          : input.transition === 'activate'
            ? 'activated_by_membership_id'
            : null;
      await c.query(
        `UPDATE commercial.rate_plan_versions SET status=$1,version=version+1,updated_at=clock_timestamp()${field ? `,${field}=$2` : ''} WHERE id=$${field ? 3 : 2}`,
        [status[input.transition], ...(field ? [actor.rows[0].id] : []), row.id],
      );
      this.testOnlyFailure?.('after-domain-write');
      await this.evidence(
        c,
        input,
        input.ratePlanId,
        `commercial.rating.rate-plan.${input.transition === 'submit' ? 'submitted' : input.transition + 'd'}`,
        'rate_plan',
      );
      const result = requireRow(
        (await this.getInside(c, input.tenantId, input.ratePlanId)) ?? undefined,
        'Rate Plan was not found.',
      );
      await this.saveReplay(c, input, input.ratePlanId, result);
      return result;
    });
  }
  async createApplicability(input: RatingMutation & RatingApplicabilityCreate) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      const replay = await this.replay(c, input, parseIdempotencyApplicability);
      if (replay.found) return replay.value;
      const plan = await c.query<RatePlanVersionReferenceRow>(
        'SELECT rate_plan_id FROM commercial.rate_plan_versions WHERE tenant_id=$1 AND id=$2',
        [input.tenantId, input.rate_plan_version_id],
      );
      if (!plan.rows[0])
        throw new RatingFailure('INVALID_REFERENCE', 'Rate Plan Version is unavailable.');
      const r = await c.query<RatingApplicabilityRow>(
        'INSERT INTO commercial.rating_applicabilities(id,tenant_id,subscription_id,rate_plan_id,rate_plan_version_id,effective_from,effective_to) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          randomUUID(),
          input.tenantId,
          input.subscription_id,
          plan.rows[0].rate_plan_id,
          input.rate_plan_version_id,
          input.effective_from,
          input.effective_to ?? null,
        ],
      );
      const row = r.rows[0];
      if (!row)
        throw new RatingFailure('INVALID_REFERENCE', 'Rating applicability was not created.');
      this.testOnlyFailure?.('after-domain-write');
      await this.evidence(c, input, row.id, null, 'applicability');
      const result = mapApplicabilityRow(row);
      await this.saveReplay(c, input, row.id, result);
      return result;
    });
  }
  async listFacts(token: string, tenantId: string) {
    return this.transaction(token, 'commercial.rating.read', async (c) =>
      (
        await c.query<RatedFactRow>(
          'SELECT * FROM commercial.rated_facts WHERE tenant_id=$1 ORDER BY created_at DESC',
          [tenantId],
        )
      ).rows.map(mapRatedFactRow),
    );
  }
  async execute(input: RatingExecution) {
    return this.rate(input);
  }
  async rerate(input: RatingExecution & { ratedFactId: string; reason: string }) {
    return this.rate(input, input.ratedFactId, input.reason);
  }
  private async rate(input: RatingExecution, previousId?: string, reason?: string) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.usageAggregateId,
      ]);
      const old = await c.query<IdempotencyRow>(
        'SELECT request_hash,result FROM commercial.rating_operations WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',
        [input.tenantId, input.idempotencyKey],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== input.requestHash)
          throw new RatingFailure('CONFLICT', 'Idempotency key conflicts.');
        return { fact: parseIdempotencyFact(old.rows[0].result), replay: true };
      }
      const r = await c.query<RatingInputRow>(
        `SELECT u.id usage_id,u.subscription_id,u.entitlement_id,u.time_bucket,u.bucket_start,u.aggregate_value,u.measurement_type,u.unit,a.rate_plan_id,a.rate_plan_version_id,v.currency_code,rr.pricing_model,rr.flat_amount,rr.unit_rate,COALESCE(jsonb_agg(jsonb_build_object('lower_bound',t.lower_bound::text,'upper_bound',t.upper_bound::text,'unit_rate',t.unit_rate::text,'ordinal',t.ordinal) ORDER BY t.ordinal) FILTER(WHERE t.id IS NOT NULL),'[]'::jsonb) tiers FROM commercial.usage_aggregates u JOIN commercial.rating_applicabilities a ON a.tenant_id=u.tenant_id AND a.subscription_id=u.subscription_id AND u.bucket_start>=a.effective_from AND (a.effective_to IS NULL OR u.bucket_start<a.effective_to) JOIN commercial.rate_plan_versions v ON v.id=a.rate_plan_version_id AND v.tenant_id=u.tenant_id AND v.status IN ('ACTIVE','SUPERSEDED') JOIN commercial.rate_rules rr ON rr.rate_plan_version_id=v.id AND rr.tenant_id=u.tenant_id AND rr.measurement_type=u.measurement_type AND rr.unit=u.unit LEFT JOIN commercial.rate_tiers t ON t.rate_rule_id=rr.id AND t.tenant_id=rr.tenant_id WHERE u.tenant_id=$1 AND u.id=$2 GROUP BY u.id,a.rate_plan_id,a.rate_plan_version_id,v.currency_code,rr.pricing_model,rr.flat_amount,rr.unit_rate`,
        [input.tenantId, input.usageAggregateId],
      );
      const row = r.rows[0];
      if (!row)
        throw new RatingFailure(
          'INVALID_REFERENCE',
          'Authoritative usage or effective rate is unavailable.',
        );
      let amount: string;
      try {
        amount = calculateRating({
          pricingModel: row.pricing_model,
          quantity: String(row.aggregate_value),
          flatAmount: row.flat_amount,
          unitRate: row.unit_rate,
          tiers: row.tiers,
        });
      } catch {
        throw new RatingFailure(
          'INVALID_INPUT',
          'Rate Rule is unavailable for deterministic calculation.',
        );
      }
      if (previousId) {
        const prior = await c.query<IdRow>(
          "UPDATE commercial.rated_facts SET status='SUPERSEDED' WHERE tenant_id=$1 AND id=$2 AND status='RATED' RETURNING id",
          [input.tenantId, previousId],
        );
        if (!prior.rows[0])
          throw new RatingFailure('CONFLICT', 'Rated Fact is unavailable for rerating.');
      }
      const id = randomUUID();
      const fact = await c.query<RatedFactRow>(
        'INSERT INTO commercial.rated_facts(id,tenant_id,subscription_id,entitlement_id,usage_aggregate_id,usage_window,measurement_type,quantity,unit,rate_plan_id,rate_plan_version_id,pricing_model,currency_code,rate_evidence,pre_tax_amount,supersedes_rated_fact_id,rerating_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
        [
          id,
          input.tenantId,
          row.subscription_id,
          row.entitlement_id,
          row.usage_id,
          row.time_bucket,
          row.measurement_type,
          row.aggregate_value,
          row.unit,
          row.rate_plan_id,
          row.rate_plan_version_id,
          row.pricing_model,
          row.currency_code,
          {
            tiers: row.tiers,
            flat_amount: row.flat_amount,
            unit_rate: row.unit_rate,
            rounding: 'HALF_UP',
          },
          amount,
          previousId ?? null,
          reason ?? null,
        ],
      );
      this.testOnlyFailure?.('after-domain-write');
      const ratedFact = mapRatedFactRow(requireRow(fact.rows[0], 'Rated Fact was not created.'));
      await this.evidence(
        c,
        input,
        id,
        previousId ? 'commercial.rating.rerated' : 'commercial.rating.rated',
        'rated_fact',
      );
      await c.query(
        'INSERT INTO commercial.rating_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          input.action,
          id,
          input.requestHash,
          ratedFact,
        ],
      );
      this.testOnlyFailure?.('after-idempotency');
      return { fact: ratedFact, replay: false };
    });
  }
  private async getInside(
    c: pg.PoolClient,
    tenantId: string,
    id: string,
  ): Promise<RatePlan | null> {
    const r = await c.query<RatePlanRow>(
      "SELECT p.*,COALESCE(jsonb_agg(v ORDER BY v.version_number) FILTER(WHERE v.id IS NOT NULL),'[]'::jsonb) versions FROM commercial.rate_plans p LEFT JOIN commercial.rate_plan_versions v ON v.rate_plan_id=p.id AND v.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.id=$2 GROUP BY p.id",
      [tenantId, id],
    );
    return r.rows[0] ? mapRatePlanRow(r.rows[0]) : null;
  }
  private async evidence(
    c: pg.PoolClient,
    input: RatingMutation,
    id: string,
    event: string | null,
    kind: string,
  ) {
    await c.query(
      "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('resource_id',$7::uuid))",
      [
        input.tenantId,
        input.actorUserId,
        input.action,
        `commercial:rating-${kind}`,
        input.correlationId,
        input.requestId,
        id,
      ],
    );
    this.testOnlyFailure?.('after-audit');
    if (event === null) return;
    await c.query(
      "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',$5)",
      [event, input.tenantId, input.correlationId, input.requestId, { id, resource_kind: kind }],
    );
    this.testOnlyFailure?.('after-outbox');
  }
  private async replay<T>(
    c: pg.PoolClient,
    input: RatingMutation,
    parse: (value: unknown) => T,
  ): Promise<{ found: false } | { found: true; value: T }> {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const existing = await c.query<IdempotencyRow>(
      'SELECT request_hash,result FROM commercial.rating_operations WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE',
      [input.tenantId, input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) return { found: false };
    if (row.request_hash !== input.requestHash)
      throw new RatingFailure('CONFLICT', 'Idempotency key conflicts.');
    return { found: true, value: parse(row.result) };
  }
  private async saveReplay(
    c: pg.PoolClient,
    input: RatingMutation,
    resourceId: string,
    result: unknown,
  ) {
    await c.query(
      'INSERT INTO commercial.rating_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        input.tenantId,
        input.idempotencyKey,
        input.actorUserId,
        input.action,
        resourceId,
        input.requestHash,
        result,
      ],
    );
    this.testOnlyFailure?.('after-idempotency');
  }
  private async transaction<T>(
    token: string,
    action: string,
    work: (c: pg.PoolClient) => Promise<T>,
  ) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query<{ context_token: string }>(
        'SELECT * FROM platform.activate_tenant_context($1,$2)',
        [token, action],
      );
      if (active.rowCount !== 1)
        throw new RatingFailure('FORBIDDEN', 'Trusted context activation failed.');
      const value = await work(c);
      this.testOnlyFailure?.('before-commit');
      await c.query('COMMIT');
      return value;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }
}
