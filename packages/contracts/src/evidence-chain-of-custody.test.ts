import { describe, expect, it } from 'vitest';
import {
  evidenceEventTypeSchema,
  evidenceClassificationSchema,
  evidenceCollectSchema,
  evidenceMpaOperationSchema,
} from './evidence-chain-of-custody.js';

describe('XCAP-005 contracts', () => {
  it('registers exactly the seven approved Event Foundation contracts', () => {
    expect(evidenceEventTypeSchema.options).toHaveLength(7);
    expect(new Set(evidenceEventTypeSchema.options).size).toBe(7);
  });
  it('registers the approved classification vocabulary only', () => {
    expect(evidenceClassificationSchema.options).toEqual([
      'PUBLIC',
      'INTERNAL',
      'CONFIDENTIAL',
      'RESTRICTED_SECURITY',
    ]);
    expect(evidenceClassificationSchema.safeParse('RESTRICTED').success).toBe(false);
  });

  it('requires bounded evidence identity and content inputs', () => {
    expect(
      evidenceCollectSchema.safeParse({
        evidence_source_id: '10000000-0000-4000-8000-000000000001',
        source_event_id: 'event-1',
        observed_at: '2026-09-08T12:00:00Z',
        media_type: 'application/octet-stream',
        raw_bytes_base64: 'YWNz',
        classification: 'INTERNAL',
        metadata: {},
        retention_policy_id: 'initial-policy',
      }).success,
    ).toBe(true);
  });

  it('requires MPA identity, versions, attestation and a reason', () => {
    expect(evidenceMpaOperationSchema.safeParse({ expected_version: 1 }).success).toBe(false);
  });
});
