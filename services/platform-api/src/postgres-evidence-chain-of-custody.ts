import { createHash } from 'node:crypto';
import pg from 'pg';
import type {
  EvidenceClassification,
  EvidenceCollect,
  EvidenceRecord,
  EvidenceSource,
} from '@acs/contracts';
import { MultiPersonAuthorizationFailure } from './multi-person-authorization.js';
import {
  withMultiPersonAuthorizationConsumption,
  type PostgresMpaTransaction,
} from './postgres-multi-person-authorization.js';
import {
  EVIDENCE_CANONICALIZATION_VERSION,
  EVIDENCE_CONTRACT_VERSION,
  EvidenceChainOfCustodyFailure,
  canonicalizeMetadata,
  type EvidenceMutationReceipt,
  type EvidenceRepository,
} from './evidence-chain-of-custody.js';

const { Pool } = pg;
type RecordRow = {
  evidence_id: string;
  tenant_id: string;
  evidence_source_id: string;
  parent_evidence_id: string | null;
  blob_reference_id: string;
  media_type: string;
  size_bytes: string | number;
  content_sha256: string;
  metadata_sha256: string;
  classification: EvidenceClassification;
  integrity_status: 'VERIFIED' | 'FAILED' | 'UNVERIFIABLE';
  operational_status: 'AVAILABLE' | 'QUARANTINED' | 'DESTRUCTION_AUTHORIZED';
  version: string | number;
  created_at: Date | string;
};
type SourceRow = {
  source_id: string;
  tenant_id: string;
  machine_principal_id: string;
  source_type: string;
  connector_type: string;
  external_binding: string;
  credential_reference: string;
  trust_classification: 'UNTRUSTED' | 'VALIDATED' | 'TRUSTED';
  status: 'UNREGISTERED' | 'REGISTERED' | 'QUARANTINED' | 'REVOKED';
  ingestion_policy_version: string;
  version: string | number;
  created_at: Date | string;
};

interface RepositoryContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

interface EvidenceInsertContext extends RepositoryContext {
  readonly evidenceId: string;
  readonly blobReferenceId: string;
  readonly rawBytes: Buffer;
  readonly contentHash: string;
  readonly metadataHash: string;
  readonly command: EvidenceCollect;
}

interface RetentionContext extends RepositoryContext {
  readonly evidenceId: string;
  readonly retentionPolicyId?: string;
  readonly retention_policy_id?: string;
  readonly reasonReference?: string;
  readonly command?: EvidenceCollect | { readonly reason_reference?: string };
}

const recordSelect = `SELECT r.evidence_id,r.tenant_id,r.evidence_source_id,r.parent_evidence_id,r.blob_reference_id,
 b.media_type,b.size_bytes,b.content_sha256,r.metadata_sha256,
 COALESCE((SELECT d.classification FROM cyberdefense.evidence_classification_decisions d WHERE d.tenant_id=r.tenant_id AND d.evidence_id=r.evidence_id ORDER BY d.decided_at DESC,d.decision_id DESC LIMIT 1),r.classification_at_ingest) classification,
 COALESCE((SELECT v.outcome FROM cyberdefense.evidence_integrity_verifications v WHERE v.tenant_id=r.tenant_id AND v.evidence_id=r.evidence_id ORDER BY v.verified_at DESC,v.verification_id DESC LIMIT 1),'VERIFIED') integrity_status,
 CASE WHEN EXISTS(SELECT 1 FROM cyberdefense.evidence_retention_bindings rb WHERE rb.tenant_id=r.tenant_id AND rb.evidence_id=r.evidence_id AND rb.action='DESTRUCTION_AUTHORIZED') THEN 'DESTRUCTION_AUTHORIZED'
      WHEN EXISTS(SELECT 1 FROM cyberdefense.evidence_custody_entries c WHERE c.tenant_id=r.tenant_id AND c.evidence_id=r.evidence_id AND c.action='QUARANTINE') THEN 'QUARANTINED' ELSE 'AVAILABLE' END operational_status,
 COALESCE((SELECT max(c.sequence) FROM cyberdefense.evidence_custody_entries c WHERE c.tenant_id=r.tenant_id AND c.evidence_id=r.evidence_id),1) version,r.created_at
 FROM cyberdefense.evidence_records r JOIN cyberdefense.evidence_blob_references b USING(tenant_id,blob_reference_id)`;

