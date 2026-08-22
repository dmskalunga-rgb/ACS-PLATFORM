import pg from 'pg';
import type {
  Proposal,
  ProposalAssign,
  ProposalCreate,
  ProposalLineCreate,
  ProposalLineUpdate,
  ProposalTransition,
  ProposalUpdate,
} from '@acs/contracts';
import {
  ProposalRegistryFailure,
  type ProposalMutation,
  type ProposalRepository,
} from './proposal-registry.js';
const { Pool } = pg;
type ProposalRow = Omit<
  Proposal,
  | 'version'
  | 'revision_number'
  | 'lines'
  | 'created_at'
  | 'updated_at'
  | 'issued_at'
  | 'approved_at'
  | 'proposal_subtotal'
  | 'grand_total'
> & {
  tenant_id: string;
  version: string;
  revision_number: string;
  created_at: Date | string;
  updated_at: Date | string;
  issued_at: Date | string | null;
  approved_at: Date | string | null;
  proposal_subtotal: string;
  grand_total: string;
};
type LineRow = Proposal['lines'][number] & { created_at: Date | string; updated_at: Date | string };
export type ProposalTestTransactionPhase =
  | 'after-aggregate-mutation'
  | 'after-audit'
  | 'after-outbox'
  | 'after-revision-snapshot'
  | 'before-commit';
const cols =
  'tenant_id,id,proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,status,issued_at,valid_until,revision_number,version,proposal_subtotal,grand_total,approved_by_membership_id,approved_at,created_at,updated_at';
