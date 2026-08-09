import pg from 'pg';
import type {
  ContextReadMetadata,
  ResolvedTenantContext,
  TenantContextRepository,
} from './platform-context.js';

const { Pool } = pg;

interface ContextRow {
  tenant_display_name: string;
  tenant_id: string;
  tenant_slug: string;
  user_id: string;
}

export class PostgresTenantContextRepository implements TenantContextRepository {
  private readonly resolverPool: pg.Pool;
  private readonly tenantPool: pg.Pool;

  constructor(resolverDatabaseUrl: string, tenantDatabaseUrl: string) {
    this.resolverPool = new Pool({ connectionString: resolverDatabaseUrl, max: 5 });
    this.tenantPool = new Pool({ connectionString: tenantDatabaseUrl, max: 10 });
  }

  async resolve(subject: string, requestedTenantId: string): Promise<ResolvedTenantContext | null> {
    const result = await this.resolverPool.query<ContextRow>(
      `SELECT user_id, tenant_id, tenant_slug, tenant_display_name
       FROM platform.resolve_tenant_context($1, $2::uuid)`,
      [subject, requestedTenantId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          tenantDisplayName: row.tenant_display_name,
          tenantId: row.tenant_id,
          tenantSlug: row.tenant_slug,
          userId: row.user_id,
        };
  }

  async readAndAudit(
    context: ResolvedTenantContext,
    metadata: ContextReadMetadata,
  ): Promise<ResolvedTenantContext> {
    const client = await this.tenantPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [context.userId]);
      const verified = await client.query<ContextRow>(
        `SELECT t.id AS tenant_id, t.slug AS tenant_slug,
                t.display_name AS tenant_display_name, m.user_id
         FROM platform.tenants AS t
         JOIN platform.memberships AS m ON m.tenant_id = t.id
         WHERE t.id = $1::uuid AND m.user_id = $2::uuid AND m.status = 'ACTIVE'`,
        [context.tenantId, context.userId],
      );
      const row = verified.rows[0];
      if (row === undefined) throw new Error('tenant context disappeared during authorization');
      await client.query(
        `INSERT INTO platform.audit_logs
           (id, tenant_id, actor_user_id, action, outcome, correlation_id, request_id, metadata)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'platform.context.read', 'ALLOWED', $3, $4,
                 jsonb_build_object('source', 'platform-api'))`,
        [context.tenantId, context.userId, metadata.correlationId, metadata.requestId],
      );
      await client.query('COMMIT');
      return {
        tenantDisplayName: row.tenant_display_name,
        tenantId: row.tenant_id,
        tenantSlug: row.tenant_slug,
        userId: row.user_id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.resolverPool.end(), this.tenantPool.end()]);
  }
}
