import pg from 'pg';
import type { Customer, CustomerCreate, CustomerUpdate } from '@acs/contracts';
import {
  CUSTOMER_CREATE,
  CustomerRegistryFailure,
  type CustomerMutationInput,
  type CustomerRepository,
} from './customer-registry.js';
const { Pool } = pg;

type Row = Omit<Customer, 'version' | 'created_at' | 'updated_at'> & {
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
};
type StoredResult = { customer: Row };

export class PostgresCustomerRepository implements CustomerRepository {
  private readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, customerId: string) {
    return this.transaction(token, 'commercial.customer.read', async (client) => {
      const result = await client.query<Row>(
        `SELECT id,display_name,reference_code,contact_email,status,version,created_at,updated_at
         FROM commercial.customers WHERE tenant_id=$1 AND id=$2`,
        [tenantId, customerId],
      );
      return result.rows[0] ? map(result.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.transaction(token, 'commercial.customer.read', async (client) => {
      const result = await client.query<Row>(
        `SELECT id,display_name,reference_code,contact_email,status,version,created_at,updated_at
         FROM commercial.customers WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2)
         ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const hasMore = result.rows.length > limit;
      const rows = result.rows.slice(0, limit);
      return { customers: rows.map(map), nextCursor: hasMore ? rows.at(-1)!.id : null };
    });
  }
  async create(input: CustomerMutationInput & CustomerCreate) {
    return this.mutate(input, CUSTOMER_CREATE, async (client) => {
      try {
        const result = await client.query<Row>(
          `INSERT INTO commercial.customers
           (tenant_id,display_name,reference_code,contact_email,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,$5)
           RETURNING id,display_name,reference_code,contact_email,status,version,created_at,updated_at`,
          [
            input.tenantId,
            input.display_name,
            input.reference_code ?? null,
            input.contact_email ?? null,
            input.actorUserId,
          ],
        );
        return { customer: result.rows[0]!, changedFields: ['display_name', 'reference_code'] };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505')
          throw new CustomerRegistryFailure(
            'REFERENCE_CONFLICT',
            'Reference code is already used.',
          );
        throw error;
      }
    });
  }
  async update(
    input: CustomerMutationInput & CustomerUpdate & { customerId: string; action: string },
  ) {
    return this.mutate(input, input.action, async (client) => {
      const current = await client.query<Row>(
        `SELECT id,display_name,reference_code,contact_email,status,version,created_at,updated_at
         FROM commercial.customers WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [input.tenantId, input.customerId],
      );
      const row = current.rows[0];
      if (!row) throw new CustomerRegistryFailure('NOT_FOUND', 'Customer was not found.');
      if (Number(row.version) !== input.expected_version)
        throw new CustomerRegistryFailure('STALE_VERSION', 'Customer version is stale.');
      const next = {
        displayName: input.display_name ?? row.display_name,
        referenceCode:
          input.reference_code === undefined ? row.reference_code : input.reference_code,
        contactEmail: input.contact_email === undefined ? row.contact_email : input.contact_email,
        status: input.status ?? row.status,
      };
      const changedFields = [
        next.displayName !== row.display_name ? 'display_name' : null,
        next.referenceCode !== row.reference_code ? 'reference_code' : null,
        next.contactEmail !== row.contact_email ? 'contact_email' : null,
        next.status !== row.status ? 'status' : null,
      ].filter((value): value is string => value !== null);
      if (changedFields.length === 0) return { customer: row, changedFields };
      try {
        const result = await client.query<Row>(
          `UPDATE commercial.customers SET display_name=$1,reference_code=$2,contact_email=$3,status=$4,
           version=version+1,updated_by=$5,updated_at=clock_timestamp()
           WHERE tenant_id=$6 AND id=$7
           RETURNING id,display_name,reference_code,contact_email,status,version,created_at,updated_at`,
          [
            next.displayName,
            next.referenceCode,
            next.contactEmail,
            next.status,
            input.actorUserId,
            input.tenantId,
            input.customerId,
          ],
        );
        return { customer: result.rows[0]!, changedFields };
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505')
          throw new CustomerRegistryFailure(
            'REFERENCE_CONFLICT',
            'Reference code is already used.',
          );
        throw error;
      }
    });
  }

  private async mutate(
    input: CustomerMutationInput,
    action: string,
    change: (client: pg.PoolClient) => Promise<{ customer: Row; changedFields: string[] }>,
  ) {
    return this.transaction(input.contextToken, action, async (client) => {
      const prior = await client.query<{ request_hash: string; result: StoredResult }>(
        'SELECT request_hash,result FROM commercial.customer_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new CustomerRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { customer: map(prior.rows[0].result.customer), replay: true };
      }
      const result = await change(client);
      const customer = map(result.customer);
      await client.query(
        `INSERT INTO platform.audit_logs
         (id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
         VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,
           jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint))`,
        [
          input.tenantId,
          input.actorUserId,
          action,
          `commercial:customer:${customer.id}`,
          input.correlationId,
          input.requestId,
          result.changedFields.filter((field) => field !== 'contact_email'),
          customer.version,
        ],
      );
      if (result.changedFields.length > 0) {
        const statusChanged = result.changedFields.includes('status');
        const eventType =
          action === CUSTOMER_CREATE
            ? 'commercial.customer.created'
            : statusChanged
              ? 'commercial.customer.status_changed'
              : 'commercial.customer.updated';
        await client.query(
          `INSERT INTO platform.domain_events
           (event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
           VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','CONFIDENTIAL',
             jsonb_build_object('customer_id',$5::uuid,'version',$6::bigint,'changed_fields',$7::text[],'status',$8::text))`,
          [
            eventType,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            customer.id,
            customer.version,
            result.changedFields.filter((field) => field !== 'contact_email'),
            customer.status,
          ],
        );
      }
      const stored = { customer: result.customer };
      await client.query(
        `INSERT INTO commercial.customer_operations
         (tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          action,
          customer.id,
          input.requestHash,
          stored,
        ],
      );
      return { customer, replay: false };
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
        throw new CustomerRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
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

function map(row: Row): Customer {
  return {
    ...row,
    version: Number(row.version),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}
