import pg from 'pg';
import type { CanonicalDatabaseTransaction } from '@acs/foundation';
import {
  MultiPersonAuthorizationFailure,
  type MultiPersonAuthorizationCommandReceipt,
  type MultiPersonAuthorizationRecord,
  type MultiPersonAuthorizationRepository,
} from './multi-person-authorization.js';

const { Pool } = pg;

type EnvelopeRow = {
  authorization_id: string;
  tenant_id: string;
  requester_user_id: string;
  operation: MultiPersonAuthorizationRecord['operation'];
  target_reference_hash: string;
  policy_id: MultiPersonAuthorizationRecord['policyId'];
  policy_version: '1.0.0';
  state: MultiPersonAuthorizationRecord['state'];
  version: string;
  approval_count: number;
  required_approval_count: number;
  expires_at: Date;
};

type CommandResult = { authorization: MultiPersonAuthorizationRecord };

export class PostgresMultiPersonAuthorizationRepository implements MultiPersonAuthorizationRepository {
  private readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }
  async close() {
    await this.pool.end();
  }

  async request(input: Parameters<MultiPersonAuthorizationRepository['request']>[0]) {
    return this.transaction(input.contextToken, 'platform.mpa.request', async (client) => {
      const replay = await this.replay(client, input);
      if (replay) return replay;
      const policy = await client.query<{ required_count: number; expiry_interval: string }>(
        `SELECT r.required_count,p.expiry_interval::text
           FROM platform.mpa_policies p
           JOIN platform.mpa_policy_authority_requirements r USING(policy_id,policy_version)
          WHERE p.policy_id=$1 AND p.policy_version=$2 AND p.operation=$3 AND p.status='ACTIVE'`,
        [input.binding.policyId, input.binding.policyVersion, input.binding.operation],
      );
      const configured = policy.rows[0];
      if (!configured)
        throw new MultiPersonAuthorizationFailure('FORBIDDEN', 'Policy binding is not available.');
      const created = await client.query<EnvelopeRow>(
        `INSERT INTO platform.mpa_authorization_envelopes
           (tenant_id,requester_user_id,requester_membership_id,operation,target_reference_hash,
            policy_id,policy_version,state,required_approval_count,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'REQUESTED',$8,clock_timestamp()+interval '15 minutes')
         RETURNING *`,
        [
          input.tenantId,
          input.actorUserId,
          input.actorMembershipId,
          input.binding.operation,
          input.binding.targetReferenceHash,
          input.binding.policyId,
          input.binding.policyVersion,
          configured.required_count,
        ],
      );
      const authorization = map(created.rows[0]!);
      await this.lifecycle(
        client,
        input,
        authorization,
        'platform.mpa.request',
        'authorization.approval.requested',
      );
      return { authorization, replay: false };
    });
  }

  async read(input: Parameters<MultiPersonAuthorizationRepository['read']>[0]) {
    return this.transaction(input.contextToken, 'platform.mpa.read', async (client) => {
      const current = await this.materializeExpiry(client, input, 'platform.mpa.read');
      return current ? map(current) : null;
    });
  }

  async approvalPreparation(
    input: Parameters<MultiPersonAuthorizationRepository['approvalPreparation']>[0],
  ) {
    return this.transaction(input.contextToken, 'platform.mpa.approve', async (client) => {
      const row = await this.materializeExpiry(client, input, 'platform.mpa.approve');
      if (!row) return { authorization: null, binding: null, existingApproverUserIds: [] };
      if (row.state === 'EXPIRED')
        return { authorization: map(row), binding: null, existingApproverUserIds: [] };
      const requirement = await client.query<{ authority_class_id: string }>(
        `SELECT authority_class_id
           FROM platform.mpa_policy_authority_requirements
          WHERE policy_id=$1 AND policy_version=$2`,
        [row.policy_id, row.policy_version],
      );
      const authorityClass = requirement.rows[0]?.authority_class_id;
      const eligible = await client.query(
        `SELECT 1 FROM platform.mpa_membership_authorities ma
         WHERE ma.tenant_id=$1 AND ma.membership_id=$2 AND ma.authority_class_id=$3`,
        [input.tenantId, input.actorMembershipId, authorityClass],
      );
      const existing = await client.query<{ actor_user_id: string }>(
        `SELECT actor_user_id FROM platform.mpa_authorization_decisions
          WHERE tenant_id=$1 AND authorization_id=$2 AND decision='APPROVE'`,
        [input.tenantId, input.authorizationId],
      );
      return {
        authorization: map(row),
        binding:
          eligible.rowCount === 1 && authorityClass !== undefined
            ? {
                actorUserId: input.actorUserId,
                tenantId: input.tenantId,
                authorityClass: authorityClass as never,
              }
            : null,
        existingApproverUserIds: existing.rows.map((value) => value.actor_user_id),
      };
    });
  }

  async decide(input: Parameters<MultiPersonAuthorizationRepository['decide']>[0]) {
    const action = input.decision === 'APPROVE' ? 'platform.mpa.approve' : 'platform.mpa.reject';
    return this.transaction(input.contextToken, action, async (client) => {
      const replay = await this.replay(client, input);
      if (replay) return replay;
      const lockedRow = await this.materializeExpiry(client, input, action);
      if (!lockedRow)
        throw new MultiPersonAuthorizationFailure('NOT_FOUND', 'Authorization is not available.');
      const locked = map(lockedRow);
      if (locked.state === 'EXPIRED') return { authorization: locked, replay: false };
      this.assertMutable(locked, input.expectedVersion);
      if (locked.requesterUserId === input.actorUserId && input.decision === 'APPROVE')
        throw new MultiPersonAuthorizationFailure(
          'SELF_APPROVAL_DENIED',
          'Self approval is prohibited.',
        );
      const membership = await client.query<{ authority_class_id: string }>(
        `SELECT r.authority_class_id
           FROM platform.mpa_policy_authority_requirements r
           LEFT JOIN platform.mpa_membership_authorities ma
             ON ma.tenant_id=$1 AND ma.membership_id=$2
            AND ma.authority_class_id=r.authority_class_id
          WHERE r.policy_id=$3 AND r.policy_version=$4
            AND ($5::text='REJECT' OR ma.membership_id IS NOT NULL)`,
        [
          input.tenantId,
          input.actorMembershipId,
          locked.policyId,
          locked.policyVersion,
          input.decision,
        ],
      );
      const actor = membership.rows[0];
      if (!actor)
        throw new MultiPersonAuthorizationFailure(
          'WRONG_AUTHORITY_CLASS',
          'Decision authority is not available.',
        );
      if (input.decision === 'APPROVE' && !input.attestationReferenceHash)
        throw new MultiPersonAuthorizationFailure('ATTESTATION_DENIED', 'Attestation is required.');
      try {
        await client.query(
          `INSERT INTO platform.mpa_authorization_decisions
            (tenant_id,authorization_id,actor_user_id,actor_membership_id,authority_class_id,decision,
             attestation_reference_hash,expected_version)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            input.tenantId,
            input.authorizationId,
            input.actorUserId,
            input.actorMembershipId,
            input.decision === 'APPROVE' ? actor.authority_class_id : null,
            input.decision,
            input.attestationReferenceHash ?? null,
            input.expectedVersion,
          ],
        );
      } catch (error) {
        if (isPgCode(error, '23505'))
          throw new MultiPersonAuthorizationFailure(
            'DUPLICATE_APPROVAL_DENIED',
            'Duplicate decision is prohibited.',
          );
        throw error;
      }
      const count =
        input.decision === 'APPROVE'
          ? Number(
              (
                await client.query<{ count: string }>(
                  "SELECT count(*) FROM platform.mpa_authorization_decisions WHERE tenant_id=$1 AND authorization_id=$2 AND decision='APPROVE'",
                  [input.tenantId, input.authorizationId],
                )
              ).rows[0]!.count,
            )
          : locked.approvalCount;
      const state =
        input.decision === 'REJECT'
          ? 'REJECTED'
          : count >= locked.requiredApprovalCount
            ? 'APPROVED'
            : 'PARTIALLY_APPROVED';
      const updated = await client.query<EnvelopeRow>(
        `UPDATE platform.mpa_authorization_envelopes
            SET state=$1,approval_count=$2,version=version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$3 AND authorization_id=$4 RETURNING *`,
        [state, count, input.tenantId, input.authorizationId],
      );
      const authorization = map(updated.rows[0]!);
      const event =
        state === 'REJECTED'
          ? 'authorization.approval.rejected'
          : state === 'APPROVED'
            ? 'authorization.approval.approved'
            : 'authorization.approval.partially_approved';
      await this.lifecycle(client, input, authorization, action, event);
      return { authorization, replay: false };
    });
  }

  async revoke(input: Parameters<MultiPersonAuthorizationRepository['revoke']>[0]) {
    return this.transaction(input.contextToken, 'platform.mpa.revoke', async (client) => {
      const replay = await this.replay(client, input);
      if (replay) return replay;
      const lockedRow = await this.materializeExpiry(client, input, 'platform.mpa.revoke');
      if (!lockedRow)
        throw new MultiPersonAuthorizationFailure('NOT_FOUND', 'Authorization is not available.');
      const locked = map(lockedRow);
      if (locked.state === 'EXPIRED') return { authorization: locked, replay: false };
      this.assertMutable(locked, input.expectedVersion);
      await client.query(
        `INSERT INTO platform.mpa_authorization_decisions
          (tenant_id,authorization_id,actor_user_id,actor_membership_id,decision,expected_version)
         VALUES($1,$2,$3,$4,'REVOKE',$5)`,
        [
          input.tenantId,
          input.authorizationId,
          input.actorUserId,
          input.actorMembershipId,
          input.expectedVersion,
        ],
      );
      const updated = await client.query<EnvelopeRow>(
        `UPDATE platform.mpa_authorization_envelopes SET state='REVOKED',version=version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND authorization_id=$2 RETURNING *`,
        [input.tenantId, input.authorizationId],
      );
      const authorization = map(updated.rows[0]!);
      await this.lifecycle(
        client,
        input,
        authorization,
        'platform.mpa.revoke',
        'authorization.approval.revoked',
      );
      return { authorization, replay: false };
    });
  }

  private async replay(
    client: pg.PoolClient,
    input: { tenantId: string; idempotencyKey: string; requestHash: string },
  ): Promise<MultiPersonAuthorizationCommandReceipt | null> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", [
      input.tenantId,
      input.idempotencyKey,
    ]);
    const prior = await client.query<{ request_hash: string; result: CommandResult }>(
      'SELECT request_hash,result FROM platform.mpa_command_results WHERE tenant_id=$1 AND idempotency_key=$2',
      [input.tenantId, input.idempotencyKey],
    );
    if (!prior.rows[0]) return null;
    if (prior.rows[0].request_hash !== input.requestHash)
      throw new MultiPersonAuthorizationFailure(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key was already used for another request.',
      );
    return { authorization: prior.rows[0].result.authorization, replay: true };
  }

  private async lifecycle(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      actorUserId: string;
      idempotencyKey: string;
      requestHash: string;
      requestId: string;
      correlationId: string;
    },
    authorization: MultiPersonAuthorizationRecord,
    action: string,
    eventType: string,
  ) {
    const result: CommandResult = { authorization };
    await client.query(
      `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
       VALUES(gen_random_uuid(),$1,$2,$3,$4,'ALLOWED',$5,$6,jsonb_build_object('state',$7::text,'version',$8::bigint))`,
      [
        input.tenantId,
        input.actorUserId,
        action,
        `platform:mpa:${authorization.authorizationId}`,
        input.correlationId,
        input.requestId,
        authorization.state,
        authorization.version,
      ],
    );
    await client.query(
      `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
       VALUES($1,'1.0.0',$2,$3,$4,'acs-platform-api','INTERNAL',
        jsonb_build_object('authorization_id',$5::uuid,'policy_id',$6::text,'policy_version',$7::text,
          'operation',$8::text,'target_reference_hash',$9::text,'state',$10::text,'version',$11::bigint,'request_id',$12::text))`,
      [
        eventType,
        input.tenantId,
        input.correlationId,
        input.idempotencyKey,
        authorization.authorizationId,
        authorization.policyId,
        authorization.policyVersion,
        authorization.operation,
        authorization.targetReferenceHash,
        authorization.state,
        authorization.version,
        input.requestId,
      ],
    );
    await client.query(
      `INSERT INTO platform.mpa_command_results(tenant_id,idempotency_key,actor_user_id,command,request_hash,result)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [input.tenantId, input.idempotencyKey, input.actorUserId, action, input.requestHash, result],
    );
  }

  private async materializeExpiry(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      authorizationId: string;
      actorUserId: string;
      requestId: string;
      correlationId: string;
    },
    permission: string,
  ) {
    const result = await client.query<EnvelopeRow>(
      `SELECT * FROM platform.materialize_mpa_expiry(
        $1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6::uuid
      )`,
      [
        input.tenantId,
        input.authorizationId,
        input.actorUserId,
        permission,
        input.requestId,
        input.correlationId,
      ],
    );
    return result.rows[0] ?? null;
  }

  private assertMutable(authorization: MultiPersonAuthorizationRecord, expectedVersion: number) {
    if (authorization.version !== expectedVersion)
      throw new MultiPersonAuthorizationFailure('STALE_VERSION', 'Authorization version is stale.');
    if (new Date(authorization.expiresAt).getTime() <= Date.now())
      throw new MultiPersonAuthorizationFailure('EXPIRED', 'Authorization has expired.');
    if (authorization.state !== 'REQUESTED' && authorization.state !== 'PARTIALLY_APPROVED')
      throw new MultiPersonAuthorizationFailure(
        'INVALID_TRANSITION',
        'Authorization transition is not available.',
      );
  }

  private async transaction<T>(
    contextToken: string,
    action: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const active = await client.query(
        'SELECT * FROM platform.activate_tenant_context($1::uuid,$2)',
        [contextToken, action],
      );
      if (active.rowCount !== 1)
        throw new MultiPersonAuthorizationFailure(
          'FORBIDDEN',
          'Trusted context activation failed.',
        );
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

export interface PostgresMpaTransaction extends CanonicalDatabaseTransaction {
  readonly client: pg.PoolClient;
  readonly kind: 'canonical-postgres-transaction';
}

export async function withMultiPersonAuthorizationConsumption<Result>(input: {
  readonly transaction: PostgresMpaTransaction;
  readonly contextToken: string;
  readonly tenantId: string;
  readonly authorizationId: string;
  readonly expectedVersion: number;
  readonly operation: string;
  readonly targetReferenceHash: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly actorUserId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly attestationReferenceHash: string;
  readonly verifyAttestation: () => Promise<boolean>;
  readonly protectedOperation: (transaction: PostgresMpaTransaction) => Promise<Result>;
}): Promise<
  { readonly status: 'CONSUMED'; readonly result: Result } | { readonly status: 'EXPIRED' }
> {
  const client = input.transaction.client;
  const active = await client.query('SELECT * FROM platform.activate_tenant_context($1::uuid,$2)', [
    input.contextToken,
    'platform.mpa.consume',
  ]);
  if (active.rowCount !== 1)
    throw new MultiPersonAuthorizationFailure('FORBIDDEN', 'Trusted context activation failed.');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", [
    input.tenantId,
    input.idempotencyKey,
  ]);
  const replay = await client.query<{ request_hash: string; result: { protected_result: Result } }>(
    'SELECT request_hash,result FROM platform.mpa_command_results WHERE tenant_id=$1 AND idempotency_key=$2',
    [input.tenantId, input.idempotencyKey],
  );
  if (replay.rows[0]) {
    if (replay.rows[0].request_hash !== input.requestHash)
      throw new MultiPersonAuthorizationFailure('IDEMPOTENCY_CONFLICT', 'Idempotency conflict.');
    return { status: 'CONSUMED', result: replay.rows[0].result.protected_result };
  }
  const locked = await client.query<EnvelopeRow>(
    `SELECT * FROM platform.materialize_mpa_expiry(
      $1::uuid,$2::uuid,$3::uuid,'platform.mpa.consume',$4::uuid,$5::uuid
    )`,
    [
      input.tenantId,
      input.authorizationId,
      input.actorUserId,
      input.requestId,
      input.correlationId,
    ],
  );
  const row = locked.rows[0];
  if (!row)
    throw new MultiPersonAuthorizationFailure('NOT_FOUND', 'Authorization is not available.');
  const authorization = map(row);
  if (authorization.state === 'EXPIRED') return { status: 'EXPIRED' };
  if (
    authorization.version !== input.expectedVersion ||
    authorization.state !== 'APPROVED' ||
    authorization.operation !== input.operation ||
    authorization.targetReferenceHash !== input.targetReferenceHash ||
    authorization.policyId !== input.policyId ||
    authorization.policyVersion !== input.policyVersion ||
    new Date(authorization.expiresAt).getTime() <= Date.now()
  ) {
    throw new MultiPersonAuthorizationFailure(
      'INVALID_TRANSITION',
      'Consumption binding is invalid.',
    );
  }
  if (!(await input.verifyAttestation()))
    throw new MultiPersonAuthorizationFailure('ATTESTATION_DENIED', 'Attestation was denied.');
  const consumption = await client.query<{ consumption_id: string }>(
    `INSERT INTO platform.mpa_consumptions
      (tenant_id,authorization_id,actor_user_id,operation,target_reference_hash,policy_id,policy_version,attestation_reference_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING consumption_id`,
    [
      input.tenantId,
      input.authorizationId,
      input.actorUserId,
      input.operation,
      input.targetReferenceHash,
      input.policyId,
      input.policyVersion,
      input.attestationReferenceHash,
    ],
  );
  const protectedResult = await input.protectedOperation(input.transaction);
  await client.query(
    "UPDATE platform.mpa_authorization_envelopes SET state='CONSUMED',version=version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND authorization_id=$2",
    [input.tenantId, input.authorizationId],
  );
  await client.query(
    `INSERT INTO platform.audit_logs(id,tenant_id,actor_user_id,action,resource,outcome,correlation_id,request_id,metadata)
     VALUES(gen_random_uuid(),$1,$2,'platform.mpa.consume',$3,'ALLOWED',$4,$5,jsonb_build_object('state','CONSUMED'))`,
    [
      input.tenantId,
      input.actorUserId,
      `platform:mpa:${input.authorizationId}`,
      input.correlationId,
      input.requestId,
    ],
  );
  await client.query(
    `INSERT INTO platform.domain_events(event_type,schema_version,tenant_id,correlation_id,causation_id,producer,classification,payload)
     VALUES('authorization.approval.consumed','1.0.0',$1,$2,$3,'acs-platform-api','INTERNAL',
       jsonb_build_object('authorization_id',$4::uuid,'consumption_id',$5::uuid,'operation',$6::text,
         'target_reference_hash',$7::text,'state','CONSUMED','version',$8::bigint,'request_id',$9::text))`,
    [
      input.tenantId,
      input.correlationId,
      input.idempotencyKey,
      input.authorizationId,
      consumption.rows[0]!.consumption_id,
      input.operation,
      input.targetReferenceHash,
      authorization.version + 1,
      input.requestId,
    ],
  );
  await client.query(
    `INSERT INTO platform.mpa_command_results(tenant_id,idempotency_key,actor_user_id,command,request_hash,result)
     VALUES($1,$2,$3,'platform.mpa.consume',$4,$5)`,
    [
      input.tenantId,
      input.idempotencyKey,
      input.actorUserId,
      input.requestHash,
      { protected_result: protectedResult },
    ],
  );
  return { status: 'CONSUMED', result: protectedResult };
}

function map(row: EnvelopeRow): MultiPersonAuthorizationRecord {
  return {
    authorizationId: row.authorization_id,
    tenantId: row.tenant_id,
    requesterUserId: row.requester_user_id,
    operation: row.operation,
    targetReferenceHash: row.target_reference_hash,
    policyId: row.policy_id,
    policyVersion: row.policy_version,
    state: row.state,
    version: Number(row.version),
    approvalCount: Number(row.approval_count),
    requiredApprovalCount: Number(row.required_approval_count),
    expiresAt: row.expires_at.toISOString(),
  };
}

function isPgCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
