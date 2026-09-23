import pg from 'pg';
import type { AiRiskRecord } from '@acs/contracts';
import {
  AI_RISK_PERMISSIONS,
  AiRiskFailure,
  type AiRiskCommandContext,
  type AiRiskEvent,
  type AiRiskReceipt,
  type AiRiskRepository,
} from './ai-risk.js';

const { Pool } = pg;

type RiskRow = {
  risk_id: string;
  risk_code: string;
  title: string;
  description: string;
  primary_category: AiRiskRecord['primary_category'];
  owner_user_id: string;
  status: AiRiskRecord['status'];
  version: string | number;
  ai_system_id: string | null;
  model_id: string | null;
  model_version_id: string | null;
  dataset_id: string | null;
  dataset_version_id: string | null;
  prompt_id: string | null;
  prompt_version_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const inventoryColumns = {
  AI_SYSTEM: 'ai_system_id',
  MODEL: 'model_id',
  MODEL_VERSION: 'model_version_id',
  DATASET: 'dataset_id',
  DATASET_VERSION: 'dataset_version_id',
  PROMPT: 'prompt_id',
  PROMPT_VERSION: 'prompt_version_id',
} as const;

export type AiRiskTransactionPhase =
  'after-domain-write' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'before-commit';

export class PostgresAiRiskRepository implements AiRiskRepository {
  private readonly pool: pg.Pool;

  constructor(
    databaseUrl: string,
    private readonly testOnlyFailure?: (phase: AiRiskTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  async create(input: Parameters<AiRiskRepository['create']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.create, async (client) =>
      this.idempotent(client, input, 'risk.create', async () => {
        if (input.command.owner_user_id !== input.userId) throw new AiRiskFailure('FORBIDDEN');
        const inventory = input.command.inventory;
        const column = inventory === null ? null : inventoryColumns[inventory.kind];
        const result = await client.query<RiskRow>(
          `INSERT INTO ai_governance.risks
            (tenant_id,risk_id,risk_code,title,description,primary_category,owner_user_id,
             evidence_reference,created_by,ai_system_id,model_id,model_version_id,
             dataset_id,dataset_version_id,prompt_id,prompt_version_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
          [
            input.tenantId,
            input.riskId,
            input.command.risk_code,
            input.command.title,
            input.command.description,
            input.command.primary_category,
            input.command.owner_user_id,
            input.command.evidence_reference,
            input.userId,
            column === 'ai_system_id' ? inventory?.id : null,
            column === 'model_id' ? inventory?.id : null,
            column === 'model_version_id' ? inventory?.id : null,
            column === 'dataset_id' ? inventory?.id : null,
            column === 'dataset_version_id' ? inventory?.id : null,
            column === 'prompt_id' ? inventory?.id : null,
            column === 'prompt_version_id' ? inventory?.id : null,
          ],
        );
        const risk = mapRisk(result.rows[0]!);
        await this.lifecycle(
          client,
          input,
          'risk.create',
          'aigov.risk.created',
          risk.risk_id,
          risk.version,
        );
        return risk;
      }),
    );
  }

  async update(input: Parameters<AiRiskRepository['update']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.update, async (client) =>
      this.idempotent(client, input, 'risk.update', async () => {
        const row = await client.query<RiskRow>(
          `UPDATE ai_governance.risks
              SET title=$1,description=$2,evidence_reference=$3,
                  version=version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$4 AND risk_id=$5 AND version=$6
            RETURNING *`,
          [
            input.command.title,
            input.command.description,
            input.command.evidence_reference,
            input.tenantId,
            input.riskId,
            input.command.expected_version,
          ],
        );
        if (!row.rows[0]) await this.missingOrStale(client, input);
        const risk = mapRisk(row.rows[0]!);
        await this.lifecycle(
          client,
          input,
          'risk.update',
          'aigov.risk.updated',
          risk.risk_id,
          risk.version,
        );
        return risk;
      }),
    );
  }

  async assess(input: Parameters<AiRiskRepository['assess']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.assess, async (client) =>
      this.idempotent(client, input, 'risk.assess', async () => {
        const latest = await client.query<{ assessment_id: string }>(
          `SELECT assessment_id FROM ai_governance.risk_assessments
            WHERE tenant_id=$1 AND risk_id=$2 ORDER BY created_at DESC,assessment_id DESC LIMIT 1`,
          [input.tenantId, input.riskId],
        );
        if ((latest.rows[0]?.assessment_id ?? null) !== input.command.previous_assessment_id)
          throw new AiRiskFailure('STALE_VERSION');
        const scores = calculateScores(input.command);
        const risk = await this.updateStatus(client, input, 'ASSESSED');
        const row = await client.query<{ created_at: string | Date }>(
          `INSERT INTO ai_governance.risk_assessments
            (tenant_id,assessment_id,risk_id,previous_assessment_id,likelihood,impact,
             exposure,detectability,autonomy,blast_radius,control_strength,inherent_score,
             residual_score,scoring_formula_reference,reason_reference,trigger_reference,
             evidence_reference,assessed_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                  'ACS-AI-GOV-001:v1.0:formula',$14,$15,$16,$17)
           RETURNING created_at`,
          [
            input.tenantId,
            input.eventId,
            input.riskId,
            input.command.previous_assessment_id,
            input.command.likelihood,
            input.command.impact,
            input.command.exposure,
            input.command.detectability,
            input.command.autonomy,
            input.command.blast_radius,
            input.command.control_strength,
            scores.inherent,
            scores.residual,
            input.command.reason_reference,
            input.command.trigger_reference,
            input.command.evidence_reference,
            input.userId,
          ],
        );
        const event: AiRiskEvent = {
          event_id: input.eventId,
          risk_id: input.riskId,
          risk_version: risk.version,
          kind: 'ASSESSMENT',
          created_at: new Date(row.rows[0]!.created_at).toISOString(),
          inherent_score: scores.inherent,
          residual_score: scores.residual,
          scoring_formula_reference: 'ACS-AI-GOV-001:v1.0:formula',
        };
        await this.lifecycle(
          client,
          input,
          'risk.assess',
          'aigov.risk.assessed',
          input.riskId,
          risk.version,
        );
        return event;
      }),
    );
  }

  async treat(input: Parameters<AiRiskRepository['treat']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.treat, async (client) =>
      this.idempotent(client, input, 'risk.treat', async () => {
        const risk = await this.updateStatus(client, input, 'TREATMENT_REQUIRED', [
          'ASSESSED',
          'TREATMENT_REQUIRED',
          'RESIDUAL_RISK_REVIEW',
        ]);
        const row = await client.query<{ created_at: string | Date }>(
          `INSERT INTO ai_governance.risk_treatments
            (tenant_id,treatment_id,risk_id,treatment_type,rationale_reference,
             planned_actions_reference,evidence_reference,proposed_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`,
          [
            input.tenantId,
            input.eventId,
            input.riskId,
            input.command.treatment_type,
            input.command.rationale_reference,
            input.command.planned_actions_reference,
            input.command.evidence_reference,
            input.userId,
          ],
        );
        const event = mapEvent(input, 'TREATMENT', risk.version, row.rows[0]!.created_at);
        await this.lifecycle(
          client,
          input,
          'risk.treat',
          'aigov.risk.treatment_proposed',
          input.riskId,
          risk.version,
        );
        return event;
      }),
    );
  }

  async review(input: Parameters<AiRiskRepository['review']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.review, async (client) =>
      this.idempotent(client, input, 'risk.review', async () => {
        const assessment = await client.query(
          `SELECT 1 FROM ai_governance.risk_assessments
            WHERE tenant_id=$1 AND risk_id=$2 AND assessment_id=$3`,
          [input.tenantId, input.riskId, input.command.assessment_id],
        );
        if (assessment.rowCount === 0) throw new AiRiskFailure('INVALID_REFERENCE');
        const risk = await this.updateStatus(client, input, 'RESIDUAL_RISK_REVIEW', [
          'ASSESSED',
          'TREATMENT_REQUIRED',
          'RESIDUAL_RISK_REVIEW',
        ]);
        const row = await client.query<{ created_at: string | Date }>(
          `INSERT INTO ai_governance.risk_residual_reviews
            (tenant_id,review_id,risk_id,assessment_id,reason_reference,evidence_reference,reviewed_by)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING created_at`,
          [
            input.tenantId,
            input.eventId,
            input.riskId,
            input.command.assessment_id,
            input.command.reason_reference,
            input.command.evidence_reference,
            input.userId,
          ],
        );
        const event = mapEvent(input, 'RESIDUAL_REVIEW', risk.version, row.rows[0]!.created_at);
        await this.lifecycle(
          client,
          input,
          'risk.review',
          'aigov.risk.residual_reviewed',
          input.riskId,
          risk.version,
        );
        return event;
      }),
    );
  }

  async monitor(input: Parameters<AiRiskRepository['monitor']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.monitor, async (client) =>
      this.idempotent(client, input, 'risk.monitor', async () => {
        const risk = await this.updateStatus(
          client,
          input,
          input.command.reassessment_required ? 'REASSESSMENT_REQUIRED' : undefined,
        );
        const row = await client.query<{ created_at: string | Date }>(
          `INSERT INTO ai_governance.risk_monitoring
            (tenant_id,monitoring_id,risk_id,trigger_kind,reassessment_required,
             reason_reference,evidence_reference,recorded_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING created_at`,
          [
            input.tenantId,
            input.eventId,
            input.riskId,
            input.command.trigger_kind,
            input.command.reassessment_required,
            input.command.reason_reference,
            input.command.evidence_reference,
            input.userId,
          ],
        );
        const event = mapEvent(input, 'MONITORING', risk.version, row.rows[0]!.created_at);
        await this.lifecycle(
          client,
          input,
          'risk.monitor',
          'aigov.risk.monitored',
          input.riskId,
          risk.version,
        );
        return event;
      }),
    );
  }

  async read(input: Parameters<AiRiskRepository['read']>[0]) {
    return this.transaction(input, AI_RISK_PERMISSIONS.read, async (client) => {
      const row = await client.query<RiskRow>(
        'SELECT * FROM ai_governance.risks WHERE tenant_id=$1 AND risk_id=$2',
        [input.tenantId, input.riskId],
      );
      return row.rows[0] ? mapRisk(row.rows[0]) : null;
    });
  }

  private async updateStatus(
    client: pg.PoolClient,
    input: AiRiskCommandContext & { riskId: string; command: { expected_version: number } },
    status?: AiRiskRecord['status'],
    allowed?: AiRiskRecord['status'][],
  ): Promise<AiRiskRecord> {
    const row = await client.query<RiskRow>(
      `UPDATE ai_governance.risks SET status=COALESCE($1,status),version=version+1,
         updated_at=clock_timestamp()
       WHERE tenant_id=$2 AND risk_id=$3 AND version=$4
         AND ($5::text[] IS NULL OR status=ANY($5::text[])) RETURNING *`,
      [
        status ?? null,
        input.tenantId,
        input.riskId,
        input.command.expected_version,
        allowed ?? null,
      ],
    );
    if (!row.rows[0]) await this.missingOrStale(client, input, allowed);
    return mapRisk(row.rows[0]!);
  }

  private async missingOrStale(
    client: pg.PoolClient,
    input: { tenantId: string; riskId: string },
    allowed?: AiRiskRecord['status'][],
  ): Promise<never> {
    const existing = await client.query<{ status: AiRiskRecord['status'] }>(
      'SELECT status FROM ai_governance.risks WHERE tenant_id=$1 AND risk_id=$2',
      [input.tenantId, input.riskId],
    );
    if (!existing.rows[0]) throw new AiRiskFailure('NOT_FOUND');
    if (allowed && !allowed.includes(existing.rows[0].status))
      throw new AiRiskFailure('INVALID_RISK_STATE');
    throw new AiRiskFailure('STALE_VERSION');
  }

  private async lifecycle(
    client: pg.PoolClient,
    input: AiRiskCommandContext,
    action: string,
    eventType: string,
    riskId: string,
    version: number,
  ) {
    this.testOnlyFailure?.('after-domain-write');
    await client.query(
      `INSERT INTO platform.audit_logs
        (id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,
              jsonb_build_object('risk_id',$7::uuid,'version',$8::bigint))`,
      [
        input.tenantId,
        input.userId,
        action,
        `aigov:risk:${riskId}`,
        input.correlationId,
        input.requestId,
        riskId,
        version,
      ],
    );
    this.testOnlyFailure?.('after-audit');
    await client.query(
      `INSERT INTO platform.domain_events
        (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
       VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',
              jsonb_build_object('risk_id',$5::uuid,'version',$6::bigint,'request_id',$7::uuid))`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        riskId,
        version,
        input.requestId,
      ],
    );
    this.testOnlyFailure?.('after-outbox');
  }

  private async idempotent<T>(
    client: pg.PoolClient,
    input: AiRiskCommandContext,
    command: string,
    work: () => Promise<T>,
  ): Promise<AiRiskReceipt<T>> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,0))", [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const previous = await client.query<{
      command: string;
      actor_user_id: string;
      request_hash: string;
      result: { data: T };
    }>(
      `SELECT command,actor_user_id,request_hash,result FROM ai_governance.risk_command_results
        WHERE tenant_id=$1 AND idempotency_key=$2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (previous.rows[0]) {
      if (
        previous.rows[0].command !== command ||
        previous.rows[0].actor_user_id !== input.userId ||
        previous.rows[0].request_hash !== input.requestHash
      )
        throw new AiRiskFailure('IDEMPOTENCY_CONFLICT');
      return { data: previous.rows[0].result.data, replay: true };
    }
    const data = await work();
    await client.query(
      `INSERT INTO ai_governance.risk_command_results
        (tenant_id,idempotency_key,actor_user_id,command,request_hash,result)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [input.tenantId, input.idempotencyKey, input.userId, command, input.requestHash, { data }],
    );
    this.testOnlyFailure?.('after-idempotency');
    return { data, replay: false };
  }

  private async transaction<T>(
    actor: Pick<AiRiskCommandContext, 'tenantId' | 'userId' | 'contextToken'>,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [actor.contextToken, action],
      );
      if (active.rowCount !== 1) throw new AiRiskFailure('FORBIDDEN');
      const bound = await client.query<{ allowed: boolean }>(
        'SELECT platform.has_trusted_tenant_context($1::uuid,$2::uuid,$3) AS allowed',
        [actor.tenantId, actor.userId, action],
      );
      if (bound.rows[0]?.allowed !== true) throw new AiRiskFailure('FORBIDDEN');
      const result = await work(client);
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof Error && 'code' in error) {
        if (error.code === '23503' || error.code === '23514')
          throw new AiRiskFailure('INVALID_REFERENCE');
        if (error.code === '23505') throw new AiRiskFailure('ALREADY_EXISTS');
        if (error.code === '42501') throw new AiRiskFailure('FORBIDDEN');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

function mapRisk(row: RiskRow): AiRiskRecord {
  const inventory = row.ai_system_id
    ? { kind: 'AI_SYSTEM' as const, id: row.ai_system_id }
    : row.model_id
      ? { kind: 'MODEL' as const, id: row.model_id }
      : row.model_version_id
        ? { kind: 'MODEL_VERSION' as const, id: row.model_version_id }
        : row.dataset_id
          ? { kind: 'DATASET' as const, id: row.dataset_id }
          : row.dataset_version_id
            ? { kind: 'DATASET_VERSION' as const, id: row.dataset_version_id }
            : row.prompt_id
              ? { kind: 'PROMPT' as const, id: row.prompt_id }
              : row.prompt_version_id
                ? { kind: 'PROMPT_VERSION' as const, id: row.prompt_version_id }
                : null;
  return {
    risk_id: row.risk_id,
    risk_code: row.risk_code,
    title: row.title,
    description: row.description,
    primary_category: row.primary_category,
    owner_user_id: row.owner_user_id,
    status: row.status,
    version: Number(row.version),
    inventory,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function mapEvent(
  input: { eventId: string; riskId: string },
  kind: AiRiskEvent['kind'],
  version: number,
  createdAt: string | Date,
): AiRiskEvent {
  return {
    event_id: input.eventId,
    risk_id: input.riskId,
    risk_version: version,
    kind,
    created_at: new Date(createdAt).toISOString(),
  };
}

function calculateScores(command: Parameters<AiRiskRepository['assess']>[0]['command']) {
  const numerator =
    command.likelihood *
    command.impact *
    (command.exposure + command.detectability + command.autonomy + command.blast_radius);
  const controlBasisPoints = Math.round(command.control_strength * 10_000);
  // All dimensions are integers and control strength has at most four decimal places.
  // Integer half-up rounding matches PostgreSQL numeric round(..., 2), including ties.
  const residualCents = Math.floor((numerator * (10_000 - controlBasisPoints) + 200) / 400);
  return {
    inherent: numerator / 4,
    residual: residualCents / 100,
  };
}
