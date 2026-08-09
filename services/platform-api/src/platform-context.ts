import type { PlatformContextResponse } from '@acs/contracts';

export const PLATFORM_CONTEXT_READ = 'platform.context.read' as const;

export interface TrustedIdentity {
  readonly subject: string;
}

export interface IdentityAdapter {
  authenticate(authorizationHeader: string | undefined): Promise<TrustedIdentity | null>;
  readonly configured: boolean;
}

export interface ResolvedTenantContext {
  readonly tenantDisplayName: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly userId: string;
}

export interface ContextReadMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}

export interface TenantContextRepository {
  resolve(subject: string, requestedTenantId: string): Promise<ResolvedTenantContext | null>;
  readAndAudit(
    context: ResolvedTenantContext,
    metadata: ContextReadMetadata,
  ): Promise<ResolvedTenantContext>;
}

export type PlatformContextFailureCode =
  'IDENTITY_NOT_CONFIGURED' | 'TENANT_CONTEXT_DENIED' | 'UNAUTHENTICATED';

export class PlatformContextFailure extends Error {
  constructor(
    readonly code: PlatformContextFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class PlatformContextService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly repository: TenantContextRepository,
  ) {}

  async read(
    authorizationHeader: string | undefined,
    requestedTenantId: string,
    metadata: ContextReadMetadata,
  ): Promise<PlatformContextResponse> {
    if (!this.identity.configured) {
      throw new PlatformContextFailure(
        'IDENTITY_NOT_CONFIGURED',
        'The identity provider is not configured for this environment.',
      );
    }
    const identity = await this.identity.authenticate(authorizationHeader);
    if (identity === null) {
      throw new PlatformContextFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    const context = await this.repository.resolve(identity.subject, requestedTenantId);
    if (context === null) {
      throw new PlatformContextFailure(
        'TENANT_CONTEXT_DENIED',
        'The requested tenant context is not available.',
      );
    }

    // The first Phase 1 action is intentionally authorized by a verified active membership.
    // No caller-supplied role or permission is accepted.
    const audited = await this.repository.readAndAudit(context, metadata);
    return {
      data: {
        user_id: audited.userId,
        tenant: {
          id: audited.tenantId,
          slug: audited.tenantSlug,
          display_name: audited.tenantDisplayName,
        },
        membership: { status: 'ACTIVE' },
        permissions: [PLATFORM_CONTEXT_READ],
      },
      meta: {
        request_id: metadata.requestId,
        correlation_id: metadata.correlationId,
      },
    };
  }
}
