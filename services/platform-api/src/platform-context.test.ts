import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DevelopmentHeaderIdentityAdapter, NotConfiguredIdentityAdapter } from './identity.js';
import {
  PlatformContextFailure,
  PlatformContextService,
  type TenantContextRepository,
} from './platform-context.js';

const tenantId = randomUUID();
const userId = randomUUID();
const metadata = { correlationId: randomUUID(), requestId: randomUUID() };

function repository(resolved = true): TenantContextRepository {
  return {
    resolve: vi.fn(async () =>
      resolved ? { tenantDisplayName: 'Tenant A', tenantId, tenantSlug: 'tenant-a', userId } : null,
    ),
    readAndAudit: vi.fn(async (context) => context),
  };
}

describe('Phase 1 platform context service', () => {
  it('fails closed when identity is not configured', async () => {
    const service = new PlatformContextService(new NotConfiguredIdentityAdapter(), repository());
    await expect(service.read(undefined, tenantId, metadata)).rejects.toMatchObject({
      code: 'IDENTITY_NOT_CONFIGURED',
    } satisfies Partial<PlatformContextFailure>);
  });

  it('rejects missing authentication before tenant resolution', async () => {
    const store = repository();
    const service = new PlatformContextService(new DevelopmentHeaderIdentityAdapter(), store);
    await expect(service.read(undefined, tenantId, metadata)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    } satisfies Partial<PlatformContextFailure>);
    expect(store.resolve).not.toHaveBeenCalled();
  });

  it('denies a subject without an independently verified active membership', async () => {
    const service = new PlatformContextService(
      new DevelopmentHeaderIdentityAdapter(),
      repository(false),
    );
    await expect(service.read('Bearer dev:oidc|alice', tenantId, metadata)).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_DENIED',
    } satisfies Partial<PlatformContextFailure>);
  });

  it('returns only the server-authorized action after the required audit write', async () => {
    const store = repository();
    const service = new PlatformContextService(new DevelopmentHeaderIdentityAdapter(), store);
    const response = await service.read('Bearer dev:oidc|alice', tenantId, metadata);
    expect(store.readAndAudit).toHaveBeenCalledOnce();
    expect(response.data.permissions).toEqual(['platform.context.read']);
    expect(response.data.tenant.id).toBe(tenantId);
  });
});
