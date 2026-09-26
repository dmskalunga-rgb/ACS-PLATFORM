import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  EVIDENCE_REFERENCE_VALIDATE,
  EvidenceReferenceValidationFailure,
  EvidenceReferenceValidator,
} from './evidence-reference-validator.js';
import {
  MachineAuthenticationFailure,
  MachineAuthenticationService,
  type MachineAuthenticationRepository,
  type StoredMachineCredential,
} from './machine-service-auth.js';

const tenant = '00000000-0000-4000-8000-000000000011';
const principalId = randomUUID();
const credentialId = randomUUID();
const credential = 'A'.repeat(43);
const evidenceReference = randomUUID();
const metadata = () => ({ requestId: randomUUID(), correlationId: randomUUID() });

function setup(overrides: Partial<StoredMachineCredential> = {}) {
  const stored: StoredMachineCredential = {
    credentialId,
    principalId,
    principalType: 'SERVICE',
    tenantId: tenant,
    verifier: createHash('sha256').update(credential).digest('hex'),
    credentialStatus: 'ACTIVE',
    principalStatus: 'ACTIVE',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
  const repository = {
    resolveCredential: vi.fn().mockResolvedValue(stored),
    issueContext: vi.fn().mockResolvedValue(randomUUID()),
  };
  const authentication = new MachineAuthenticationService(
    {} as never,
    {} as never,
    {} as never,
    repository as unknown as MachineAuthenticationRepository,
  );
  const evidence = { validateReference: vi.fn().mockResolvedValue(true) };
  const validator = new EvidenceReferenceValidator(authentication, evidence);
  const input = { credentialId, credential, tenantId: tenant, evidenceReference, ...metadata() };
  return { validator, repository, evidence, input };
}

describe('bounded XCAP-005 evidence reference validation', () => {
  it('uses canonical machine authentication and its dedicated permission before a boolean read', async () => {
    const { validator, repository, evidence, input } = setup();
    expect(await validator.validate(input)).toBe('VALID');
    expect(repository.resolveCredential).toHaveBeenCalledWith(credentialId);
    expect(repository.issueContext).toHaveBeenCalledWith(
      expect.objectContaining({ principalId, tenantId: tenant }),
      EVIDENCE_REFERENCE_VALIDATE,
    );
    expect(evidence.validateReference).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenant, evidenceId: evidenceReference }),
    );
  });

  it('collapses nonexistent and malformed references to the same INVALID result', async () => {
    const { validator, evidence, input } = setup();
    evidence.validateReference.mockResolvedValue(false);
    expect(await validator.validate(input)).toBe('INVALID');
    expect(await validator.validate({ ...input, evidenceReference: 'malformed' })).toBe('INVALID');
    expect(evidence.validateReference).toHaveBeenLastCalledWith(
      expect.objectContaining({ evidenceId: '00000000-0000-0000-0000-000000000000' }),
    );
  });

  it.each([
    ['missing', { credential: undefined }],
    ['invalid', { credential: 'B'.repeat(43) }],
  ])('denies %s credentials before evidence access', async (_case, change) => {
    const { validator, evidence, input } = setup();
    await expect(validator.validate({ ...input, ...change })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(evidence.validateReference).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked', { credentialStatus: 'REVOKED' as const }],
    ['expired', { expiresAt: new Date(Date.now() - 60_000).toISOString() }],
    ['disabled', { principalStatus: 'DISABLED' as const }],
  ])('denies %s canonical machine state', async (_case, change) => {
    const { validator, evidence, input } = setup(change);
    await expect(validator.validate(input)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(evidence.validateReference).not.toHaveBeenCalled();
  });

  it('denies wrong tenant or missing permission without evidence access', async () => {
    const { validator, repository, evidence, input } = setup();
    await expect(
      validator.validate({ ...input, tenantId: '00000000-0000-4000-8000-000000000022' }),
    ).rejects.toBeInstanceOf(MachineAuthenticationFailure);
    repository.issueContext.mockResolvedValueOnce(null);
    await expect(validator.validate(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(evidence.validateReference).not.toHaveBeenCalled();
  });

  it('fails closed when authentication, context issuance or XCAP-005 repository is unavailable', async () => {
    const { validator, repository, evidence, input } = setup();
    repository.resolveCredential.mockRejectedValueOnce(new Error('repository unavailable'));
    await expect(validator.validate(input)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    repository.issueContext.mockRejectedValueOnce(new Error('issuer unavailable'));
    await expect(validator.validate(input)).rejects.toBeInstanceOf(
      EvidenceReferenceValidationFailure,
    );
    evidence.validateReference.mockRejectedValueOnce(new Error('repository unavailable'));
    await expect(validator.validate(input)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
});
