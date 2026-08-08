import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TenantContextStore } from './tenant-context.js';

describe('FOUNDATION tenant context', () => {
  it('propagates one validated tenant through an asynchronous operation', async () => {
    const store = new TenantContextStore();
    const tenantId = randomUUID();

    await store.run(
      { tenant_id: tenantId, request_id: randomUUID(), correlation_id: randomUUID() },
      async () => {
        await Promise.resolve();
        expect(store.current().tenant_id).toBe(tenantId);
      },
    );
  });

  it('fails closed when no tenant context exists', () => {
    const store = new TenantContextStore();
    expect(() => store.current()).toThrow('Tenant context is required');
  });
});
