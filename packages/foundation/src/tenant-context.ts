import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';

const tenantContextSchema = z.object({
  correlation_id: z.uuid(),
  request_id: z.uuid(),
  tenant_id: z.uuid(),
  user_id: z.uuid().optional(),
});

export type TenantContext = Readonly<z.infer<typeof tenantContextSchema>>;

export class TenantContextStore {
  readonly #storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, operation: () => T): T {
    return this.#storage.run(tenantContextSchema.parse(context), operation);
  }

  current(): TenantContext {
    const context = this.#storage.getStore();
    if (context === undefined) {
      throw new Error('Tenant context is required for this operation.');
    }
    return context;
  }
}

export const FOUNDATION_COMPONENT = 'FOUNDATION' as const;
