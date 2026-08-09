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
