import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfiguration } from './config.js';
import { EvidenceReferenceValidator } from './evidence-reference-validator.js';
import { HumanEvidenceReferenceAdapter } from './human-evidence-reference.js';
import {
  canonicalSignedGenesisManifest,
  HUMAN_GENESIS_EXECUTE,
  HUMAN_GOVERNANCE_ROOT_ALGORITHM,
  HUMAN_GOVERNANCE_ROOT_PURPOSE,
  humanGenesisManifestHash,
  HumanGenesisAuthorizationVerifier,
  type HumanGenesisManifest,
} from './human-governance-genesis.js';
import { PostgresHumanGenesisRepository } from './postgres-human-genesis.js';
import { PostgresHumanAttestation } from './postgres-human-attestation.js';
import { DevelopmentHeaderIdentityAdapter, OidcJwtIdentityAdapter } from './identity.js';
import { MachineAuthenticationService } from './machine-service-auth.js';
import { PostgresEvidenceChainOfCustodyRepository } from './postgres-evidence-chain-of-custody.js';
import { PostgresMachineAuthenticationRepository } from './postgres-machine-service-auth.js';
import {
  PrincipalClassificationService,
  PostgresPrincipalClassificationRepository,
} from './principal-classification.js';
import { RepositoryAuthorizationPort } from './platform-context.js';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';

const databaseUrl = process.env.DATABASE_URL;
const disposableDatabase = databaseUrl?.endsWith('/acs_foundation') === true;
const tenantId = '00000000-0000-4000-8000-000000000011';

