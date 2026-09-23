import { createHash, randomUUID } from 'node:crypto';
import type {
  AiDatasetCreate,
  AiDatasetVersionCreate,
  AiInventoryAsset,
  AiInventoryUpdate,
  AiInventoryVersion,
  AiModelCreate,
  AiModelVersionCreate,
  AiPromptCreate,
  AiPromptVersionCreate,
  AiSystemCreate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type ActiveMembershipRepository,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export type AiInventoryFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'ALREADY_EXISTS'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE';

export class AiInventoryFailure extends Error {
  constructor(
    readonly code: AiInventoryFailureCode,
    message = 'AI Inventory operation is unavailable.',
  ) {
    super(message);
  }
}

export const AI_INVENTORY_PERMISSIONS = {
  read: 'aigov.inventory.read',
  systemCreate: 'aigov.ai_system.create',
  systemUpdate: 'aigov.ai_system.update',
  modelCreate: 'aigov.model.create',
  modelUpdate: 'aigov.model.update',
  modelVersionRegister: 'aigov.model_version.register',
  datasetCreate: 'aigov.dataset.create',
  datasetUpdate: 'aigov.dataset.update',
  datasetVersionRegister: 'aigov.dataset_version.register',
  promptCreate: 'aigov.prompt.create',
  promptUpdate: 'aigov.prompt.update',
  promptVersionRegister: 'aigov.prompt_version.register',
} as const;

export interface AiInventoryMetadata {
  readonly requestId: string;
  readonly correlationId: string;
}

export interface AiInventoryActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly contextToken: string;
}

export interface AiInventoryReceipt<T> {
  readonly data: T;
  readonly replay: boolean;
}

export type AiAssetCreateCommand =
  | { readonly kind: 'AI_SYSTEM'; readonly command: AiSystemCreate }
  | { readonly kind: 'MODEL'; readonly command: AiModelCreate }
  | { readonly kind: 'DATASET'; readonly command: AiDatasetCreate }
  | { readonly kind: 'PROMPT'; readonly command: AiPromptCreate };

export type AiVersionCreateCommand =
  | { readonly kind: 'MODEL_VERSION'; readonly command: AiModelVersionCreate }
  | { readonly kind: 'DATASET_VERSION'; readonly command: AiDatasetVersionCreate }
  | { readonly kind: 'PROMPT_VERSION'; readonly command: AiPromptVersionCreate };

interface CommandContext extends AiInventoryActor, AiInventoryMetadata {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export interface AiInventoryRepository {
  createAsset(
    input: CommandContext & AiAssetCreateCommand & { readonly assetId: string },
  ): Promise<AiInventoryReceipt<AiInventoryAsset>>;
  updateAsset(
    input: CommandContext & {
      readonly assetId: string;
      readonly kind: AiAssetCreateCommand['kind'];
      readonly command: AiInventoryUpdate;
    },
  ): Promise<AiInventoryReceipt<AiInventoryAsset>>;
  createVersion(
    input: CommandContext & AiVersionCreateCommand & { readonly versionId: string },
  ): Promise<AiInventoryReceipt<AiInventoryVersion>>;
  readAsset(
    input: AiInventoryActor &
      AiInventoryMetadata & {
        readonly assetId: string;
        readonly kind: AiAssetCreateCommand['kind'];
      },
  ): Promise<AiInventoryAsset | null>;
}

export class AiInventoryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly memberships: ActiveMembershipRepository,
    private readonly repository: AiInventoryRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async createAsset(
    authorizationHeader: string | undefined,
    tenantId: string,
    input: AiAssetCreateCommand,
    idempotencyKey: string,
    metadata: AiInventoryMetadata,
  ) {
    const action = createPermission(input.kind);
    const actor = await this.actor(authorizationHeader, tenantId, action, metadata);
    return this.repository.createAsset({
      ...actor,
      ...metadata,
      ...input,
      assetId: randomUUID(),
      idempotencyKey,
      requestHash: stableHash(input),
    });
  }

