export interface AiGatewayRequest {
  readonly capability: string;
  readonly classification: string;
  readonly context_references: readonly string[];
  readonly correlation_id: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly tenant_id: string;
  readonly user_id: string;
}

export interface AiGatewayResponse {
  readonly audit_reference: string;
  readonly confidence: number;
  readonly explanation: string;
  readonly model_reference: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly source_references: readonly string[];
}

export interface AiGatewayPort {
  execute(request: AiGatewayRequest): Promise<AiGatewayResponse>;
}

/** FOUNDATION boundary: domain packages must not connect directly to model providers. */
export const AI_GATEWAY_DIRECT_MODEL_ACCESS_ALLOWED = false as const;
