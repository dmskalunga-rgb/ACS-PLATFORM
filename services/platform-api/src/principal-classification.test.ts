import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  IdentityAdapter,
  IssuedTenantContext,
  SecurityAuditPort,
  TenantContextRepository,
} from './platform-context.js';
import {
  PrincipalClassificationService,
  type ClassificationRepository,
} from './principal-classification.js';

const tenantId = 'tenant-a';
const actorId = 'verifier-a';
const metadata = { requestId: 'request-a', correlationId: 'correlation-a' };

function fixture(
  options: {
    secondActor?: string;
    secondTenant?: string;
    denySecond?: boolean;
  } = {},
) {
  const first: IssuedTenantContext = {
    userId: actorId,
    tenantId,
    tenantSlug: 'tenant-a',
    tenantDisplayName: 'Tenant A',
    contextToken: 'evidence-context',
  };
  const second: IssuedTenantContext = {
    ...first,
    userId: options.secondActor ?? actorId,
    tenantId: options.secondTenant ?? tenantId,
    contextToken: 'verification-context',
  };
  let authenticationCount = 0;
  let authorizationCount = 0;
  let issuanceCount = 0;
  const identity: IdentityAdapter = {
    configured: true,
    authenticate: vi.fn(() => {
      authenticationCount += 1;
      return Promise.resolve({
        subject: authenticationCount === 1 ? 'subject-a' : 'subject-b',
      });
    }),
  };
  const contexts: TenantContextRepository = {
    resolveMembership: vi.fn((subject) =>
      Promise.resolve({
        ...first,
        userId: subject === 'subject-a' ? actorId : (options.secondActor ?? actorId),
      }),
    ),
    isActionAuthorized: vi.fn(() => Promise.resolve(true)),
    issueContext: vi.fn(() => {
      issuanceCount += 1;
      return Promise.resolve(issuanceCount === 1 ? first : second);
    }),
    readAndAudit: vi.fn(() => Promise.resolve(first)),
  };
  const authorization: AuthorizationPort = {
    authorize: vi.fn(() => {
      authorizationCount += 1;
      return Promise.resolve({
        allowed: !(options.denySecond && authorizationCount === 2),
        reason: 'FOCUSED_TEST',
      });
    }),
  };
  const pendingHumanEvidence = vi.fn(() => Promise.resolve('evidence-reference'));
  const verifyHuman = vi.fn(() => Promise.resolve('verified-person'));
  const transitionHuman = vi.fn(() => Promise.resolve(2));
  const repository: ClassificationRepository = {
    set: vi.fn(() => Promise.resolve(null)),
    requestHuman: vi.fn(() => Promise.resolve(null)),
    pendingHumanEvidence,
    verifyHuman,
    transitionHuman,
  };
  const evidence = {
    validate: vi.fn(() => Promise.resolve<'VALID' | 'INVALID'>('VALID')),
  };
  const securityAudit: SecurityAuditPort = {
    recordDenied: vi.fn(() => Promise.resolve()),
  };
  return {
    service: new PrincipalClassificationService(
      identity,
      authorization,
      contexts,
      repository,
      evidence,
      securityAudit,
    ),
    issuedContextCount: () => issuanceCount,
    authorizationCount: () => authorizationCount,
    pendingHumanEvidence,
    verifyHuman,
    transitionHuman,
    evidence,
  };
}

describe('principal classification one-use context boundary', () => {
  it('authorizes each operation and uses distinct contexts for the same actor and tenant', async () => {
    const subject = fixture();
    await expect(
      subject.service.verifyHuman(undefined, tenantId, 'classification-request', metadata),
    ).resolves.toMatchObject({ person_id: 'verified-person' });
    expect(subject.pendingHumanEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ contextToken: 'evidence-context', actorUserId: actorId, tenantId }),
    );
    expect(subject.verifyHuman).toHaveBeenCalledWith(
      expect.objectContaining({
        contextToken: 'verification-context',
        actorUserId: actorId,
        tenantId,
      }),
    );
    expect(subject.evidence.validate).toHaveBeenCalledOnce();
    expect(subject.issuedContextCount()).toBe(2);
    expect(subject.authorizationCount()).toBe(2);
  });

  it('denies a substituted second actor before verification', async () => {
    const subject = fixture({ secondActor: 'verifier-b' });
    await expect(
      subject.service.verifyHuman(undefined, tenantId, 'classification-request', metadata),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(subject.verifyHuman).not.toHaveBeenCalled();
  });

  it('denies a second context issued for another tenant', async () => {
    const subject = fixture({ secondTenant: 'tenant-b' });
    await expect(
      subject.service.verifyHuman(undefined, tenantId, 'classification-request', metadata),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(subject.verifyHuman).not.toHaveBeenCalled();
  });

  it('cannot obtain a second context without independent authorization', async () => {
    const subject = fixture({ denySecond: true });
    await expect(
      subject.service.verifyHuman(undefined, tenantId, 'classification-request', metadata),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(subject.issuedContextCount()).toBe(1);
    expect(subject.verifyHuman).not.toHaveBeenCalled();
  });
});

describe('protected HUMAN lifecycle service boundary', () => {
  const command = {
    targetUserId: 'subject-user',
    transition: 'SUSPEND' as const,
    reasonCode: 'GOVERNED_REVIEW',
    evidenceId: 'evidence-reference',
    expectedVersion: 1,
    idempotencyKey: 'command-id',
  };

  it('validates evidence and forwards a server-authorized tenant context', async () => {
    const subject = fixture();
    await expect(
      subject.service.transitionHuman(undefined, tenantId, command, metadata),
    ).resolves.toMatchObject({ status: 'SUSPENDED', version: 2 });
    expect(subject.evidence.validate).toHaveBeenCalledOnce();
    expect(subject.transitionHuman).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        actorUserId: actorId,
        targetUserId: command.targetUserId,
        contextToken: 'evidence-context',
        expectedVersion: 1,
      }),
    );
  });

  it.each(['SUSPEND', 'REACTIVATE', 'REVOKE'] as const)(
    'denies a self-issued %s lifecycle operation before repository mutation',
    async (transition) => {
      const subject = fixture();
      await expect(
        subject.service.transitionHuman(
          undefined,
          tenantId,
          { ...command, transition, targetUserId: actorId },
          metadata,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(subject.transitionHuman).not.toHaveBeenCalled();
    },
  );

  it('denies invalid evidence before repository mutation', async () => {
    const subject = fixture();
    subject.evidence.validate.mockResolvedValueOnce('INVALID');
    await expect(
      subject.service.transitionHuman(undefined, tenantId, command, metadata),
    ).rejects.toMatchObject({ code: 'INVALID_TARGET_OR_VERSION' });
    expect(subject.transitionHuman).not.toHaveBeenCalled();
  });
});
