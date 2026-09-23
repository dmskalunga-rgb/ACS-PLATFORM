import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { aiRiskAssessmentSchema, aiRiskCreateSchema } from '@acs/contracts';
import { AI_RISK_PERMISSIONS, AiRiskService, type AiRiskRepository } from './ai-risk.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const userId = '10000000-0000-4000-8000-000000000011';
const membershipId = '30000000-0000-4000-8000-000000000011';
const evidence = 'e3000000-0000-4000-8000-000000000011';
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });
const createCommand = () => ({
  risk_code: 'AIR-001',
  title: 'AI reliability',
  description: 'AI-specific test risk',
  primary_category: 'AIR-T01' as const,
  owner_user_id: userId,
  inventory: null,
  evidence_reference: evidence,
});

function setup(allowed = true) {
  const authorize = vi.fn().mockResolvedValue({ allowed, reason: allowed ? 'TEST' : 'DENIED' });
  const create = vi.fn<AiRiskRepository['create']>();
  const repository: AiRiskRepository = {
    create,
    update: vi.fn(),
    assess: vi.fn(),
    treat: vi.fn(),
    review: vi.fn(),
    monitor: vi.fn(),
    read: vi.fn(),
  };
  const recordDenied = vi.fn();
  const service = new AiRiskService(
    { configured: true, authenticate: vi.fn().mockResolvedValue({ subject: 'oidc|alice' }) },
    { authorize },
    {
      resolveMembership: vi
        .fn()
        .mockResolvedValue({ userId, tenantId, tenantSlug: 'tenant', tenantDisplayName: 'Tenant' }),
      isActionAuthorized: vi.fn().mockResolvedValue(true),
      issueContext: vi.fn().mockResolvedValue({
        userId,
        tenantId,
        tenantSlug: 'tenant',
        tenantDisplayName: 'Tenant',
        contextToken: randomUUID(),
      }),
      readAndAudit: vi
        .fn()
        .mockResolvedValue({ userId, tenantId, tenantSlug: 'tenant', tenantDisplayName: 'Tenant' }),
    },
    {
      listActiveMembershipsBySubject: vi
        .fn()
        .mockResolvedValue([
          { userId, tenantId, membershipId, tenantSlug: 'tenant', tenantDisplayName: 'Tenant' },
        ]),
    },
    repository,
    { recordDenied },
  );
  return { service, create, authorize, recordDenied };
}

describe('AIGOV M0B AI-specific risk boundary', () => {
  it('rejects client authority, computed state and unknown fields', () => {
    expect(aiRiskCreateSchema.safeParse({ ...createCommand(), tenant_id: tenantId }).success).toBe(
      false,
    );
    expect(aiRiskCreateSchema.safeParse({ ...createCommand(), status: 'ACCEPTED' }).success).toBe(
      false,
    );
    expect(
      aiRiskAssessmentSchema.safeParse({
        expected_version: 1,
        likelihood: 2,
        impact: 3,
        exposure: 4,
        detectability: 3,
        autonomy: 2,
        blast_radius: 1,
        control_strength: 0.5,
        previous_assessment_id: null,
        reason_reference: 'reason',
        trigger_reference: 'initial',
        evidence_reference: evidence,
        residual_score: 0,
      }).success,
    ).toBe(false);
  });

  it('uses active membership and canonical AuthorizationPort before the repository', async () => {
    const { service, create, authorize } = setup();
    create.mockResolvedValue({ data: {} as never, replay: false });
    await service.create('Bearer opaque', tenantId, createCommand(), randomUUID(), metadata());
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AI_RISK_PERMISSIONS.create,
        subject_id: userId,
        tenant_id: tenantId,
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        userId,
        membershipId,
      }),
    );
  });

  it('does not use a membership from another tenant', async () => {
    const { service, create, recordDenied } = setup();
    await expect(
      service.create(
        'Bearer opaque',
        '00000000-0000-4000-8000-000000000022',
        createCommand(),
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(create).not.toHaveBeenCalled();
    expect(recordDenied).toHaveBeenCalledOnce();
  });

  it('keeps protected acceptance and rejection fail-closed pending MPA policy', async () => {
    const { service, create, recordDenied } = setup();
    await expect(
      service.decideProtected('Bearer opaque', tenantId, metadata()),
    ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_PENDING_POLICY' });
    expect(create).not.toHaveBeenCalled();
    expect(recordDenied).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'AIGOV_M0B_POLICY_NOT_AUTHORIZED',
      }),
    );
  });

  it('denies authorization failure before any mutation', async () => {
    const { service, create } = setup(false);
    await expect(
      service.create('Bearer opaque', tenantId, createCommand(), randomUUID(), metadata()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(create).not.toHaveBeenCalled();
  });
});