export class PostgresProposalRegistryRepository implements ProposalRepository {
  private readonly pool: pg.Pool;
  constructor(
    url: string,
    private readonly testOnlyTransactionFailure?: (phase: ProposalTestTransactionPhase) => void,
  ) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }
  async close() {
    await this.pool.end();
  }
  async get(token: string, tenantId: string, id: string) {
    return this.tx(token, 'commercial.proposal.read', async (c) => this.find(c, tenantId, id));
  }
  async list(token: string, tenantId: string, limit: number, cursor?: string) {
    return this.tx(token, 'commercial.proposal.read', async (c) => {
      const r = await c.query<ProposalRow>(
        `SELECT ${cols} FROM commercial.proposals WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [tenantId, cursor ?? null, limit + 1],
      );
      const rows = r.rows.slice(0, limit);
      return {
        proposals: await Promise.all(rows.map((x) => this.withLines(c, x))),
        nextCursor: r.rows.length > limit ? rows.at(-1)!.id : null,
      };
    });
  }
  async create(input: ProposalMutation & ProposalCreate) {
    return this.mutate(input, async (c) => {
      const opportunity = await this.opportunity(c, input.tenantId, input.opportunity_id);
      const owner = input.owner_membership_id ?? opportunity.owner_membership_id;
      await this.refs(
        c,
        input.tenantId,
        owner,
        input.customer_id ?? null,
        input.partner_id ?? null,
        opportunity,
      );
      const r = await c.query<ProposalRow>(
        `INSERT INTO commercial.proposals(tenant_id,proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,valid_until,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$10) RETURNING ${cols}`,
        [
          input.tenantId,
          input.proposal_code,
          input.title,
          input.opportunity_id,
          input.customer_id ?? null,
          input.partner_id ?? null,
          owner,
          input.currency_code,
          input.valid_until,
          input.actorUserId,
        ],
      );
      return {
        row: r.rows[0]!,
        event: 'commercial.proposal.created',
        fields: ['proposal_code', 'title', 'opportunity_id', 'currency_code'],
      };
    });
  }
  async update(input: ProposalMutation & ProposalUpdate & { proposalId: string }) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.proposalId);
      this.editable(old);
      this.stale(old, input.expected_version);
      const opportunity = await this.opportunity(c, input.tenantId, old.opportunity_id);
      const next = {
        title: input.title ?? old.title,
        customer_id: input.customer_id === undefined ? old.customer_id : input.customer_id,
        partner_id: input.partner_id === undefined ? old.partner_id : input.partner_id,
        valid_until: input.valid_until ?? date(old.valid_until)!,
      };
      await this.refs(
        c,
        input.tenantId,
        old.owner_membership_id,
        next.customer_id,
        next.partner_id,
        opportunity,
      );
      const r = await c.query<ProposalRow>(
        `UPDATE commercial.proposals SET title=$1,customer_id=$2,partner_id=$3,valid_until=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() WHERE id=$6 AND tenant_id=$7 RETURNING ${cols}`,
        [
          next.title,
          next.customer_id,
          next.partner_id,
          next.valid_until,
          input.actorUserId,
          input.proposalId,
          input.tenantId,
        ],
      );
      return { row: r.rows[0]!, event: 'commercial.proposal.updated', fields: ['draft'] };
    });
  }
  async assign(input: ProposalMutation & ProposalAssign & { proposalId: string }) {
    return this.mutate(input, async (c) => {
      const old = await this.must(c, input.tenantId, input.proposalId);
      this.stale(old, input.expected_version);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(old.status))
        throw new ProposalRegistryFailure('INVALID_TRANSITION', 'Proposal owner is locked.');
      await this.member(c, input.tenantId, input.owner_membership_id);
      const r = await c.query<ProposalRow>(
        `UPDATE commercial.proposals SET owner_membership_id=$1,version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3 AND tenant_id=$4 RETURNING ${cols}`,
        [input.owner_membership_id, input.actorUserId, input.proposalId, input.tenantId],
      );
      return {
        row: r.rows[0]!,
        event: 'commercial.proposal.updated',
        fields: ['owner_membership_id'],
      };
    });
  }
  async line(
    input: ProposalMutation &
      (ProposalLineCreate | ProposalLineUpdate | ProposalTransition) & {
        proposalId: string;
        lineId?: string;
        operation: 'create' | 'update' | 'delete';
      },
  ) {
    return this.mutate(input, async (c) => {
      const p = await this.must(c, input.tenantId, input.proposalId);
      this.stale(p, input.expected_version);
      this.editable(p);
      if (input.operation === 'create') {
        const line = input as ProposalLineCreate;
        const plan = await c.query<{ plan_code: string; name: string; description: string | null }>(
          `SELECT plan_code,name,description FROM commercial.plans WHERE id=$1 AND tenant_id=$2`,
          [line.plan_id, input.tenantId],
        );
        if (!plan.rowCount)
          throw new ProposalRegistryFailure(
            'INVALID_REFERENCE',
            'Proposal reference is unavailable.',
          );
        const n = await c.query<{ n: number }>(
          'SELECT coalesce(max(line_number),0)+1 n FROM commercial.proposal_line_items WHERE proposal_id=$1',
          [input.proposalId],
        );
        await c.query(
          `INSERT INTO commercial.proposal_line_items(proposal_id,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,round($7::numeric*$8::numeric,4))`,
          [
            input.proposalId,
            input.tenantId,
            n.rows[0]!.n,
            line.plan_id,
            plan.rows[0]!.name,
            plan.rows[0]!.description ?? '',
            line.quantity,
            line.unit_price,
          ],
        );
      } else if (input.operation === 'update') {
        const line = input as ProposalLineUpdate;
        if (!input.lineId)
          throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal line was not found.');
        const r = await c.query<LineRow>(
          'SELECT * FROM commercial.proposal_line_items WHERE id=$1 AND proposal_id=$2 AND tenant_id=$3 FOR UPDATE',
          [input.lineId, input.proposalId, input.tenantId],
        );
        if (!r.rowCount)
          throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal line was not found.');
        await c.query(
          'UPDATE commercial.proposal_line_items SET quantity=$1,unit_price=$2,line_subtotal=round($1::numeric*$2::numeric,4),updated_at=clock_timestamp() WHERE id=$3',
          [
            line.quantity ?? r.rows[0]!.quantity,
            line.unit_price ?? r.rows[0]!.unit_price,
            input.lineId,
          ],
        );
      } else {
        if (!input.lineId)
          throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal line was not found.');
        const d = await c.query(
          'DELETE FROM commercial.proposal_line_items WHERE id=$1 AND proposal_id=$2 AND tenant_id=$3',
          [input.lineId, input.proposalId, input.tenantId],
        );
        if (!d.rowCount)
          throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal line was not found.');
      }
      const row = await this.retotal(c, input);
      return { row, event: 'commercial.proposal.updated', fields: ['line'] };
    });
  }
  async transition(
    input: ProposalMutation & ProposalTransition & { proposalId: string; transition: string },
  ) {
    return this.mutate(input, async (c) => {
      const p = await this.must(c, input.tenantId, input.proposalId);
      this.stale(p, input.expected_version);
      const command = input.transition;
      const transitions: Record<string, { from: string[]; to: string; event: string | null }> = {
        submit: {
          from: ['DRAFT'],
          to: 'PENDING_APPROVAL',
          event: 'commercial.proposal.approval_requested',
        },
        'return-to-draft': { from: ['PENDING_APPROVAL'], to: 'DRAFT', event: null },
        approve: {
          from: ['PENDING_APPROVAL'],
          to: 'APPROVED',
          event: 'commercial.proposal.approved',
        },
        revise: { from: ['APPROVED'], to: 'DRAFT', event: 'commercial.proposal.revision_created' },
        send: { from: ['APPROVED'], to: 'SENT', event: 'commercial.proposal.sent' },
        accept: { from: ['SENT'], to: 'ACCEPTED', event: 'commercial.proposal.accepted' },
        reject: { from: ['SENT'], to: 'REJECTED', event: 'commercial.proposal.rejected' },
        cancel: {
          from: ['APPROVED', 'SENT'],
          to: 'CANCELLED',
          event: 'commercial.proposal.cancelled',
        },
        expire: { from: ['SENT'], to: 'EXPIRED', event: 'commercial.proposal.expired' },
      };
      const transition = transitions[command];
      if (!transition?.from.includes(p.status))
        throw new ProposalRegistryFailure(
          ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(p.status)
            ? 'TERMINAL_PROPOSAL'
            : 'INVALID_TRANSITION',
          'Proposal lifecycle transition is not allowed.',
        );
      if (
        command === 'approve' &&
        p.created_by_membership_id ===
          (await this.actorMembership(c, input.tenantId, input.actorUserId))
      )
        throw new ProposalRegistryFailure(
          'SOD_DENIED',
          'Proposal creator cannot approve the proposal.',
        );
      if (command === 'accept' && new Date(date(p.valid_until)!).getTime() < Date.now())
        throw new ProposalRegistryFailure('INVALID_VALUE', 'Proposal has expired.');
      if (command === 'expire' && new Date(date(p.valid_until)!).getTime() >= Date.now())
        throw new ProposalRegistryFailure('INVALID_VALUE', 'Proposal cannot expire yet.');
      if (command === 'submit') {
        const lines = await c.query<{ plan_id: string }>(
          'SELECT plan_id FROM commercial.proposal_line_items WHERE proposal_id=$1 AND tenant_id=$2',
          [p.id, input.tenantId],
        );
        if (!lines.rowCount)
          throw new ProposalRegistryFailure(
            'INVALID_VALUE',
            'Proposal submission requires a line item.',
          );
        const opportunity = await this.opportunity(c, input.tenantId, p.opportunity_id);
        await this.refs(
          c,
          input.tenantId,
          p.owner_membership_id,
          p.customer_id,
          p.partner_id,
          opportunity,
        );
        if (new Date(date(p.valid_until)!).getTime() <= Date.now())
          throw new ProposalRegistryFailure(
            'INVALID_VALUE',
            'Proposal validity must be in the future.',
          );
        if (opportunity.plan_id && !lines.rows.some((line) => line.plan_id === opportunity.plan_id))
          throw new ProposalRegistryFailure(
            'INVALID_VALUE',
            'Proposal requires the opportunity plan.',
          );
      }
      if (command === 'send' && new Date(date(p.valid_until)!).getTime() <= Date.now())
        throw new ProposalRegistryFailure(
          'INVALID_VALUE',
          'Proposal validity must be in the future.',
        );
      if (command === 'revise') {
        await this.snapshot(c, p);
        this.testOnlyTransactionFailure?.('after-revision-snapshot');
      }
      const approver =
        command === 'approve'
          ? await this.actorMembership(c, input.tenantId, input.actorUserId)
          : null;
      const issued = command === 'send';
      const clearsApproval = command === 'return-to-draft' || command === 'revise';
      const r = await c.query<ProposalRow>(
        `UPDATE commercial.proposals SET status=$1,revision_number=revision_number+$2,approved_by_membership_id=CASE WHEN $5 THEN NULL WHEN $3::uuid IS NULL THEN approved_by_membership_id ELSE $3 END,approved_at=CASE WHEN $5 THEN NULL WHEN $3::uuid IS NULL THEN approved_at ELSE clock_timestamp() END,issued_at=CASE WHEN $4 THEN clock_timestamp() ELSE issued_at END,version=version+1,updated_by=$6,updated_at=clock_timestamp() WHERE id=$7 AND tenant_id=$8 RETURNING ${cols}`,
        [
          transition.to,
          command === 'revise' ? 1 : 0,
          approver,
          issued,
          clearsApproval,
          input.actorUserId,
          input.proposalId,
          input.tenantId,
        ],
      );
      return { row: r.rows[0]!, event: transition.event, fields: [command] };
    });
  }
  private async mutate(
    input: ProposalMutation,
    work: (
      c: pg.PoolClient,
    ) => Promise<{ row: ProposalRow; event: string | null; fields: string[] }>,
  ) {
    return this.tx(input.contextToken, input.action, async (c) => {
      // Serialize only requests that share this tenant-scoped idempotency key.
      // This makes a concurrent identical replay observe the committed operation
      // instead of racing the aggregate's own uniqueness constraints.
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        input.tenantId,
        input.idempotencyKey,
      ]);
      const prior = await c.query<{ request_hash: string; result: { row: ProposalRow } }>(
        'SELECT request_hash,result FROM commercial.proposal_operations WHERE tenant_id=$1 AND idempotency_key=$2',
        [input.tenantId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== input.requestHash)
          throw new ProposalRegistryFailure(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was already used for another request.',
          );
        return { proposal: await this.withLines(c, prior.rows[0].result.row), replay: true };
      }
      const r = await work(c);
      this.testOnlyTransactionFailure?.('after-aggregate-mutation');
      const proposal = await this.withLines(c, r.row);
      await c.query(
        "INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata) VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('changed_fields',$7::text[],'version',$8::bigint,'revision_number',$9::bigint))",
        [
          input.tenantId,
          input.actorUserId,
          input.auditAction ?? input.action,
          `commercial:proposal:${r.row.id}`,
          input.correlationId,
          input.requestId,
          r.fields,
          Number(r.row.version),
          Number(r.row.revision_number),
        ],
      );
      this.testOnlyTransactionFailure?.('after-audit');
      if (r.event !== null)
        await c.query(
          "INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload) VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',jsonb_build_object('id',$5::uuid,'version',$6::bigint,'status',$7::text,'revision_number',$8::bigint,'opportunity_id',$9::uuid))",
          [
            r.event,
            input.tenantId,
            input.correlationId,
            input.idempotencyKey,
            r.row.id,
            Number(r.row.version),
            r.row.status,
            Number(r.row.revision_number),
            r.row.opportunity_id,
          ],
        );
      this.testOnlyTransactionFailure?.('after-outbox');
      await c.query(
        'INSERT INTO commercial.proposal_operations(tenant_id,idempotency_key,actor_user_id,operation,resource_id,request_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.tenantId,
          input.idempotencyKey,
          input.actorUserId,
          input.action,
          r.row.id,
          input.requestHash,
          { row: r.row },
        ],
      );
      return { proposal, replay: false };
    });
  }
  private async must(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query<ProposalRow>(
      `SELECT ${cols} FROM commercial.proposals WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [t, id],
    );
    if (!r.rowCount) throw new ProposalRegistryFailure('NOT_FOUND', 'Proposal was not found.');
    return r.rows[0]!;
  }
  private async find(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query<ProposalRow>(
      `SELECT ${cols} FROM commercial.proposals WHERE tenant_id=$1 AND id=$2`,
      [t, id],
    );
    return r.rows[0] ? this.withLines(c, r.rows[0]) : null;
  }
  private async withLines(c: pg.PoolClient, r: ProposalRow): Promise<Proposal> {
    const lines = await c.query<LineRow>(
      'SELECT id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity::text,unit_price::text,line_subtotal::text,created_at,updated_at FROM commercial.proposal_line_items WHERE proposal_id=$1 ORDER BY line_number',
      [r.id],
    );
    return {
      ...r,
      version: Number(r.version),
      revision_number: Number(r.revision_number),
      proposal_subtotal: r.proposal_subtotal,
      grand_total: r.grand_total,
      issued_at: date(r.issued_at),
      approved_at: date(r.approved_at),
      valid_until: date(r.valid_until)!,
      created_at: date(r.created_at)!,
      updated_at: date(r.updated_at)!,
      lines: lines.rows.map((x) => ({
        ...x,
        created_at: date(x.created_at)!,
        updated_at: date(x.updated_at)!,
      })),
    };
  }
  private stale(p: ProposalRow, v: number) {
    if (Number(p.version) !== v)
      throw new ProposalRegistryFailure('STALE_VERSION', 'Proposal version is stale.');
  }
  private editable(p: ProposalRow) {
    if (p.status !== 'DRAFT')
      throw new ProposalRegistryFailure(
        ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(p.status)
          ? 'TERMINAL_PROPOSAL'
          : 'INVALID_TRANSITION',
        'Proposal commercial content is locked.',
      );
  }
  private async opportunity(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query<{
      owner_membership_id: string;
      customer_id: string | null;
      partner_id: string | null;
      plan_id: string | null;
    }>(
      'SELECT owner_membership_id,customer_id,partner_id,plan_id FROM commercial.opportunities WHERE tenant_id=$1 AND id=$2',
      [t, id],
    );
    if (!r.rowCount)
      throw new ProposalRegistryFailure('INVALID_REFERENCE', 'Proposal reference is unavailable.');
    return r.rows[0]!;
  }
  private async member(c: pg.PoolClient, t: string, id: string) {
    const r = await c.query(
      "SELECT 1 FROM platform.memberships WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'",
      [id, t],
    );
    if (!r.rowCount)
      throw new ProposalRegistryFailure('INVALID_REFERENCE', 'Proposal reference is unavailable.');
  }
  private async refs(
    c: pg.PoolClient,
    t: string,
    owner: string,
    customer: string | null,
    partner: string | null,
    o: { customer_id: string | null; partner_id: string | null },
  ) {
    await this.member(c, t, owner);
    if ((o.customer_id && customer !== o.customer_id) || (o.partner_id && partner !== o.partner_id))
      throw new ProposalRegistryFailure('INVALID_REFERENCE', 'Proposal reference is unavailable.');
    for (const [table, id] of [
      ['customers', customer],
      ['partners', partner],
    ] as const)
      if (id) {
        const r = await c.query(`SELECT 1 FROM commercial.${table} WHERE tenant_id=$1 AND id=$2`, [
          t,
          id,
        ]);
        if (!r.rowCount)
          throw new ProposalRegistryFailure(
            'INVALID_REFERENCE',
            'Proposal reference is unavailable.',
          );
      }
  }
  private async actorMembership(c: pg.PoolClient, t: string, user: string) {
    const r = await c.query<{ id: string }>(
      "SELECT id FROM platform.memberships WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE'",
      [t, user],
    );
    return r.rows[0]?.id ?? '';
  }
  private async retotal(c: pg.PoolClient, i: ProposalMutation & { proposalId: string }) {
    const r = await c.query<ProposalRow>(
      `UPDATE commercial.proposals SET proposal_subtotal=(SELECT coalesce(sum(line_subtotal),0) FROM commercial.proposal_line_items WHERE proposal_id=$1),grand_total=(SELECT coalesce(sum(line_subtotal),0) FROM commercial.proposal_line_items WHERE proposal_id=$1),version=version+1,updated_by=$2,updated_at=clock_timestamp() WHERE id=$1 AND tenant_id=$3 RETURNING ${cols}`,
      [i.proposalId, i.actorUserId, i.tenantId],
    );
    return r.rows[0]!;
  }
  private async snapshot(c: pg.PoolClient, p: ProposalRow) {
    const r = await c.query<{ id: string }>(
      `INSERT INTO commercial.proposal_revisions(proposal_id,tenant_id,revision_number,proposal_code,title,opportunity_id,customer_id,partner_id,owner_membership_id,created_by_membership_id,currency_code,status,valid_until,proposal_subtotal,grand_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        p.id,
        p.tenant_id,
        p.revision_number,
        p.proposal_code,
        p.title,
        p.opportunity_id,
        p.customer_id,
        p.partner_id,
        p.owner_membership_id,
        p.created_by_membership_id,
        p.currency_code,
        p.status,
        p.valid_until,
        p.proposal_subtotal,
        p.grand_total,
      ],
    );
    await c.query(
      `INSERT INTO commercial.proposal_revision_line_items(proposal_revision_id,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal) SELECT $1,tenant_id,line_number,plan_id,plan_name_snapshot,description_snapshot,quantity,unit_price,line_subtotal FROM commercial.proposal_line_items WHERE proposal_id=$2`,
      [r.rows[0]!.id, p.id],
    );
  }
  private async tx<T>(
    token: string,
    action: string,
    work: (c: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const a = await c.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
        token,
        action,
      ]);
      if (a.rowCount !== 1)
        throw new ProposalRegistryFailure('FORBIDDEN', 'Trusted context activation failed.');
      const r = await work(c);
      this.testOnlyTransactionFailure?.('before-commit');
      await c.query('COMMIT');
      return r;
    } catch (e) {
      await c.query('ROLLBACK');
      if (typeof e === 'object' && e !== null && 'code' in e) {
        if (e.code === '23505')
          throw new ProposalRegistryFailure(
            'DUPLICATE_PROPOSAL_CODE',
            'Proposal code is already registered for this tenant.',
          );
        if (['22003', '22P02', '23514'].includes(String(e.code)))
          throw new ProposalRegistryFailure(
            'INVALID_VALUE',
            'Proposal contains an invalid numeric or constrained value.',
          );
      }
      throw e;
    } finally {
      c.release();
    }
  }
}
const date = (v: Date | string | null | undefined) =>
  v == null ? null : v instanceof Date ? v.toISOString() : v;
