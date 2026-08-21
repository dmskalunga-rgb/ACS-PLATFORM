import pg from 'pg';
import type { Lead, LeadCreate, LeadUpdate } from '@acs/contracts';
import {
  LEAD_CREATE,
  LeadRegistryFailure,
  type LeadMutationInput,
  type LeadRepository,
} from './lead-registry.js';
const { Pool } = pg;
type Row = Omit<Lead, 'version' | 'created_at' | 'updated_at'> & {
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export class PostgresLeadRepository implements LeadRepository {
  private readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, leadId: string) {
    return this.transaction(token, LEAD_CREATE.replace('create', 'read'), async (client) => {
      const result = await client.query<Row>(
        'SELECT id,display_name,source,contact_name,contact_email,status,version,created_at,updated_at FROM commercial.leads WHERE tenant_id=$1 AND id=$2',
        [tenantId, leadId],
      );
      return result.rows[0] ? map(result.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.transaction(token, LEAD_CREATE.replace('create', 'read'), async (client) => {
      const result = await client.query<Row>(
        'SELECT id,display_name,source,contact_name,contact_email,status,version,created_at,updated_at FROM commercial.leads WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = result.rows.slice(0, limit);
      return {
        leads: rows.map(map),
        nextCursor: result.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: LeadMutationInput & LeadCreate) {
    return this.mutate(input, LEAD_CREATE, async (client) => {
      const result = await client.query<Row>(
        'INSERT INTO commercial.leads (tenant_id,display_name,source,contact_name,contact_email,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,display_name,source,contact_name,contact_email,status,version,created_at,updated_at',
        [
          input.tenantId,
          input.display_name,
          input.source ?? null,
          input.contact_name ?? null,
          input.contact_email ?? null,
          input.actorUserId,
        ],
      );
      return { lead: result.rows[0]!, changedFields: ['display_name', 'source'] };
    });
  }
  async update(input: LeadMutationInput & LeadUpdate & { leadId: string; action: string }) {
    return this.mutate(input, input.action, async (client) => {
      const current = await client.query<Row>(
        'SELECT id,display_name,source,contact_name,contact_email,status,version,created_at,updated_at FROM commercial.leads WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [input.tenantId, input.leadId],
      );
      const row = current.rows[0];
      if (!row) throw new LeadRegistryFailure('NOT_FOUND', 'Lead was not found.');
      if (Number(row.version) !== input.expected_version)
        throw new LeadRegistryFailure('STALE_VERSION', 'Lead version is stale.');
      const next = {
        displayName: input.display_name ?? row.display_name,
        source: input.source === undefined ? row.source : input.source,
        contactName: input.contact_name === undefined ? row.contact_name : input.contact_name,
        contactEmail: input.contact_email === undefined ? row.contact_email : input.contact_email,
        status: input.status ?? row.status,
      };
      const changedFields = [
        ['display_name', next.displayName, row.display_name],
        ['source', next.source, row.source],
        ['contact_name', next.contactName, row.contact_name],
        ['contact_email', next.contactEmail, row.contact_email],
        ['status', next.status, row.status],
      ]
        .filter(([, a, b]) => a !== b)
        .map(([field]) => field as string);
      if (!changedFields.length) return { lead: row, changedFields };
      const result = await client.query<Row>(
        'UPDATE commercial.leads SET display_name=$1,source=$2,contact_name=$3,contact_email=$4,status=$5,version=version+1,updated_by=$6,updated_at=clock_timestamp() WHERE tenant_id=$7 AND id=$8 RETURNING id,display_name,source,contact_name,contact_email,status,version,created_at,updated_at',
        [
          next.displayName,
          next.source,
          next.contactName,
          next.contactEmail,
          next.status,
          input.actorUserId,
          input.tenantId,
          input.leadId,
        ],
      );
      return { lead: result.rows[0]!, changedFields };
    });
  }
  private async mutate(
    input: LeadMutationInput,
    action: string,
    change: (client: pg.PoolClient) => Promise<{ lead: Row; changedFields: string[] }>,
  ) {
    return this.transaction(input.contextToken, action, async (client) => {
      const prior = await client.query<{ request_hash: string; result: { lead: Row } }>(
        'SELECT request_hash,result FROM commercial.lead_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new LeadRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { lead: map(prior.rows[0].result.lead), replay: true };
      }
      const result = await change(client);
      const lead = map(result.lead);
      const safeFields = result.changedFields.filter(
        (field) => field !== 'contact_name' && field !== 'contact_email',
      );
      await client.query(
        "INSERT INTO platform.audit_logs (id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          action,
          `commercial:lead:${lead.id}`,
          input.correlationId,
          input.requestId,
          safeFields,
          lead.version,
        ],
      );
      if (result.changedFields.length) {
        const eventType =
          action === LEAD_CREATE
            ? 'commercial.lead.created'
            : result.changedFields.includes('status')
              ? 'commercial.lead.status_changed'
              : 'commercial.lead.updated';
        await client.query(
          "INSERT INTO platform.domain_events (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','CONFIDENTIAL',jsonb_build_object('lead_id',$5::uuid,'version',$6::bigint,'changed_fields',$7::text[],'status',$8::text))",
          [
            eventType,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            lead.id,
            lead.version,
            safeFields,
            lead.status,
          ],
        );
      }
      await client.query(
        'INSERT INTO commercial.lead_operations (tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          action,
          lead.id,
          input.requestHash,
          { lead: result.lead },
        ],
      );
      return { lead, replay: false };
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
        throw new LeadRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
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
function map(row: Row): Lead {
  return {
    ...row,
    version: Number(row.version),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}
