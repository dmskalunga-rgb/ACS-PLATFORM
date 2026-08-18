import { createHash } from 'node:crypto';
import type {
  Customer,
  CustomerCreate,
  CustomerEnvelope,
  CustomerListEnvelope,
  CustomerUpdate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const CUSTOMER_READ = 'commercial.customer.read';
export const CUSTOMER_CREATE = 'commercial.customer.create';
export const CUSTOMER_UPDATE = 'commercial.customer.update';
export const CUSTOMER_ADMIN = 'commercial.customer.admin';

export interface CustomerMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface CustomerMutationInput {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export interface CustomerRepository {
  create(
    input: CustomerMutationInput & CustomerCreate,
  ): Promise<{ customer: Customer; replay: boolean }>;
  get(contextToken: string, tenantId: string, customerId: string): Promise<Customer | null>;
  list(
    contextToken: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ customers: Customer[]; nextCursor: string | null }>;
  update(
    input: CustomerMutationInput & CustomerUpdate & { customerId: string; action: string },
  ): Promise<{ customer: Customer; replay: boolean }>;
}

export type CustomerFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'REFERENCE_CONFLICT';
export class CustomerRegistryFailure extends Error {
  constructor(
    readonly code: CustomerFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class CustomerRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly customers: CustomerRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    metadata: CustomerMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      await this.securityAudit.recordDenied({
        action,
        correlationId: metadata.correlationId,
        reasonCode:
          error instanceof IdentityAuthenticationError
            ? error.reasonCode
            : 'IDENTITY_PROVIDER_ERROR',
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new CustomerRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (identity === null)
      throw new CustomerRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (membership === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:customer-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, metadata, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (issued === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'CONTEXT_ISSUANCE_DENIED');
    return { ...issued, subject: identity.subject };
  }

  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: CustomerMetadata,
    reasonCode: string,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode,
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new CustomerRegistryFailure(
      'FORBIDDEN',
      'The requested customer operation is unavailable.',
    );
  }

  async create(
    header: string | undefined,
    tenantId: string,
    idempotencyKey: string,
    value: CustomerCreate,
    metadata: CustomerMetadata,
  ): Promise<CustomerEnvelope> {
    const context = await this.authorize(header, tenantId, CUSTOMER_CREATE, metadata);
    let result;
    try {
      result = await this.customers.create({
        ...value,
        actorUserId: context.userId,
        contextToken: context.contextToken,
        correlationId: metadata.correlationId,
        idempotencyKey,
        requestHash: hash(value),
        requestId: metadata.requestId,
        tenantId,
      });
    } catch (error) {
      await this.recordRepositoryFailure(
        error,
        context.subject,
        tenantId,
        CUSTOMER_CREATE,
        metadata,
      );
      throw error;
    }
    return envelope(result.customer, metadata, result.replay);
  }

  async get(
    header: string | undefined,
    tenantId: string,
    customerId: string,
    metadata: CustomerMetadata,
  ): Promise<CustomerEnvelope> {
    const context = await this.authorize(header, tenantId, CUSTOMER_READ, metadata);
    const customer = await this.customers.get(context.contextToken, tenantId, customerId);
    if (customer === null)
      throw new CustomerRegistryFailure('NOT_FOUND', 'Customer was not found.');
    return envelope(customer, metadata);
  }

  async list(
    header: string | undefined,
    tenantId: string,
    limit: number,
    cursor: string | undefined,
    metadata: CustomerMetadata,
  ): Promise<CustomerListEnvelope> {
    const context = await this.authorize(header, tenantId, CUSTOMER_READ, metadata);
    const result = await this.customers.list(context.contextToken, tenantId, limit, cursor);
    return {
      data: result.customers,
      meta: {
        request_id: metadata.requestId,
        correlation_id: metadata.correlationId,
        next_cursor: result.nextCursor,
      },
    };
  }

  async update(
    header: string | undefined,
    tenantId: string,
    customerId: string,
    idempotencyKey: string,
    value: CustomerUpdate,
    metadata: CustomerMetadata,
  ): Promise<CustomerEnvelope> {
    const action = value.status === undefined ? CUSTOMER_UPDATE : CUSTOMER_ADMIN;
    const context = await this.authorize(header, tenantId, action, metadata);
    let result;
    try {
      result = await this.customers.update({
        ...value,
        action,
        actorUserId: context.userId,
        contextToken: context.contextToken,
        correlationId: metadata.correlationId,
        customerId,
        idempotencyKey,
        requestHash: hash({ customerId, ...value }),
        requestId: metadata.requestId,
        tenantId,
      });
    } catch (error) {
      await this.recordRepositoryFailure(error, context.subject, tenantId, action, metadata);
      throw error;
    }
    return envelope(result.customer, metadata, result.replay);
  }

  private async recordRepositoryFailure(
    error: unknown,
    subject: string,
    tenantId: string,
    action: string,
    metadata: CustomerMetadata,
  ) {
    if (!(error instanceof CustomerRegistryFailure)) return;
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: error.code,
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
  }
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function envelope(
  customer: Customer,
  metadata: CustomerMetadata,
  replay?: boolean,
): CustomerEnvelope {
  return {
    data: customer,
    meta: {
      request_id: metadata.requestId,
      correlation_id: metadata.correlationId,
      ...(replay === undefined ? {} : { idempotent_replay: replay }),
    },
  };
}
