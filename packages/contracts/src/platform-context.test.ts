import { describe, expect, it } from 'vitest';
import { activeMembershipBootstrapSchema } from './platform-context.js';

describe('activeMembershipBootstrapSchema', () => {
  it('accepts only server-authoritative ACTIVE membership selections', () => {
    const result = activeMembershipBootstrapSchema.safeParse({
      data: {
        memberships: [
          {
            membership_id: '30000000-0000-4000-8000-000000000001',
            status: 'ACTIVE',
            tenant: {
              id: '00000000-0000-4000-8000-000000000011',
              slug: 'tenant-a',
              display_name: 'Tenant A',
            },
          },
        ],
      },
      meta: {
        request_id: '10000000-0000-4000-8000-000000000001',
        correlation_id: '20000000-0000-4000-8000-000000000001',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects inactive membership and malformed tenant authority data', () => {
    expect(
      activeMembershipBootstrapSchema.safeParse({
        data: {
          memberships: [
            {
              membership_id: '30000000-0000-4000-8000-000000000001',
              status: 'INACTIVE',
              tenant: { id: 'not-a-uuid', slug: '', display_name: '' },
            },
          ],
        },
        meta: {
          request_id: '10000000-0000-4000-8000-000000000001',
          correlation_id: '20000000-0000-4000-8000-000000000001',
        },
      }).success,
    ).toBe(false);
  });
});
