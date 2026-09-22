import { createHash } from 'node:crypto';
import pg from 'pg';
import type { XcfFrameworkRelease, XcfFrameworkSource, XcfPublisher } from '@acs/contracts';
import { MultiPersonAuthorizationFailure } from './multi-person-authorization.js';
import {
  withMultiPersonAuthorizationConsumption,
  type PostgresMpaTransaction,
} from './postgres-multi-person-authorization.js';
import {
  XcfM1Failure,
  type XcfM1MutationReceipt,
  type XcfM1Repository,
} from './xcf-framework-registry.js';
import type { XcfSourceIngestionPolicy } from './xcf-framework-artifact.js';

const { Pool } = pg;

type PublisherRow = {
  publisher_id: string;
  publisher_key: string;
  legal_name: string;
  trust_status: 'TRUSTED' | 'SUSPENDED' | 'REVOKED';
  version: string | number;
  created_at: Date | string;
};
type SourceRow = {
  source_id: string;
  publisher_id: string;
  framework_id: string;
  framework_key: string;
  framework_name: string;
  canonical_uri: string;
  status: XcfFrameworkSource['status'];
  version: string | number;
  created_at: Date | string;
};
type ReleaseRow = {
  release_id: string;
  source_id: string;
  framework_id: string;
  release_version: string;
  artifact_sha256: string;
  status: XcfFrameworkRelease['status'];
  version: string | number;
  object_count: string | number;
  created_at: Date | string;
};
type SourcePolicyRow = {
  source_id: string;
  publisher_id: string;
  publisher_trust_status: XcfSourceIngestionPolicy['publisherTrustStatus'];
  status: XcfSourceIngestionPolicy['status'];
  allowed_uri_prefixes: string[];
  source_format: string;
  signature_policy: XcfSourceIngestionPolicy['signaturePolicy'];
  trusted_key_reference: string;
  hash_algorithm: 'SHA-256';
  license: string;
  license_version: string;
  license_state: XcfSourceIngestionPolicy['licenseState'];
  license_allowed_use: XcfSourceIngestionPolicy['licenseAllowedUse'];
  license_activation_compatible: boolean;
  review_due_at: Date | string;
};
type CommandContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly correlationId: string;
};

export type XcfM1TransactionPhase =
  'after-domain-write' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'before-commit';

export class PostgresXcfFrameworkRegistryRepository implements XcfM1Repository {
  private readonly pool: pg.Pool;

