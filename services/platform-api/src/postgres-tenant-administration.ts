import pg from 'pg';
import type { TenantAdministration } from '@acs/contracts';
import {
  TenantAdministrationFailure,
  type AdminMutationInput,
  type TenantAdminRepository,
} from './tenant-administration.js';
const { Pool } = pg;

type MutationResult = {
  membership_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  version: number;
  changed: boolean;
};
export class PostgresTenantAdminRepository implements TenantAdminRepository {
  private readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async list(token: string, tenantId: string): Promise<TenantAdministration['data']> {
    return this.transaction(token, 'platform.memberships.read', async (client) => {
      const memberships = await client.query<{
        id: string;
        user_id: string;
        status: 'ACTIVE' | 'INACTIVE';
        version: string;
        roles: unknown;
      }>(
        `SELECT m.id,m.user_id,m.status,m.version,
          COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'role_key',r.role_key,'display_name',r.display_name,'status',r.status))
            FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) roles
         FROM platform.memberships m LEFT JOIN platform.membership_roles mr ON mr.membership_id=m.id AND mr.tenant_id=m.tenant_id
         LEFT JOIN platform.roles r ON r.id=mr.role_id AND r.tenant_id=mr.tenant_id
         WHERE m.tenant_id=$1 GROUP BY m.id ORDER BY m.id`,
        [tenantId],
      );
      const roles = await client.query<{
        id: string;
        role_key: string;
        display_name: string;
        status: 'ACTIVE' | 'INACTIVE';
        permissions: unknown;
      }>(
        `SELECT r.id,r.role_key,r.display_name,r.status,
          COALESCE(jsonb_agg(rp.permission_key ORDER BY rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL),'[]'::jsonb) permissions
         FROM platform.roles r LEFT JOIN platform.role_permissions rp ON rp.role_id=r.id AND rp.tenant_id=r.tenant_id
         WHERE r.tenant_id=$1 GROUP BY r.id ORDER BY r.role_key`,
        [tenantId],
      );
      return {
        memberships: memberships.rows.map((r) => ({
          ...r,
          version: Number(r.version),
          roles: r.roles as never[],
        })),
        roles: roles.rows.map((r) => ({ ...r, permissions: r.permissions as string[] })),
      };
    });
  }
  async setMembershipStatus(input: AdminMutationInput & { status: 'ACTIVE' | 'INACTIVE' }) {
    return this.mutate(
      input,
      'platform.memberships.manage',
      async (client, current) => {
        const changed = current.status !== input.status;
        const updated = changed
          ? await client.query<{ status: 'ACTIVE' | 'INACTIVE'; version: string }>(
              `UPDATE platform.memberships SET status=$1,version=version+1,updated_at=clock_timestamp() WHERE id=$2 AND tenant_id=$3 RETURNING status,version`,
              [input.status, input.membershipId, input.tenantId],
            )
          : { rows: [current] };
        return {
          membership_id: input.membershipId,
          status: updated.rows[0]!.status,
          version: Number(updated.rows[0]!.version),
          changed,
        };
      },
      'platform.membership.status_changed',
    );
  }
  async setMembershipRole(input: AdminMutationInput & { roleId: string; assign: boolean }) {
    return this.mutate(
      input,
      'platform.roles.manage',
      async (client, current) => {
        if (current.status !== 'ACTIVE') {
          throw new TenantAdministrationFailure(
            'INVALID_TARGET',
            'Role lifecycle requires an active membership.',
          );
        }
        const role = await client.query(
          "SELECT 1 FROM platform.roles WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'",
          [input.roleId, input.tenantId],
        );
        if (role.rowCount !== 1)
          throw new TenantAdministrationFailure('INVALID_TARGET', 'The role is not available.');
        const changed = input.assign
          ? (
              await client.query(
                `INSERT INTO platform.membership_roles(tenant_id,membership_id,role_id,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
                [input.tenantId, input.membershipId, input.roleId, input.actorUserId],
              )
            ).rowCount === 1
          : (
              await client.query(
                'DELETE FROM platform.membership_roles WHERE tenant_id=$1 AND membership_id=$2 AND role_id=$3',
                [input.tenantId, input.membershipId, input.roleId],
              )
            ).rowCount === 1;
        const updated = changed
          ? await client.query<{ status: 'ACTIVE' | 'INACTIVE'; version: string }>(
              'UPDATE platform.memberships SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND tenant_id=$2 RETURNING status,version',
              [input.membershipId, input.tenantId],
            )
          : { rows: [current] };
        return {
          membership_id: input.membershipId,
          status: updated.rows[0]!.status,
          version: Number(updated.rows[0]!.version),
          changed,
        };
      },
      input.assign ? 'platform.membership.role_assigned' : 'platform.membership.role_removed',
    );
  }

  private async mutate(
    input: AdminMutationInput,
    action: string,
    change: (
      client: pg.PoolClient,
      current: { user_id: string; status: 'ACTIVE' | 'INACTIVE'; version: string },
    ) => Promise<MutationResult>,
    eventType: string,
  ) {
    return this.transaction(input.contextToken, action, async (client) => {
      const prior = await client.query<{ request_hash: string; result: MutationResult }>(
        'SELECT request_hash,result FROM platform.administrative_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new TenantAdministrationFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { ...prior.rows[0].result, replay: true };
      }
      const target = await client.query<{
        user_id: string;
        status: 'ACTIVE' | 'INACTIVE';
        version: string;
      }>(
        'SELECT user_id,status,version FROM platform.memberships WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
        [input.membershipId, input.tenantId],
      );
      const current = target.rows[0];
      if (!current)
        throw new TenantAdministrationFailure('INVALID_TARGET', 'The membership is not available.');
      if (current.user_id === input.actorUserId)
        throw new TenantAdministrationFailure(
          'SELF_ADMINISTRATION_DENIED',
          'Self administration is prohibited.',
        );
      if (Number(current.version) !== input.expectedVersion)
        throw new TenantAdministrationFailure('STALE_VERSION', 'The membership version is stale.');
      const result = await change(client, current);
      await client.query(
        `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed',$7::boolean))`,
        [
          input.tenantId,
          input.actorUserId,
          action,
          `platform:membership:${input.membershipId}`,
          input.correlationId,
          input.requestId,
          result.changed,
        ],
      );
      if (result.changed)
        await client.query(
          `INSERT INTO platform.domain_events(event_type,tenant_id,correlation_id,causation_id,payload)
       VALUES($1,$2,$3,$4,jsonb_build_object('membership_id',$5::uuid,'version',$6::bigint))`,
          [
            eventType,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            input.membershipId,
            result.version,
          ],
        );
      await client.query(
        'INSERT INTO platform.administrative_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          action,
          input.membershipId,
          input.requestHash,
          result,
        ],
      );
      return { ...result, replay: false };
    });
  }
  private async transaction<T>(
    token: string,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [token, action],
      );
      if (active.rowCount !== 1)
        throw new TenantAdministrationFailure('FORBIDDEN', 'Trusted context activation failed.');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
