import pg from 'pg';
import type { AiInventoryAsset, AiInventoryVersion } from '@acs/contracts';
import {
  AI_INVENTORY_PERMISSIONS,
  AiInventoryFailure,
  type AiAssetCreateCommand,
  type AiInventoryReceipt,
  type AiInventoryRepository,
  type AiVersionCreateCommand,
} from './ai-inventory.js';

const { Pool } = pg;

type AssetRow = {
  asset_id: string;
  system_id: string | null;
  asset_key: string;
  name: string;
  classification: AiInventoryAsset['classification'];
  status: 'REGISTERED';
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

type VersionRow = {
  version_id: string;
  asset_id: string;
  version_label: string;
  content_sha256: string;
  status: 'REGISTERED';
  created_at: Date | string;
};

type CommandContext = {
  readonly tenantId: string;
  readonly userId: string;
  readonly contextToken: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly correlationId: string;
};

export type AiInventoryTransactionPhase =
  'after-domain-write' | 'after-audit' | 'after-outbox' | 'after-idempotency' | 'before-commit';

export class PostgresAiInventoryRepository implements AiInventoryRepository {
  private readonly pool: pg.Pool;

  constructor(
    databaseUrl: string,
    private readonly testOnlyFailure?: (phase: AiInventoryTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close() {
    await this.pool.end();
  }

  async createAsset(input: Parameters<AiInventoryRepository['createAsset']>[0]) {
    const action = createPermission(input.kind);
    return this.transaction(input, action, async (client) =>
      this.idempotent(client, input, action, async () => {
        const row = await this.insertAsset(client, input);
        const data = mapAsset(row, input.kind);
        await this.lifecycle(
          client,
          input,
          action,
          `aigov.${eventStem(input.kind)}.registered`,
          data,
        );
        return data;
      }),
    );
  }

  async updateAsset(input: Parameters<AiInventoryRepository['updateAsset']>[0]) {
    const action = updatePermission(input.kind);
    return this.transaction(input, action, async (client) =>
      this.idempotent(client, input, action, async () => {
        const specification = assetSpecification(input.kind);
        const result = await client.query<AssetRow>(
          `UPDATE ${specification.table}
              SET name=$1,evidence_reference=$2,version=version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$3 AND ${specification.idColumn}=$4 AND version=$5
            RETURNING ${specification.returning}`,
          [
            input.command.name,
            input.command.evidence_reference,
            input.tenantId,
            input.assetId,
            input.command.expected_version,
          ],
        );
        if (!result.rows[0]) {
          const exists = await client.query(
            `SELECT 1 FROM ${specification.table} WHERE tenant_id=$1 AND ${specification.idColumn}=$2`,
            [input.tenantId, input.assetId],
          );
          throw new AiInventoryFailure(exists.rowCount === 0 ? 'NOT_FOUND' : 'STALE_VERSION');
        }
        const data = mapAsset(result.rows[0], input.kind);
        await this.lifecycle(client, input, action, `aigov.${eventStem(input.kind)}.updated`, data);
        return data;
      }),
    );
  }

  async createVersion(input: Parameters<AiInventoryRepository['createVersion']>[0]) {
    const action = versionPermission(input.kind);
    return this.transaction(input, action, async (client) =>
      this.idempotent(client, input, action, async () => {
        let result: pg.QueryResult<VersionRow>;
        if (input.kind === 'MODEL_VERSION') {
          result = await client.query<VersionRow>(
            `INSERT INTO ai_governance.model_versions
              (tenant_id,model_version_id,model_id,version_label,artifact_sha256,
               artifact_reference,source_reference,provider_reference,provenance_reference,
               evidence_reference,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING model_version_id AS version_id,model_id AS asset_id,version_label,
                       artifact_sha256 AS content_sha256,status,created_at`,
            [
              input.tenantId,
              input.versionId,
              input.command.model_id,
              input.command.version_label,
              input.command.artifact_sha256,
              input.command.artifact_reference,
              input.command.source_reference,
              input.command.provider_reference,
              input.command.provenance_reference,
              input.command.evidence_reference,
              input.userId,
            ],
          );
        } else if (input.kind === 'DATASET_VERSION') {
          result = await client.query<VersionRow>(
            `INSERT INTO ai_governance.dataset_versions
              (tenant_id,dataset_version_id,dataset_id,version_label,content_sha256,
               content_reference,provenance_reference,permitted_uses,residency_policy_reference,
               retention_policy_reference,evidence_reference,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING dataset_version_id AS version_id,dataset_id AS asset_id,version_label,
                       content_sha256,status,created_at`,
            [
              input.tenantId,
              input.versionId,
              input.command.dataset_id,
              input.command.version_label,
              input.command.content_sha256,
              input.command.content_reference,
              input.command.provenance_reference,
              input.command.permitted_uses,
              input.command.residency_policy_reference,
              input.command.retention_policy_reference,
              input.command.evidence_reference,
              input.userId,
            ],
          );
        } else {
          result = await client.query<VersionRow>(
            `INSERT INTO ai_governance.prompt_versions
              (tenant_id,prompt_version_id,prompt_id,version_label,content_sha256,
               content_reference,change_reason,evidence_reference,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING prompt_version_id AS version_id,prompt_id AS asset_id,version_label,
                       content_sha256,status,created_at`,
            [
              input.tenantId,
              input.versionId,
              input.command.prompt_id,
              input.command.version_label,
              input.command.content_sha256,
              input.command.content_reference,
              input.command.change_reason,
              input.command.evidence_reference,
              input.userId,
            ],
          );
        }
        const data = mapVersion(result.rows[0]!, input.kind);
        await this.lifecycle(
          client,
          input,
          action,
          `aigov.${eventStem(input.kind)}.registered`,
          data,
        );
        return data;
      }),
    );
  }

  async readAsset(input: Parameters<AiInventoryRepository['readAsset']>[0]) {
    return this.transaction(input, AI_INVENTORY_PERMISSIONS.read, async (client) => {
      const specification = assetSpecification(input.kind);
      const result = await client.query<AssetRow>(
        `SELECT ${specification.returning} FROM ${specification.table}
          WHERE tenant_id=$1 AND ${specification.idColumn}=$2`,
        [input.tenantId, input.assetId],
      );
      return result.rows[0] ? mapAsset(result.rows[0], input.kind) : null;
    });
  }

  private async insertAsset(
    client: pg.PoolClient,
    input: Parameters<AiInventoryRepository['createAsset']>[0],
  ) {
    if (input.kind === 'AI_SYSTEM') {
      const result = await client.query<AssetRow>(
        `INSERT INTO ai_governance.ai_systems
          (tenant_id,system_id,system_key,name,purpose,owner_reference,classification,
           evidence_reference,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING system_id AS asset_id,NULL::uuid AS system_id,system_key AS asset_key,
                   name,classification,status,version,created_at,updated_at`,
        [
          input.tenantId,
          input.assetId,
          input.command.system_key,
          input.command.name,
          input.command.purpose,
          input.command.owner_reference,
          input.command.classification,
          input.command.evidence_reference,
          input.userId,
        ],
      );
      return result.rows[0]!;
    }
    if (input.kind === 'MODEL') {
      const result = await client.query<AssetRow>(
        `INSERT INTO ai_governance.models
          (tenant_id,model_id,system_id,model_key,name,provider_reference,classification,
           evidence_reference,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING model_id AS asset_id,system_id,model_key AS asset_key,name,classification,
                   status,version,created_at,updated_at`,
        [
          input.tenantId,
          input.assetId,
          input.command.system_id,
          input.command.model_key,
          input.command.name,
          input.command.provider_reference,
          input.command.classification,
          input.command.evidence_reference,
          input.userId,
        ],
      );
      return result.rows[0]!;
    }
    if (input.kind === 'DATASET') {
      const result = await client.query<AssetRow>(
        `INSERT INTO ai_governance.datasets
          (tenant_id,dataset_id,system_id,dataset_key,name,classification,evidence_reference,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING dataset_id AS asset_id,system_id,dataset_key AS asset_key,name,classification,
                   status,version,created_at,updated_at`,
        [
          input.tenantId,
          input.assetId,
          input.command.system_id,
          input.command.dataset_key,
          input.command.name,
          input.command.classification,
          input.command.evidence_reference,
          input.userId,
        ],
      );
      return result.rows[0]!;
    }
    const result = await client.query<AssetRow>(
      `INSERT INTO ai_governance.prompts
        (tenant_id,prompt_id,system_id,prompt_key,name,classification,evidence_reference,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING prompt_id AS asset_id,system_id,prompt_key AS asset_key,name,classification,
                 status,version,created_at,updated_at`,
      [
        input.tenantId,
        input.assetId,
        input.command.system_id,
        input.command.prompt_key,
        input.command.name,
        input.command.classification,
        input.command.evidence_reference,
        input.userId,
      ],
    );
    return result.rows[0]!;
  }

  private async lifecycle<T extends AiInventoryAsset | AiInventoryVersion>(
    client: pg.PoolClient,
    input: CommandContext,
    action: string,
    eventType: string,
    data: T,
  ) {
    this.testOnlyFailure?.('after-domain-write');
    const targetId = data.kind.endsWith('_VERSION')
      ? (data as AiInventoryVersion).version_id
      : (data as AiInventoryAsset).asset_id;
    await client.query(
      `INSERT INTO platform.audit_logs
        (id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,
              jsonb_build_object('target_id',$7::uuid,'kind',$8::text))`,
      [
        input.tenantId,
        input.userId,
        action,
        `aigov:${targetId}`,
        input.correlationId,
        input.requestId,
        targetId,
        data.kind,
      ],
    );
    this.testOnlyFailure?.('after-audit');
    await client.query(
      `INSERT INTO platform.domain_events
        (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
       VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',
              jsonb_build_object('target_id',$5::uuid,'kind',$6::text,'request_id',$7::uuid))`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        targetId,
        data.kind,
        input.requestId,
      ],
    );
    this.testOnlyFailure?.('after-outbox');
  }

  private async idempotent<T>(
    client: pg.PoolClient,
    input: CommandContext,
    command: string,
    operation: () => Promise<T>,
  ): Promise<AiInventoryReceipt<T>> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1||':'||$2,0))", [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const prior = await client.query<{ request_hash: string; result: { data: T } }>(
      `SELECT request_hash,result FROM ai_governance.command_results
        WHERE tenant_id=$1 AND idempotency_key=$2`,
      [input.tenantId, input.idempotencyKey],
    );
    if (prior.rows[0]) {
      if (prior.rows[0].request_hash !== input.requestHash)
        throw new AiInventoryFailure('IDEMPOTENCY_CONFLICT');
      return { data: prior.rows[0].result.data, replay: true };
    }
    const data = await operation();
    await client.query(
      `INSERT INTO ai_governance.command_results
        (tenant_id,idempotency_key,actor_user_id,command,request_hash,result)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [input.tenantId, input.idempotencyKey, input.userId, command, input.requestHash, { data }],
    );
    this.testOnlyFailure?.('after-idempotency');
    return { data, replay: false };
  }

  private async transaction<T>(
    actor: Pick<CommandContext, 'contextToken' | 'tenantId' | 'userId'>,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [actor.contextToken, action],
      );
      if (active.rowCount !== 1) throw new AiInventoryFailure('FORBIDDEN');
      const bound = await client.query<{ allowed: boolean }>(
        'SELECT platform.has_trusted_tenant_context($1::uuid,$2::uuid,$3) AS allowed',
        [actor.tenantId, actor.userId, action],
      );
      if (bound.rows[0]?.allowed !== true) throw new AiInventoryFailure('FORBIDDEN');
      const result = await work(client);
      this.testOnlyFailure?.('before-commit');
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === '23503' || error.code === '23514')
      )
        throw new AiInventoryFailure('INVALID_REFERENCE');
      if (error instanceof Error && 'code' in error && error.code === '23505')
        throw new AiInventoryFailure('ALREADY_EXISTS');
      if (error instanceof Error && 'code' in error && error.code === '42501')
        throw new AiInventoryFailure('FORBIDDEN');
      throw error;
    } finally {
      client.release();
    }
  }
}

function assetSpecification(kind: AiAssetCreateCommand['kind']) {
  return {
    AI_SYSTEM: {
      table: 'ai_governance.ai_systems',
      idColumn: 'system_id',
      returning:
        'system_id AS asset_id,NULL::uuid AS system_id,system_key AS asset_key,name,classification,status,version,created_at,updated_at',
    },
    MODEL: {
      table: 'ai_governance.models',
      idColumn: 'model_id',
      returning:
        'model_id AS asset_id,system_id,model_key AS asset_key,name,classification,status,version,created_at,updated_at',
    },
    DATASET: {
      table: 'ai_governance.datasets',
      idColumn: 'dataset_id',
      returning:
        'dataset_id AS asset_id,system_id,dataset_key AS asset_key,name,classification,status,version,created_at,updated_at',
    },
    PROMPT: {
      table: 'ai_governance.prompts',
      idColumn: 'prompt_id',
      returning:
        'prompt_id AS asset_id,system_id,prompt_key AS asset_key,name,classification,status,version,created_at,updated_at',
    },
  }[kind];
}

function createPermission(kind: AiAssetCreateCommand['kind']) {
  return {
    AI_SYSTEM: AI_INVENTORY_PERMISSIONS.systemCreate,
    MODEL: AI_INVENTORY_PERMISSIONS.modelCreate,
    DATASET: AI_INVENTORY_PERMISSIONS.datasetCreate,
    PROMPT: AI_INVENTORY_PERMISSIONS.promptCreate,
  }[kind];
}

function updatePermission(kind: AiAssetCreateCommand['kind']) {
  return {
    AI_SYSTEM: AI_INVENTORY_PERMISSIONS.systemUpdate,
    MODEL: AI_INVENTORY_PERMISSIONS.modelUpdate,
    DATASET: AI_INVENTORY_PERMISSIONS.datasetUpdate,
    PROMPT: AI_INVENTORY_PERMISSIONS.promptUpdate,
  }[kind];
}

function versionPermission(kind: AiVersionCreateCommand['kind']) {
  return {
    MODEL_VERSION: AI_INVENTORY_PERMISSIONS.modelVersionRegister,
    DATASET_VERSION: AI_INVENTORY_PERMISSIONS.datasetVersionRegister,
    PROMPT_VERSION: AI_INVENTORY_PERMISSIONS.promptVersionRegister,
  }[kind];
}

function eventStem(kind: AiAssetCreateCommand['kind'] | AiVersionCreateCommand['kind']) {
  return kind.toLowerCase();
}

function mapAsset(row: AssetRow, kind: AiAssetCreateCommand['kind']): AiInventoryAsset {
  return {
    asset_id: row.asset_id,
    kind,
    system_id: row.system_id,
    asset_key: row.asset_key,
    name: row.name,
    classification: row.classification,
    status: row.status,
    version: Number(row.version),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function mapVersion(row: VersionRow, kind: AiVersionCreateCommand['kind']): AiInventoryVersion {
  return {
    version_id: row.version_id,
    asset_id: row.asset_id,
    kind,
    version_label: row.version_label,
    content_sha256: row.content_sha256,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
  };
}
