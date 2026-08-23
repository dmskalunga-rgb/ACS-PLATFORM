import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import type {
  MachineMeasurementIngest,
  MeasurementCorrection,
  MeasurementCorrectionCreate,
  MeasurementSource,
  MeasurementSourceCreate,
  RawMeasurement,
  UsageAggregate,
} from '@acs/contracts';
import {
  USAGE_INGEST,
  USAGE_READ,
  USAGE_SOURCE_READ,
  UsageMeteringFailure,
  stableHash,
  type HumanUsageMutation,
  type MachineSourceIdentity,
  type UsageMetadata,
  type UsageMeteringRepository,
} from './usage-metering.js';

const { Pool } = pg;
const sourceColumns =
  'id,tenant_id,name,descriptor,status,credential_id,credential_created_at,credential_rotated_at,version,created_at,updated_at';
const measurementColumns =
  'id,tenant_id,source_id,source_event_id,subscription_id,entitlement_id,plan_feature_id,measurement_type,value,unit,event_time,received_at,processed_at,status,schema_version,created_at';
type SourceRow = Omit<
  MeasurementSource,
  'version' | 'credential_created_at' | 'credential_rotated_at' | 'created_at' | 'updated_at'
> & {
  version: string;
  credential_created_at: Date | string;
  credential_rotated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type MeasurementRow = Omit<
  RawMeasurement,
  'value' | 'schema_version' | 'event_time' | 'received_at' | 'processed_at' | 'created_at'
> & {
  value: string | number;
  schema_version: string | number;
  event_time: Date | string;
  received_at: Date | string;
  processed_at: Date | string;
  created_at: Date | string;
};
type AggregateRow = Omit<
  UsageAggregate,
  'aggregate_value' | 'version' | 'bucket_start' | 'computed_at'
> & {
  aggregate_value: string | number;
  version: string;
  bucket_start: Date | string;
  computed_at: Date | string;
};
type CorrectionRow = Omit<
  MeasurementCorrection,
  'compensating_value' | 'version' | 'created_at'
> & {
  compensating_value: string | number;
  version: string;
  created_at: Date | string;
};

export type UsageTestTransactionPhase =
  'after-domain-write' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'before-commit';

export class PostgresUsageMeteringRepository implements UsageMeteringRepository {
  private readonly pool: pg.Pool;
  private readonly issuerPool: pg.Pool;
  constructor(
    usageUrl: string,
    machineIssuerUrl: string,
    private readonly testOnlyFailure?: (phase: UsageTestTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: usageUrl, max: 8 });
    this.issuerPool = new Pool({ connectionString: machineIssuerUrl, max: 4 });
  }
  async close() {
    await Promise.all([this.pool.end(), this.issuerPool.end()]);
  }

  async registerSource(input: HumanUsageMutation & MeasurementSourceCreate) {
    const sourceId = randomUUID(),
      credentialId = randomUUID(),
      credential = randomBytes(32).toString('base64url');
    return this.transaction(input.contextToken, input.action, async (c) => {
      const principal = await c.query<{ id: string }>(
        `SELECT platform.create_machine_principal($1,'MEASUREMENT_SOURCE',$2,'commercial.usage.ingest',$3) AS id`,
        [input.tenantId, sourceId, input.action],
      );
      if (!principal.rows[0]?.id)
        throw new UsageMeteringFailure('FORBIDDEN', 'Machine principal creation was denied.');
      const r = await c.query<SourceRow>(
        `INSERT INTO commercial.measurement_sources(id,tenant_id,machine_principal_id,name,descriptor,credential_id,credential_hash,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING ${sourceColumns}`,
        [
          sourceId,
          input.tenantId,
          principal.rows[0].id,
          input.name,
          input.descriptor ?? null,
          credentialId,
          hashSecret(credential),
          input.actorUserId,
        ],
      );
      await this.humanEvidence(c, input, sourceId, 'commercial.usage.source.registered', 'source');
      return {
        data: mapSource(r.rows[0]!),
        credential: { credential_id: credentialId, credential },
        meta: { request_id: input.requestId, correlation_id: input.correlationId },
      };
    });
  }
  async listSources(token: string, tenantId: string) {
    return this.transaction(token, USAGE_SOURCE_READ, async (c) =>
      (
        await c.query<SourceRow>(
          `SELECT ${sourceColumns} FROM commercial.measurement_sources WHERE tenant_id=$1 ORDER BY id`,
          [tenantId],
        )
      ).rows.map(mapSource),
    );
  }
  async getSource(token: string, tenantId: string, sourceId: string) {
    return this.transaction(token, USAGE_SOURCE_READ, async (c) => {
      const r = await c.query<SourceRow>(
        `SELECT ${sourceColumns} FROM commercial.measurement_sources WHERE tenant_id=$1 AND id=$2`,
        [tenantId, sourceId],
      );
      return r.rows[0] ? mapSource(r.rows[0]) : null;
    });
  }
  async transitionSource(
    input: HumanUsageMutation & { sourceId: string; status: 'ACTIVE' | 'DISABLED' | 'REVOKED' },
  ) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.sourceId]);
      const old = await c.query<{ status: string; machine_principal_id: string }>(
        `SELECT status,machine_principal_id FROM commercial.measurement_sources WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [input.tenantId, input.sourceId],
      );
      if (!old.rows[0])
        throw new UsageMeteringFailure('NOT_FOUND', 'Measurement Source was not found.');
      if (old.rows[0].status === 'REVOKED' && input.status !== 'REVOKED')
        throw new UsageMeteringFailure('TERMINAL_SOURCE', 'Revoked source is terminal.');
      const changed = await c.query<SourceRow>(
        `UPDATE commercial.measurement_sources SET status=$1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE tenant_id=$3 AND id=$4 RETURNING ${sourceColumns}`,
        [input.status, input.actorUserId, input.tenantId, input.sourceId],
      );
      const synced = await c.query<{ ok: boolean }>(
        'SELECT platform.set_machine_principal_status($1,$2,$3,$4) AS ok',
        [old.rows[0].machine_principal_id, input.tenantId, input.status, input.action],
      );
      if (!synced.rows[0]?.ok)
        throw new UsageMeteringFailure(
          'FORBIDDEN',
          'Machine principal state synchronization failed.',
        );
      const suffix = input.status === 'ACTIVE' ? 'reactivated' : input.status.toLowerCase();
      await this.humanEvidence(
        c,
        input,
        input.sourceId,
        `commercial.usage.source.${suffix}`,
        'source',
      );
      return mapSource(changed.rows[0]!);
    });
  }
  async rotateCredential(input: HumanUsageMutation & { sourceId: string }) {
    const credentialId = randomUUID(),
      credential = randomBytes(32).toString('base64url');
    return this.transaction(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.sourceId]);
      const r = await c.query<SourceRow>(
        `UPDATE commercial.measurement_sources SET credential_id=$1,credential_hash=$2,credential_rotated_at=clock_timestamp(),version=version+1,updated_by=$3,updated_at=clock_timestamp() WHERE tenant_id=$4 AND id=$5 AND status<>'REVOKED' RETURNING ${sourceColumns}`,
        [credentialId, hashSecret(credential), input.actorUserId, input.tenantId, input.sourceId],
      );
      if (!r.rows[0])
        throw new UsageMeteringFailure(
          'TERMINAL_SOURCE',
          'Source is unavailable for credential rotation.',
        );
      await c.query(
        `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,'commercial:usage-credential-rotation','ALLOWED',$4,$5,jsonb_build_object('source_id',$6::uuid,'credential_id',$7::uuid))`,
        [
          input.tenantId,
          input.actorUserId,
          input.action,
          input.correlationId,
          input.requestId,
          input.sourceId,
          credentialId,
        ],
      );
      this.testOnlyFailure?.('after-audit');
      return {
        data: mapSource(r.rows[0]),
        credential: { credential_id: credentialId, credential },
        meta: { request_id: input.requestId, correlation_id: input.correlationId },
      };
    });
  }
  async authenticateSource(credentialId: string, secret: string): Promise<MachineSourceIdentity> {
    const resolved = await this.pool.query<{
      source_id: string;
      tenant_id: string;
      machine_principal_id: string;
      credential_hash: string;
      source_status: string;
      principal_status: string;
    }>('SELECT * FROM commercial.resolve_measurement_source_credential($1)', [credentialId]);
    const row = resolved.rows[0];
    if (
      !row ||
      !safeHashEquals(row.credential_hash, hashSecret(secret)) ||
      row.source_status !== 'ACTIVE' ||
      row.principal_status !== 'ACTIVE'
    )
      throw new UsageMeteringFailure('UNAUTHENTICATED', 'Machine source authentication failed.');
    const issued = await this.issuerPool.query<{ context_token: string }>(
      'SELECT context_token FROM platform.issue_machine_tenant_context($1,$2,$3)',
      [row.machine_principal_id, row.tenant_id, USAGE_INGEST],
    );
    if (!issued.rows[0])
      throw new UsageMeteringFailure('FORBIDDEN', 'Machine source is not authorized.');
    return {
      credentialId,
      sourceId: row.source_id,
      tenantId: row.tenant_id,
      machinePrincipalId: row.machine_principal_id,
      contextToken: issued.rows[0].context_token,
    };
  }
  async ingest(
    identity: MachineSourceIdentity,
    value: MachineMeasurementIngest,
    meta: UsageMetadata,
  ) {
    const requestHash = stableHash(value);
    return this.transaction(identity.contextToken, USAGE_INGEST, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.sourceId]);
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        identity.sourceId,
        value.source_event_id,
      ]);
      const source = await c.query<{ source_status: string; principal_status: string }>(
        'SELECT source_status,principal_status FROM commercial.resolve_measurement_source_credential($1)',
        [identity.credentialId],
      );
      if (
        source.rows[0]?.source_status !== 'ACTIVE' ||
        source.rows[0]?.principal_status !== 'ACTIVE'
      )
        throw new UsageMeteringFailure('FORBIDDEN', 'Machine source is inactive.');
      const prior = await c.query<MeasurementRow & { payload_hash: string }>(
        `SELECT payload_hash,${measurementColumns} FROM commercial.raw_measurements WHERE tenant_id=$1 AND source_id=$2 AND source_event_id=$3`,
        [identity.tenantId, identity.sourceId, value.source_event_id],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].payload_hash !== requestHash)
          throw new UsageMeteringFailure(
            'SOURCE_EVENT_CONFLICT',
            'Source event payload conflicts.',
          );
        return { measurement: mapMeasurement(prior.rows[0]), replay: true };
      }
      const received = new Date();
      const event = new Date(value.event_time);
      if (
        event.getTime() > received.getTime() + 300000 ||
        event.getTime() < received.getTime() - 30 * 86400000
      )
        throw new UsageMeteringFailure(
          'INVALID_TIMESTAMP',
          'Measurement event time is outside the accepted window.',
        );
      const origin = await c.query<{
        entitlement_id: string;
        subscription_id: string;
        plan_feature_id: string | null;
      }>(
        `SELECT e.id entitlement_id,e.subscription_id,e.plan_feature_id FROM commercial.entitlements e JOIN commercial.subscriptions s ON s.id=e.subscription_id AND s.tenant_id=e.tenant_id WHERE e.tenant_id=$1 AND e.id=$2 AND e.status='ACTIVE' AND s.status='ACTIVE'`,
        [identity.tenantId, value.entitlement_id],
      );
      if (!origin.rows[0])
        throw new UsageMeteringFailure(
          'INVALID_REFERENCE',
          'Active commercial origin is unavailable.',
        );
      if (value.plan_feature_id && value.plan_feature_id !== origin.rows[0].plan_feature_id)
        throw new UsageMeteringFailure(
          'INVALID_REFERENCE',
          'Authoritative Plan Feature does not match.',
        );
      const r = await c.query<MeasurementRow>(
        `INSERT INTO commercial.raw_measurements(tenant_id,source_id,source_event_id,payload_hash,subscription_id,entitlement_id,plan_feature_id,measurement_type,value,unit,event_time,received_at,processed_at,status,schema_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp(),'ACCEPTED',$13) RETURNING ${measurementColumns}`,
        [
          identity.tenantId,
          identity.sourceId,
          value.source_event_id,
          requestHash,
          origin.rows[0].subscription_id,
          origin.rows[0].entitlement_id,
          origin.rows[0].plan_feature_id,
          value.measurement_type,
          value.value,
          value.unit,
          value.event_time,
          received,
          value.schema_version,
        ],
      );
      this.testOnlyFailure?.('after-domain-write');
      const measurement = r.rows[0]!;
      await this.aggregate(c, measurement, Number(value.value));
      await c.query(
        `INSERT INTO platform.audit_logs(id,tenant_id,actor_kind,machine_principal_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,'MACHINE',$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('source_id',$7::uuid,'measurement_id',$8::uuid))`,
        [
          identity.tenantId,
          identity.machinePrincipalId,
          USAGE_INGEST,
          'commercial:usage-measurement',
          meta.correlationId,
          meta.requestId,
          identity.sourceId,
          measurement.id,
        ],
      );
      this.testOnlyFailure?.('after-audit');
      await this.event(
        c,
        'commercial.usage.measurement.accepted',
        identity.tenantId,
        meta,
        measurement.id,
        { source_id: identity.sourceId, entitlement_id: value.entitlement_id },
      );
      await this.event(
        c,
        'commercial.usage.aggregate.updated',
        identity.tenantId,
        meta,
        measurement.id,
        { measurement_type: measurement.measurement_type, unit: measurement.unit },
      );
      this.testOnlyFailure?.('after-outbox');
      return { measurement: mapMeasurement(measurement), replay: false };
    });
  }
  async listMeasurements(token: string, tenantId: string) {
    return this.transaction(token, USAGE_READ, async (c) =>
      (
        await c.query<MeasurementRow>(
          `SELECT ${measurementColumns} FROM commercial.raw_measurements WHERE tenant_id=$1 ORDER BY id`,
          [tenantId],
        )
      ).rows.map(mapMeasurement),
    );
  }
  async getMeasurement(token: string, tenantId: string, id: string) {
    return this.transaction(token, USAGE_READ, async (c) => {
      const r = await c.query<MeasurementRow>(
        `SELECT ${measurementColumns} FROM commercial.raw_measurements WHERE tenant_id=$1 AND id=$2`,
        [tenantId, id],
      );
      return r.rows[0] ? mapMeasurement(r.rows[0]) : null;
    });
  }
  async listAggregates(token: string, tenantId: string) {
    return this.transaction(token, USAGE_READ, async (c) =>
      (
        await c.query<AggregateRow>(
          'SELECT id,tenant_id,subscription_id,entitlement_id,plan_feature_id,measurement_type,unit,time_bucket,bucket_start,aggregate_value,computed_at,version FROM commercial.usage_aggregates WHERE tenant_id=$1 ORDER BY bucket_start,id',
          [tenantId],
        )
      ).rows.map(mapAggregate),
    );
  }
  async correct(
    input: HumanUsageMutation &
      MeasurementCorrectionCreate & { idempotencyKey: string; requestHash: string },
  ) {
    return this.transaction(input.contextToken, input.action, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.idempotencyKey,
      ]);
      const prior = await c.query<{ request_hash: string; result: unknown }>(
        'SELECT request_hash,result FROM commercial.usage_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new UsageMeteringFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key payload conflicts.',
          );
        return { correction: prior.rows[0].result, replay: true };
      }
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.measurement_id]);
      const raw = await c.query<MeasurementRow>(
        `SELECT ${measurementColumns} FROM commercial.raw_measurements WHERE tenant_id=$1 AND id=$2 AND status='ACCEPTED'`,
        [input.tenantId, input.measurement_id],
      );
      if (!raw.rows[0]) throw new UsageMeteringFailure('NOT_FOUND', 'Measurement was not found.');
      const member = await c.query<{ id: string }>(
        "SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [input.tenantId, input.actorUserId],
      );
      const actorMembership = member.rows[0];
      if (!actorMembership)
        throw new UsageMeteringFailure('FORBIDDEN', 'Active membership is required.');
      const rawMeasurement = raw.rows[0];
      if (input.expected_version !== 1)
        throw new UsageMeteringFailure('STALE_VERSION', 'Measurement version is stale.');
      if (input.unit !== rawMeasurement.unit)
        throw new UsageMeteringFailure(
          'INVALID_REFERENCE',
          'Correction unit must match the original measurement.',
        );
      const r = await c.query<CorrectionRow>(
        'INSERT INTO commercial.measurement_corrections(tenant_id,measurement_id,reason,compensating_value,unit,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,tenant_id,measurement_id,reason,compensating_value,unit,status,created_by_membership_id,version,created_at',
        [
          input.tenantId,
          input.measurement_id,
          input.reason,
          input.compensating_value,
          input.unit,
          actorMembership.id,
        ],
      );
      const correction = r.rows[0]!;
      await this.aggregate(c, rawMeasurement, input.compensating_value);
      await this.humanEvidence(
        c,
        input,
        correction.id,
        'commercial.usage.measurement.corrected',
        'correction',
      );
      await this.event(
        c,
        'commercial.usage.aggregate.updated',
        input.tenantId,
        input,
        correction.id,
        { measurement_id: rawMeasurement.id, unit: rawMeasurement.unit },
      );
      const canonicalCorrection = mapCorrection(correction);
      await c.query(
        'INSERT INTO commercial.usage_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          input.action,
          correction.id,
          input.requestHash,
          canonicalCorrection,
        ],
      );
      this.testOnlyFailure?.('after-idempotency');
      return { correction: canonicalCorrection, replay: false };
    });
  }
  private async aggregate(c: pg.PoolClient, row: MeasurementRow, delta: number) {
    for (const bucket of ['HOURLY', 'DAILY'] as const) {
      const trunc = bucket === 'HOURLY' ? 'hour' : 'day';
      await c.query(
        `INSERT INTO commercial.usage_aggregates(tenant_id,subscription_id,entitlement_id,plan_feature_id,measurement_type,unit,time_bucket,bucket_start,aggregate_value) VALUES($1,$2,$3,$4,$5,$6,$7,date_trunc('${trunc}',$8::timestamptz),$9) ON CONFLICT (tenant_id,subscription_id,entitlement_id,measurement_type,unit,time_bucket,bucket_start,(COALESCE(plan_feature_id,'00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET aggregate_value=commercial.usage_aggregates.aggregate_value+EXCLUDED.aggregate_value,computed_at=clock_timestamp(),version=commercial.usage_aggregates.version+1`,
        [
          row.tenant_id,
          row.subscription_id,
          row.entitlement_id,
          row.plan_feature_id,
          row.measurement_type,
          row.unit,
          bucket,
          row.event_time,
          delta,
        ],
      );
    }
  }
  private async humanEvidence(
    c: pg.PoolClient,
    input: HumanUsageMutation,
    id: string,
    event: string,
    kind: string,
  ) {
    await c.query(
      `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('resource_id',$7::uuid))`,
      [
        input.tenantId,
        input.actorUserId,
        input.action,
        `commercial:usage-${kind}`,
        input.correlationId,
        input.requestId,
        id,
      ],
    );
    this.testOnlyFailure?.('after-audit');
    await this.event(c, event, input.tenantId, input, id, { resource_kind: kind });
    this.testOnlyFailure?.('after-outbox');
  }
  private async event(
    c: pg.PoolClient,
    type: string,
    tenant: string,
    meta: UsageMetadata,
    id: string,
    payload: Record<string, unknown>,
  ) {
    await c.query(
      `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',$5)`,
      [type, tenant, meta.correlationId, meta.requestId, { id, ...payload }],
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
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new UsageMeteringFailure('FORBIDDEN', 'Trusted context activation failed.');
      const result = await work(c);
      this.testOnlyFailure?.('before-commit');
      await c.query('COMMIT');
      return result;
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    } finally {
      c.release();
    }
  }
}
const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
const safeHashEquals = (a: string, b: string) => {
  const left = Buffer.from(a, 'hex'),
    right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};
const iso = (v: Date | string | null) => (v instanceof Date ? v.toISOString() : v);
const mapSource = (r: SourceRow): MeasurementSource => ({
  ...r,
  version: Number(r.version),
  credential_created_at: iso(r.credential_created_at)!,
  credential_rotated_at: iso(r.credential_rotated_at),
  created_at: iso(r.created_at)!,
  updated_at: iso(r.updated_at)!,
});
const mapMeasurement = (r: MeasurementRow): RawMeasurement => ({
  ...r,
  value: Number(r.value),
  schema_version: Number(r.schema_version),
  event_time: iso(r.event_time)!,
  received_at: iso(r.received_at)!,
  processed_at: iso(r.processed_at)!,
  created_at: iso(r.created_at)!,
});
const mapAggregate = (r: AggregateRow): UsageAggregate => ({
  ...r,
  aggregate_value: Number(r.aggregate_value),
  version: Number(r.version),
  bucket_start: iso(r.bucket_start)!,
  computed_at: iso(r.computed_at)!,
});
const mapCorrection = (r: CorrectionRow): MeasurementCorrection => ({
  ...r,
  compensating_value: Number(r.compensating_value),
  version: Number(r.version),
  created_at: iso(r.created_at)!,
});
