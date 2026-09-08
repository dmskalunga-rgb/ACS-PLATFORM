import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { errorEnvelopeSchema, multiPersonAuthorizationEnvelopeSchema } from '@acs/contracts';
import { buildApp } from './app.js';
import { loadConfiguration } from './config.js';
import {
  MultiPersonAuthorizationService,
  type MultiPersonAuthorizationRecord,
  type MultiPersonAuthorizationRepository,
} from './multi-person-authorization.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const userId = '10000000-0000-4000-8000-000000000011';

function service() {
  let current: MultiPersonAuthorizationRecord = {
    authorizationId: '90000000-0000-4000-8000-000000000001',
    tenantId,
    requesterUserId: userId,
    operation: 'cyberdefense.evidence.export',
    targetReferenceHash: 'a'.repeat(64),
    policyId: 'cyberdefense.evidence.export.standard',
    policyVersion: '1.0.0',
    state: 'REQUESTED',
    version: 1,
    approvalCount: 0,
    requiredApprovalCount: 1,
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
  };
  const repository: MultiPersonAuthorizationRepository = {
    async request(input) {
      await Promise.resolve();
      current = { ...current, targetReferenceHash: input.binding.targetReferenceHash };
      return { authorization: current, replay: false };
    },
    async read() {
      await Promise.resolve();
      return current;
    },
    async approvalPreparation() {
      await Promise.resolve();
      return { authorization: current, binding: null, existingApproverUserIds: [] };
    },
    async decide() {
      await Promise.resolve();
      return { authorization: current, replay: false };
    },
    async revoke() {
      await Promise.resolve();
      return { authorization: current, replay: false };
    },
  };
  return new MultiPersonAuthorizationService(
    {
      configured: true,
      async authenticate(header) {
        await Promise.resolve();
        return header ? { subject: 'oidc|requester' } : null;
      },
    },
    {
      async authorize() {
        await Promise.resolve();
        return { allowed: true, reason: 'TEST' };
      },
    },
    {
      async resolveMembership() {
        await Promise.resolve();
        return { userId, tenantId, tenantSlug: 'tenant-a', tenantDisplayName: 'Tenant A' };
      },
      async isActionAuthorized() {
        await Promise.resolve();
        return true;
      },
      async issueContext() {
        await Promise.resolve();
        return {
          contextToken: randomUUID(),
          userId,
          tenantId,
          tenantSlug: 'tenant-a',
          tenantDisplayName: 'Tenant A',
        };
      },
      async readAndAudit(value) {
        await Promise.resolve();
        return value;
      },
    },
    {
      async listActiveMembershipsBySubject() {
        await Promise.resolve();
        return [
          {
            membershipId: '30000000-0000-4000-8000-000000000011',
            userId,
            tenantId,
            tenantSlug: 'tenant-a',
            tenantDisplayName: 'Tenant A',
          },
        ];
      },
    },
    repository,
    {
      async verify() {
        await Promise.resolve();
        return { verified: false, reason: 'NOT_CONFIGURED' };
      },
    },
    { async recordDenied() {} },
  );
}

describe('MPA HTTP boundary', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('creates and reads a policy-bound envelope without exposing a consume endpoint', async () => {
    const app = await buildApp(loadConfiguration({ ACS_ENV: 'test' }), {
      logger: false,
      multiPersonAuthorizationService: service(),
    });
    apps.push(app);
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/tenants/${tenantId}/multi-person-authorizations`,
      headers: { authorization: 'Bearer opaque', 'idempotency-key': randomUUID() },
      payload: {
        operation: 'cyberdefense.evidence.export',
        target_reference: 'evidence:42',
        policy_id: 'cyberdefense.evidence.export.standard',
        policy_version: '1.0.0',
      },
    });
    expect(created.statusCode).toBe(201);
    const createdEnvelope = multiPersonAuthorizationEnvelopeSchema.parse(created.json());
    expect(createdEnvelope.data.state).toBe('REQUESTED');
    expect(createdEnvelope.data).not.toHaveProperty('target_reference');

    const consume = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/tenants/${tenantId}/multi-person-authorizations/90000000-0000-4000-8000-000000000001/consume`,
      headers: { authorization: 'Bearer opaque' },
    });
    expect(consume.statusCode).toBe(404);
  });

  it('keeps external authentication failures generic', async () => {
    const app = await buildApp(loadConfiguration({ ACS_ENV: 'test' }), {
      logger: false,
      multiPersonAuthorizationService: service(),
    });
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/platform/tenants/${tenantId}/multi-person-authorizations/90000000-0000-4000-8000-000000000001`,
    });
    expect(response.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('UNAUTHENTICATED');
  });
});
