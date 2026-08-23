import { createHash } from 'node:crypto';
import type {
  Contract,
  ContractAssign,
  ContractCreate,
  ContractLineCreate,
  ContractLineUpdate,
  ContractTransition,
  ContractUpdate,
} from '@acs/contracts';
import type { AuthorizationPort } from '@acs/foundation';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const CONTRACT_READ = 'commercial.contract.read';
export const CONTRACT_CREATE = 'commercial.contract.create';
export const CONTRACT_UPDATE = 'commercial.contract.update';
export const CONTRACT_ASSIGN = 'commercial.contract.assign';
export const CONTRACT_APPROVE = 'commercial.contract.approve';
export const CONTRACT_REVISE = 'commercial.contract.revise';
export const CONTRACT_ACTIVATE = 'commercial.contract.activate';
export const CONTRACT_CANCEL = 'commercial.contract.cancel';
export const CONTRACT_TERMINATE = 'commercial.contract.terminate';

export interface ContractMetadata {
  correlationId: string;
  requestId: string;
}
export interface ContractMutation {
  actorUserId: string;
  contextToken: string;
  correlationId: string;
  idempotencyKey: string;
  requestHash: string;
  requestId: string;
  tenantId: string;
  action: string;
  auditAction?: string;
}
type MutationResult = { contract: Contract; replay: boolean };
export interface ContractRepository {
  create(input: ContractMutation & ContractCreate): Promise<MutationResult>;
  get(token: string, tenantId: string, id: string): Promise<Contract | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ contracts: Contract[]; nextCursor: string | null }>;
  update(
    input: ContractMutation & ContractUpdate & { contractId: string },
  ): Promise<MutationResult>;
  assign(
    input: ContractMutation & ContractAssign & { contractId: string },
  ): Promise<MutationResult>;
  line(
    input: ContractMutation &
      (ContractLineCreate | ContractLineUpdate | ContractTransition) & {
        contractId: string;
        lineId?: string;
        operation: 'create' | 'update' | 'delete';
      },
  ): Promise<MutationResult>;
  transition(
    input: ContractMutation & ContractTransition & { contractId: string; transition: string },
  ): Promise<MutationResult>;
}
export type ContractFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_CONTRACT'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_CONTRACT'
  | 'INVALID_VALUE'
  | 'SOD_DENIED';
export class ContractRegistryFailure extends Error {
  constructor(
    readonly code: ContractFailureCode,
    message: string,
  ) {
    super(message);
  }
}

export class ContractRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly contracts: ContractRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: ContractMetadata,
  ) {
    let identity;
    try {
      identity = await this.identity.authenticate(header);
    } catch (error) {
      await this.securityAudit.recordDenied({
        action,
        correlationId: meta.correlationId,
        reasonCode:
          error instanceof IdentityAuthenticationError
            ? error.reasonCode
            : 'IDENTITY_PROVIDER_ERROR',
        requestId: meta.requestId,
        requestedTenantId: tenantId,
      });
      throw new ContractRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new ContractRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const decision = await this.authorization.authorize({
      action,
      resource: 'commercial:contract-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed)
      return this.deny(identity.subject, tenantId, action, meta, 'PERMISSION_DENIED');
    const context = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!context)
      return this.deny(identity.subject, tenantId, action, meta, 'CONTEXT_ISSUANCE_DENIED');
    return context;
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: ContractMetadata,
    reasonCode: string,
  ): Promise<never> {
    await this.securityAudit.recordDenied({
      action,
      actorSubject: subject,
      correlationId: meta.correlationId,
      reasonCode,
      requestId: meta.requestId,
      requestedTenantId: tenantId,
    });
    throw new ContractRegistryFailure(
      'FORBIDDEN',
      'The requested contract operation is unavailable.',
    );
  }
  private envelope(data: Contract, meta: ContractMetadata, replay?: boolean) {
    return {
      data,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        ...(replay === undefined ? {} : { idempotent_replay: replay }),
      },
    };
  }
  async create(
    h: string | undefined,
    t: string,
    key: string,
    value: ContractCreate,
    meta: ContractMetadata,
  ) {
    const context = await this.authorize(h, t, CONTRACT_CREATE, meta);
    if (value.owner_membership_id) await this.authorize(h, t, CONTRACT_ASSIGN, meta);
    const result = await this.contracts.create({
      ...value,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash(value),
      requestId: meta.requestId,
      tenantId: t,
      action: CONTRACT_CREATE,
    });
    return this.envelope(result.contract, meta, result.replay);
  }
  async get(h: string | undefined, t: string, id: string, meta: ContractMetadata) {
    const context = await this.authorize(h, t, CONTRACT_READ, meta);
    const contract = await this.contracts.get(context.contextToken, t, id);
    if (!contract) throw new ContractRegistryFailure('NOT_FOUND', 'Contract was not found.');
    return this.envelope(contract, meta);
  }
  async list(
    h: string | undefined,
    t: string,
    limit: number,
    cursor: string | undefined,
    meta: ContractMetadata,
  ) {
    const context = await this.authorize(h, t, CONTRACT_READ, meta);
    const result = await this.contracts.list(context.contextToken, t, limit, cursor);
    return {
      data: result.contracts,
      meta: {
        request_id: meta.requestId,
        correlation_id: meta.correlationId,
        next_cursor: result.nextCursor,
      },
    };
  }
  async update(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: ContractUpdate,
    meta: ContractMetadata,
  ) {
    return this.run(h, t, id, key, CONTRACT_UPDATE, value, meta, (input) =>
      this.contracts.update(input),
    );
  }
  async assign(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    value: ContractAssign,
    meta: ContractMetadata,
  ) {
    return this.run(h, t, id, key, CONTRACT_ASSIGN, value, meta, (input) =>
      this.contracts.assign(input),
    );
  }
  async line(
    h: string | undefined,
    t: string,
    id: string,
    lineId: string | undefined,
    key: string,
    operation: 'create' | 'update' | 'delete',
    value: ContractLineCreate | ContractLineUpdate | ContractTransition,
    meta: ContractMetadata,
  ) {
    return this.run(
      h,
      t,
      id,
      key,
      CONTRACT_UPDATE,
      { ...value, ...(lineId ? { lineId } : {}), operation },
      meta,
      (input) => this.contracts.line(input),
    );
  }
  async transition(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    transition: string,
    action: string,
    value: ContractTransition,
    meta: ContractMetadata,
  ) {
    return this.run(
      h,
      t,
      id,
      key,
      action,
      {
        ...value,
        transition,
        ...(transition === 'return-to-draft' ? { auditAction: 'contract.approval_returned' } : {}),
      },
      meta,
      (input) => this.contracts.transition(input),
    );
  }
  private async run<T extends object>(
    h: string | undefined,
    t: string,
    id: string,
    key: string,
    action: string,
    value: T,
    meta: ContractMetadata,
    fn: (input: ContractMutation & T & { contractId: string }) => Promise<MutationResult>,
  ) {
    const context = await this.authorize(h, t, action, meta);
    const result = await fn({
      ...value,
      actorUserId: context.userId,
      contextToken: context.contextToken,
      correlationId: meta.correlationId,
      idempotencyKey: key,
      requestHash: hash({ id, ...value }),
      requestId: meta.requestId,
      tenantId: t,
      contractId: id,
      action,
    });
    return this.envelope(result.contract, meta, result.replay);
  }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
