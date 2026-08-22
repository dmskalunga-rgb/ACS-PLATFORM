import { createHash } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  Proposal,
  ProposalAssign,
  ProposalCreate,
  ProposalEnvelope,
  ProposalLineCreate,
  ProposalLineUpdate,
  ProposalListEnvelope,
  ProposalTransition,
  ProposalUpdate,
} from '@acs/contracts';
import {
  IdentityAuthenticationError,
  type IdentityAdapter,
  type SecurityAuditPort,
  type TenantContextRepository,
} from './platform-context.js';

export const PROPOSAL_READ = 'commercial.proposal.read',
  PROPOSAL_CREATE = 'commercial.proposal.create',
  PROPOSAL_UPDATE = 'commercial.proposal.update',
  PROPOSAL_ASSIGN = 'commercial.proposal.assign',
  PROPOSAL_APPROVE = 'commercial.proposal.approve',
  PROPOSAL_REVISE = 'commercial.proposal.revise',
  PROPOSAL_SEND = 'commercial.proposal.send',
  PROPOSAL_ACCEPT = 'commercial.proposal.accept',
  PROPOSAL_REJECT = 'commercial.proposal.reject',
  PROPOSAL_CANCEL = 'commercial.proposal.cancel',
  PROPOSAL_EXPIRE = 'commercial.proposal.expire';
export interface ProposalMetadata {
  readonly correlationId: string;
  readonly requestId: string;
}
export interface ProposalMutation {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly action: string;
  readonly auditAction?: string;
}
export interface ProposalRepository {
  create(
    input: ProposalMutation & ProposalCreate,
  ): Promise<{ proposal: Proposal; replay: boolean }>;
  get(token: string, tenantId: string, id: string): Promise<Proposal | null>;
  list(
    token: string,
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ proposals: Proposal[]; nextCursor: string | null }>;
  update(
    input: ProposalMutation & ProposalUpdate & { proposalId: string },
  ): Promise<{ proposal: Proposal; replay: boolean }>;
  assign(
    input: ProposalMutation & ProposalAssign & { proposalId: string },
  ): Promise<{ proposal: Proposal; replay: boolean }>;
  line(
    input: ProposalMutation &
      (ProposalLineCreate | ProposalLineUpdate | ProposalTransition) & {
        proposalId: string;
        lineId?: string;
        operation: 'create' | 'update' | 'delete';
      },
  ): Promise<{ proposal: Proposal; replay: boolean }>;
  transition(
    input: ProposalMutation & ProposalTransition & { proposalId: string; transition: string },
  ): Promise<{ proposal: Proposal; replay: boolean }>;
}
type ProposalMutationResult = { proposal: Proposal; replay: boolean };
export type ProposalFailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'DUPLICATE_PROPOSAL_CODE'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_REFERENCE'
  | 'INVALID_TRANSITION'
  | 'TERMINAL_PROPOSAL'
  | 'INVALID_VALUE'
  | 'SOD_DENIED';
