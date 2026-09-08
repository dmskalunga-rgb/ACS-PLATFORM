import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MultiPersonAuthorizationFailure,
  MultiPersonAuthorizationService,
  NotConfiguredPhysicalHumanAttestation,
  type MultiPersonAuthorizationRecord,
  type MultiPersonAuthorizationRepository,
  type PhysicalHumanIndependenceAttestationPort,
} from './multi-person-authorization.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const command = {
  operation: 'cyberdefense.evidence.export' as const,
  target_reference: 'evidence:42',
  policy_id: 'cyberdefense.evidence.export.restricted_security' as const,
  policy_version: '1.0.0' as const,
};

function record(
  overrides: Partial<MultiPersonAuthorizationRecord> = {},
): MultiPersonAuthorizationRecord {
  return {
    authorizationId: '10000000-0000-4000-8000-000000000001',
    tenantId,
    requesterUserId: 'requester',
    operation: command.operation,
    targetReferenceHash: 'a'.repeat(64),
    policyId: command.policy_id,
    policyVersion: '1.0.0',
    state: 'REQUESTED',
    version: 1,
    approvalCount: 0,
    requiredApprovalCount: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

class MemoryRepository implements MultiPersonAuthorizationRepository {
  current = record();
  existing: string[] = [];
  eligible = true;
  replay = false;
  async request(input: Parameters<MultiPersonAuthorizationRepository['request']>[0]) {
    await Promise.resolve();
    this.current = record({
      requesterUserId: input.actorUserId,
      targetReferenceHash: input.binding.targetReferenceHash,
      policyId: input.binding.policyId,
    });
    return { authorization: this.current, replay: this.replay };
  }
  async read(input: Parameters<MultiPersonAuthorizationRepository['read']>[0]) {
    await Promise.resolve();
    return input.tenantId === tenantId ? this.current : null;
  }
  async approvalPreparation(
    input: Parameters<MultiPersonAuthorizationRepository['approvalPreparation']>[0],
  ) {
    await Promise.resolve();
    return {
      authorization: input.tenantId === tenantId ? this.current : null,
      binding: this.eligible
        ? {
            actorUserId: input.actorUserId,
            tenantId: input.tenantId,
            authorityClass: 'cyberdefense.evidence.export_authority' as const,
          }
        : null,
      existingApproverUserIds: this.existing,
    };
  }
  async decide(input: Parameters<MultiPersonAuthorizationRepository['decide']>[0]) {
    await Promise.resolve();
    if (input.expectedVersion !== this.current.version)
      throw new MultiPersonAuthorizationFailure('STALE_VERSION', 'Authorization version is stale.');
    if (this.current.state !== 'REQUESTED' && this.current.state !== 'PARTIALLY_APPROVED')
      throw new MultiPersonAuthorizationFailure('INVALID_TRANSITION', 'Invalid transition.');
    if (input.decision === 'REJECT') {
      this.current = record({
        ...this.current,
        state: 'REJECTED',
        version: this.current.version + 1,
      });
    } else {
      const approvalCount = this.current.approvalCount + 1;
      this.current = record({
        ...this.current,
        approvalCount,
        state:
          approvalCount >= this.current.requiredApprovalCount ? 'APPROVED' : 'PARTIALLY_APPROVED',
        version: this.current.version + 1,
      });
      this.existing.push(input.actorUserId);
    }
    return { authorization: this.current, replay: this.replay };
  }
  async revoke(input: Parameters<MultiPersonAuthorizationRepository['revoke']>[0]) {
    await Promise.resolve();
    if (input.expectedVersion !== this.current.version)
      throw new MultiPersonAuthorizationFailure('STALE_VERSION', 'Authorization version is stale.');
    this.current = record({ ...this.current, state: 'REVOKED', version: this.current.version + 1 });
    return { authorization: this.current, replay: this.replay };
  }
}

const verifiedAttestation: PhysicalHumanIndependenceAttestationPort = {
  async verify() {
    await Promise.resolve();
    return { verified: true, referenceHash: 'b'.repeat(64) };
  },
};

function setup(
  options: {
    userId?: string;
    tenant?: string;
    permission?: boolean;
    attestation?: PhysicalHumanIndependenceAttestationPort;
  } = {},
) {
  const repository = new MemoryRepository();
  const userId = options.userId ?? 'approver-1';
  const resolvedTenant = options.tenant ?? tenantId;
  const service = new MultiPersonAuthorizationService(
    {
      configured: true,
      async authenticate(header) {
        await Promise.resolve();
        return header === undefined ? null : { subject: `subject:${userId}` };
      },
    },
    {
      async authorize() {
        await Promise.resolve();
        return { allowed: options.permission ?? true, reason: 'TEST' };
      },
    },
    {
      async resolveMembership(_subject, requestedTenant) {
        await Promise.resolve();
        return requestedTenant === resolvedTenant
          ? { userId, tenantId: resolvedTenant, tenantSlug: 'tenant-a', tenantDisplayName: 'A' }
          : null;
      },
      async isActionAuthorized() {
        await Promise.resolve();
        return true;
      },
      async issueContext(_subject, requestedTenant) {
        await Promise.resolve();
        return requestedTenant === resolvedTenant
          ? {
              contextToken: randomUUID(),
              userId,
              tenantId: resolvedTenant,
              tenantSlug: 'tenant-a',
              tenantDisplayName: 'A',
            }
          : null;
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
            membershipId: `membership:${userId}`,
            userId,
            tenantId: resolvedTenant,
            tenantSlug: 'tenant-a',
            tenantDisplayName: 'A',
          },
        ];
      },
    },
    repository,
    options.attestation ?? verifiedAttestation,
    { async recordDenied() {} },
  );
  return { service, repository };
}

