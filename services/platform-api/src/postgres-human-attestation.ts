import { createHash } from 'node:crypto';
import pg from 'pg';
import type {
  PhysicalHumanAttestationResult,
  PhysicalHumanIndependenceAttestationPort,
} from './multi-person-authorization.js';

const { Pool } = pg;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresHumanAttestation implements PhysicalHumanIndependenceAttestationPort {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  async issue(
    input: Parameters<NonNullable<PhysicalHumanIndependenceAttestationPort['issue']>>[0],
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.activate(client, input.contextToken, input.actorUserId))) {
        await client.query('ROLLBACK');
        return null;
      }
      const issued = await client.query<{
        attestation: { reference: string; expires_at: string } | null;
      }>(
        `SELECT platform.issue_human_operation_attestation(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6::uuid,$7::uuid
        ) AS attestation`,
        [
          input.tenantId,
          input.actorUserId,
          input.authorizationId,
          input.approvalRequestKey,
          input.expectedVersion,
          input.requestId,
          input.correlationId,
        ],
      );
      const attestation = issued.rows[0]?.attestation;
      if (attestation === null || attestation === undefined) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query('COMMIT');
      return { reference: attestation.reference, expiresAt: attestation.expires_at };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verify(
    input: Parameters<PhysicalHumanIndependenceAttestationPort['verify']>[0],
  ): Promise<PhysicalHumanAttestationResult> {
    if (!UUID.test(input.reference)) return { verified: false, reason: 'MALFORMED' };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.activate(client, input.contextToken, input.approverUserId))) {
        await client.query('ROLLBACK');
        return { verified: false, reason: 'UNVERIFIED' };
      }
      const decision = await client.query<{ verified: boolean }>(
        `SELECT platform.verify_human_operation_attestation(
          $1::uuid,$2::uuid,$3,$4::uuid,$5::uuid
        ) AS verified`,
        [
          input.tenantId,
          input.approverUserId,
          hash(input.reference),
          input.authorizationId,
          input.approvalRequestKey,
        ],
      );
      await client.query('COMMIT');
      if (decision.rows[0]?.verified !== true) return { verified: false, reason: 'UNVERIFIED' };
      return { verified: true, referenceHash: hash(input.reference) };
    } catch {
      await client.query('ROLLBACK');
      return { verified: false, reason: 'UNAVAILABLE' };
    } finally {
      client.release();
    }
  }

  private async activate(client: pg.PoolClient, token: string, actorUserId: string) {
    const result = await client.query<{ user_id: string }>(
      `SELECT user_id FROM platform.activate_tenant_context($1::uuid,'platform.mpa.approve')`,
      [token],
    );
    return result.rowCount === 1 && result.rows[0]?.user_id === actorUserId;
  }
}

function hash(reference: string) {
  return createHash('sha256').update(reference).digest('hex');
}
