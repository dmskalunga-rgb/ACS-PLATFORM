import pg from 'pg';
import {
  HUMAN_GENESIS_EXECUTE,
  type HumanGenesisRepository,
  type HumanGovernancePublicRoot,
  type HumanGovernancePublicRootPort,
} from './human-governance-genesis.js';

const { Pool } = pg;

type RootRow = {
  trust_root_id: string;
  purpose: string;
  algorithm: string;
  public_key: string;
  public_key_fingerprint: string;
  version: number;
  status: HumanGovernancePublicRoot['status'];
  not_before: Date;
  not_after: Date;
  revoked_at: Date | null;
};

export class PostgresHumanGenesisRepository
  implements HumanGovernancePublicRootPort, HumanGenesisRepository
{
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async resolve(trustRootId: string): Promise<HumanGovernancePublicRoot | null> {
    const result = await this.pool.query<RootRow>(
      'SELECT * FROM platform.resolve_human_governance_trust_root($1)',
      [trustRootId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      trustRootId: row.trust_root_id,
      purpose: row.purpose,
      algorithm: row.algorithm,
      publicKeyPem: row.public_key,
      publicKeyFingerprint: row.public_key_fingerprint,
      version: row.version,
      status: row.status,
      notBefore: row.not_before.toISOString(),
      notAfter: row.not_after.toISOString(),
      revokedAt: row.revoked_at?.toISOString() ?? null,
    };
  }

  async execute(input: Parameters<HumanGenesisRepository['execute']>[0]): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const activated = await client.query<{ user_id: string; tenant_id: string }>(
        'SELECT user_id,tenant_id FROM platform.activate_tenant_context($1::uuid,$2)',
        [input.contextToken, HUMAN_GENESIS_EXECUTE],
      );
      if (
        activated.rows[0]?.user_id !== input.executorUserId ||
        activated.rows[0]?.tenant_id !== input.manifest.tenant_id
      ) {
        await client.query('ROLLBACK');
        return false;
      }
      const { manifest } = input;
      const result = await client.query<{ completed: boolean }>(
        `SELECT platform.complete_human_genesis(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,
          $8::timestamptz,$9::timestamptz,$10::timestamptz,$11::jsonb,
          $12::uuid,$13::uuid
        ) AS completed`,
        [
          manifest.tenant_id,
          input.executorUserId,
          manifest.genesis_id,
          manifest.nonce,
          manifest.manifest_hash,
          input.signatureBase64,
          manifest.trust_root_id,
          manifest.issued_at,
          manifest.not_before,
          manifest.expires_at,
          JSON.stringify(manifest.candidates),
          input.requestId,
          input.correlationId,
        ],
      );
      if (result.rows[0]?.completed !== true) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
