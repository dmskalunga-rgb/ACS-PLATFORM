import { createHash } from 'node:crypto';
import pg from 'pg';
import type {
  ActiveTenantMembership,
  ActiveMembershipRepository,
  ContextReadMetadata,
  IssuedTenantContext,
  ResolvedTenantMembership,
  SecurityAuditPort,
  SecurityDenialRecord,
  TenantContextRepository,
} from './platform-context.js';
import { PLATFORM_CONTEXT_RESOURCE } from './platform-context.js';

const { Pool } = pg;

interface ContextRow {
  context_token?: string;
  membership_id?: string;
  tenant_display_name: string;
  tenant_id: string;
  tenant_slug: string;
  user_id: string;
}

export class PostgresTenantContextRepository
  implements TenantContextRepository, ActiveMembershipRepository
{
  private readonly issuerPool: pg.Pool;
  private readonly tenantPool: pg.Pool;

  constructor(issuerDatabaseUrl: string, tenantDatabaseUrl: string) {
    this.issuerPool = new Pool({ connectionString: issuerDatabaseUrl, max: 5 });
    this.tenantPool = new Pool({ connectionString: tenantDatabaseUrl, max: 10 });
  }

  async listActiveMembershipsBySubject(
    subject: string,
  ): Promise<readonly ActiveTenantMembership[]> {
    const result = await this.issuerPool.query<ContextRow>(
      `SELECT membership_id, user_id, tenant_id, tenant_slug, tenant_display_name
       FROM platform.list_active_tenant_memberships($1)`,
      [subject],
    );
    return result.rows.map(mapActiveMembership);
  }

  async resolveMembership(
    subject: string,
    requestedTenantId: string,
  ): Promise<ResolvedTenantMembership | null> {
    const result = await this.issuerPool.query<ContextRow>(
      `SELECT user_id, tenant_id, tenant_slug, tenant_display_name
       FROM platform.resolve_active_tenant_membership($1, $2::uuid)`,
      [subject, requestedTenantId],
    );
    return mapContext(result.rows[0]);
  }

  async isActionAuthorized(userId: string, tenantId: string, action: string): Promise<boolean> {
    const result = await this.issuerPool.query<{ allowed: boolean }>(
      `SELECT platform.is_tenant_action_authorized($1::uuid, $2::uuid, $3) AS allowed`,
      [userId, tenantId, action],
    );
    return result.rows[0]?.allowed === true;
  }

  async issueContext(
    subject: string,
    requestedTenantId: string,
    action: string,
  ): Promise<IssuedTenantContext | null> {
    const result = await this.issuerPool.query<ContextRow>(
      `SELECT context_token, user_id, tenant_id, tenant_slug, tenant_display_name
       FROM platform.issue_tenant_context($1, $2::uuid, $3)`,
      [subject, requestedTenantId, action],
    );
    const row = result.rows[0];
    const context = mapContext(row);
    return context === null || row?.context_token === undefined
      ? null
      : { ...context, contextToken: row.context_token };
  }

  async readAndAudit(
    context: IssuedTenantContext,
    metadata: ContextReadMetadata,
  ): Promise<ResolvedTenantMembership> {
    const client = await this.tenantPool.connect();
    try {
      await client.query('BEGIN');
      const activated = await client.query<ContextRow>(
        `SELECT user_id, tenant_id, tenant_slug, tenant_display_name
         FROM platform.activate_tenant_context($1::uuid, 'platform.context.read')`,
        [context.contextToken],
      );
      const row = activated.rows[0];
      if (row === undefined) throw new Error('trusted tenant context activation failed');
      const verified = await client.query<ContextRow>(
        `SELECT t.id AS tenant_id, t.slug AS tenant_slug,
                t.display_name AS tenant_display_name, m.user_id
         FROM platform.tenants AS t
         JOIN platform.memberships AS m ON m.tenant_id = t.id
         WHERE t.id = $1::uuid AND m.user_id = $2::uuid AND m.status = 'ACTIVE'`,
        [row.tenant_id, row.user_id],
      );
      const verifiedRow = verified.rows[0];
      if (verifiedRow === undefined) throw new Error('trusted tenant context was not visible');
      await client.query(
        `INSERT INTO platform.audit_logs
           (id, tenant_id, actor_user_id, action, resource, outcome,
            correlation_id, request_id, metadata)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'platform.context.read', $3,
                 'ALLOWED', $4, $5, jsonb_build_object('source', 'platform-api'))`,
        [
          row.tenant_id,
          row.user_id,
          PLATFORM_CONTEXT_RESOURCE,
          metadata.correlationId,
          metadata.requestId,
        ],
      );
      await client.query('COMMIT');
      return mapRequiredContext(verifiedRow);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.issuerPool.end(), this.tenantPool.end()]);
  }
}

export class PostgresSecurityAuditRepository implements SecurityAuditPort {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async recordDenied(record: SecurityDenialRecord): Promise<void> {
    const requestedTenantId =
      record.requestedTenantId !== undefined && isUuid(record.requestedTenantId)
        ? record.requestedTenantId
        : null;
    await this.pool.query(
      `SELECT platform.record_security_denial(
        $1, $2::uuid, $3, $4, $5, $6, $7, $8
      )`,
      [
        fingerprint(record.actorSubject),
        requestedTenantId,
        fingerprint(record.selector),
        record.reasonCode,
        record.action,
        PLATFORM_CONTEXT_RESOURCE,
        record.correlationId,
        record.requestId,
      ],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function fingerprint(value: string | undefined): string | null {
  return value === undefined ? null : createHash('sha256').update(value).digest('hex');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapContext(row: ContextRow | undefined): ResolvedTenantMembership | null {
  return row === undefined ? null : mapRequiredContext(row);
}

function mapRequiredContext(row: ContextRow): ResolvedTenantMembership {
  return {
    tenantDisplayName: row.tenant_display_name,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    userId: row.user_id,
  };
}

function mapActiveMembership(row: ContextRow): ActiveTenantMembership {
  if (row.membership_id === undefined)
    throw new Error('active membership identifier was not returned');
  return { ...mapRequiredContext(row), membershipId: row.membership_id };
}
