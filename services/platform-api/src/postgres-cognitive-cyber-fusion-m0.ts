import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import {
  fusionCompletedPayloadSchema,
  fusionFailedPayloadSchema,
  fusionRequestedPayloadSchema,
  type FusionFailureCode,
  type FusionResult,
} from '@acs/contracts';
import {
  canonicalJson,
  CognitiveFusionFailure,
  sha256,
  type FusionReceiptRepository,
} from './cognitive-cyber-fusion-m0.js';

const { Pool } = pg;

type ReceiptRow = {
  request_hash: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  fusion_request_id: string | null;
  fusion_result_id: string | null;
  request_id: string;
  correlation_id: string;
  result_hash: string | null;
  failure_code: FusionFailureCode | null;
  completed_at: Date | string | null;
  expires_at: Date | string;
};

export type FusionTransactionPhase =
  | 'after-receipt'
  | 'after-audit'
  | 'after-requested-outbox'
  | 'after-completed-outbox'
  | 'before-commit';

export class PostgresCognitiveCyberFusionM0Repository implements FusionReceiptRepository {
  private readonly pool: pg.Pool;

  constructor(
    databaseUrl: string,
    private readonly testOnlyFailure?: (phase: FusionTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 8 });
  }

  async close() {
    await this.pool.end();
  }

  async execute(input: Parameters<FusionReceiptRepository['execute']>[0]) {
    const client = await this.pool.connect();
    let contextActivated = false;
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [input.contextToken, 'cyberdefense.fusion.request'],
      );
      if (active.rowCount !== 1) throw new CognitiveFusionFailure('TENANT_CONTEXT_INVALID');
      contextActivated = true;
      await client.query(
        `INSERT INTO cyberdefense.fusion_command_receipts
          (tenant_id,idempotency_key,request_hash,operation,request_schema_version,
           result_schema_version,reference_schema_version,status,fusion_request_id,
           fusion_result_id,request_id,correlation_id,expires_at)
         VALUES($1,$2,$3,'cyberdefense.fusion.request','1.0.0','1.0.0','1.0.0',
                'IN_PROGRESS',$4,$5,$6,$7,$8)
         ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.requestHash,
          input.fusionRequestId,
          input.fusionResultId,
          input.requestId,
          input.correlationId,
          input.expiresAt,
        ],
      );
      const locked = await client.query<ReceiptRow>(
        `SELECT request_hash,status,fusion_request_id,fusion_result_id,result_hash,
                request_id,correlation_id,failure_code,completed_at,expires_at
         FROM cyberdefense.fusion_command_receipts
         WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      const row = locked.rows[0];
      if (!row) throw new CognitiveFusionFailure('DEPENDENCY_UNAVAILABLE');
      if (new Date(row.expires_at).getTime() <= Date.now())
        throw new CognitiveFusionFailure('REPLAY_CONFLICT');
      if (row.request_hash !== input.requestHash)
        throw new CognitiveFusionFailure('IDEMPOTENCY_CONFLICT');
      if (row.status === 'FAILED')
        throw new CognitiveFusionFailure(row.failure_code ?? 'DEPENDENCY_UNAVAILABLE');
      if (row.status === 'COMPLETED') {
        if (
          !row.completed_at ||
          !row.fusion_request_id ||
          !row.fusion_result_id ||
          !row.result_hash
        )
          throw new CognitiveFusionFailure('DEPENDENCY_UNAVAILABLE');
        const result = await input.produce(
          new Date(row.completed_at).toISOString(),
          row.fusion_request_id,
          row.fusion_result_id,
          row.request_id,
          row.correlation_id,
        );
        if (!safeHashEquals(sha256(canonicalJson(result)), row.result_hash))
          throw new CognitiveFusionFailure('PROVENANCE_TAMPERED');
        await client.query('COMMIT');
        return { result, replay: true };
      }

      const completedAt = new Date().toISOString();
      const fusionRequestId = row.fusion_request_id ?? input.fusionRequestId;
      const fusionResultId = row.fusion_result_id ?? input.fusionResultId;
      const result = await input.produce(
        completedAt,
        fusionRequestId,
        fusionResultId,
        input.requestId,
        input.correlationId,
      );
      const resultHash = sha256(canonicalJson(result));
      const refused = result.status === 'REFUSED';
      const updated = await client.query(
        `UPDATE cyberdefense.fusion_command_receipts SET
           status='COMPLETED',fusion_request_id=$3,fusion_result_id=$4,result_hash=$5,
           completed_at=$6,row_version=row_version+1
         WHERE tenant_id=$1 AND idempotency_key=$2 AND status='IN_PROGRESS'`,
        [
          input.tenantId,
          input.idempotencyKey,
          fusionRequestId,
          fusionResultId,
          resultHash,
          completedAt,
        ],
      );
      if (updated.rowCount !== 1) throw new CognitiveFusionFailure('REPLAY_CONFLICT');
      this.testOnlyFailure?.('after-receipt');

      await client.query(
        `INSERT INTO platform.audit_logs
          (id,tenant_id,actor_user_id,action,resource,outcome,classification,
           correlation_id,request_id,metadata)
          VALUES(gen_random_uuid(),$1,$2,'cyberdefense.fusion.request',
            'cyberdefense:fusion-request:'||$3,$7,'SECURITY',$4,$5,
            jsonb_strip_nulls(jsonb_build_object('fusion_request_id',$3,
              'fusion_result_id',$6::uuid,'failure_code',$8::text,
              'request_schema_version','1.0.0','result_schema_version','1.0.0')))`,
        [
          input.tenantId,
          input.actorUserId,
          fusionRequestId,
          input.correlationId,
          input.requestId,
          fusionResultId,
          refused ? 'DENIED' : 'ALLOWED',
          refused ? result.failure_code : null,
        ],
      );
      this.testOnlyFailure?.('after-audit');

      const versions = {
        request_schema_version: '1.0.0',
        result_schema_version: '1.0.0',
        reference_schema_version: '1.0.0',
        provenance_schema_version: '1.0.0',
        confidence_schema_version: '1.0.0',
        reasoning_policy_version: '1.0.0',
        confidence_policy_version: '1.0.0',
        content_policy_version: '1.0.0',
      } as const;
      const requested = fusionRequestedPayloadSchema.parse({
        fusion_request_id: fusionRequestId,
        reasoning_mode: input.reasoningMode,
        reasoning_purpose: input.reasoningPurpose,
        evidence_reference_count: input.evidenceReferenceCount,
        observable_reference_count: 0,
        entity_reference_count: 0,
        correlation_reference_count: 0,
        graph_reference_count: 0,
        context_snapshot_present: input.contextSnapshotPresent,
        ...versions,
      });
      await this.event(
        client,
        input,
        'cyberdefense.fusion.requested',
        result.classification,
        requested,
      );
      this.testOnlyFailure?.('after-requested-outbox');

      if (refused) {
        const failed = fusionFailedPayloadSchema.parse({
          fusion_request_id: fusionRequestId,
          fusion_result_id: fusionResultId,
          failure_code: result.failure_code,
          dependency_class: 'NONE',
          ...versions,
        });
        await this.event(
          client,
          input,
          'cyberdefense.fusion.failed',
          result.classification,
          failed,
        );
      } else {
        const completed = fusionCompletedPayloadSchema.parse({
          fusion_request_id: fusionRequestId,
          fusion_result_id: fusionResultId,
          status: 'COMPLETED',
          assertion_count: result.assertions.length,
          hypothesis_count: result.hypotheses.length,
          cross_domain_assertion_count: result.cross_domain_assertions.length,
          evidence_gap_count: result.evidence_gaps.length,
          investigation_action_count: result.recommended_investigation_actions.length,
          response_candidate_count: result.response_candidates?.length ?? 0,
          ...versions,
        });
        await this.event(
          client,
          input,
          'cyberdefense.fusion.completed',
          result.classification,
          completed,
        );
      }
      this.testOnlyFailure?.('after-completed-outbox');
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return { result, replay: false };
    } catch (error) {
      await client.query('ROLLBACK');
      const boundedError =
        error instanceof CognitiveFusionFailure
          ? error
          : new CognitiveFusionFailure('DEPENDENCY_UNAVAILABLE');
      if (contextActivated)
        await this.persistFailure(input, boundedError.code, boundedError.dependencyClass).catch(
          () => undefined,
        );
      throw boundedError;
    } finally {
      client.release();
    }
  }

  private async persistFailure(
    input: Parameters<FusionReceiptRepository['execute']>[0],
    failureCode: FusionFailureCode,
    dependencyClass?: CognitiveFusionFailure['dependencyClass'],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [input.contextToken, 'cyberdefense.fusion.request'],
      );
      if (active.rowCount !== 1) throw new CognitiveFusionFailure('TENANT_CONTEXT_INVALID');
      const inserted = await client.query(
        `INSERT INTO cyberdefense.fusion_command_receipts
          (tenant_id,idempotency_key,request_hash,operation,request_schema_version,
           result_schema_version,reference_schema_version,status,fusion_request_id,
           request_id,correlation_id,failure_code,completed_at,expires_at)
         VALUES($1,$2,$3,'cyberdefense.fusion.request','1.0.0','1.0.0','1.0.0',
           'FAILED',$4,$5,$6,$7,clock_timestamp(),$8)
         ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.requestHash,
          input.fusionRequestId,
          input.requestId,
          input.correlationId,
          failureCode,
          input.expiresAt,
        ],
      );
      const row = await client.query<ReceiptRow>(
        `SELECT request_hash,status,fusion_request_id,fusion_result_id,result_hash,
                request_id,correlation_id,failure_code,completed_at,expires_at
         FROM cyberdefense.fusion_command_receipts
         WHERE tenant_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.tenantId, input.idempotencyKey],
      );
      const receipt = row.rows[0];
      if (
        !receipt ||
        receipt.request_hash !== input.requestHash ||
        receipt.status === 'COMPLETED'
      ) {
        await client.query('ROLLBACK');
        return;
      }
      if (receipt.status === 'FAILED' && inserted.rowCount === 0) {
        await client.query('COMMIT');
        return;
      }
      const failedRequestId = receipt.fusion_request_id ?? input.fusionRequestId;
      if (receipt.status === 'IN_PROGRESS')
        await client.query(
          `UPDATE cyberdefense.fusion_command_receipts SET status='FAILED',
             fusion_request_id=$3,fusion_result_id=NULL,result_hash=NULL,failure_code=$4,
             completed_at=clock_timestamp(),row_version=row_version+1
           WHERE tenant_id=$1 AND idempotency_key=$2`,
          [input.tenantId, input.idempotencyKey, failedRequestId, failureCode],
        );
      await client.query(
        `INSERT INTO platform.audit_logs
          (id,tenant_id,actor_user_id,action,resource,outcome,classification,
           correlation_id,request_id,metadata)
         VALUES(gen_random_uuid(),$1,$2,'cyberdefense.fusion.request',
           'cyberdefense:fusion-request:'||$3,'DENIED','SECURITY',$4,$5,
           jsonb_build_object('failure_code',$6::text,'request_schema_version','1.0.0'))`,
        [
          input.tenantId,
          input.actorUserId,
          failedRequestId,
          input.correlationId,
          input.requestId,
          failureCode,
        ],
      );
      const versions = {
        request_schema_version: '1.0.0',
        result_schema_version: '1.0.0',
        reference_schema_version: '1.0.0',
        provenance_schema_version: '1.0.0',
        confidence_schema_version: '1.0.0',
        reasoning_policy_version: '1.0.0',
        confidence_policy_version: '1.0.0',
        content_policy_version: '1.0.0',
      } as const;
      const payload = fusionFailedPayloadSchema.parse({
        fusion_request_id: failedRequestId,
        failure_code: failureCode,
        dependency_class: dependencyClass ?? failureDependency(failureCode),
        ...versions,
      });
      await this.event(client, input, 'cyberdefense.fusion.failed', 'INTERNAL', payload);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async event(
    client: pg.PoolClient,
    input: Parameters<FusionReceiptRepository['execute']>[0],
    eventType: string,
    classification: FusionResult['classification'],
    payload: object,
  ) {
    await client.query(
      `INSERT INTO platform.domain_events
        (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
       VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api',$5,$6)`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        classification,
        payload,
      ],
    );
  }
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function failureDependency(code: FusionFailureCode) {
  if (code === 'REFERENCE_OWNER_UNAVAILABLE') return 'XCAP005_EVIDENCE' as const;
  if (code === 'TENANT_CONTEXT_INVALID' || code === 'CONTEXT_STALE')
    return 'PLATFORM_CONTEXT' as const;
  if (code === 'AUTHORIZATION_DENIED' || code === 'REFERENCE_UNAUTHORIZED')
    return 'AUTHORIZATION' as const;
  if (code === 'DEPENDENCY_UNAVAILABLE' || code === 'DEPENDENCY_TIMEOUT')
    return 'IDEMPOTENCY_RECEIPT' as const;
  return 'NONE' as const;
}
