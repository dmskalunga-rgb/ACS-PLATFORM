export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policy_id?: string;
}

export interface AuthorizationRequest {
  readonly action: string;
  readonly resource: string;
  readonly subject_id: string;
  readonly tenant_id: string;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface AuthorizationPort {
  authorize(request: AuthorizationRequest): Promise<AuthorizationDecision>;
}

export interface AuditRecord {
  readonly action: string;
  readonly actor_id: string;
  readonly correlation_id: string;
  readonly outcome: 'ALLOWED' | 'DENIED' | 'FAILED';
  readonly resource: string;
  readonly tenant_id: string;
  readonly timestamp: string;
}

export interface AuditPort {
  write(record: AuditRecord): Promise<void>;
}

/**
 * A deliberately opaque transaction handle shared by MPA and a same-database
 * protected-operation consumer. Infrastructure adapters narrow it locally;
 * domain callers cannot forge tenant authority through this handle.
 */
export interface CanonicalDatabaseTransaction {
  readonly kind: 'canonical-postgres-transaction';
}

export type MultiPersonAuthorizationConsumptionOutcome<Result> =
  { readonly status: 'CONSUMED'; readonly result: Result } | { readonly status: 'EXPIRED' };

export interface MultiPersonAuthorizationConsumptionPort {
  withMultiPersonAuthorizationConsumption<Result>(input: {
    readonly transaction: CanonicalDatabaseTransaction;
    readonly contextToken: string;
    readonly tenantId: string;
    readonly authorizationId: string;
    readonly expectedVersion: number;
    readonly operation: string;
    readonly targetReferenceHash: string;
    readonly policyId: string;
    readonly policyVersion: string;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly actorUserId: string;
    readonly attestationReference: string;
    readonly verifyAttestation: () => Promise<boolean>;
    readonly protectedOperation: (transaction: CanonicalDatabaseTransaction) => Promise<Result>;
  }): Promise<MultiPersonAuthorizationConsumptionOutcome<Result>>;
}
