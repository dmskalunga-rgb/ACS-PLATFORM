import type { EvidenceReferenceValidator } from './evidence-reference-validator.js';
import type { ClassificationEvidencePort } from './principal-classification.js';

/** Server-held machine identity calls the stable XCAP-005 boundary; no evidence data crosses it. */
export class HumanEvidenceReferenceAdapter implements ClassificationEvidencePort {
  constructor(
    private readonly validator: EvidenceReferenceValidator,
    private readonly credentialId: string,
    private readonly credential: string,
  ) {}

  validate(input: Parameters<ClassificationEvidencePort['validate']>[0]) {
    return this.validator.validate({
      tenantId: input.tenantId,
      evidenceReference: input.evidenceReference,
      requestId: input.requestId,
      correlationId: input.correlationId,
      credentialId: this.credentialId,
      credential: this.credential,
    });
  }
}