export class ProposalRegistryFailure extends Error {
  constructor(
    readonly code: ProposalFailureCode,
    message: string,
  ) {
    super(message);
  }
}
export class ProposalRegistryService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly proposals: ProposalRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}
  private async authorize(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: ProposalMetadata,
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
      throw new ProposalRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    }
    if (!identity)
      throw new ProposalRegistryFailure('UNAUTHENTICATED', 'Authentication is required.');
    const membership = await this.contexts.resolveMembership(identity.subject, tenantId);
    if (!membership)
      return this.deny(identity.subject, tenantId, action, meta, 'MEMBERSHIP_DENIED');
    const d = await this.authorization.authorize({
      action,
      resource: 'commercial:proposal-registry',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!d.allowed) return this.deny(identity.subject, tenantId, action, meta, 'PERMISSION_DENIED');
    const issued = await this.contexts.issueContext(identity.subject, tenantId, action);
    if (!issued)
      return this.deny(identity.subject, tenantId, action, meta, 'CONTEXT_ISSUANCE_DENIED');
    return issued;
  }
  private async deny(
    subject: string,
    tenantId: string,
    action: string,
    meta: ProposalMetadata,
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
    throw new ProposalRegistryFailure(
      'FORBIDDEN',
      'The requested proposal operation is unavailable.',
    );
  }
  private env(data: Proposal, meta: ProposalMetadata, replay?: boolean): ProposalEnvelope {
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
    k: string,
    v: ProposalCreate,
    m: ProposalMetadata,
  ) {
    const c = await this.authorize(h, t, PROPOSAL_CREATE, m);
    if (v.owner_membership_id !== undefined) await this.authorize(h, t, PROPOSAL_ASSIGN, m);
    const r = await this.proposals.create({
      ...v,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: m.correlationId,
      idempotencyKey: k,
      requestHash: hash(v),
      requestId: m.requestId,
      tenantId: t,
      action: PROPOSAL_CREATE,
    });
    return this.env(r.proposal, m, r.replay);
  }
  async get(h: string | undefined, t: string, id: string, m: ProposalMetadata) {
    const c = await this.authorize(h, t, PROPOSAL_READ, m);
    const v = await this.proposals.get(c.contextToken, t, id);
    if (!v) throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal was not found.');
    return this.env(v, m);
  }
  async list(
    h: string | undefined,
    t: string,
    limit: number,
    cursor: string | undefined,
    m: ProposalMetadata,
  ): Promise<ProposalListEnvelope> {
    const c = await this.authorize(h, t, PROPOSAL_READ, m);
    const v = await this.proposals.list(c.contextToken, t, limit, cursor);
    return {
      data: v.proposals,
      meta: { request_id: m.requestId, correlation_id: m.correlationId, next_cursor: v.nextCursor },
    };
  }
  async update(
    h: string | undefined,
    t: string,
    id: string,
    k: string,
    v: ProposalUpdate,
    m: ProposalMetadata,
  ) {
    return this.run(h, t, id, k, PROPOSAL_UPDATE, v, m, (input) => this.proposals.update(input));
  }
  async assign(
    h: string | undefined,
    t: string,
    id: string,
    k: string,
    v: ProposalAssign,
    m: ProposalMetadata,
  ) {
    return this.run(h, t, id, k, PROPOSAL_ASSIGN, v, m, (input) => this.proposals.assign(input));
  }
  async line(
    h: string | undefined,
    t: string,
    id: string,
    lineId: string | undefined,
    k: string,
    operation: 'create' | 'update' | 'delete',
    v: ProposalLineCreate | ProposalLineUpdate | ProposalTransition,
    m: ProposalMetadata,
  ) {
    const command = { ...v, ...(lineId === undefined ? {} : { lineId }), operation };
    return this.run(h, t, id, k, PROPOSAL_UPDATE, command, m, (input) =>
      this.proposals.line(input),
    );
  }
  async transition(
    h: string | undefined,
    t: string,
    id: string,
    k: string,
    transition: string,
    action: string,
    v: ProposalTransition,
    m: ProposalMetadata,
  ) {
    return this.run(
      h,
      t,
      id,
      k,
      action,
      {
        ...v,
        transition,
        ...(transition === 'return-to-draft' ? { auditAction: 'proposal.approval_returned' } : {}),
      },
      m,
      (input) => this.proposals.transition(input),
    );
  }
  private async run<TCommand extends object>(
    h: string | undefined,
    t: string,
    id: string,
    k: string,
    action: string,
    v: TCommand,
    m: ProposalMetadata,
    fn: (
      input: ProposalMutation & TCommand & { proposalId: string },
    ) => Promise<ProposalMutationResult>,
  ) {
    const c = await this.authorize(h, t, action, m);
    const r = await fn({
      ...v,
      actorUserId: c.userId,
      contextToken: c.contextToken,
      correlationId: m.correlationId,
      idempotencyKey: k,
      requestHash: hash({ id, ...v }),
      requestId: m.requestId,
      tenantId: t,
      proposalId: id,
      action,
    });
    return this.env(r.proposal, m, r.replay);
  }
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