(disposableDatabase ? describe : describe.skip)('human genesis PostgreSQL 17', () => {
  it('registers a public root and commits exactly three people once with audit/outbox', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const repository = new PostgresHumanGenesisRepository(databaseUrl!);
    try {
      const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const fingerprint = createHash('sha256')
        .update(keys.publicKey.export({ type: 'spki', format: 'der' }))
        .digest('hex');
      await client.query(
        `INSERT INTO platform.human_governance_trust_roots(
          trust_root_id,purpose,algorithm,public_key,public_key_fingerprint,version,
          status,not_before,not_after
        ) VALUES($1,$2,$3,$4,$5,1,'ACTIVE',now()-interval '1 hour',now()+interval '1 hour')`,
        [
          'ACS-HGR-001',
          HUMAN_GOVERNANCE_ROOT_PURPOSE,
          HUMAN_GOVERNANCE_ROOT_ALGORITHM,
          publicKeyPem,
          fingerprint,
        ],
      );
      const executorUserId = randomUUID();
      const executorSubject = JSON.stringify(['https://issuer.acs.test', randomUUID()]);
      const executorMembershipId = randomUUID();
      await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
        executorUserId,
        executorSubject,
      ]);
      await client.query(
        `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
         VALUES($1,$2,$3,'ACTIVE')`,
        [executorMembershipId, tenantId, executorUserId],
      );
      await client.query(
        `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
         VALUES($1,$2,$3)`,
        [tenantId, executorMembershipId, HUMAN_GENESIS_EXECUTE],
      );
      const candidates: { principal_id: string; person_id: string; evidence_reference: string }[] =
        [];
      for (let index = 0; index < 3; index += 1) {
        const principal_id = randomUUID();
        const person_id = randomUUID();
        const evidence_reference = randomUUID();
        await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
          principal_id,
          JSON.stringify(['https://issuer.acs.test', randomUUID()]),
        ]);
        await client.query(
          `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
           VALUES($1,$2,$3,'ACTIVE')`,
          [randomUUID(), tenantId, principal_id],
        );
        candidates.push({ principal_id, person_id, evidence_reference });
      }
      const now = Date.now();
      const base: HumanGenesisManifest = {
        genesis_id: randomUUID(),
        manifest_version: '1.0.0',
        purpose: HUMAN_GOVERNANCE_ROOT_PURPOSE,
        tenant_id: tenantId,
        candidates,
        authorized_executor_identity: executorUserId,
        trust_root_id: 'ACS-HGR-001',
        issued_at: new Date(now - 60_000).toISOString(),
        not_before: new Date(now - 30_000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        nonce: randomUUID(),
        manifest_hash: '',
      };
      const manifest = { ...base, manifest_hash: humanGenesisManifestHash(base) };
      const signer = createSign('sha256');
      signer.update(canonicalSignedGenesisManifest(manifest));
      signer.end();
      const signatureBase64 = signer.sign(keys.privateKey).toString('base64');
      const verifier = new HumanGenesisAuthorizationVerifier(repository);
      await expect(
        verifier.verify(manifest, signatureBase64, tenantId, executorUserId),
      ).resolves.toBe(manifest.manifest_hash);
      const issueContext = async () => {
        const context = await client.query<{ context_token: string }>(
          'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
          [executorSubject, tenantId, HUMAN_GENESIS_EXECUTE],
        );
        const token = context.rows[0]?.context_token;
        if (!token) throw new Error('Test fixture failed to issue a trusted tenant context.');
        return token;
      };
      const input = {
        contextToken: await issueContext(),
        executorUserId,
        manifest,
        signatureBase64,
        requestId: randomUUID(),
        correlationId: randomUUID(),
      };
      const directBypass = await client.query<{ completed: boolean }>(
        `SELECT platform.complete_human_genesis(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,
          $8::timestamptz,$9::timestamptz,$10::timestamptz,$11::jsonb,
          $12::uuid,$13::uuid
        ) AS completed`,
        [
          tenantId,
          executorUserId,
          manifest.genesis_id,
          manifest.nonce,
          manifest.manifest_hash,
          signatureBase64,
          manifest.trust_root_id,
          manifest.issued_at,
          manifest.not_before,
          manifest.expires_at,
          JSON.stringify(manifest.candidates),
          randomUUID(),
          randomUUID(),
        ],
      );
      expect(directBypass.rows[0]?.completed).toBe(false);
      await client.query(`
        CREATE FUNCTION platform.human_genesis_injected_failure()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'disposable genesis failure injection'; END $$;
        CREATE TRIGGER human_genesis_injected_failure BEFORE INSERT ON platform.persons
        FOR EACH ROW EXECUTE FUNCTION platform.human_genesis_injected_failure();
      `);
      await expect(repository.execute(input)).rejects.toThrow(
        'disposable genesis failure injection',
      );
      const afterFailure = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM platform.human_genesis_ceremonies WHERE tenant_id=$1',
        [tenantId],
      );
      expect(afterFailure.rows[0]?.count).toBe('0');
      await client.query(`
        DROP TRIGGER human_genesis_injected_failure ON platform.persons;
        DROP FUNCTION platform.human_genesis_injected_failure();
      `);
      const outcomes = await Promise.all([
        repository.execute({ ...input, contextToken: await issueContext() }),
        repository.execute({ ...input, contextToken: await issueContext() }),
      ]);
      expect(outcomes.sort()).toEqual([false, true]);
      const rows = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.principal_classifications
         WHERE tenant_id=$1 AND classification_source='SIGNED_GENESIS'`,
        [tenantId],
      );
      expect(rows.rows[0]?.count).toBe('3');
      const audit = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.audit_logs
         WHERE tenant_id=$1 AND action='platform.principals.genesis.execute'`,
        [tenantId],
      );
      expect(audit.rows[0]?.count).toBe('1');
      const outbox = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM platform.domain_events
         WHERE tenant_id=$1 AND event_type='platform.human_genesis.completed'`,
        [tenantId],
      );
      expect(outbox.rows[0]?.count).toBe('1');
      await expect(
        repository.execute({
          ...input,
          contextToken: await issueContext(),
        }),
      ).resolves.toBe(false);

      const targetUserId = randomUUID();
      await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
        targetUserId,
        JSON.stringify(['https://issuer.acs.test', randomUUID()]),
      ]);
      await client.query(
        `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
         VALUES($1,$2,$3,'ACTIVE')`,
        [randomUUID(), tenantId, targetUserId],
      );
      const principals = [candidates[0]!, candidates[1]!];
      const services: PrincipalClassificationService[] = [];
      const contexts = new PostgresTenantContextRepository(databaseUrl!, databaseUrl!);
      const classificationRepository = new PostgresPrincipalClassificationRepository(databaseUrl!);
      try {
        for (const [index, principal] of principals.entries()) {
          const subject = await client.query<{ external_subject: string }>(
            'SELECT external_subject FROM platform.users WHERE id=$1',
            [principal.principal_id],
          );
          const membership = await client.query<{ id: string }>(
            'SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2',
            [tenantId, principal.principal_id],
          );
          for (const permission of [
            'platform.principals.classify',
            index === 0
              ? 'platform.principals.classify.operator'
              : 'platform.principals.classify.verifier',
          ])
            await client.query(
              `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
               VALUES($1,$2,$3)`,
              [tenantId, membership.rows[0]!.id, permission],
            );
          services.push(
            new PrincipalClassificationService(
              {
                configured: true,
                authenticate: () => Promise.resolve({ subject: subject.rows[0]!.external_subject }),
              },
              new RepositoryAuthorizationPort(contexts),
              contexts,
              classificationRepository,
              { validate: () => Promise.resolve('VALID') },
              { recordDenied: () => Promise.resolve() },
            ),
          );
        }
        const request = await services[0]!.requestHuman(
          undefined,
          tenantId,
          {
            targetUserId,
            evidenceId: randomUUID(),
            policyVersion: 'HUMAN_CLASSIFICATION_V1',
            expectedVersion: 0,
          },
          { requestId: randomUUID(), correlationId: randomUUID() },
        );
        await expect(
          services[0]!.verifyHuman(undefined, tenantId, request.classification_request_id, {
            requestId: randomUUID(),
            correlationId: randomUUID(),
          }),
        ).rejects.toThrow('not available');
        const verified = await services[1]!.verifyHuman(
          undefined,
          tenantId,
          request.classification_request_id,
          { requestId: randomUUID(), correlationId: randomUUID() },
        );
        expect(verified.status).toBe('VERIFIED');
        const target = await client.query<{
          principal_type: string;
          status: string;
          person_id: string;
        }>(
          'SELECT principal_type,status,person_id FROM platform.principal_classifications WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, targetUserId],
        );
        expect(target.rows[0]).toMatchObject({
          principal_type: 'HUMAN',
          status: 'VERIFIED',
          person_id: verified.person_id,
        });
        const verifierContexts = await client.query<{ token: string; consumed: boolean }>(
          `SELECT token, activated_at IS NOT NULL AS consumed
           FROM platform.tenant_context_grants
           WHERE user_id=$1 AND tenant_id=$2 AND permission_key='platform.principals.classify'`,
          [principals[1]!.principal_id, tenantId],
        );
        expect(verifierContexts.rows).toHaveLength(2);
        expect(verifierContexts.rows.every((row) => row.consumed)).toBe(true);
        for (const row of verifierContexts.rows) {
          const reused = await client.query(
            `SELECT * FROM platform.activate_tenant_context($1::uuid,'platform.principals.classify')`,
            [row.token],
          );
          expect(reused.rowCount).toBe(0);
        }
        await client.query(
          `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
           VALUES($1,$2,'platform.mpa.approve')`,
          [
            tenantId,
            (
              await client.query<{ id: string }>(
                'SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2',
                [tenantId, principals[1]!.principal_id],
              )
            ).rows[0]!.id,
          ],
        );
        const requesterMembership = await client.query<{ id: string }>(
          'SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, principals[0]!.principal_id],
        );
        const authorizationId = randomUUID();
        const approvalRequestKey = randomUUID();
        await client.query(
          `INSERT INTO platform.mpa_authorization_envelopes(
            authorization_id,tenant_id,requester_user_id,requester_membership_id,
            operation,target_reference_hash,policy_id,policy_version,state,
            required_approval_count,expires_at
          ) VALUES($1,$2,$3,$4,'cyberdefense.evidence.export',$5,
            'cyberdefense.evidence.export.standard','1.0.0','REQUESTED',1,
            clock_timestamp()+interval '15 minutes')`,
          [
            authorizationId,
            tenantId,
            principals[0]!.principal_id,
            requesterMembership.rows[0]!.id,
            'a'.repeat(64),
          ],
        );
        const issueApprovalContext = async () => {
          const result = await client.query<{ context_token: string }>(
            'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
            [
              (
                await client.query<{ external_subject: string }>(
                  'SELECT external_subject FROM platform.users WHERE id=$1',
                  [principals[1]!.principal_id],
                )
              ).rows[0]!.external_subject,
              tenantId,
              'platform.mpa.approve',
            ],
          );
          return result.rows[0]!.context_token;
        };
        const attestation = new PostgresHumanAttestation(databaseUrl!);
        try {
          const issued = await attestation.issue({
            tenantId,
            actorUserId: principals[1]!.principal_id,
            authorizationId,
            approvalRequestKey,
            expectedVersion: 1,
            contextToken: await issueApprovalContext(),
            requestId: randomUUID(),
            correlationId: randomUUID(),
          });
          expect(issued).not.toBeNull();
          expect(
            await attestation.verify({
              reference: issued!.reference,
              tenantId,
              approverUserId: principals[1]!.principal_id,
              authorizationId,
              operation: 'cyberdefense.evidence.export',
              policyId: 'cyberdefense.evidence.export.standard',
              policyVersion: '1.0.0',
              requesterUserId: principals[0]!.principal_id,
              existingApproverUserIds: [],
              approvalRequestKey,
              contextToken: await issueApprovalContext(),
            }),
          ).toMatchObject({ verified: true });
          expect(
            await attestation.verify({
              reference: issued!.reference,
              tenantId,
              approverUserId: principals[1]!.principal_id,
              authorizationId: randomUUID(),
              operation: 'cyberdefense.evidence.export',
              policyId: 'cyberdefense.evidence.export.standard',
              policyVersion: '1.0.0',
              requesterUserId: principals[0]!.principal_id,
              existingApproverUserIds: [],
              approvalRequestKey,
              contextToken: await issueApprovalContext(),
            }),
          ).toMatchObject({ verified: false });
          const evidence = await client.query<{ audit: string; events: string }>(
            `SELECT
               (SELECT count(*)::text FROM platform.audit_logs
                 WHERE action='platform.principals.attest'
                   AND metadata->>'authorization_id'=$1) AS audit,
               (SELECT count(*)::text FROM platform.domain_events
                 WHERE event_type='platform.principal.attested'
                   AND payload->>'authorization_id'=$1) AS events`,
            [authorizationId],
          );
          expect(evidence.rows[0]).toEqual({ audit: '1', events: '1' });
        } finally {
          await attestation.close();
        }
        const lifecycleMetadata = () => ({
          requestId: randomUUID(),
          correlationId: randomUUID(),
        });
        const verifierLifecycle = {
          targetUserId: principals[1]!.principal_id,
          transition: 'SUSPEND' as const,
          reasonCode: 'GOVERNED_REVIEW',
          evidenceId: randomUUID(),
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        };
        await expect(
          services[0]!.transitionHuman(undefined, tenantId, verifierLifecycle, lifecycleMetadata()),
        ).resolves.toMatchObject({ status: 'SUSPENDED', version: 2 });
        const suspendedAttestation = new PostgresHumanAttestation(databaseUrl!);
        try {
          await expect(
            suspendedAttestation.issue({
              tenantId,
              actorUserId: principals[1]!.principal_id,
              authorizationId,
              approvalRequestKey: randomUUID(),
              expectedVersion: 1,
              contextToken: await issueApprovalContext(),
              ...lifecycleMetadata(),
            }),
          ).resolves.toBeNull();
        } finally {
          await suspendedAttestation.close();
        }
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...verifierLifecycle,
              transition: 'REACTIVATE',
              expectedVersion: 2,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).resolves.toMatchObject({ status: 'VERIFIED', version: 3 });
        const thirdActor = candidates[2]!;
        const thirdMembership = await client.query<{ id: string }>(
          'SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, thirdActor.principal_id],
        );
        for (const permission of [
          'platform.principals.classify',
          'platform.principals.classify.operator',
        ])
          await client.query(
            `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
             VALUES($1,$2,$3)`,
            [tenantId, thirdMembership.rows[0]!.id, permission],
          );
        const thirdSubject = await client.query<{ external_subject: string }>(
          'SELECT external_subject FROM platform.users WHERE id=$1',
          [thirdActor.principal_id],
        );
        const thirdService = new PrincipalClassificationService(
          {
            configured: true,
            authenticate: () =>
              Promise.resolve({ subject: thirdSubject.rows[0]!.external_subject }),
          },
          new RepositoryAuthorizationPort(contexts),
          contexts,
          classificationRepository,
          { validate: () => Promise.resolve('VALID') },
          { recordDenied: () => Promise.resolve() },
        );
        const thirdTransition = {
          targetUserId: thirdActor.principal_id,
          transition: 'SUSPEND' as const,
          reasonCode: 'GOVERNED_REVIEW',
          evidenceId: randomUUID(),
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        };
        await expect(
          services[0]!.transitionHuman(undefined, tenantId, thirdTransition, lifecycleMetadata()),
        ).resolves.toMatchObject({ status: 'SUSPENDED', version: 2 });
        const deniedActorTransition = () =>
          thirdService.transitionHuman(
            undefined,
            tenantId,
            { ...thirdTransition, targetUserId, idempotencyKey: randomUUID() },
            lifecycleMetadata(),
          );
        await expect(deniedActorTransition()).rejects.toMatchObject({
          code: 'INVALID_TARGET_OR_VERSION',
        });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...thirdTransition,
              transition: 'REVOKE',
              expectedVersion: 2,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).resolves.toMatchObject({ status: 'REVOKED', version: 3 });
        await expect(deniedActorTransition()).rejects.toMatchObject({
          code: 'INVALID_TARGET_OR_VERSION',
        });
        const suspension = {
          targetUserId,
          transition: 'SUSPEND' as const,
          reasonCode: 'GOVERNED_REVIEW',
          evidenceId: randomUUID(),
          expectedVersion: 1,
          idempotencyKey: randomUUID(),
        };
        await expect(
          services[0]!.transitionHuman(undefined, tenantId, suspension, lifecycleMetadata()),
        ).resolves.toMatchObject({ status: 'SUSPENDED', version: 2 });
        await expect(
          services[0]!.transitionHuman(undefined, tenantId, suspension, lifecycleMetadata()),
        ).resolves.toMatchObject({ status: 'SUSPENDED', version: 2 });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            { ...suspension, transition: 'REVOKE' },
            lifecycleMetadata(),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            { ...suspension, idempotencyKey: randomUUID() },
            lifecycleMetadata(),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...suspension,
              transition: 'REACTIVATE',
              expectedVersion: 2,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).resolves.toMatchObject({ status: 'VERIFIED', version: 3 });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...suspension,
              transition: 'REVOKE',
              expectedVersion: 3,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).resolves.toMatchObject({ status: 'REVOKED', version: 4 });
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...suspension,
              transition: 'REACTIVATE',
              expectedVersion: 4,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
        const lifecycleEvidence = await client.query<{
          transitions: string;
          audit: string;
          outbox: string;
        }>(
          `SELECT
            (SELECT count(*)::text FROM platform.principal_classification_lifecycle
              WHERE tenant_id=$1 AND user_id=$2) AS transitions,
            (SELECT count(*)::text FROM platform.audit_logs
              WHERE tenant_id=$1 AND action LIKE 'platform.principals.lifecycle.%'
                AND metadata->>'target_user_id'=$2::text) AS audit,
            (SELECT count(*)::text FROM platform.domain_events
              WHERE tenant_id=$1 AND event_type='platform.principal.human_lifecycle_changed'
                AND payload->>'user_id'=$2::text) AS outbox`,
          [tenantId, targetUserId],
        );
        expect(lifecycleEvidence.rows[0]).toEqual({ transitions: '3', audit: '3', outbox: '3' });
        const reclassification = await services[0]!.requestHuman(
          undefined,
          tenantId,
          {
            targetUserId,
            evidenceId: randomUUID(),
            policyVersion: 'HUMAN_CLASSIFICATION_V1',
            expectedVersion: 4,
          },
          lifecycleMetadata(),
        );
        const reverified = await services[1]!.verifyHuman(
          undefined,
          tenantId,
          reclassification.classification_request_id,
          lifecycleMetadata(),
        );
        expect(reverified.person_id).not.toBe(verified.person_id);
        const newClassification = await client.query<{ version: string; status: string }>(
          'SELECT version::text,status FROM platform.principal_classifications WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, targetUserId],
        );
        expect(newClassification.rows[0]).toEqual({ version: '5', status: 'VERIFIED' });
        const requalificationHistory = await client.query<{
          before_status: string;
          after_status: string;
          before_person: string;
          after_person: string;
        }>(
          `SELECT prior_record->>'status' AS before_status,
            new_record->>'status' AS after_status,
            prior_record->>'person_id' AS before_person,
            new_record->>'person_id' AS after_person
           FROM platform.principal_classification_lifecycle
           WHERE tenant_id=$1 AND user_id=$2 AND kind='REQUALIFY'`,
          [tenantId, targetUserId],
        );
        expect(requalificationHistory.rows[0]).toEqual({
          before_status: 'REVOKED',
          after_status: 'VERIFIED',
          before_person: verified.person_id,
          after_person: reverified.person_id,
        });
        const requalificationEmission = await client.query<{ audit: string; outbox: string }>(
          `SELECT
            (SELECT count(*)::text FROM platform.audit_logs
              WHERE tenant_id=$1 AND action='platform.principals.classify.verify'
                AND metadata->>'classification_request_id'=$2::text) AS audit,
            (SELECT count(*)::text FROM platform.domain_events
              WHERE tenant_id=$1 AND event_type='platform.principal.classification_verified'
                AND payload->>'classification_request_id'=$2::text) AS outbox`,
          [tenantId, reclassification.classification_request_id],
        );
        expect(requalificationEmission.rows[0]).toEqual({ audit: '1', outbox: '1' });
        const aliasUserId = randomUUID();
        const aliasSubjectId = randomUUID();
        const aliasSubject = JSON.stringify(['https://issuer.acs.test', aliasSubjectId]);
        const aliasMembershipId = randomUUID();
        await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
          aliasUserId,
          aliasSubject,
        ]);
        await client.query(
          `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
           VALUES($1,$2,$3,'ACTIVE')`,
          [aliasMembershipId, tenantId, aliasUserId],
        );
        for (const permission of [
          'platform.principals.classify',
          'platform.principals.classify.operator',
        ])
          await client.query(
            `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
             VALUES($1,$2,$3)`,
            [tenantId, aliasMembershipId, permission],
          );
        await client.query(
          `INSERT INTO platform.principal_classifications(
            tenant_id,user_id,principal_type,status,person_id,issuer,subject,
            classification_source,policy_version,evidence_id,classified_by,verified_by
          ) VALUES($1,$2,'HUMAN','VERIFIED',$3,$4,$5,'GOVERNED_OPERATOR',
            'HUMAN_CLASSIFICATION_V1',$6,$7,$8)`,
          [
            tenantId,
            aliasUserId,
            reverified.person_id,
            'https://issuer.acs.test',
            aliasSubjectId,
            randomUUID(),
            principals[0]!.principal_id,
            principals[1]!.principal_id,
          ],
        );
        const aliasContext = await contexts.issueContext(
          aliasSubject,
          tenantId,
          'platform.principals.classify',
        );
        expect(aliasContext).not.toBeNull();
        await expect(
          classificationRepository.transitionHuman({
            targetUserId,
            transition: 'SUSPEND',
            reasonCode: 'GOVERNED_REVIEW',
            evidenceId: randomUUID(),
            expectedVersion: 5,
            idempotencyKey: randomUUID(),
            tenantId,
            actorUserId: aliasUserId,
            contextToken: aliasContext!.contextToken,
            ...lifecycleMetadata(),
          }),
        ).resolves.toBeNull();
        for (const failedStage of ['state', 'audit', 'outbox'] as const) {
          const table =
            failedStage === 'state'
              ? 'platform.principal_classifications'
              : failedStage === 'audit'
                ? 'platform.audit_logs'
                : 'platform.domain_events';
          const triggerEvent = failedStage === 'state' ? 'AFTER UPDATE' : 'BEFORE INSERT';
          const functionName = `platform.test_reject_human_lifecycle_${failedStage}`;
          const triggerName = `test_reject_human_lifecycle_${failedStage}`;
          await client.query(
            `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN RAISE EXCEPTION 'forced lifecycle ${failedStage} failure'; END; $$`,
          );
          await client.query(
            `CREATE TRIGGER ${triggerName} ${triggerEvent} ON ${table}
             FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
          );
          try {
            await expect(
              services[0]!.transitionHuman(
                undefined,
                tenantId,
                {
                  targetUserId,
                  transition: 'SUSPEND',
                  reasonCode: 'GOVERNED_REVIEW',
                  evidenceId: randomUUID(),
                  expectedVersion: 5,
                  idempotencyKey: randomUUID(),
                },
                lifecycleMetadata(),
              ),
            ).rejects.toThrow(`forced lifecycle ${failedStage} failure`);
          } finally {
            await client.query(`DROP TRIGGER ${triggerName} ON ${table}`);
            await client.query(`DROP FUNCTION ${functionName}()`);
          }
          const afterFailure = await client.query<{
            status: string;
            version: string;
            transitions: string;
            audit: string;
            outbox: string;
          }>(
            `SELECT c.status,c.version::text,
              (SELECT count(*)::text FROM platform.principal_classification_lifecycle l
                WHERE l.tenant_id=c.tenant_id AND l.user_id=c.user_id) AS transitions,
              (SELECT count(*)::text FROM platform.audit_logs a
                WHERE a.tenant_id=c.tenant_id
                  AND a.action LIKE 'platform.principals.lifecycle.%'
                  AND a.metadata->>'target_user_id'=c.user_id::text) AS audit,
              (SELECT count(*)::text FROM platform.domain_events e
                WHERE e.tenant_id=c.tenant_id
                  AND e.event_type='platform.principal.human_lifecycle_changed'
                  AND e.payload->>'user_id'=c.user_id::text) AS outbox
             FROM platform.principal_classifications c
             WHERE c.tenant_id=$1 AND c.user_id=$2`,
            [tenantId, targetUserId],
          );
          expect(afterFailure.rows[0]).toEqual({
            status: 'VERIFIED',
            version: '5',
            transitions: '4',
            audit: '3',
            outbox: '3',
          });
        }
        await expect(
          services[1]!.verifyHuman(undefined, randomUUID(), request.classification_request_id, {
            requestId: randomUUID(),
            correlationId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });

        const secondTargetUserId = randomUUID();
        await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
          secondTargetUserId,
          JSON.stringify(['https://issuer.acs.test', randomUUID()]),
        ]);
        await client.query(
          `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
           VALUES($1,$2,$3,'ACTIVE')`,
          [randomUUID(), tenantId, secondTargetUserId],
        );
        const secondRequest = await services[0]!.requestHuman(
          undefined,
          tenantId,
          {
            targetUserId: secondTargetUserId,
            evidenceId: randomUUID(),
            policyVersion: 'HUMAN_CLASSIFICATION_V1',
            expectedVersion: 0,
          },
          { requestId: randomUUID(), correlationId: randomUUID() },
        );
        for (const principalType of ['UNKNOWN', 'MACHINE', 'SERVICE'] as const) {
          const deniedUserId = randomUUID();
          const deniedSubject = JSON.stringify(['https://issuer.acs.test', randomUUID()]);
          const deniedMembershipId = randomUUID();
          await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
            deniedUserId,
            deniedSubject,
          ]);
          await client.query(
            `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
             VALUES($1,$2,$3,'ACTIVE')`,
            [deniedMembershipId, tenantId, deniedUserId],
          );
          for (const permission of [
            'platform.principals.classify',
            'platform.principals.classify.verifier',
            'platform.principals.classify.operator',
            'platform.mpa.approve',
          ])
            await client.query(
              `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
               VALUES($1,$2,$3)`,
              [tenantId, deniedMembershipId, permission],
            );
          if (principalType !== 'UNKNOWN')
            await services[0]!.set(
              undefined,
              tenantId,
              {
                targetUserId: deniedUserId,
                principalType,
                status: 'VERIFIED',
                evidenceId: randomUUID(),
                policyVersion: 'HUMAN_CLASSIFICATION_V1',
                expectedVersion: 0,
              },
              { requestId: randomUUID(), correlationId: randomUUID() },
            );
          const deniedService = new PrincipalClassificationService(
            {
              configured: true,
              authenticate: () => Promise.resolve({ subject: deniedSubject }),
            },
            new RepositoryAuthorizationPort(contexts),
            contexts,
            classificationRepository,
            { validate: () => Promise.resolve('VALID') },
            { recordDenied: () => Promise.resolve() },
          );
          await expect(
            deniedService.verifyHuman(
              undefined,
              tenantId,
              secondRequest.classification_request_id,
              { requestId: randomUUID(), correlationId: randomUUID() },
            ),
          ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
          await expect(
            deniedService.transitionHuman(
              undefined,
              tenantId,
              {
                targetUserId,
                transition: 'SUSPEND',
                reasonCode: 'GOVERNED_REVIEW',
                evidenceId: randomUUID(),
                expectedVersion: 5,
                idempotencyKey: randomUUID(),
              },
              lifecycleMetadata(),
            ),
          ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
          const deniedApprovalContext = await client.query<{ context_token: string }>(
            'SELECT context_token FROM platform.issue_tenant_context($1,$2::uuid,$3)',
            [deniedSubject, tenantId, 'platform.mpa.approve'],
          );
          expect(deniedApprovalContext.rows).toHaveLength(1);
          const deniedAttestation = new PostgresHumanAttestation(databaseUrl!);
          try {
            await expect(
              deniedAttestation.issue({
                tenantId,
                actorUserId: deniedUserId,
                authorizationId,
                approvalRequestKey: randomUUID(),
                expectedVersion: 1,
                contextToken: deniedApprovalContext.rows[0]!.context_token,
                requestId: randomUUID(),
                correlationId: randomUUID(),
              }),
            ).resolves.toBeNull();
          } finally {
            await deniedAttestation.close();
          }
        }
        const verifierMembership = await client.query<{ id: string }>(
          'SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, principals[1]!.principal_id],
        );
        await client.query(
          `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
           VALUES($1,$2,'platform.principals.classify.operator')`,
          [tenantId, verifierMembership.rows[0]!.id],
        );
        const competing = await Promise.allSettled([
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              targetUserId,
              transition: 'SUSPEND',
              reasonCode: 'GOVERNED_REVIEW',
              evidenceId: randomUUID(),
              expectedVersion: 5,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
          services[1]!.transitionHuman(
            undefined,
            tenantId,
            {
              targetUserId,
              transition: 'REVOKE',
              reasonCode: 'GOVERNED_REVIEW',
              evidenceId: randomUUID(),
              expectedVersion: 5,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ]);
        expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);
        const afterCompetition = await client.query<{ version: string }>(
          'SELECT version::text FROM platform.principal_classifications WHERE tenant_id=$1 AND user_id=$2',
          [tenantId, targetUserId],
        );
        expect(afterCompetition.rows[0]?.version).toBe('6');
        await expect(
          services[0]!.transitionHuman(
            undefined,
            tenantId,
            {
              ...verifierLifecycle,
              transition: 'REVOKE',
              expectedVersion: 3,
              idempotencyKey: randomUUID(),
            },
            lifecycleMetadata(),
          ),
        ).resolves.toMatchObject({ status: 'REVOKED', version: 4 });
        const revokedAttestation = new PostgresHumanAttestation(databaseUrl!);
        try {
          await expect(
            revokedAttestation.issue({
              tenantId,
              actorUserId: principals[1]!.principal_id,
              authorizationId,
              approvalRequestKey: randomUUID(),
              expectedVersion: 1,
              contextToken: await issueApprovalContext(),
              ...lifecycleMetadata(),
            }),
          ).resolves.toBeNull();
        } finally {
          await revokedAttestation.close();
        }
      } finally {
        await Promise.all([contexts.close(), classificationRepository.close()]);
      }
    } finally {
      await repository.close();
      await client.end();
    }
  });

  it('enforces the signed-OIDC Human lifecycle HTTP contract on PostgreSQL', async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    const contexts = new PostgresTenantContextRepository(databaseUrl!, databaseUrl!);
    const repository = new PostgresPrincipalClassificationRepository(databaseUrl!);
    const machineRepository = new PostgresMachineAuthenticationRepository(
      databaseUrl!,
      databaseUrl!,
    );
    const evidenceRepository = new PostgresEvidenceChainOfCustodyRepository(databaseUrl!);
    const actorUserId = randomUUID();
    const actorSubjectId = randomUUID();
    const targetUserId = randomUUID();
    const keys = await generateKeyPair('RS256');
    const publicKey = {
      ...(await exportJWK(keys.publicKey)),
      alg: 'RS256',
      kid: 'human-lifecycle-e2e',
      use: 'sig',
    };
    const jwks = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicKey] }));
    });
    let app: Awaited<ReturnType<typeof buildApp>> | undefined;
    try {
      for (const [userId, subjectId] of [
        [actorUserId, actorSubjectId],
        [targetUserId, randomUUID()],
      ]) {
        await client.query('INSERT INTO platform.users(id,external_subject) VALUES($1,$2)', [
          userId,
          JSON.stringify(['https://issuer.acs.test', subjectId]),
        ]);
        const membershipId = randomUUID();
        await client.query(
          `INSERT INTO platform.memberships(id,tenant_id,user_id,status)
           VALUES($1,$2,$3,'ACTIVE')`,
          [membershipId, tenantId, userId],
        );
        if (userId === actorUserId)
          for (const permission of [
            'platform.principals.classify',
            'platform.principals.classify.operator',
          ])
            await client.query(
              `INSERT INTO platform.membership_permissions(tenant_id,membership_id,permission_key)
               VALUES($1,$2,$3)`,
              [tenantId, membershipId, permission],
            );
        const personId = randomUUID();
        const evidenceId = randomUUID();
        await client.query(
          `INSERT INTO platform.persons(tenant_id,person_id,status,policy_version,evidence_id)
           VALUES($1,$2,'VERIFIED','HUMAN_CLASSIFICATION_V1',$3)`,
          [tenantId, personId, evidenceId],
        );
        await client.query(
          `INSERT INTO platform.principal_classifications(
            tenant_id,user_id,principal_type,status,person_id,issuer,subject,
            classification_source,policy_version,evidence_id,classified_by,verified_by
          ) VALUES($1,$2,'HUMAN','VERIFIED',$3,$4,$5,'SIGNED_GENESIS',
            'HUMAN_CLASSIFICATION_V1',$6,$7,$7)`,
          [
            tenantId,
            userId,
            personId,
            'https://issuer.acs.test',
            subjectId,
            evidenceId,
            actorUserId,
          ],
        );
      }
      await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
      const address = jwks.address();
      if (!address || typeof address === 'string') throw new Error('Test JWKS unavailable.');
      const identity = new OidcJwtIdentityAdapter({
        allowedAlgorithms: ['RS256'],
        audience: 'acs-platform-api',
        clockToleranceSeconds: 0,
        issuer: 'https://issuer.acs.test',
        jwksCacheMs: 60_000,
        jwksCooldownMs: 1_000,
        jwksTimeoutMs: 1_000,
        jwksUri: `http://127.0.0.1:${address.port}/jwks`,
      });
      const machinePrincipalId = randomUUID();
      const credentialId = randomUUID();
      const credential = randomBytes(32).toString('base64url');
      await client.query(
        `INSERT INTO platform.machine_principals(
          id,tenant_id,principal_type,external_binding,status
        ) VALUES($1,$2,'SERVICE',$3,'ACTIVE')`,
        [machinePrincipalId, tenantId, `human-lifecycle-evidence-${randomUUID()}`],
      );
      await client.query(
        `INSERT INTO platform.machine_credentials(
          credential_id,tenant_id,machine_principal_id,verifier_sha256,expires_at,created_by
        ) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5)`,
        [
          credentialId,
          tenantId,
          machinePrincipalId,
          createHash('sha256').update(credential).digest('hex'),
          actorUserId,
        ],
      );
      await client.query(
        `INSERT INTO platform.machine_principal_permissions(
          tenant_id,machine_principal_id,permission_key
        ) VALUES($1,$2,'cyberdefense.evidence.reference.validate')`,
        [tenantId, machinePrincipalId],
      );
      const machine = new MachineAuthenticationService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(contexts),
        contexts,
        machineRepository,
      );
      const evidenceValidator = new HumanEvidenceReferenceAdapter(
        new EvidenceReferenceValidator(machine, evidenceRepository),
        credentialId,
        credential,
      );
      const service = new PrincipalClassificationService(
        identity,
        new RepositoryAuthorizationPort(contexts),
        contexts,
        repository,
        evidenceValidator,
        { recordDenied: () => Promise.resolve() },
      );
      app = await buildApp(loadConfiguration({ ACS_ENV: 'test' }), {
        logger: false,
        principalClassificationService: service,
      });
      const token = await new SignJWT({ amr: ['pwd', 'otp'] })
        .setProtectedHeader({ alg: 'RS256', kid: 'human-lifecycle-e2e' })
        .setIssuer('https://issuer.acs.test')
        .setAudience('acs-platform-api')
        .setSubject(actorSubjectId)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(keys.privateKey);
      const url = (userId: string) => `/api/v1/platform/principals/${userId}/human-lifecycle`;
      const headers = (selectedTenantId = tenantId) => ({
        authorization: `Bearer ${token}`,
        'x-acs-tenant-id': selectedTenantId,
      });
      const payload = (
        transition: 'SUSPEND' | 'REACTIVATE' | 'REVOKE',
        expectedVersion: number,
      ) => ({
        transition,
        reason_code: 'GOVERNED_REVIEW',
        evidence_id: 'e3000000-0000-4000-8000-000000000011',
        expected_version: expectedVersion,
        idempotency_key: randomUUID(),
      });
      const initial = payload('SUSPEND', 1);
      const missingAuthentication = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: { 'x-acs-tenant-id': tenantId },
        payload: initial,
      });
      expect(missingAuthentication.statusCode).toBe(401);
      const self = await app.inject({
        method: 'POST',
        url: url(actorUserId),
        headers: headers(),
        payload: initial,
      });
      expect(self.statusCode).toBe(403);
      const foreign = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(randomUUID()),
        payload: initial,
      });
      expect(foreign.statusCode).toBe(403);
      const malformed = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: { ...initial, unexpected_authority: true },
      });
      expect(malformed.statusCode).toBe(400);
      const invalidEvidence = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: { ...initial, evidence_id: randomUUID() },
      });
      expect(invalidEvidence.statusCode).toBe(409);
      const suspended = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: initial,
      });
      expect(suspended.statusCode).toBe(200);
      expect(suspended.json()).toMatchObject({ data: { status: 'SUSPENDED', version: 2 } });
      const replay = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: initial,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toMatchObject({ data: { status: 'SUSPENDED', version: 2 } });
      const stale = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: payload('SUSPEND', 1),
      });
      expect(stale.statusCode).toBe(409);
      const reactivated = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: payload('REACTIVATE', 2),
      });
      expect(reactivated.statusCode).toBe(200);
      expect(reactivated.json()).toMatchObject({ data: { status: 'VERIFIED', version: 3 } });
      const revoked = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: payload('REVOKE', 3),
      });
      expect(revoked.statusCode).toBe(200);
      expect(revoked.json()).toMatchObject({ data: { status: 'REVOKED', version: 4 } });
      const invalidTransition = await app.inject({
        method: 'POST',
        url: url(targetUserId),
        headers: headers(),
        payload: payload('REACTIVATE', 4),
      });
      expect(invalidTransition.statusCode).toBe(409);
      const evidence = await client.query<{ transitions: string; audit: string; outbox: string }>(
        `SELECT
          (SELECT count(*)::text FROM platform.principal_classification_lifecycle
            WHERE tenant_id=$1 AND user_id=$2) AS transitions,
          (SELECT count(*)::text FROM platform.audit_logs
            WHERE tenant_id=$1 AND action LIKE 'platform.principals.lifecycle.%'
              AND metadata->>'target_user_id'=$2::text) AS audit,
          (SELECT count(*)::text FROM platform.domain_events
            WHERE tenant_id=$1 AND event_type='platform.principal.human_lifecycle_changed'
              AND payload->>'user_id'=$2::text) AS outbox`,
        [tenantId, targetUserId],
      );
      expect(evidence.rows[0]).toEqual({ transitions: '3', audit: '3', outbox: '3' });
    } finally {
      if (app) await app.close();
      if (jwks.listening)
        await new Promise<void>((resolve, reject) =>
          jwks.close((error) => (error ? reject(error) : resolve())),
        );
      await Promise.all([
        contexts.close(),
        repository.close(),
        machineRepository.close(),
        evidenceRepository.close(),
        client.end(),
      ]);
    }
  });
});