  constructor(
    databaseUrl: string,
    private readonly testOnlyFailure?: (phase: XcfM1TransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 8 });
  }

  async close() {
    await this.pool.end();
  }

  async createPublisher(input: Parameters<XcfM1Repository['createPublisher']>[0]) {
    return this.transaction(input.contextToken, 'xcf.publisher.administer', async (client) =>
      this.idempotent(client, input, 'xcf.publisher.create', async () => {
        const result = await client.query<PublisherRow>(
          `INSERT INTO xcf.publishers
            (governance_tenant_id,publisher_id,publisher_key,legal_name,trust_status,created_by)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            input.tenantId,
            input.publisherId,
            input.command.publisher_key,
            input.command.legal_name,
            input.command.trust_status,
            input.userId,
          ],
        );
        const data = mapPublisher(result.rows[0]!);
        await this.lifecycle(
          client,
          input,
          'xcf.publisher.administer',
          'xcf.publisher.created',
          input.publisherId,
          data,
        );
        return data;
      }),
    );
  }

  async registerSource(input: Parameters<XcfM1Repository['registerSource']>[0]) {
    return this.transaction(input.contextToken, 'xcf.framework_source.register', async (client) =>
      this.idempotent(client, input, 'xcf.framework_source.register', async () => {
        const publisher = await client.query(
          `SELECT 1 FROM xcf.publishers
            WHERE governance_tenant_id=$1 AND publisher_id=$2 AND trust_status='TRUSTED'`,
          [input.tenantId, input.command.publisher_id],
        );
        if (publisher.rowCount !== 1) throw new XcfM1Failure('SOURCE_NOT_TRUSTED');
        await client.query(
          `INSERT INTO xcf.frameworks
            (governance_tenant_id,framework_id,publisher_id,framework_key,framework_name,created_by)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [
            input.tenantId,
            input.frameworkId,
            input.command.publisher_id,
            input.command.framework_key,
            input.command.framework_name,
            input.userId,
          ],
        );
        const result = await client.query<SourceRow>(
          `INSERT INTO xcf.framework_sources
            (governance_tenant_id,source_id,publisher_id,framework_id,framework_key,framework_name,
             canonical_uri,allowed_uri_prefixes,source_format,authentication_method,signature_policy,
             trusted_key_reference,hash_algorithm,license,license_version,license_state,
             license_allowed_use,license_activation_compatible,redistribution_constraints,status,
             review_due_at,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'VALIDATED',$20,$21)
           RETURNING *`,
          [
            input.tenantId,
            input.sourceId,
            input.command.publisher_id,
            input.frameworkId,
            input.command.framework_key,
            input.command.framework_name,
            input.command.canonical_uri,
            input.command.allowed_uri_prefixes,
            input.command.source_format,
            input.command.authentication_method,
            input.command.signature_policy,
            input.command.trusted_key_reference,
            input.command.hash_algorithm,
            input.command.license,
            input.command.license_version,
            input.command.license_state,
            input.command.license_allowed_use,
            input.command.license_activation_compatible,
            input.command.redistribution_constraints,
            input.command.review_due_at,
            input.userId,
          ],
        );
        const data = mapSource(result.rows[0]!);
        await this.lifecycle(
          client,
          input,
          'xcf.framework_source.register',
          'xcf.framework_source.registered',
          input.sourceId,
          data,
        );
        return data;
      }),
    );
  }

  async readSource(input: Parameters<XcfM1Repository['readSource']>[0]) {
    return this.transaction(input.contextToken, 'xcf.framework_source.read', async (client) => {
      const result = await client.query<SourceRow>(
        'SELECT * FROM xcf.framework_sources WHERE governance_tenant_id=$1 AND source_id=$2',
        [input.tenantId, input.sourceId],
      );
      return result.rows[0] ? mapSource(result.rows[0]) : null;
    });
  }

  async readSourceIngestionPolicy(
    input: Parameters<XcfM1Repository['readSourceIngestionPolicy']>[0],
  ) {
    return this.transaction(input.contextToken, 'xcf.framework_release.ingest', async (client) => {
      const result = await client.query<SourcePolicyRow>(
        `SELECT source.source_id,source.publisher_id,publisher.trust_status AS publisher_trust_status,
                source.status,source.allowed_uri_prefixes,source.source_format,
                source.signature_policy,source.trusted_key_reference,source.hash_algorithm,
                source.license,source.license_version,source.license_state,
                source.license_allowed_use,source.license_activation_compatible,source.review_due_at
           FROM xcf.framework_sources source
           JOIN xcf.publishers publisher
             ON publisher.governance_tenant_id=source.governance_tenant_id
            AND publisher.publisher_id=source.publisher_id
          WHERE source.governance_tenant_id=$1 AND source.source_id=$2`,
        [input.tenantId, input.sourceId],
      );
      return result.rows[0] ? mapSourcePolicy(result.rows[0]) : null;
    });
  }

  async recordIngestionFailure(input: Parameters<XcfM1Repository['recordIngestionFailure']>[0]) {
    await this.transaction(input.contextToken, 'xcf.framework_release.ingest', async (client) => {
      await this.idempotent(client, input, 'xcf.framework_release.ingestion-failed', async () => {
        const data = { status: 'FAILED', reason: input.reason } as const;
        await this.lifecycle(
          client,
          input,
          'xcf.framework_release.ingest',
          'xcf.framework_release.ingestion_failed',
          input.sourceId,
          data,
          'DENIED',
        );
        return data;
      });
    });
  }

  async ingestRelease(input: Parameters<XcfM1Repository['ingestRelease']>[0]) {
    return this.transaction(input.contextToken, 'xcf.framework_release.ingest', async (client) =>
      this.idempotent(client, input, 'xcf.framework_release.ingest', async () => {
        await lockRegistryResource(
          client,
          input.tenantId,
          'framework-source',
          input.command.source_id,
        );
        const source = await client.query<{
          framework_id: string;
          status: string;
          allowed_uri_prefixes: string[];
          trusted_key_reference: string;
        }>(
          `SELECT framework_id,status,allowed_uri_prefixes,trusted_key_reference
             FROM xcf.framework_sources
            WHERE governance_tenant_id=$1 AND source_id=$2
              AND review_due_at>clock_timestamp()`,
          [input.tenantId, input.command.source_id],
        );
        if (
          !source.rows[0] ||
          source.rows[0].status !== 'ACTIVE' ||
          !isAllowedArtifactUri(input.command.artifact_uri, source.rows[0].allowed_uri_prefixes)
        )
          throw new XcfM1Failure('SOURCE_NOT_TRUSTED');
        await client.query(
          `INSERT INTO xcf.source_artifacts
            (governance_tenant_id,artifact_id,source_id,artifact_uri,media_type,artifact_bytes,size_bytes,
             artifact_sha256,signature_result,signature_algorithm,trusted_key_reference,
             license_identity,license_version,retrieved_at,validation_policy_version,evidence_reference,
             correlation_id,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            input.tenantId,
            input.artifactId,
            input.command.source_id,
            input.command.artifact_uri,
            input.command.artifact_media_type,
            input.artifactBytes,
            input.artifactBytes.byteLength,
            input.artifactSha256,
            input.signatureResult,
            input.command.signature_algorithm,
            source.rows[0].trusted_key_reference,
            input.licenseIdentity,
            input.licenseVersion,
            input.command.retrieved_at,
            input.command.validation_policy_version,
            input.command.evidence_reference ?? null,
            input.correlationId,
            input.userId,
          ],
        );
        const status = input.quarantineReason === undefined ? 'INGESTED' : 'QUARANTINED';
        const result = await client.query<ReleaseRow>(
          `INSERT INTO xcf.framework_releases
            (governance_tenant_id,release_id,source_id,framework_id,artifact_id,release_version,
             released_at,status,status_reason_reference,artifact_sha256,object_count,ingested_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            input.tenantId,
            input.releaseId,
            input.command.source_id,
            source.rows[0].framework_id,
            input.artifactId,
            input.command.release_version,
            input.command.released_at,
            status,
            input.quarantineReason ?? null,
            input.artifactSha256,
            input.quarantineReason === undefined ? input.objects.length : 0,
            input.userId,
          ],
        );
        for (const object of input.quarantineReason === undefined ? input.objects : [])
          await client.query(
            `INSERT INTO xcf.framework_objects
              (governance_tenant_id,object_id,release_id,external_id,object_type,
               canonical_payload_sha256,parent_external_id)
             VALUES($1,gen_random_uuid(),$2,$3,$4,$5,$6)`,
            [
              input.tenantId,
              input.releaseId,
              object.external_id,
              object.object_type,
              object.canonical_payload_sha256,
              object.parent_external_id ?? null,
            ],
          );
        const data = mapRelease(result.rows[0]!);
        await this.lifecycle(
          client,
          input,
          'xcf.framework_release.ingest',
          input.quarantineReason === undefined
            ? 'xcf.framework_release.ingested'
            : 'xcf.framework_release.quarantined',
          input.releaseId,
          data,
          input.quarantineReason === undefined ? 'ALLOWED' : 'DENIED',
        );
        return data;
      }),
    );
  }

  async approveRelease(input: Parameters<XcfM1Repository['approveRelease']>[0]) {
    return this.transaction(input.contextToken, 'xcf.framework_release.approve', async (client) =>
      this.idempotent(client, input, 'xcf.framework_release.approve', async () => {
        const result = await client.query<ReleaseRow>(
          `UPDATE xcf.framework_releases
              SET status='APPROVED',version=version+1,approved_by=$1,approved_at=clock_timestamp()
            WHERE governance_tenant_id=$2 AND release_id=$3 AND status='INGESTED'
              AND version=$4 AND ingested_by<>$1 RETURNING *`,
          [input.userId, input.tenantId, input.releaseId, input.command.expected_version],
        );
        if (!result.rows[0]) throw new XcfM1Failure('INVALID_TRANSITION');
        const data = mapRelease(result.rows[0]);
        await this.lifecycle(
          client,
          input,
          'xcf.framework_release.approve',
          'xcf.framework_release.approved',
          input.releaseId,
          data,
        );
        return data;
      }),
    );
  }

  async transitionSource(input: Parameters<XcfM1Repository['transitionSource']>[0]) {
    if (input.transition === 'SUSPEND')
      return this.transaction(input.contextToken, 'xcf.framework_source.suspend', async (client) =>
        this.idempotent(client, input, 'xcf.framework_source.suspend', async () => {
          await lockRegistryResource(client, input.tenantId, 'framework-source', input.sourceId);
          const result = await client.query<SourceRow>(
            `UPDATE xcf.framework_sources SET status='SUSPENDED',version=version+1,
                status_reason_reference=$1,updated_at=clock_timestamp()
              WHERE governance_tenant_id=$2 AND source_id=$3 AND status='ACTIVE' AND version=$4
              RETURNING *`,
            [
              input.command.reason_reference,
              input.tenantId,
              input.sourceId,
              input.command.expected_version,
            ],
          );
          if (!result.rows[0]) throw new XcfM1Failure('INVALID_TRANSITION');
          const data = mapSource(result.rows[0]);
          await this.lifecycle(
            client,
            input,
            'xcf.framework_source.suspend',
            'xcf.framework_source.suspended',
            input.sourceId,
            data,
          );
          return data;
        }),
      );
    if (
      !('authorization_id' in input.command) ||
      input.targetReferenceHash === undefined ||
      input.verifyAttestation === undefined
    )
      throw new XcfM1Failure('MPA_DENIED');
    return this.protectedSource(input as ProtectedSourceInput);
  }

  async transitionRelease(input: Parameters<XcfM1Repository['transitionRelease']>[0]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transaction: PostgresMpaTransaction = {
        kind: 'canonical-postgres-transaction',
        client,
      };
      const operation =
        input.transition === 'ACTIVATE'
          ? 'xcf.framework_release.activate'
          : 'xcf.framework_release.revoke';
      const consumed = await withMultiPersonAuthorizationConsumption({
        transaction,
        contextToken: input.contextToken,
        tenantId: input.tenantId,
        authorizationId: input.command.authorization_id,
        expectedVersion: input.command.authorization_expected_version,
        operation,
        targetReferenceHash: input.targetReferenceHash,
        policyId:
          input.transition === 'ACTIVATE'
            ? 'xcf.framework_release.activate.standard'
            : 'xcf.framework_release.revoke.standard',
        policyVersion: '1.0.0',
        actorUserId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        requestId: input.requestId,
        correlationId: input.correlationId,
        attestationReferenceHash: sha256(input.command.attestation_reference),
        verifyAttestation: input.verifyAttestation,
        protectedOperation: async () => {
          const current = await client.query<
            ReleaseRow & {
              approved_by: string | null;
              source_status: string;
              publisher_trust_status: string;
              review_due_at: Date | string;
              source_license: string;
              source_license_version: string;
              license_state: string;
              license_allowed_use: string;
              license_activation_compatible: boolean;
              artifact_license: string | null;
              artifact_license_version: string | null;
              signature_result: string;
            }
          >(
            `SELECT release.*,source.status AS source_status,
                    publisher.trust_status AS publisher_trust_status,source.review_due_at,
                    source.license AS source_license,source.license_version AS source_license_version,
                    source.license_state,source.license_allowed_use,
                    source.license_activation_compatible,
                    artifact.license_identity AS artifact_license,
                    artifact.license_version AS artifact_license_version,
                    artifact.signature_result
               FROM xcf.framework_releases release
               JOIN xcf.framework_sources source
                 ON source.governance_tenant_id=release.governance_tenant_id
                AND source.source_id=release.source_id
               JOIN xcf.publishers publisher
                 ON publisher.governance_tenant_id=source.governance_tenant_id
                AND publisher.publisher_id=source.publisher_id
               JOIN xcf.source_artifacts artifact
                 ON artifact.governance_tenant_id=release.governance_tenant_id
                AND artifact.artifact_id=release.artifact_id
              WHERE release.governance_tenant_id=$1 AND release.release_id=$2
              FOR UPDATE OF release`,
            [input.tenantId, input.releaseId],
          );
          const row = current.rows[0];
          if (!row || Number(row.version) !== input.command.expected_version)
            throw new XcfM1Failure('STALE_VERSION');
          if (input.transition === 'ACTIVATE') {
            if (row.status !== 'APPROVED' || row.approved_by === input.userId)
              throw new XcfM1Failure('INVALID_TRANSITION');
            if (
              row.source_status !== 'ACTIVE' ||
              row.publisher_trust_status !== 'TRUSTED' ||
              new Date(row.review_due_at).getTime() <= Date.now() ||
              row.signature_result !== 'VALID'
            )
              throw new XcfM1Failure('SOURCE_NOT_TRUSTED');
            if (
              row.license_state !== 'ACTIVE' ||
              !row.license_activation_compatible ||
              !['ACS_INTERNAL', 'ACS_INTERNAL_AND_REDISTRIBUTION'].includes(
                row.license_allowed_use,
              ) ||
              row.artifact_license !== row.source_license ||
              row.artifact_license_version !== row.source_license_version
            )
              throw new XcfM1Failure('LICENSE_INVALID');
            const prior = await client.query<{ release_id: string }>(
              `UPDATE xcf.framework_releases SET status='SUPERSEDED',version=version+1,
                  updated_at=clock_timestamp()
                WHERE governance_tenant_id=$1 AND framework_id=$2 AND status='ACTIVE'
                RETURNING release_id`,
              [input.tenantId, row.framework_id],
            );
            for (const priorRow of prior.rows)
              await client.query(
                `INSERT INTO xcf.release_supersessions
                  (governance_tenant_id,prior_release_id,new_release_id,reason_reference,authorized_by)
                 VALUES($1,$2,$3,$4,$5)`,
                [
                  input.tenantId,
                  priorRow.release_id,
                  input.releaseId,
                  input.command.reason_reference,
                  input.userId,
                ],
              );
          } else if (!['APPROVED', 'ACTIVE'].includes(row.status)) {
            throw new XcfM1Failure('INVALID_TRANSITION');
          }
          const nextStatus = input.transition === 'ACTIVATE' ? 'ACTIVE' : 'REVOKED';
          const updated = await client.query<ReleaseRow>(
            `UPDATE xcf.framework_releases SET status=$1,version=version+1,
                status_reason_reference=$2,updated_at=clock_timestamp()
              WHERE governance_tenant_id=$3 AND release_id=$4 RETURNING *`,
            [nextStatus, input.command.reason_reference, input.tenantId, input.releaseId],
          );
          if (input.transition === 'REVOKE')
            await this.revocation(client, input, 'FRAMEWORK_RELEASE', input.releaseId);
          const data = mapRelease(updated.rows[0]!);
          await this.lifecycle(
            client,
            input,
            operation,
            input.transition === 'ACTIVATE'
              ? 'xcf.framework_release.activated'
              : 'xcf.framework_release.revoked',
            input.releaseId,
            data,
          );
          return data;
        },
      });
      if (consumed.status === 'EXPIRED') throw new XcfM1Failure('MPA_DENIED');
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return { data: consumed.result, replay: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw mapMpaFailure(error);
    } finally {
      client.release();
    }
  }

  private async protectedSource(input: ProtectedSourceInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transaction: PostgresMpaTransaction = {
        kind: 'canonical-postgres-transaction',
        client,
      };
      const operation =
        input.transition === 'ACTIVATE'
          ? 'xcf.framework_source.activate'
          : 'xcf.framework_source.revoke';
      const consumed = await withMultiPersonAuthorizationConsumption({
        transaction,
        contextToken: input.contextToken,
        tenantId: input.tenantId,
        authorizationId: input.command.authorization_id,
        expectedVersion: input.command.authorization_expected_version,
        operation,
        targetReferenceHash: input.targetReferenceHash,
        policyId:
          input.transition === 'ACTIVATE'
            ? 'xcf.framework_source.activate.standard'
            : 'xcf.framework_source.revoke.standard',
        policyVersion: '1.0.0',
        actorUserId: input.userId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        requestId: input.requestId,
        correlationId: input.correlationId,
        attestationReferenceHash: sha256(input.command.attestation_reference),
        verifyAttestation: input.verifyAttestation,
        protectedOperation: async () => {
          await lockRegistryResource(client, input.tenantId, 'framework-source', input.sourceId);
          const allowedFrom =
            input.transition === 'ACTIVATE' ? ['VALIDATED', 'SUSPENDED'] : ['ACTIVE', 'SUSPENDED'];
          const result = await client.query<SourceRow>(
            `UPDATE xcf.framework_sources SET status=$1,version=version+1,
                status_reason_reference=$2,updated_at=clock_timestamp()
              WHERE governance_tenant_id=$3 AND source_id=$4 AND version=$5 AND status=ANY($6::text[])
              RETURNING *`,
            [
              input.transition === 'ACTIVATE' ? 'ACTIVE' : 'REVOKED',
              input.transition === 'ACTIVATE' ? null : input.command.reason_reference,
              input.tenantId,
              input.sourceId,
              input.command.expected_version,
              allowedFrom,
            ],
          );
          if (!result.rows[0]) throw new XcfM1Failure('INVALID_TRANSITION');
          if (input.transition === 'REVOKE')
            await this.revocation(client, input, 'FRAMEWORK_SOURCE', input.sourceId);
          const data = mapSource(result.rows[0]);
          await this.lifecycle(
            client,
            input,
            operation,
            input.transition === 'ACTIVATE'
              ? 'xcf.framework_source.activated'
              : 'xcf.framework_source.revoked',
            input.sourceId,
            data,
          );
          return data;
        },
      });
      if (consumed.status === 'EXPIRED') throw new XcfM1Failure('MPA_DENIED');
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return { data: consumed.result, replay: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw mapMpaFailure(error);
    } finally {
      client.release();
    }
  }

  private async revocation(
    client: pg.PoolClient,
    input: ProtectedSourceInput | Parameters<XcfM1Repository['transitionRelease']>[0],
    targetType: 'FRAMEWORK_SOURCE' | 'FRAMEWORK_RELEASE',
    targetId: string,
  ) {
    await client.query(
      `INSERT INTO xcf.revocations
        (governance_tenant_id,revocation_id,target_type,target_id,reason_reference,
         mpa_authorization_id,effective_at,requested_by,downstream_invalidation_state)
       VALUES($1,gen_random_uuid(),$2,$3,$4,$5,clock_timestamp(),$6,'PENDING')`,
      [
        input.tenantId,
        targetType,
        targetId,
        input.command.reason_reference,
        input.command.authorization_id,
        input.userId,
      ],
    );
  }

  private async lifecycle<T>(
    client: pg.PoolClient,
    input: CommandContext,
    action: string,
    eventType: string,
    targetId: string,
    data: T,
    outcome: 'ALLOWED' | 'DENIED' = 'ALLOWED',
  ) {
    this.testOnlyFailure?.('after-domain-write');
    await client.query(
      `INSERT INTO platform.audit_logs
        (id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,
              jsonb_build_object('target_id',$8::uuid))`,
      [
        input.tenantId,
        input.userId,
        action,
        `xcf:${targetId}`,
        outcome,
        input.correlationId,
        input.requestId,
        targetId,
      ],
    );
    this.testOnlyFailure?.('after-audit');
    await client.query(
      `INSERT INTO platform.domain_events
        (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
       VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',$5)`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        { target_id: targetId, request_id: input.requestId },
      ],
    );
    this.testOnlyFailure?.('after-outbox');
    return data;
  }

  private async idempotent<T>(
    client: pg.PoolClient,
    input: CommandContext,
    command: string,
    operation: () => Promise<T>,
  ): Promise<XcfM1MutationReceipt<T>> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,0))", [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const prior = await client.query<{ request_hash: string; result: { data: T } }>(
      `SELECT request_hash,result FROM xcf.command_results
        WHERE governance_tenant_id=$1 AND idempotency_key=$2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== input.requestHash)
        throw new XcfM1Failure('IDEMPOTENCY_CONFLICT');
      return { data: prior.rows[0].result.data, replay: true };
    }
    const data = await operation();
    await client.query(
      `INSERT INTO xcf.command_results
        (governance_tenant_id,idempotency_key,actor_user_id,command,request_hash,result)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [input.tenantId, input.idempotencyKey, input.userId, command, input.requestHash, { data }],
    );
    this.testOnlyFailure?.('after-idempotency');
    return { data, replay: false };
  }

  private async transaction<T>(
    contextToken: string,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [contextToken, action],
      );
      if (active.rowCount !== 1) throw new XcfM1Failure('FORBIDDEN');
      const result = await work(client);
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

