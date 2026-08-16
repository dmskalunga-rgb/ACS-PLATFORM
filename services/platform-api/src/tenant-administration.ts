import { createHash } from 'node:crypto';
import type { AdministrationMutationResult, TenantAdministration } from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const MEMBERSHIPS_READ = 'platform.memberships.read';
export const MEMBERSHIPS_MANAGE = 'platform.memberships.manage';
export const ROLES_MANAGE = 'platform.roles.manage';

export interface AdminMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface TenantAdminRepository {
  list(contextToken: string, tenantId: string): Promise<TenantAdministration['data']>;
  setMembershipStatus(
    input: AdminMutationInput & { status: 'ACTIVE' | 'INACTIVE' },
  ): Promise<AdministrationMutationResult['data'] & { replay: boolean }>;
  setMembershipRole(
    input: AdminMutationInput & { roleId: string; assign: boolean },
  ): Promise<AdministrationMutationResult['data'] & { replay: boolean }>;
}
export interface AdminMutationInput {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly membershipId: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
}
export class TenantAdministrationFailure extends Error {
  constructor(
    readonly code:
      | 'UNAUTHENTICATED'
      | 'FORBIDDEN'
      | 'STALE_VERSION'
      | 'SELF_ADMINISTRATION_DENIED'
      | 'INVALID_TARGET'
      | 'IDEMPOTENCY_CONFLICT',
    message: string,
  ) {
    super(message);
  }
}

export class TenantAdministrationService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly admin: TenantAdminRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    metadata: AdminMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      const reason =
        error instanceof IdentityAuthenticationError ? error.reasonCode : 'IDENTITY_PROVIDER_ERROR';
      await this.securityAudit.recordDenied({
        action,
        correlationId: metadata.correlationId,
        reasonCode: reason,
        requestId: metadata.requestId,
        requestedTenantId: tenantId,
      });
      throw new TenantAdministrationFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (identity === null)
      throw new TenantAdministrationFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (membership === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'platform:tenant-administration',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, metadata, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (issued === null)
      return this.deny(identity.subject, tenantId, action, metadata, 'CONTEXT_ISSUANCE_DENIED');
    return issued;
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: AdminMetadata,
    reason: string,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: reason,
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new TenantAdministrationFailure(
      'FORBIDDEN',
      'The requested administrative operation is not available.',
    );
  }
  async list(
    header: string | undefined,
    tenantId: string,
    metadata: AdminMetadata,
  ): Promise<TenantAdministration> {
    const context = await this.authorize(header, tenantId, MEMBERSHIPS_READ, metadata);
    return {
      data: await this.admin.list(context.contextToken, tenantId),
      meta: { request_id: metadata.requestId, correlation_id: metadata.correlationId },
    };
  }
  async status(
    header: string | undefined,
    tenantId: string,
    membershipId: string,
    status: 'ACTIVE' | 'INACTIVE',
    expectedVersion: number,
    idempotencyKey: string,
    metadata: AdminMetadata,
  ): Promise<AdministrationMutationResult> {
    const context = await this.authorize(header, tenantId, MEMBERSHIPS_MANAGE, metadata);
    const result = await this.admin.setMembershipStatus({
      actorUserId: context.userId,
      contextToken: context.contextToken,
      correlationId: metadata.correlationId,
      expectedVersion,
      idempotencyKey,
      membershipId,
      requestHash: hash({ membershipId, status, expectedVersion }),
      requestId: metadata.requestId,
      status,
      tenantId,
    });
    return envelope(result, metadata);
  }
  async role(
    header: string | undefined,
    tenantId: string,
    membershipId: string,
    roleId: string,
    assign: boolean,
    expectedVersion: number,
    idempotencyKey: string,
    metadata: AdminMetadata,
  ): Promise<AdministrationMutationResult> {
    const context = await this.authorize(header, tenantId, ROLES_MANAGE, metadata);
    const result = await this.admin.setMembershipRole({
      actorUserId: context.userId,
      assign,
      contextToken: context.contextToken,
      correlationId: metadata.correlationId,
      expectedVersion,
      idempotencyKey,
      membershipId,
      requestHash: hash({ membershipId, roleId, assign, expectedVersion }),
      requestId: metadata.requestId,
      roleId,
      tenantId,
    });
    return envelope(result, metadata);
  }
}
function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function envelope(
  result: AdministrationMutationResult['data'] & { replay: boolean },
  metadata: AdminMetadata,
): AdministrationMutationResult {
  const { replay, ...data } = result;
  return {
    data,
    meta: {
      request_id: metadata.requestId,
      correlation_id: metadata.correlationId,
      idempotent_replay: replay,
    },
  };
}
