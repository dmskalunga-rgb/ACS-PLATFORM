import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CustomerRegistryFailure, CustomerRegistryService } from './customer-registry.js';
import { DevelopmentHeaderIdentityAdapter } from './identity.js';

const tenantId = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const metadata = { correlationId: randomUUID(), requestId: randomUUID() };
const customer = {
  id: customerId,
  display_name: 'Acme',
  reference_code: null,
  contact_email: null,
  status: 'ACTIVE' as const,
  version: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const contexts = {
  resolveMembership: vi.fn(() =>
    Promise.resolve({ tenantDisplayName: 'Tenant', tenantId, tenantSlug: 'tenant', userId }),
  ),
  isActionAuthorized: vi.fn(() => Promise.resolve(true)),
  issueContext: vi.fn(() =>
    Promise.resolve({
      contextToken: randomUUID(),
      tenantDisplayName: 'Tenant',
      tenantId,
      tenantSlug: 'tenant',
      userId,
    }),
  ),
  readAndAudit: vi.fn(),
};

describe('Customer Registry service', () => {
  it('uses AuthorizationPort and preserves tenant authority outside the payload', async () => {
    const authorization = {
      authorize: vi.fn(() => Promise.resolve({ allowed: true, reason: 'test' })),
    };
    const repository = {
      create: vi.fn(() => Promise.resolve({ customer, replay: false })),
      get: vi.fn(() => Promise.resolve(customer)),
      list: vi.fn(() => Promise.resolve({ customers: [customer], nextCursor: null })),
      update: vi.fn(() => Promise.resolve({ customer, replay: false })),
    };
    const service = new CustomerRegistryService(
      new DevelopmentHeaderIdentityAdapter(),
      authorization,
      contexts,
      repository,
      { recordDenied: vi.fn() },
    );
    await service.create(
      'Bearer dev:alice',
      tenantId,
      randomUUID(),
      { display_name: 'Acme' },
      metadata,
    );
    expect(authorization.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'commercial.customer.create', tenant_id: tenantId }),
    );
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId }));
  });

  it('fails closed and records a denial when permission is absent', async () => {
    const denial = vi.fn();
    const service = new CustomerRegistryService(
      new DevelopmentHeaderIdentityAdapter(),
      { authorize: vi.fn(() => Promise.resolve({ allowed: false, reason: 'denied' })) },
      contexts,
      { create: vi.fn(), get: vi.fn(), list: vi.fn(), update: vi.fn() },
      { recordDenied: denial },
    );
    await expect(
      service.get('Bearer dev:alice', tenantId, customerId, metadata),
    ).rejects.toBeInstanceOf(CustomerRegistryFailure);
    expect(denial).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'PERMISSION_DENIED' }),
    );
  });
});