  async updateAsset(
    authorizationHeader: string | undefined,
    tenantId: string,
    kind: AiAssetCreateCommand['kind'],
    assetId: string,
    command: AiInventoryUpdate,
    idempotencyKey: string,
    metadata: AiInventoryMetadata,
  ) {
    const actor = await this.actor(authorizationHeader, tenantId, updatePermission(kind), metadata);
    return this.repository.updateAsset({
      ...actor,
      ...metadata,
      kind,
      assetId,
      command,
      idempotencyKey,
      requestHash: stableHash({ kind, assetId, command }),
    });
  }

  async createVersion(
    authorizationHeader: string | undefined,
    tenantId: string,
    input: AiVersionCreateCommand,
    idempotencyKey: string,
    metadata: AiInventoryMetadata,
  ) {
    const actor = await this.actor(
      authorizationHeader,
      tenantId,
      versionPermission(input.kind),
      metadata,
    );
    return this.repository.createVersion({
      ...actor,
      ...metadata,
      ...input,
      versionId: randomUUID(),
      idempotencyKey,
      requestHash: stableHash(input),
    });
  }

  async readAsset(
    authorizationHeader: string | undefined,
    tenantId: string,
    kind: AiAssetCreateCommand['kind'],
    assetId: string,
    metadata: AiInventoryMetadata,
  ) {
    const actor = await this.actor(
      authorizationHeader,
      tenantId,
      AI_INVENTORY_PERMISSIONS.read,
      metadata,
    );
    const result = await this.repository.readAsset({ ...actor, ...metadata, kind, assetId });
    if (result === null) throw new AiInventoryFailure('NOT_FOUND');
    return result;
  }

  private async actor(
    authorizationHeader: string | undefined,
    tenantId: string,
    action: string,
    metadata: AiInventoryMetadata,
  ): Promise<AiInventoryActor> {
    let identity;
    try {
      identity = await this.identity.authenticate(authorizationHeader);
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
      throw new AiInventoryFailure('UNAUTHENTICATED');
    }
    if (identity === null) throw new AiInventoryFailure('UNAUTHENTICATED');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    const active = (await this.memberships.listActiveMembershipsBySubject(identity.subject)).find(
      (candidate) => candidate.tenantId === tenantId && candidate.userId === membership?.userId,
    );
    if (membership === null || active === undefined)
      return this.deny(identity.subject, tenantId, action, metadata);
    const decision = await this.authorization.authorize({
      action,
      resource: 'aigov:ai-inventory',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) return this.deny(identity.subject, tenantId, action, metadata);
    const context = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (context === null) return this.deny(identity.subject, tenantId, action, metadata);
    return {
      tenantId,
      userId: context.userId,
      membershipId: active.membershipId,
      contextToken: context.contextToken,
    };
  }

  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    metadata: AiInventoryMetadata,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: metadata.correlationId,
      reasonCode: 'AIGOV_M0A_AUTHORITY_DENIED',
      requestId: metadata.requestId,
      requestedTenantId: tenantId,
    });
    throw new AiInventoryFailure('FORBIDDEN');
  }
}

function createPermission(kind: AiAssetCreateCommand['kind']) {
  return {
    AI_SYSTEM: AI_INVENTORY_PERMISSIONS.systemCreate,
    MODEL: AI_INVENTORY_PERMISSIONS.modelCreate,
    DATASET: AI_INVENTORY_PERMISSIONS.datasetCreate,
    PROMPT: AI_INVENTORY_PERMISSIONS.promptCreate,
  }[kind];
}

function updatePermission(kind: AiAssetCreateCommand['kind']) {
  return {
    AI_SYSTEM: AI_INVENTORY_PERMISSIONS.systemUpdate,
    MODEL: AI_INVENTORY_PERMISSIONS.modelUpdate,
    DATASET: AI_INVENTORY_PERMISSIONS.datasetUpdate,
    PROMPT: AI_INVENTORY_PERMISSIONS.promptUpdate,
  }[kind];
}

function versionPermission(kind: AiVersionCreateCommand['kind']) {
  return {
    MODEL_VERSION: AI_INVENTORY_PERMISSIONS.modelVersionRegister,
    DATASET_VERSION: AI_INVENTORY_PERMISSIONS.datasetVersionRegister,
    PROMPT_VERSION: AI_INVENTORY_PERMISSIONS.promptVersionRegister,
  }[kind];
}

function stableHash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined && child !== null)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, child]) => [name, canonicalValue(child)]),
    );
  return value;
}
