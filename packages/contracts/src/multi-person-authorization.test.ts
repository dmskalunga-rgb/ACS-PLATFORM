import { describe, expect, it } from 'vitest';
import {
  multiPersonAuthorizationEnvelopeSchema,
  multiPersonAuthorizationEventTypeSchema,
  multiPersonAuthorizationRequestSchema,
} from './multi-person-authorization.js';

describe('multi-person authorization contracts', () => {
  it('accepts only governed policy/operation pairs at the structural boundary', () => {
    expect(
      multiPersonAuthorizationRequestSchema.parse({
        operation: 'cyberdefense.evidence.destroy',
        target_reference: 'evidence:42',
        policy_id: 'cyberdefense.evidence.destroy',
        policy_version: '1.0.0',
      }),
    ).toBeDefined();
    expect(() =>
      multiPersonAuthorizationRequestSchema.parse({
        operation: 'platform.mpa.admin',
        target_reference: 'x',
        policy_id: 'unregistered',
        policy_version: 'latest',
      }),
    ).toThrow();
  });

  it('registers exactly seven bounded Event Foundation types', () => {
    expect(multiPersonAuthorizationEventTypeSchema.options).toHaveLength(7);
  });

  it('does not expose raw target data in an envelope', () => {
    const result = multiPersonAuthorizationEnvelopeSchema.parse({
      data: {
        authorization_id: '10000000-0000-4000-8000-000000000001',
        tenant_id: '20000000-0000-4000-8000-000000000002',
        operation: 'cyberdefense.evidence.export',
        target_reference_hash: 'a'.repeat(64),
        policy_id: 'cyberdefense.evidence.export.standard',
        policy_version: '1.0.0',
        state: 'REQUESTED',
        version: 1,
        approval_count: 0,
        required_approval_count: 1,
        expires_at: '2026-09-03T12:15:00.000Z',
      },
      meta: {
        request_id: '30000000-0000-4000-8000-000000000003',
        correlation_id: '40000000-0000-4000-8000-000000000004',
      },
    });
    expect(result.data).not.toHaveProperty('target_reference');
  });
});
