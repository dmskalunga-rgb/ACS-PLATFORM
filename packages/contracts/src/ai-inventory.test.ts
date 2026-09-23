import { describe, expect, it } from 'vitest';
import {
  aiDatasetVersionCreateSchema,
  aiModelVersionCreateSchema,
  aiPromptVersionCreateSchema,
  aiSystemCreateSchema,
} from './ai-inventory.js';

const id = '10000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);

describe('AIGOV M0A AI Inventory contracts', () => {
  it('accepts bounded tenant-neutral AI system metadata', () => {
    const parsed = aiSystemCreateSchema.parse({
      system_key: 'fraud.assist',
      name: 'Fraud Assist',
      purpose: 'Bounded decision support.',
      owner_reference: 'owner:risk',
      classification: 'CONFIDENTIAL',
      evidence_reference: 'e3000000-0000-4000-8000-000000000011',
    });
    expect(parsed).not.toHaveProperty('tenant_id');
    expect(parsed.system_key).toBe('fraud.assist');
  });

  it('requires a typed XCAP-005 evidence identity rather than arbitrary text', () => {
    const valid = {
      system_key: 'fraud.assist',
      name: 'Fraud Assist',
      purpose: 'Bounded decision support.',
      owner_reference: 'owner:risk',
      classification: 'CONFIDENTIAL',
      evidence_reference: 'e3000000-0000-4000-8000-000000000011',
    };
    expect(aiSystemCreateSchema.safeParse(valid).success).toBe(true);
    expect(
      aiSystemCreateSchema.safeParse({ ...valid, evidence_reference: 'evidence:untyped' }).success,
    ).toBe(false);
    expect(
      aiSystemCreateSchema.safeParse({ ...valid, evidence_reference: undefined }).success,
    ).toBe(false);
    expect(
      aiSystemCreateSchema.safeParse({ ...valid, owner_reference: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('rejects caller-declared model trust or activation state', () => {
    expect(() =>
      aiModelVersionCreateSchema.parse({
        model_id: id,
        version_label: '1.0.0',
        artifact_sha256: hash,
        artifact_reference: 'artifact:model:1',
        source_reference: 'source:model:1',
        provider_reference: 'provider:approved:1',
        provenance_reference: 'e3000000-0000-4000-8000-000000000011',
        evidence_reference: 'e3000000-0000-4000-8000-000000000011',
        trust_state: 'TRUSTED',
      }),
    ).toThrow();
  });

  it('requires dataset policy and provenance references without raw dataset bytes', () => {
    const parsed = aiDatasetVersionCreateSchema.parse({
      dataset_id: id,
      version_label: '2026-09',
      content_sha256: hash,
      content_reference: 'artifact:dataset:1',
      provenance_reference: 'e3000000-0000-4000-8000-000000000011',
      permitted_uses: ['TRAINING_EVALUATION'],
      residency_policy_reference: 'policy:residency:ao',
      retention_policy_reference: 'policy:retention:standard',
      evidence_reference: 'e3000000-0000-4000-8000-000000000011',
    });
    expect(parsed).not.toHaveProperty('content');
  });

  it('prohibits raw prompt content and client promotion state', () => {
    expect(() =>
      aiPromptVersionCreateSchema.parse({
        prompt_id: id,
        version_label: '1.0.0',
        content_sha256: hash,
        content_reference: 'artifact:prompt:1',
        change_reason: 'Initial governed registration.',
        evidence_reference: 'e3000000-0000-4000-8000-000000000011',
        content: 'sensitive prompt',
      }),
    ).toThrow();
  });
});
