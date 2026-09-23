import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_INVENTORY_PERMISSIONS,
  AiInventoryService,
  type AiInventoryRepository,
} from './ai-inventory.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const userId = '10000000-0000-4000-8000-000000000101';
const membershipId = '10000000-0000-4000-8000-000000000301';
const contextToken = '10000000-0000-4000-8000-000000000201';
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });

function setup(allowed = true) {
  const authorize = vi.fn().mockResolvedValue({ allowed, reason: allowed ? 'TEST' : 'DENIED' });
  const authenticate = vi.fn().mockResolvedValue({ subject: 'issuer|subject' });
  const createAsset = vi.fn<AiInventoryRepository['createAsset']>();
  const updateAsset = vi.fn<AiInventoryRepository['updateAsset']>();
  const createVersion = vi.fn<AiInventoryRepository['createVersion']>();
  const readAsset = vi.fn<AiInventoryRepository['readAsset']>();
  const repository: AiInventoryRepository = {
    createAsset,
    updateAsset,
    createVersion,
    readAsset,
  };
  const recordDenied = vi.fn();
  const service = new AiInventoryService(
    { configured: true, authenticate },
    { authorize },
    {
      resolveMembership: vi.fn().mockResolvedValue({
        userId,
        tenantId,
        tenantSlug: 'tenant',
        tenantDisplayName: 'Tenant',
      }),
      isActionAuthorized: vi.fn().mockResolvedValue(true),
      issueContext: vi.fn().mockResolvedValue({
        userId,
        tenantId,
        tenantSlug: 'tenant',
        tenantDisplayName: 'Tenant',
        contextToken,
      }),
      readAndAudit: vi.fn().mockResolvedValue({
        userId,
        tenantId,
        tenantSlug: 'tenant',
        tenantDisplayName: 'Tenant',
      }),
    },
    {
      listActiveMembershipsBySubject: vi.fn().mockResolvedValue([
        {
          userId,
          tenantId,
          membershipId,
          tenantSlug: 'tenant',
          tenantDisplayName: 'Tenant',
        },
      ]),
    },
    repository,
    { recordDenied },
  );
  return { service, createAsset, createVersion, authorize, recordDenied, authenticate };
}

function systemCommand() {
  return {
    system_key: 'fraud.assist',
    name: 'Fraud Assist',
    purpose: 'Decision support.',
    owner_reference: 'owner:risk',
    classification: 'CONFIDENTIAL' as const,
    evidence_reference: 'e3000000-0000-4000-8000-000000000011',
  };
}

describe('AIGOV M0A AI Inventory service', () => {
  it('uses the requested tenant only after active membership and AuthorizationPort approval', async () => {
    const { service, createAsset, authorize } = setup();
    createAsset.mockResolvedValue({ data: {} as never, replay: false });
    await service.createAsset(
      'Bearer opaque',
      tenantId,
      { kind: 'AI_SYSTEM', command: systemCommand() },
      randomUUID(),
      metadata(),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AI_INVENTORY_PERMISSIONS.systemCreate,
        tenant_id: tenantId,
        subject_id: userId,
      }),
    );
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId, membershipId, contextToken }),
    );
  });

  it('keeps tenant identity out of the caller-controlled command', async () => {
    const { service, createAsset } = setup();
    createAsset.mockResolvedValue({ data: {} as never, replay: false });
    await service.createAsset(
      'Bearer opaque',
      tenantId,
      { kind: 'AI_SYSTEM', command: systemCommand() },
      randomUUID(),
      metadata(),
    );
    const input = createAsset.mock.calls[0]![0];
    expect(input.command).not.toHaveProperty('tenant_id');
    expect(input.tenantId).toBe(tenantId);
  });

  it('fails closed and records durable denial when AuthorizationPort rejects', async () => {
    const { service, createAsset, recordDenied } = setup(false);
    await expect(
      service.createAsset(
        'Bearer opaque',
        tenantId,
        { kind: 'AI_SYSTEM', command: systemCommand() },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(createAsset).not.toHaveBeenCalled();
    expect(recordDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'AIGOV_M0A_AUTHORITY_DENIED' }),
    );
  });

  it('does not reuse an active membership or authorization decision across tenants', async () => {
    const { service, createAsset, authorize, recordDenied } = setup();
    await expect(
      service.createAsset(
        'Bearer opaque',
        '00000000-0000-4000-8000-000000000022',
        { kind: 'AI_SYSTEM', command: systemCommand() },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(authorize).not.toHaveBeenCalled();
    expect(createAsset).not.toHaveBeenCalled();
    expect(recordDenied).toHaveBeenCalledOnce();
  });

  it('fails closed on missing authentication before using the repository', async () => {
    const { service, createAsset, authenticate } = setup();
    authenticate.mockResolvedValueOnce(null);
    await expect(
      service.createAsset(
        undefined,
        tenantId,
        { kind: 'AI_SYSTEM', command: systemCommand() },
        randomUUID(),
        metadata(),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(createAsset).not.toHaveBeenCalled();
  });

  it('registers prompt versions by reference and hash without executing a model', async () => {
    const { service, createVersion, authorize } = setup();
    createVersion.mockResolvedValue({ data: {} as never, replay: false });
    await service.createVersion(
      'Bearer opaque',
      tenantId,
      {
        kind: 'PROMPT_VERSION',
        command: {
          prompt_id: randomUUID(),
          version_label: '1.0.0',
          content_sha256: 'a'.repeat(64),
          content_reference: 'artifact:prompt:1',
          change_reason: 'Initial governed registration.',
          evidence_reference: 'e3000000-0000-4000-8000-000000000011',
        },
      },
      randomUUID(),
      metadata(),
    );
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ action: AI_INVENTORY_PERMISSIONS.promptVersionRegister }),
    );
    expect(createVersion).toHaveBeenCalledOnce();
  });
});