type ProtectedSourceInput = Parameters<XcfM1Repository['transitionSource']>[0] & {
  readonly transition: 'ACTIVATE' | 'REVOKE';
  readonly command: Extract<Parameters<XcfM1Repository['transitionRelease']>[0]['command'], object>;
  readonly targetReferenceHash: string;
  readonly verifyAttestation: () => Promise<boolean>;
};

function mapPublisher(row: PublisherRow): XcfPublisher {
  return {
    publisher_id: row.publisher_id,
    publisher_key: row.publisher_key,
    legal_name: row.legal_name,
    trust_status: row.trust_status,
    version: Number(row.version),
    created_at: new Date(row.created_at).toISOString(),
  };
}

function mapSource(row: SourceRow): XcfFrameworkSource {
  return {
    source_id: row.source_id,
    publisher_id: row.publisher_id,
    framework_id: row.framework_id,
    framework_key: row.framework_key,
    framework_name: row.framework_name,
    canonical_uri: row.canonical_uri,
    status: row.status,
    version: Number(row.version),
    created_at: new Date(row.created_at).toISOString(),
  };
}

function mapRelease(row: ReleaseRow): XcfFrameworkRelease {
  return {
    release_id: row.release_id,
    source_id: row.source_id,
    framework_id: row.framework_id,
    release_version: row.release_version,
    artifact_sha256: row.artifact_sha256,
    status: row.status,
    version: Number(row.version),
    object_count: Number(row.object_count),
    created_at: new Date(row.created_at).toISOString(),
  };
}

