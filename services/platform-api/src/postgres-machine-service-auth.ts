import pg from 'pg';
import {
  MachineAuthenticationFailure,
  type AuthenticatedMachineIdentity,
  type MachineAuthenticationRepository,
  type StoredMachineCredential,
} from './machine-service-auth.js';

const { Pool } = pg;

/** Database roles expose execute-only functions, never credential-table SELECT. */
export class PostgresMachineAuthenticationRepository implements MachineAuthenticationRepository {
  private readonly pool: pg.Pool;
  private readonly issuerPool: pg.Pool;

  constructor(authenticationUrl: string, issuerUrl: string) {
    this.pool = new Pool({ connectionString: authenticationUrl, max: 4 });
    this.issuerPool = new Pool({ connectionString: issuerUrl, max: 4 });
  }

  async close(): Promise<void> {
    await Promise.all([this.pool.end(), this.issuerPool.end()]);
  }

  async provision(
    input: Parameters<MachineAuthenticationRepository['provision']>[0],
  ): Promise<string> {
    const result = await this.pool.query<{ id: string | null }>(
      'SELECT platform.machine_auth_provision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id',
      [
        input.tenantId,
        input.principalType,
        input.externalBinding,
        input.credentialId,
        input.verifier,
        input.expiresAt,
        input.actorUserId,
        input.contextToken,
        input.requestId,
        input.correlationId,
      ],
    );
    if (!result.rows[0]?.id) throw new MachineAuthenticationFailure('FORBIDDEN');
    return result.rows[0].id;
  }

  async rotate(input: Parameters<MachineAuthenticationRepository['rotate']>[0]): Promise<void> {
    await this.requireTrue('platform.machine_auth_rotate', [
      input.tenantId,
      input.principalId,
      input.expectedCredentialId,
      input.credentialId,
      input.verifier,
      input.expiresAt,
      input.actorUserId,
      input.contextToken,
      input.requestId,
      input.correlationId,
    ]);
  }

  async revoke(input: Parameters<MachineAuthenticationRepository['revoke']>[0]): Promise<void> {
    await this.requireTrue('platform.machine_auth_revoke', [
      input.tenantId,
      input.principalId,
      input.credentialId,
      input.actorUserId,
      input.contextToken,
      input.requestId,
      input.correlationId,
    ]);
  }

  async disable(input: Parameters<MachineAuthenticationRepository['disable']>[0]): Promise<void> {
    await this.requireTrue('platform.machine_auth_disable', [
      input.tenantId,
      input.principalId,
      input.actorUserId,
      input.contextToken,
      input.requestId,
      input.correlationId,
    ]);
  }

  async setPermission(
    input: Parameters<MachineAuthenticationRepository['setPermission']>[0],
  ): Promise<void> {
    await this.requireTrue('platform.machine_auth_set_permission', [
      input.tenantId,
      input.principalId,
      input.permission,
      input.grant,
      input.actorUserId,
      input.contextToken,
      input.requestId,
      input.correlationId,
    ]);
  }

  private async requireTrue(name: string, args: readonly unknown[]): Promise<void> {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',');
    const result = await this.pool.query<{ ok: boolean }>(`SELECT ${name}(${placeholders}) AS ok`, [
      ...args,
    ]);
    if (!result.rows[0]?.ok) throw new MachineAuthenticationFailure('FORBIDDEN');
  }

  async resolveCredential(credentialId: string): Promise<StoredMachineCredential | null> {
    const result = await this.pool.query<{
      credential_id: string;
      principal_id: string;
      principal_type: StoredMachineCredential['principalType'];
      tenant_id: string;
      verifier: string;
      credential_status: StoredMachineCredential['credentialStatus'];
      principal_status: StoredMachineCredential['principalStatus'];
      expires_at: Date;
    }>('SELECT * FROM platform.machine_auth_resolve($1)', [credentialId]);
    const row = result.rows[0];
    return row
      ? {
          credentialId: row.credential_id,
          principalId: row.principal_id,
          principalType: row.principal_type,
          tenantId: row.tenant_id,
          verifier: row.verifier,
          credentialStatus: row.credential_status,
          principalStatus: row.principal_status,
          expiresAt: row.expires_at.toISOString(),
        }
      : null;
  }

  async issueContext(
    identity: AuthenticatedMachineIdentity,
    permission: string,
  ): Promise<string | null> {
    const result = await this.issuerPool.query<{ token: string | null }>(
      'SELECT platform.machine_auth_issue_context($1,$2,$3,$4) AS token',
      [identity.credentialId, identity.principalId, identity.tenantId, permission],
    );
    return result.rows[0]?.token ?? null;
  }
}
