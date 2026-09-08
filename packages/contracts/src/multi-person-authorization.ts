import { z } from 'zod';

export const multiPersonAuthorizationStateSchema = z.enum([
  'REQUESTED',
  'PARTIALLY_APPROVED',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'CONSUMED',
  'EXPIRED',
]);

export const multiPersonAuthorizationPolicyIdSchema = z.enum([
  'cyberdefense.evidence.export.standard',
  'cyberdefense.evidence.export.restricted_security',
  'cyberdefense.evidence.retention_override',
  'cyberdefense.evidence.destroy',
]);

export const multiPersonAuthorizationAuthorityClassSchema = z.enum([
  'cyberdefense.evidence.export_authority',
  'cyberdefense.evidence.retention_override_authority',
  'cyberdefense.evidence.destroy_authority',
]);

export const multiPersonAuthorizationEventTypeSchema = z.enum([
  'authorization.approval.requested',
  'authorization.approval.partially_approved',
  'authorization.approval.approved',
  'authorization.approval.rejected',
  'authorization.approval.revoked',
  'authorization.approval.consumed',
  'authorization.approval.expired',
]);

export const protectedOperationSchema = z.enum([
  'cyberdefense.evidence.export',
  'cyberdefense.evidence.retention_override',
  'cyberdefense.evidence.destroy',
]);

export const multiPersonAuthorizationRequestSchema = z.object({
  operation: protectedOperationSchema,
  target_reference: z.string().trim().min(1).max(256),
  policy_id: multiPersonAuthorizationPolicyIdSchema,
  policy_version: z.literal('1.0.0'),
});

export const multiPersonAuthorizationDecisionSchema = z.object({
  expected_version: z.number().int().positive(),
  attestation_reference: z.string().trim().min(1).max(256),
});

export const multiPersonAuthorizationTerminalDecisionSchema = z.object({
  expected_version: z.number().int().positive(),
});

export const multiPersonAuthorizationEnvelopeDataSchema = z.object({
  authorization_id: z.uuid(),
  tenant_id: z.uuid(),
  operation: protectedOperationSchema,
  target_reference_hash: z.string().regex(/^[0-9a-f]{64}$/),
  policy_id: multiPersonAuthorizationPolicyIdSchema,
  policy_version: z.literal('1.0.0'),
  state: multiPersonAuthorizationStateSchema,
  version: z.number().int().positive(),
  approval_count: z.number().int().nonnegative(),
  required_approval_count: z.number().int().positive(),
  expires_at: z.iso.datetime({ offset: true }),
});

export const multiPersonAuthorizationEnvelopeSchema = z.object({
  data: multiPersonAuthorizationEnvelopeDataSchema,
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean().optional(),
  }),
});

export type MultiPersonAuthorizationState = z.infer<typeof multiPersonAuthorizationStateSchema>;
export type MultiPersonAuthorizationPolicyId = z.infer<
  typeof multiPersonAuthorizationPolicyIdSchema
>;
export type MultiPersonAuthorizationAuthorityClass = z.infer<
  typeof multiPersonAuthorizationAuthorityClassSchema
>;
export type ProtectedOperation = z.infer<typeof protectedOperationSchema>;
export type MultiPersonAuthorizationRequest = z.infer<typeof multiPersonAuthorizationRequestSchema>;
export type MultiPersonAuthorizationEnvelope = z.infer<
  typeof multiPersonAuthorizationEnvelopeSchema
>;