export type EvidenceTransactionPhase =
  | 'after-domain-write'
  | 'after-custody'
  | 'after-audit'
  | 'after-outbox'
  | 'after-idempotency'
  | 'before-commit';

export class PostgresEvidenceChainOfCustodyRepository implements EvidenceRepository {
  private readonly pool: pg.Pool;
  constructor(
    databaseUrl: string,
    private readonly testOnlyFailure?: (phase: EvidenceTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 8 });
  }
  async close() {
    await this.pool.end();
  }

  async registerSource(input: Parameters<EvidenceRepository['registerSource']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.collect', async (c) =>
      this.idempotent(c, input, async () => {
        const principal = await c.query<{ id: string }>(
          'SELECT cyberdefense.register_evidence_machine_principal($1,$2,$3) id',
          [input.tenantId, input.sourceId, 'cyberdefense.evidence.collect'],
        );
        if (!principal.rows[0])
          throw new EvidenceChainOfCustodyFailure(
            'FORBIDDEN',
            'Evidence source registration was denied.',
          );
        const result = await c.query<SourceRow>(
          `INSERT INTO cyberdefense.evidence_sources
       (source_id,tenant_id,machine_principal_id,source_type,connector_type,external_binding,credential_reference,trust_classification,ingestion_policy_version,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            input.sourceId,
            input.tenantId,
            principal.rows[0].id,
            input.command.source_type,
            input.command.connector_type,
            input.command.external_binding,
            input.command.credential_reference,
            input.command.trust_classification,
            input.command.ingestion_policy_version,
            input.userId,
          ],
        );
        await this.audit(
          c,
          input,
          'cyberdefense.evidence.source.register',
          'cyberdefense:evidence-source:' + input.sourceId,
          { source_id: input.sourceId },
        );
        return mapSource(result.rows[0]!);
      }),
    );
  }

  async transitionSource(input: Parameters<EvidenceRepository['transitionSource']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.collect', async (c) =>
      this.idempotent(c, input, async () => {
        const result = await c.query<SourceRow>(
          `UPDATE cyberdefense.evidence_sources SET status=$1,version=version+1,updated_at=clock_timestamp()
       WHERE tenant_id=$2 AND source_id=$3 AND version=$4 AND status<>'REVOKED' RETURNING *`,
          [input.command.status, input.tenantId, input.sourceId, input.command.expected_version],
        );
        if (!result.rows[0])
          throw new EvidenceChainOfCustodyFailure(
            'STALE_VERSION',
            'Evidence source transition is unavailable.',
          );
        await c.query('SELECT platform.set_machine_principal_status($1,$2,$3,$4)', [
          result.rows[0].machine_principal_id,
          input.tenantId,
          input.command.status === 'REGISTERED'
            ? 'ACTIVE'
            : input.command.status === 'QUARANTINED'
              ? 'DISABLED'
              : 'REVOKED',
          'cyberdefense.evidence.collect',
        ]);
        await this.audit(
          c,
          input,
          'cyberdefense.evidence.source.transition',
          'cyberdefense:evidence-source:' + input.sourceId,
          { source_id: input.sourceId, status: input.command.status },
        );
        return mapSource(result.rows[0]);
      }),
    );
  }

  async collect(input: Parameters<EvidenceRepository['collect']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.collect', async (c) =>
      this.idempotent(c, input, async () => {
        const source = await c.query(
          `SELECT 1 FROM cyberdefense.evidence_sources WHERE tenant_id=$1 AND source_id=$2 AND status='REGISTERED' AND trust_classification IN ('VALIDATED','TRUSTED') FOR SHARE`,
          [input.tenantId, input.command.evidence_source_id],
        );
        if (!source.rows[0])
          throw new EvidenceChainOfCustodyFailure(
            'SOURCE_UNAVAILABLE',
            'Evidence source is unavailable.',
          );
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${input.tenantId}:${input.command.evidence_source_id}:${input.command.source_event_id}`,
        ]);
        const replay = await c.query<{ evidence_id: string; ingestion_request_hash: string }>(
          `SELECT evidence_id,ingestion_request_hash FROM cyberdefense.evidence_records
       WHERE tenant_id=$1 AND evidence_source_id=$2 AND source_event_id=$3`,
          [input.tenantId, input.command.evidence_source_id, input.command.source_event_id],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].ingestion_request_hash !== input.requestHash)
            throw new EvidenceChainOfCustodyFailure(
              'IDEMPOTENCY_CONFLICT',
              'Source event replay conflicts with its canonical request.',
            );
          return this.mustRead(c, input.tenantId, replay.rows[0].evidence_id);
        }

        await this.insertEvidence(c, input, input.command.evidence_source_id, null);
        return this.mustRead(c, input.tenantId, input.evidenceId);
      }),
    );
  }

  async read(input: Parameters<EvidenceRepository['read']>[0]) {
    return this.transaction(
      input.contextToken,
      input.permission ?? 'cyberdefense.evidence.read',
      async (c) => this.readRecord(c, input.tenantId, input.evidenceId),
    );
  }

  async readContent(input: Parameters<EvidenceRepository['readContent']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.read', async (c) => {
      const result = await c.query<{ raw_bytes: Buffer }>(
        `SELECT b.raw_bytes FROM cyberdefense.evidence_records r
       JOIN cyberdefense.evidence_blob_references b USING(tenant_id,blob_reference_id)
       WHERE r.tenant_id=$1 AND r.evidence_id=$2
       AND NOT EXISTS(SELECT 1 FROM cyberdefense.evidence_retention_bindings rb WHERE rb.tenant_id=r.tenant_id AND rb.evidence_id=r.evidence_id AND rb.action='DESTRUCTION_AUTHORIZED')
       AND NOT EXISTS(SELECT 1 FROM cyberdefense.evidence_integrity_verifications v WHERE v.tenant_id=r.tenant_id AND v.evidence_id=r.evidence_id AND v.outcome<>'VERIFIED' AND v.verified_at=(SELECT max(v2.verified_at) FROM cyberdefense.evidence_integrity_verifications v2 WHERE v2.tenant_id=v.tenant_id AND v2.evidence_id=v.evidence_id))`,
        [input.tenantId, input.evidenceId],
      );
      return result.rows[0]?.raw_bytes ?? null;
    });
  }

  async verify(input: Parameters<EvidenceRepository['verify']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.verify', async (c) =>
      this.idempotent(c, input, async () => {
        const current = await this.lockVersion(
          c,
          input.tenantId,
          input.evidenceId,
          input.expectedVersion,
        );
        const computed = await c.query<{
          raw_bytes: Buffer;
          canonical_metadata: Record<string, unknown>;
        }>(
          `SELECT b.raw_bytes,r.canonical_metadata FROM cyberdefense.evidence_records r JOIN cyberdefense.evidence_blob_references b USING(tenant_id,blob_reference_id) WHERE r.tenant_id=$1 AND r.evidence_id=$2`,
          [input.tenantId, input.evidenceId],
        );
        const contentHash =
          computed.rows[0] === undefined
            ? '0'.repeat(64)
            : createHash('sha256').update(computed.rows[0].raw_bytes).digest('hex');
        const metadataHash =
          computed.rows[0] === undefined
            ? '0'.repeat(64)
            : createHash('sha256')
                .update(canonicalizeMetadata(computed.rows[0].canonical_metadata))
                .digest('hex');
        const reason =
          contentHash !== current.content_sha256
            ? 'CONTENT_HASH_MISMATCH'
            : metadataHash !== current.metadata_sha256
              ? 'METADATA_HASH_MISMATCH'
              : null;
        const outcome = reason === null ? 'VERIFIED' : 'FAILED';
        await c.query(
          `INSERT INTO cyberdefense.evidence_integrity_verifications(tenant_id,evidence_id,outcome,bounded_reason,verifier_user_id,content_sha256,metadata_sha256,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            input.tenantId,
            input.evidenceId,
            outcome,
            reason,
            input.userId,
            contentHash,
            metadataHash,
            input.requestId,
            input.correlationId,
          ],
        );
        await this.custody(
          c,
          input,
          input.evidenceId,
          outcome === 'FAILED' ? 'QUARANTINE' : 'VERIFY',
          reason,
        );
        await this.evidence(
          c,
          input,
          input.evidenceId,
          outcome === 'FAILED'
            ? 'cyberdefense.evidence.integrity_failed'
            : 'cyberdefense.evidence.integrity_verified',
          { integrity_status: outcome },
        );
        if (outcome === 'FAILED')
          await this.evidence(c, input, input.evidenceId, 'cyberdefense.evidence.quarantined', {
            reason_code: reason,
          });
        return this.mustRead(c, input.tenantId, input.evidenceId);
      }),
    );
  }

  async derive(input: Parameters<EvidenceRepository['derive']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.derive', async (c) =>
      this.idempotent(c, input, async () => {
        const parent = await this.lockVersion(
          c,
          input.tenantId,
          input.parentEvidenceId,
          input.expectedVersion,
        );
        if (parent.integrity_status !== 'VERIFIED' || parent.operational_status !== 'AVAILABLE')
          throw new EvidenceChainOfCustodyFailure(
            'INTEGRITY_FAILED',
            'Derived evidence requires a verified available parent.',
          );
        await this.insertEvidence(c, input, parent.evidence_source_id, input.parentEvidenceId);
        await c.query(
          `INSERT INTO cyberdefense.evidence_derivations(tenant_id,parent_evidence_id,derived_evidence_id,transformation_id,transformation_version,actor_user_id,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            input.tenantId,
            input.parentEvidenceId,
            input.evidenceId,
            input.transformationId,
            input.transformationVersion,
            input.userId,
            input.requestId,
            input.correlationId,
          ],
        );
        return this.mustRead(c, input.tenantId, input.evidenceId);
      }),
    );
  }

  async appendGovernanceFact(input: Parameters<EvidenceRepository['appendGovernanceFact']>[0]) {
    return this.transaction(input.contextToken, 'cyberdefense.evidence.retain', async (c) =>
      this.idempotent(c, input, async () => {
        await this.lockVersion(c, input.tenantId, input.evidenceId, input.expectedVersion);
        if (input.action === 'CLASSIFY')
          await c.query(
            `INSERT INTO cyberdefense.evidence_classification_decisions(tenant_id,evidence_id,classification,actor_user_id,reason_reference,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              input.tenantId,
              input.evidenceId,
              input.classification,
              input.userId,
              input.reasonReference,
              input.requestId,
              input.correlationId,
            ],
          );
        else if (input.action === 'RETENTION_APPLIED')
          await this.retention(c, input, null, 'APPLY');
        else
          await c.query(
            `INSERT INTO cyberdefense.evidence_legal_hold_decisions(tenant_id,evidence_id,hold_reference,action,actor_user_id,reason_reference,request_id,correlation_id) VALUES($1,$2,$3,'APPLY',$4,$5,$6,$7)`,
            [
              input.tenantId,
              input.evidenceId,
              input.reasonReference,
              input.userId,
              input.reasonReference,
              input.requestId,
              input.correlationId,
            ],
          );
        await this.custody(
          c,
          input,
          input.evidenceId,
          input.action === 'LEGAL_HOLD_APPLIED'
            ? 'LEGAL_HOLD'
            : input.action === 'CLASSIFY'
              ? 'CLASSIFICATION'
              : 'RETENTION_APPLIED',
          input.reasonReference,
        );
        await this.audit(
          c,
          input,
          'cyberdefense.evidence.retain',
          'cyberdefense:evidence:' + input.evidenceId,
          { evidence_id: input.evidenceId, action: input.action },
        );
        if (input.action !== 'CLASSIFY')
          await this.evidence(
            c,
            input,
            input.evidenceId,
            'cyberdefense.evidence.retention_applied',
            { action: input.action },
          );
        return this.mustRead(c, input.tenantId, input.evidenceId);
      }),
    );
  }

  async consumeProtectedOperation(
    input: Parameters<EvidenceRepository['consumeProtectedOperation']>[0],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transaction: PostgresMpaTransaction = {
        kind: 'canonical-postgres-transaction',
        client,
      };
      const consumed = await withMultiPersonAuthorizationConsumption({
        transaction,
        contextToken: input.contextToken,
        tenantId: input.tenantId,
        authorizationId: input.command.authorization_id,
        expectedVersion: input.command.authorization_expected_version,
        operation: input.operation,
        targetReferenceHash: input.targetReferenceHash,
        policyId: input.policyId,
        policyVersion: '1.0.0',
        actorUserId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        requestId: input.requestId,
        correlationId: input.correlationId,
        attestationReferenceHash: hash(input.command.attestation_reference),
        verifyAttestation: input.verifyAttestation,
        protectedOperation: async () => {
          const current = await this.lockVersion(
            client,
            input.tenantId,
            input.evidenceId,
            input.command.expected_version,
          );
          if (current.integrity_status !== 'VERIFIED')
            throw new EvidenceChainOfCustodyFailure(
              'INTEGRITY_FAILED',
              'Evidence integrity validation failed.',
            );
          if (
            input.action === 'DESTROY' &&
            (await this.hasActiveHold(client, input.tenantId, input.evidenceId))
          )
            throw new EvidenceChainOfCustodyFailure(
              'LEGAL_HOLD_ACTIVE',
              'Evidence is protected by legal hold.',
            );
          if (
            input.action === 'DESTROY' &&
            !(await this.isRetentionExpired(client, input.tenantId, input.evidenceId))
          )
            throw new EvidenceChainOfCustodyFailure(
              'RETENTION_NOT_ELIGIBLE',
              'Evidence retention has not expired.',
            );
          if (input.action === 'EXPORT')
            await client.query(
              `INSERT INTO cyberdefense.evidence_exports(tenant_id,evidence_id,requester_user_id,mpa_authorization_id,classification,content_sha256,reason_reference,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                input.tenantId,
                input.evidenceId,
                input.userId,
                input.command.authorization_id,
                current.classification,
                current.content_sha256,
                input.command.reason_reference,
                input.requestId,
                input.correlationId,
              ],
            );
          else if (input.action === 'RETENTION_OVERRIDE')
            await this.retention(
              client,
              { ...input, retentionPolicyId: current.retention_policy_id },
              input.command.authorization_id,
              'OVERRIDE',
            );
          else if (input.action === 'LEGAL_HOLD_RELEASE')
            await client.query(
              `INSERT INTO cyberdefense.evidence_legal_hold_decisions(tenant_id,evidence_id,hold_reference,action,actor_user_id,reason_reference,mpa_authorization_id,request_id,correlation_id) VALUES($1,$2,$3,'RELEASE',$4,$5,$6,$7,$8)`,
              [
                input.tenantId,
                input.evidenceId,
                input.command.hold_reference,
                input.userId,
                input.command.reason_reference,
                input.command.authorization_id,
                input.requestId,
                input.correlationId,
              ],
            );
          else
            await this.retention(
              client,
              { ...input, retentionPolicyId: current.retention_policy_id },
              input.command.authorization_id,
              'DESTRUCTION_AUTHORIZED',
            );
          await this.custody(
            client,
            input,
            input.evidenceId,
            input.action === 'RETENTION_OVERRIDE'
              ? 'RETENTION_APPLIED'
              : input.action === 'LEGAL_HOLD_RELEASE'
                ? 'LEGAL_HOLD'
                : input.action,
            input.command.reason_reference,
          );
          await this.audit(
            client,
            input,
            input.operation,
            'cyberdefense:evidence:' + input.evidenceId,
            { evidence_id: input.evidenceId, authorization_id: input.command.authorization_id },
          );
          await this.evidence(
            client,
            input,
            input.evidenceId,
            input.action === 'EXPORT'
              ? 'cyberdefense.evidence.exported'
              : 'cyberdefense.evidence.retention_applied',
            { action: input.action, authorization_id: input.command.authorization_id },
          );
          return this.mustRead(client, input.tenantId, input.evidenceId);
        },
      });
      if (consumed.status === 'EXPIRED')
        throw new EvidenceChainOfCustodyFailure(
          'MPA_DENIED',
          'Multi-person authorization expired.',
        );
      await client.query('COMMIT');
      return { data: consumed.result, replay: false };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof MultiPersonAuthorizationFailure)
        throw new EvidenceChainOfCustodyFailure(
          'MPA_DENIED',
          'Multi-person authorization was denied.',
        );
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertEvidence(
    c: pg.PoolClient,
    input: EvidenceInsertContext,
    sourceId: string,
    parentId: string | null,
  ) {
    await c.query(
      `INSERT INTO cyberdefense.evidence_blob_references(blob_reference_id,tenant_id,raw_bytes,media_type,size_bytes,content_sha256) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        input.blobReferenceId,
        input.tenantId,
        input.rawBytes,
        input.command.media_type,
        input.rawBytes.length,
        input.contentHash,
      ],
    );
    await c.query(
      `INSERT INTO cyberdefense.evidence_records(evidence_id,tenant_id,evidence_source_id,parent_evidence_id,blob_reference_id,source_event_id,canonicalization_version,canonical_metadata,metadata_sha256,ingestion_request_hash,classification_at_ingest,retention_policy_id,observed_at,collected_by,request_id,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        input.evidenceId,
        input.tenantId,
        sourceId,
        parentId,
        input.blobReferenceId,
        input.command.source_event_id,
        EVIDENCE_CANONICALIZATION_VERSION,
        input.command.metadata,
        input.metadataHash,
        input.requestHash,
        input.command.classification,
        input.command.retention_policy_id,
        input.command.observed_at,
        input.userId,
        input.requestId,
        input.correlationId,
      ],
    );
    await c.query(
      `INSERT INTO cyberdefense.evidence_integrity_verifications(tenant_id,evidence_id,outcome,verifier_user_id,content_sha256,metadata_sha256,request_id,correlation_id) VALUES($1,$2,'VERIFIED',$3,$4,$5,$6,$7)`,
      [
        input.tenantId,
        input.evidenceId,
        input.userId,
        input.contentHash,
        input.metadataHash,
        input.requestId,
        input.correlationId,
      ],
    );
    await this.retention(
      c,
      {
        ...input,
        retentionPolicyId: input.command.retention_policy_id,
        reasonReference: 'INITIAL_RETENTION_BINDING',
      },
      null,
      'APPLY',
    );
    await this.custody(c, input, input.evidenceId, parentId ? 'DERIVE' : 'COLLECT', null);
    await this.audit(
      c,
      input,
      parentId ? 'cyberdefense.evidence.derive' : 'cyberdefense.evidence.collect',
      'cyberdefense:evidence:' + input.evidenceId,
      { evidence_id: input.evidenceId, source_id: sourceId },
    );
    await this.evidence(
      c,
      input,
      input.evidenceId,
      parentId ? 'cyberdefense.evidence.derived' : 'cyberdefense.evidence.recorded',
      { source_id: sourceId },
    );
  }

  private async lockVersion(
    c: pg.PoolClient,
    tenantId: string,
    evidenceId: string,
    expected: number,
  ) {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      tenantId + ':' + evidenceId,
    ]);
    const current = await this.readRecord(c, tenantId, evidenceId);
    if (current === null)
      throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence was not found.');
    if (current.version !== expected)
      throw new EvidenceChainOfCustodyFailure('STALE_VERSION', 'Evidence version is stale.');
    const policy = await c.query<{ retention_policy_id: string }>(
      'SELECT retention_policy_id FROM cyberdefense.evidence_records WHERE tenant_id=$1 AND evidence_id=$2',
      [tenantId, evidenceId],
    );
    if (!policy.rows[0])
      throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence was not found.');
    return { ...current, retention_policy_id: policy.rows[0].retention_policy_id };
  }

  private async retention(
    c: pg.PoolClient,
    input: RetentionContext,
    authorizationId: string | null,
    action: 'APPLY' | 'OVERRIDE' | 'DESTRUCTION_AUTHORIZED',
  ) {
    const policyId = input.retentionPolicyId ?? input.retention_policy_id;
    const policy = await c.query<{ policy_version: string }>(
      `SELECT policy_version FROM cyberdefense.evidence_retention_policies WHERE tenant_id=$1 AND retention_policy_id=$2 AND status='ACTIVE' ORDER BY policy_version DESC LIMIT 1`,
      [input.tenantId, policyId],
    );
    if (!policy.rows[0])
      throw new EvidenceChainOfCustodyFailure(
        'RETENTION_NOT_ELIGIBLE',
        'Retention policy is unavailable.',
      );
    await c.query(
      `INSERT INTO cyberdefense.evidence_retention_bindings(tenant_id,evidence_id,retention_policy_id,policy_version,action,retention_start,retention_expiry,actor_user_id,reason_reference,mpa_authorization_id,request_id,correlation_id) SELECT $1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+expiry_interval,$6,$7,$8,$9,$10 FROM cyberdefense.evidence_retention_policies WHERE tenant_id=$1 AND retention_policy_id=$3 AND policy_version=$4`,
      [
        input.tenantId,
        input.evidenceId,
        policyId,
        policy.rows[0].policy_version,
        action,
        input.userId,
        input.reasonReference ??
          (input.command && 'reason_reference' in input.command
            ? input.command.reason_reference
            : undefined),
        authorizationId,
        input.requestId,
        input.correlationId,
      ],
    );
  }

  private async hasActiveHold(c: pg.PoolClient, tenantId: string, evidenceId: string) {
    const r = await c.query<{ action: 'APPLY' | 'RELEASE' }>(
      `SELECT action FROM cyberdefense.evidence_legal_hold_decisions WHERE tenant_id=$1 AND evidence_id=$2 ORDER BY decided_at DESC,hold_decision_id DESC LIMIT 1`,
      [tenantId, evidenceId],
    );
    return r.rows[0]?.action === 'APPLY';
  }
  private async isRetentionExpired(c: pg.PoolClient, tenantId: string, evidenceId: string) {
    const r = await c.query<{ eligible: boolean }>(
      `SELECT COALESCE((SELECT retention_expiry<=clock_timestamp() FROM cyberdefense.evidence_retention_bindings WHERE tenant_id=$1 AND evidence_id=$2 AND action IN ('APPLY','OVERRIDE') ORDER BY applied_at DESC,binding_id DESC LIMIT 1),false) eligible`,
      [tenantId, evidenceId],
    );
    return r.rows[0]?.eligible === true;
  }
  private async readRecord(c: pg.PoolClient, tenantId: string, evidenceId: string) {
    const r = await c.query<RecordRow>(
      recordSelect + ' WHERE r.tenant_id=$1 AND r.evidence_id=$2',
      [tenantId, evidenceId],
    );
    return r.rows[0] ? mapRecord(r.rows[0]) : null;
  }
  private async mustRead(c: pg.PoolClient, tenantId: string, evidenceId: string) {
    const r = await this.readRecord(c, tenantId, evidenceId);
    if (!r) throw new EvidenceChainOfCustodyFailure('NOT_FOUND', 'Evidence was not found.');
    return r;
  }
  private async custody(
    c: pg.PoolClient,
    input: RepositoryContext,
    evidenceId: string,
    action: string,
    reason: string | null,
  ) {
    await c.query(
      `INSERT INTO cyberdefense.evidence_custody_entries(tenant_id,evidence_id,sequence,action,actor_user_id,reason_reference,request_id,correlation_id) SELECT $1,$2,COALESCE(max(sequence),0)+1,$3,$4,$5,$6,$7 FROM cyberdefense.evidence_custody_entries WHERE tenant_id=$1 AND evidence_id=$2`,
      [
        input.tenantId,
        evidenceId,
        action,
        input.userId,
        reason,
        input.requestId,
        input.correlationId,
      ],
    );
    this.testOnlyFailure?.('after-custody');
  }
  private async audit(
    c: pg.PoolClient,
    input: RepositoryContext,
    action: string,
    resource: string,
    metadata: object,
  ) {
    await c.query(
      `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,$7)`,
      [
        input.tenantId,
        input.userId,
        action,
        resource,
        input.correlationId,
        input.requestId,
        metadata,
      ],
    );
    this.testOnlyFailure?.('after-audit');
  }
  private async evidence(
    c: pg.PoolClient,
    input: RepositoryContext,
    evidenceId: string,
    eventType: string,
    payload: object,
  ) {
    await c.query(
      `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',$5)`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        { evidence_id: evidenceId, request_id: input.requestId, ...payload },
      ],
    );
    this.testOnlyFailure?.('after-outbox');
  }
  private async idempotent<T>(
    c: pg.PoolClient,
    input: RepositoryContext,
    operation: () => Promise<T>,
  ): Promise<EvidenceMutationReceipt<T>> {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,0))", [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const prior = await c.query<{ request_hash: string; result: { data: T } }>(
      'SELECT request_hash,result FROM cyberdefense.evidence_command_results WHERE tenant_id=$1 AND idempotency_key=$2',
      [input.tenantId, input.idempotencyKey],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== input.requestHash)
        throw new EvidenceChainOfCustodyFailure('IDEMPOTENCY_CONFLICT', 'Idempotency conflict.');
      return { data: prior.rows[0].result.data, replay: true };
    }
    const data = await operation();
    await c.query(
      `INSERT INTO cyberdefense.evidence_command_results(tenant_id,idempotency_key,actor_id,command,request_hash,result) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        input.tenantId,
        input.idempotencyKey,
        input.userId,
        'xcap005.command',
        input.requestHash,
        { data },
      ],
    );
    this.testOnlyFailure?.('after-idempotency');
    return { data, replay: false };
  }
  private async transaction<T>(
    token: string,
    action: string,
    operation: (c: pg.PoolClient) => Promise<T>,
  ) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new EvidenceChainOfCustodyFailure(
          'FORBIDDEN',
          'Trusted tenant context activation failed.',
        );
      const result = await operation(c);
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

function mapRecord(r: RecordRow): EvidenceRecord {
  return {
    evidence_id: r.evidence_id,
    tenant_id: r.tenant_id,
    evidence_source_id: r.evidence_source_id,
    parent_evidence_id: r.parent_evidence_id,
    record_contract_version: EVIDENCE_CONTRACT_VERSION,
    blob_reference_id: r.blob_reference_id,
    media_type: r.media_type,
    size_bytes: Number(r.size_bytes),
    content_sha256: r.content_sha256,
    metadata_sha256: r.metadata_sha256,
    canonicalization_version: EVIDENCE_CANONICALIZATION_VERSION,
    classification: r.classification,
    integrity_status: r.integrity_status,
    operational_status: r.operational_status,
    version: Number(r.version),
    created_at: new Date(r.created_at).toISOString(),
  };
}
function mapSource(r: SourceRow): EvidenceSource {
  return {
    source_id: r.source_id,
    tenant_id: r.tenant_id,
    machine_principal_id: r.machine_principal_id,
    source_type: r.source_type,
    connector_type: r.connector_type,
    external_binding: r.external_binding,
    credential_reference: r.credential_reference,
    trust_classification: r.trust_classification,
    status: r.status,
    ingestion_policy_version: r.ingestion_policy_version,
    version: Number(r.version),
    created_at: new Date(r.created_at).toISOString(),
  };
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