function mapSourcePolicy(row: SourcePolicyRow): XcfSourceIngestionPolicy {
  return {
    sourceId: row.source_id,
    publisherId: row.publisher_id,
    publisherTrustStatus: row.publisher_trust_status,
    status: row.status,
    allowedUriPrefixes: row.allowed_uri_prefixes,
    sourceFormat: row.source_format,
    signaturePolicy: row.signature_policy,
    trustedKeyReference: row.trusted_key_reference,
    hashAlgorithm: row.hash_algorithm,
    licenseIdentity: row.license,
    licenseVersion: row.license_version,
    licenseState: row.license_state,
    licenseAllowedUse: row.license_allowed_use,
    licenseActivationCompatible: row.license_activation_compatible,
    reviewDueAt: new Date(row.review_due_at),
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function lockRegistryResource(
  client: pg.PoolClient,
  tenantId: string,
  resourceType: 'framework-source',
  resourceId: string,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2||':'||$3,0))", [
    tenantId,
    resourceType,
    resourceId,
  ]);
}

function isAllowedArtifactUri(candidate: string, allowedPrefixes: readonly string[]) {
  const candidateUrl = new URL(candidate);
  return allowedPrefixes.some((value) => {
    const prefix = new URL(value);
    return candidateUrl.origin === prefix.origin && candidateUrl.href.startsWith(prefix.href);
  });
}

function mapMpaFailure(error: unknown) {
  return error instanceof MultiPersonAuthorizationFailure ? new XcfM1Failure('MPA_DENIED') : error;
}
