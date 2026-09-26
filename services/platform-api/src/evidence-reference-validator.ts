import type { EvidenceRequestMetadata } from './evidence-chain-of-custody.js';
import {
  MachineAuthenticationFailure,
  type MachineAuthenticationService,
} from './machine-service-auth.js';

export const EVIDENCE_REFERENCE_VALIDATE = 'cyberdefense.evidence.reference.validate';
export type EvidenceReferenceValidation = 'VALID' | 'INVALID';
export interface EvidenceReferenceRepository {
  validateReference(
    input: EvidenceRequestMetadata & {
      readonly contextToken: string;
      readonly tenantId: string;
      readonly evidenceId: string;
    },
  ): Promise<boolean>;
}

export class EvidenceReferenceValidationFailure extends Error {
  constructor(readonly code: 'UNAVAILABLE') {
    super('Evidence reference validation is unavailable.');
  }
}

/** Internal typed call only: no evidence record or content leaves XCAP-005. */
export class EvidenceReferenceValidator {
  constructor(
    private readonly machineAuthentication: MachineAuthenticationService,
    private readonly evidence: EvidenceReferenceRepository,
  ) {}

  async validate(
    input: EvidenceRequestMetadata & {
      readonly credentialId: string | undefined;
      readonly credential: string | undefined;
      readonly tenantId: string;
      readonly evidenceReference: string;
    },
  ): Promise<EvidenceReferenceValidation> {
    let identity;
    try {
      identity = await this.machineAuthentication.authenticate(
        input.credentialId,
        input.credential,
      );
    } catch (error) {
      if (error instanceof MachineAuthenticationFailure) throw error;
      throw new EvidenceReferenceValidationFailure('UNAVAILABLE');
    }
    let contextToken;
    try {
      contextToken = await this.machineAuthentication.issueTenantContext(
        identity,
        input.tenantId,
        EVIDENCE_REFERENCE_VALIDATE,
      );
    } catch (error) {
      if (error instanceof MachineAuthenticationFailure) throw error;
      throw new EvidenceReferenceValidationFailure('UNAVAILABLE');
    }
    // Malformed references follow the same repository/audit path as nonexistent UUIDs.
    const evidenceId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.evidenceReference,
    )
      ? input.evidenceReference
      : '00000000-0000-0000-0000-000000000000';
    try {
      return (await this.evidence.validateReference({
        contextToken,
        tenantId: input.tenantId,
        evidenceId,
        requestId: input.requestId,
        correlationId: input.correlationId,
      }))
        ? 'VALID'
        : 'INVALID';
    } catch {
      throw new EvidenceReferenceValidationFailure('UNAVAILABLE');
    }
  }
}