describe('ACS-PLATFORM-MPA acceptance matrix', () => {
  it('MPA-POS-001 creates a governed request', async () => {
    const { service } = setup({ userId: 'requester' });
    const result = await service.request(
      'Bearer token',
      tenantId,
      command,
      randomUUID(),
      metadata(),
    );
    expect(result.data.state).toBe('REQUESTED');
  });

  it('MPA-POS-002 records a partial independent approval', async () => {
    const { service } = setup();
    const result = await service.approve(
      'Bearer token',
      tenantId,
      record().authorizationId,
      1,
      'attestation:1',
      randomUUID(),
      metadata(),
    );
    expect(result.data.state).toBe('PARTIALLY_APPROVED');
  });

  it('MPA-POS-003 completes the required composition', async () => {
    const { service, repository } = setup({ userId: 'approver-2' });
    repository.current = record({ state: 'PARTIALLY_APPROVED', version: 2, approvalCount: 1 });
    repository.existing = ['approver-1'];
    const result = await service.approve(
      'Bearer token',
      tenantId,
      record().authorizationId,
      2,
      'attestation:2',
      randomUUID(),
      metadata(),
    );
    expect(result.data.state).toBe('APPROVED');
  });

  it('MPA-POS-004 supports authorized rejection and revocation lifecycle commands', async () => {
    const rejected = setup();
    expect(
      (
        await rejected.service.reject(
          'Bearer token',
          tenantId,
          record().authorizationId,
          1,
          randomUUID(),
          metadata(),
        )
      ).data.state,
    ).toBe('REJECTED');
    const revoked = setup();
    expect(
      (
        await revoked.service.revoke(
          'Bearer token',
          tenantId,
          record().authorizationId,
          1,
          randomUUID(),
          metadata(),
        )
      ).data.state,
    ).toBe('REVOKED');
  });

  it('MPA-POS-005 returns an idempotent command receipt', async () => {
    const { service, repository } = setup({ userId: 'requester' });
    repository.replay = true;
    const result = await service.request(
      'Bearer token',
      tenantId,
      command,
      randomUUID(),
      metadata(),
    );
    expect(result.meta.idempotent_replay).toBe(true);
  });

  it('MPA-NEG-001 denies self approval', async () => {
    const { service } = setup({ userId: 'requester' });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'SELF_APPROVAL_DENIED' });
  });

  it('MPA-NEG-002 denies the wrong authority class', async () => {
    const { service, repository } = setup();
    repository.eligible = false;
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'WRONG_AUTHORITY_CLASS' });
  });

  it('MPA-NEG-003 denies cross-tenant access', async () => {
    const { service } = setup();
    await expect(
      service.read(
        'Bearer token',
        '00000000-0000-4000-8000-000000000099',
        record().authorizationId,
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('MPA-NEG-004 denies operation/policy mismatch', async () => {
    const { service } = setup({ userId: 'requester' });
    await expect(
      service.request(
        'Bearer token',
        tenantId,
        { ...command, operation: 'cyberdefense.evidence.destroy' },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('MPA-NEG-005 hashes and never returns the target reference', async () => {
    const { service } = setup({ userId: 'requester' });
    const result = await service.request(
      'Bearer token',
      tenantId,
      command,
      randomUUID(),
      metadata(),
    );
    expect(result.data).not.toHaveProperty('target_reference');
    expect(result.data.target_reference_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('MPA-NEG-006 denies a rejected terminal transition', async () => {
    const { service, repository } = setup();
    repository.current = record({ state: 'REJECTED' });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('MPA-NEG-007 denies a revoked terminal transition', async () => {
    const { service, repository } = setup();
    repository.current = record({ state: 'REVOKED' });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('MPA-NEG-008 denies an expired envelope', async () => {
    const { service, repository } = setup();
    repository.current = record({ expiresAt: new Date(Date.now() - 1).toISOString() });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'EXPIRED' });
  });

  it('MPA-NEG-009 denies duplicate approvers', async () => {
    const { service, repository } = setup();
    repository.existing = ['approver-1'];
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_APPROVAL_DENIED' });
  });

  it('MPA-NEG-010 denies missing/unconfigured physical-human attestation', async () => {
    const { service } = setup({ attestation: new NotConfiguredPhysicalHumanAttestation() });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'ATTESTATION_DENIED' });
  });

  it('MPA-NEG-011 denies stale expected versions', async () => {
    const { service } = setup();
    await expect(
      service.reject(
        'Bearer token',
        tenantId,
        record().authorizationId,
        7,
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it.each([
    'NOT_CONFIGURED',
    'UNAVAILABLE',
    'UNKNOWN',
    'MALFORMED',
    'EXPIRED',
    'REVOKED',
    'IDENTITY_MISMATCH',
    'TENANT_MISMATCH',
    'POLICY_MISMATCH',
    'UNVERIFIED',
  ] as const)('fails closed for %s attestation', async (reason) => {
    const { service } = setup({
      attestation: {
        async verify() {
          await Promise.resolve();
          return { verified: false, reason };
        },
      },
    });
    await expect(
      service.approve(
        'Bearer token',
        tenantId,
        record().authorizationId,
        1,
        'a',
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'ATTESTATION_DENIED' });
  });
});
