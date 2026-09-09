import { describe, expect, it, vi } from 'vitest';
import {
  canonicalizeMetadata,
  evidenceMpaTargetReferenceHash,
  EvidenceChainOfCustodyFailure,
  EvidenceChainOfCustodyService,
  stableHash,
} from './evidence-chain-of-custody.js';

describe('Evidence Chain of Custody domain', () => {
  it('canonicalizes metadata recursively and omits absent values', () => {
    expect(canonicalizeMetadata({ z: 1, a: { y: null, b: 2, a: 1 } })).toBe(
      '{"a":{"a":1,"b":2},"z":1}',
    );
  });

  it('produces stable hashes independent of object insertion order', () => {
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
  });

  it('binds MPA to tenant, evidence, operation and expected version without authorization-id circularity', () => {
    expect(
      evidenceMpaTargetReferenceHash('tenant', 'evidence', 'cyberdefense.evidence.export', 2),
    ).not.toBe(
      evidenceMpaTargetReferenceHash('tenant', 'evidence', 'cyberdefense.evidence.export', 3),
    );
  });

  it('fails before persistence when declared content integrity differs', async () => {
    const repository = { collect: vi.fn() };
    const identity = {
      configured: true,
      authenticate: vi.fn().mockResolvedValue({ subject: 'issuer|subject' }),
    };
    const contexts = {
      resolveMembership: vi.fn().mockResolvedValue({ userId: 'u', tenantId: 't' }),
      issueContext: vi.fn().mockResolvedValue({ userId: 'u', tenantId: 't', contextToken: 'c' }),
    };
    const service = new EvidenceChainOfCustodyService(
      identity,
      { authorize: vi.fn().mockResolvedValue({ allowed: true, reason: 'test' }) },
      contexts as never,
      {
        listActiveMembershipsBySubject: vi
          .fn()
          .mockResolvedValue([{ userId: 'u', tenantId: 't', membershipId: 'm' }]),
      },
      repository as never,
      { verify: vi.fn() },
      { recordDenied: vi.fn() },
      1024,
    );
    await expect(
      service.collect(
        undefined,
        't',
        {
          evidence_source_id: '10000000-0000-4000-8000-000000000001',
          source_event_id: 'event',
          observed_at: '2026-09-08T00:00:00Z',
          media_type: 'text/plain',
          raw_bytes_base64: 'YWNz',
          declared_sha256: '0'.repeat(64),
          classification: 'INTERNAL',
          metadata: {},
          retention_policy_id: 'r1',
        },
        'key',
        { requestId: 'r', correlationId: 'c' },
      ),
    ).rejects.toBeInstanceOf(EvidenceChainOfCustodyFailure);
    expect(repository.collect).not.toHaveBeenCalled();
  });
});
