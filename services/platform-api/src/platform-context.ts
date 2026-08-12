import type { PlatformContextResponse } from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import { setActiveTenantTraceContext } from '@acs/observability';

export const PLATFORM_CONTEXT_READ = 'platform.context.read' as const;
export const PLATFORM_CONTEXT_RESOURCE = 'platform:tenant-context' as const;

export interface TrustedIdentity {
  readonly subject: string;
}

export interface IdentityAdapter {
  readonly authenticate: (
    authorizationHeader: string | undefined,
  ) => Promise<TrustedIdentity | null>;
  readonly configured: boolean;
}

export interface ResolvedTenantMembership {
  readonly tenantDisplayName: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly userId: string;
}

export interface IssuedTenantContext extends ResolvedTenantMembership {
  readonly contextToken: string;
}

export interface ContextReadMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}

export interface TenantContextRepository {
  readonly resolveMembership: (
    subject: string,
    requestedTenantId: string,
  ) => Promise<ResolvedTenantMembership | null>;
  readonly isActionAuthorized: (
    userId: string,
    tenantId: string,
    action: string,
  ) => Promise<boolean>;
  readonly issueContext: (
    subject: string,
    requestedTenantId: string,
    action: string,
  ) => Promise<IssuedTenantContext | null>;
  readonly readAndAudit: (
    context: IssuedTenantContext,
    metadata: ContextReadMetadata,
  ) => Promise<ResolvedTenantMembership>;
}

export interface SecurityDenialRecord {
  readonly action: string;
  readonly actorSubject?: string;
  readonly correlationId: string;
  readonly reasonCode: string;
  readonly requestId: string;
  readonly requestedTenantId?: string;
  readonly selector?: string;
}

export interface SecurityAuditPort {
  readonly recordDenied: (record: SecurityDenialRecord) => Promise<void>;
}

export class RepositoryAuthorizationPort implements AuthorizationPort {
  constructor(private readonly repository: TenantContextRepository) {}

  async authorize(request: {
    readonly action: string;
    readonly resource: string;
    readonly subject_id: string;
    readonly tenant_id: string;
    readonly attributes: Readonly<Record<string, unknown>>;
  }) {
    const allowed = await this.repository.isActionAuthorized(
      request.subject_id,
      request.tenant_id,
      request.action,
    );
    return {
      allowed,
      reason: allowed ? 'EXPLICIT_MEMBERSHIP_PERMISSION' : 'PERMISSION_NOT_GRANTED',
      policy_id: 'phase1-membership-permission-v1',
    };
  }
}

export type PlatformContextFailureCode =
  'IDENTITY_NOT_CONFIGURED' | 'PERMISSION_DENIED' | 'TENANT_CONTEXT_DENIED' | 'UNAUTHENTICATED';

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
    private readonly authorization: AuthorizationPort,
    private readonly repository: TenantContextRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async recordRequestDenial(
    reasonCode: string,
    selector: string | undefined,
    metadata: ContextReadMetadata,
  ): Promise<void> {
    await this.securityAudit.recordDenied({
      action: PLATFORM_CONTEXT_READ,
      correlationId: metadata.correlationId,
      reasonCode,
      requestId: metadata.requestId,
      ...(selector === undefined ? {} : { selector }),
    });
  }

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
      await this.securityAudit.recordDenied({
        action: PLATFORM_CONTEXT_READ,
        correlationId: metadata.correlationId,
        reasonCode: 'UNAUTHENTICATED',
        requestId: metadata.requestId,
        requestedTenantId,
      });
      throw new PlatformContextFailure('UNAUTHENTICATED', 'Authentication is required.');
    }

    const membership = await this.repository.resolveMembership(identity.subject, requestedTenantId);
    if (membership === null) {
      await this.securityAudit.recordDenied({
        action: PLATFORM_CONTEXT_READ,
        actorSubject: identity.subject,
        correlationId: metadata.correlationId,
        reasonCode: 'TENANT_CONTEXT_DENIED',
        requestId: metadata.requestId,
        requestedTenantId,
      });
      throw new PlatformContextFailure(
        'TENANT_CONTEXT_DENIED',
        'The requested tenant context is not available.',
      );
    }

    const decision = await this.authorization.authorize({
      action: PLATFORM_CONTEXT_READ,
      attributes: {},
      resource: PLATFORM_CONTEXT_RESOURCE,
      subject_id: membership.userId,
      tenant_id: membership.tenantId,
    });
    if (!decision.allowed) {
      await this.securityAudit.recordDenied({
        action: PLATFORM_CONTEXT_READ,
        actorSubject: identity.subject,
        correlationId: metadata.correlationId,
        reasonCode: 'PERMISSION_DENIED',
        requestId: metadata.requestId,
        requestedTenantId,
      });
      throw new PlatformContextFailure(
        'PERMISSION_DENIED',
        'The requested tenant context is not available.',
      );
    }

    const issued = await this.repository.issueContext(
      identity.subject,
      requestedTenantId,
      PLATFORM_CONTEXT_READ,
    );
    if (issued === null) {
      await this.securityAudit.recordDenied({
        action: PLATFORM_CONTEXT_READ,
        actorSubject: identity.subject,
        correlationId: metadata.correlationId,
        reasonCode: 'CONTEXT_ISSUANCE_DENIED',
        requestId: metadata.requestId,
        requestedTenantId,
      });
      throw new PlatformContextFailure(
        'TENANT_CONTEXT_DENIED',
        'The requested tenant context is not available.',
      );
    }

    setActiveTenantTraceContext(issued.tenantId, PLATFORM_CONTEXT_READ);
    const audited = await this.repository.readAndAudit(issued, metadata);
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
