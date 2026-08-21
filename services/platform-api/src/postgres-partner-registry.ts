import pg from 'pg';
import type { Partner, PartnerCreate, PartnerUpdate } from '@acs/contracts';
import {
  PARTNER_CREATE,
  PartnerRegistryFailure,
  type PartnerMutation,
  type PartnerRepository,
} from './partner-registry.js';
const { Pool } = pg;
type PartnerRow = Omit<Partner, 'version' | 'created_at' | 'updated_at'> & {
  version: string;
  created_at: string | Date;
  updated_at: string | Date;
};
const COLUMNS = 'id,partner_code,display_name,status,version,created_at,updated_at';
export class PostgresPartnerRegistryRepository implements PartnerRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly testBeforeCommit?: () => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, partnerId: string) {
    return this.tx(token, 'commercial.partner.read', async (c) => {
      const r = await c.query<PartnerRow>(
        `SELECT ${COLUMNS} FROM commercial.partners WHERE tenant_id=$1 AND id=$2`,
        [tenantId, partnerId],
      );
      return r.rows[0] ? partner(r.rows[0]) : null;
    });
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.tx(token, 'commercial.partner.read', async (c) => {
      const r = await c.query<PartnerRow>(
        `SELECT ${COLUMNS} FROM commercial.partners WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        partners: rows.map(partner),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: PartnerMutation & PartnerCreate) {
    return this.mutate(input, PARTNER_CREATE, async (c) => {
      const r = await c.query<PartnerRow>(
        `INSERT INTO commercial.partners(tenant_id,partner_code,display_name,created_by,updated_by) VALUES($1,$2,$3,$4,$4) RETURNING ${COLUMNS}`,
        [input.tenantId, input.partner_code, input.display_name, input.actorUserId],
      );
      return {
        entity: r.rows[0]!,
        fields: ['partner_code', 'display_name'],
        event: 'commercial.partner.created',
      };
    }).then((r) => ({ partner: partner(r.entity), replay: r.replay }));
  }
  async update(input: PartnerMutation & PartnerUpdate & { partnerId: string; action: string }) {
    return this.mutate(input, input.action, async (c) => {
      const cur = await c.query<PartnerRow>(
        `SELECT ${COLUMNS} FROM commercial.partners WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
        [input.tenantId, input.partnerId],
      );
      const old = cur.rows[0];
      if (!old) throw new PartnerRegistryFailure('NOT_FOUND', 'Partner was not found.');
      if (Number(old.version) !== input.expected_version)
        throw new PartnerRegistryFailure('STALE_VERSION', 'Partner version is stale.');
      const next = {
        partner_code: input.partner_code ?? old.partner_code,
        display_name: input.display_name ?? old.display_name,
        status: input.status ?? old.status,
      };
      const fields = (Object.keys(next) as (keyof typeof next)[]).filter(
        (key) => next[key] !== old[key],
      );
      if (!fields.length) return { entity: old, fields, event: 'commercial.partner.updated' };
      const r = await c.query<PartnerRow>(
        `UPDATE commercial.partners SET partner_code=$1,display_name=$2,status=$3,version=version+1,updated_by=$4,updated_at=clock_timestamp() WHERE tenant_id=$5 AND id=$6 RETURNING ${COLUMNS}`,
        [
          next.partner_code,
          next.display_name,
          next.status,
          input.actorUserId,
          input.tenantId,
          input.partnerId,
        ],
      );
      return {
        entity: r.rows[0]!,
        fields,
        event: fields.includes('status')
          ? 'commercial.partner.status_changed'
          : 'commercial.partner.updated',
      };
    }).then((r) => ({ partner: partner(r.entity), replay: r.replay }));
  }
  private async mutate(
    input: PartnerMutation,
    action: string,
    change: (c: pg.PoolClient) => Promise<{ entity: PartnerRow; fields: string[]; event: string }>,
  ) {
    return this.tx(input.contextToken, action, async (c) => {
      const prior = await c.query<{ request_hash: string; result: { entity: PartnerRow } }>(
        'SELECT request_hash,result FROM commercial.partner_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new PartnerRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { entity: prior.rows[0].result.entity, replay: true };
      }
      const r = await change(c),
        v = r.entity;
      await c.query(
        "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          action,
          `commercial:partner:${v.id}`,
          input.correlationId,
          input.requestId,
          r.fields,
          Number(v.version),
        ],
      );
      await c.query(
        "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'status',$7::text))",
        [
          r.event,
          input.tenantId,
          input.correlationId,
          input.idempotencyKey,
          v.id,
          Number(v.version),
          v.status,
        ],
      );
      await c.query(
        'INSERT INTO commercial.partner_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          action,
          v.id,
          input.requestHash,
          { entity: v },
        ],
      );
      return { entity: v, replay: false };
    });
  }
  private async tx<T>(
    token: string,
    action: string,
    work: (c: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const active = await c.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        token,
        action,
      ]);
      if (active.rowCount !== 1)
        throw new PartnerRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const r = await work(c);
      this.testBeforeCommit?.();
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      if (typeof e === 'object' && e !== null && 'code' in e && e.code === '23505')
        throw new PartnerRegistryFailure(
          'DUPLICATE_PARTNER_CODE',
          'Partner code is already registered for this tenant.',
        );
      throw e;
    } finally {
      c.release();
    }
  }
}
const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);
const partner = (r: PartnerRow): Partner => ({
  ...r,
  version: Number(r.version),
  created_at: iso(r.created_at),
  updated_at: iso(r.updated_at),
});
