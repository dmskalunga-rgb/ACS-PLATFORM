import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PostgresTenantContextRepository } from './postgres-platform-context.js';

function repositoryWithRow(row: object) {
  const query = vi.fn().mockResolvedValue({ rows: [row] });
  const repository = new PostgresTenantContextRepository(
    'postgresql://unused',
    'postgresql://unused',
  );
  Object.assign(repository, { issuerPool: { query } });
  return { query, repository };
}

describe('Postgres Platform Context canonical expiry projection', () => {
  it('maps the exact issued grant expiry into the canonical context', async () => {
    const validUntil = new Date(Date.now() + 30_000);
    const { query, repository } = repositoryWithRow({
      context_token: randomUUID(),
      user_id: randomUUID(),
      tenant_id: randomUUID(),
      tenant_slug: 'tenant-a',
      tenant_display_name: 'Tenant A',
      valid_until: validUntil,
    });

    const context = await repository.issueContext(
      'oidc|alice',
      randomUUID(),
      'platform.context.read',
    );

    expect(context?.validUntil).toBe(validUntil.toISOString());
    expect(query).toHaveBeenCalledWith(expect.stringContaining('valid_until'), expect.any(Array));
  });

  it('does not fabricate an expiry when the canonical projection omits it', async () => {
    const { repository } = repositoryWithRow({
      context_token: randomUUID(),
      user_id: randomUUID(),
      tenant_id: randomUUID(),
      tenant_slug: 'tenant-a',
      tenant_display_name: 'Tenant A',
    });

    const context = await repository.issueContext(
      'oidc|alice',
      randomUUID(),
      'platform.context.read',
    );

    expect(context?.validUntil).toBeUndefined();
  });
});
