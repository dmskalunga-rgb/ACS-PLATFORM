import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DevelopmentHeaderIdentityAdapter, NotConfiguredIdentityAdapter } from './identity.js';
import {
  PlatformContextFailure,
  PlatformContextService,
  RepositoryAuthorizationPort,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

const tenantId = randomUUID();
const userId = randomUUID();
const metadata = { correlationId: randomUUID(), requestId: randomUUID() };

function repository(resolved = true, allowed = true): TenantContextRepository {
  return {
    resolveMembership: vi.fn(async () =>
      resolved ? { tenantDisplayName: 'Tenant A', tenantId, tenantSlug: 'tenant-a', userId } : null,
    ),
    isActionAuthorized: vi.fn(async () => allowed),
    issueContext: vi.fn(async () =>
      resolved && allowed
        ? {
            contextToken: randomUUID(),
            tenantDisplayName: 'Tenant A',
            tenantId,
            tenantSlug: 'tenant-a',
            userId,
          }
        : null,
    ),
    readAndAudit: vi.fn(async (context) => context),
  };
}

function service(
  identity: DevelopmentHeaderIdentityAdapter | NotConfiguredIdentityAdapter,
  store = repository(),
  securityAudit: SecurityAuditPort = { recordDenied: vi.fn(async () => undefined) },
) {
  return new PlatformContextService(
    identity,
    new RepositoryAuthorizationPort(store),
    store,
    securityAudit,
  );
}

describe('Phase 1 platform context service', () => {
  it('fails closed when identity is not configured', async () => {
    const contextService = service(new NotConfiguredIdentityAdapter());
    await expect(contextService.read(undefined, tenantId, metadata)).rejects.toMatchObject({
      code: 'IDENTITY_NOT_CONFIGURED',
    } satisfies Partial<PlatformContextFailure>);
  });

  it('rejects missing authentication before tenant resolution', async () => {
    const store = repository();
    const contextService = service(new DevelopmentHeaderIdentityAdapter(), store);
    await expect(contextService.read(undefined, tenantId, metadata)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    } satisfies Partial<PlatformContextFailure>);
    expect(store.resolveMembership).not.toHaveBeenCalled();
  });

  it('denies a subject without an independently verified active membership', async () => {
    const contextService = service(new DevelopmentHeaderIdentityAdapter(), repository(false));
    await expect(
      contextService.read('Bearer dev:oidc|alice', tenantId, metadata),
    ).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_DENIED',
    } satisfies Partial<PlatformContextFailure>);
  });

  it('denies an active membership without the explicit action permission', async () => {
    const contextService = service(new DevelopmentHeaderIdentityAdapter(), repository(true, false));
    await expect(
      contextService.read('Bearer dev:oidc|alice', tenantId, metadata),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' } satisfies Partial<PlatformContextFailure>);
  });

  it('returns only the server-authorized action after the required audit write', async () => {
    const store = repository();
    const contextService = service(new DevelopmentHeaderIdentityAdapter(), store);
    const response = await contextService.read('Bearer dev:oidc|alice', tenantId, metadata);
    expect(store.readAndAudit).toHaveBeenCalledOnce();
    expect(response.data.permissions).toEqual(['platform.context.read']);
    expect(response.data.tenant.id).toBe(tenantId);
  });
});
