import { describe, expect, it, vi } from 'vitest';
import {
  CognitiveCyberFusionM0Service,
  CognitiveFusionFailure,
  type FusionReceiptRepository,
} from './cognitive-cyber-fusion-m0.js';
import type { FusionFailureCode, FusionResult } from '@acs/contracts';

const uuid = (suffix: number) => `20000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;
const tenantId = uuid(1);
const command = {
  schema_version: '1.0.0',
  idempotency_key: uuid(2),
  reasoning_purpose: 'EVIDENCE_REFERENCE_VALIDATION',
  requested_reasoning_mode: 'REFERENCE_VALIDATION',
  policy_version: '1.0.0',
  evidence_references: [
    {
      reference_type: 'EVIDENCE',
      canonical_owner: 'ACS-XCAP-005',
      resource_id: uuid(3),
      tenant_id: tenantId,
      resource_version: '1',
      provenance_reference: uuid(4),
    },
  ],
  observable_references: [],
  entity_references: [],
  correlation_references: [],
  graph_references: [],
} as const;

class MemoryReceiptRepository implements FusionReceiptRepository {
  readonly records = new Map<
    string,
    | { requestHash: string; result: FusionResult }
    | { requestHash: string; failureCode: FusionFailureCode }
  >();

  async execute(input: Parameters<FusionReceiptRepository['execute']>[0]) {
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const existing = this.records.get(key);
    if (existing) {
      if (existing.requestHash !== input.requestHash)
        throw new CognitiveFusionFailure('IDEMPOTENCY_CONFLICT');
      if ('failureCode' in existing) throw new CognitiveFusionFailure(existing.failureCode);
      return { result: existing.result, replay: true };
    }
    try {
      const result = await input.produce(
        '2026-09-09T00:00:00.000Z',
        input.fusionRequestId,
        input.fusionResultId,
        input.requestId,
        input.correlationId,
      );
      this.records.set(key, { requestHash: input.requestHash, result });
      return { result, replay: false };
    } catch (error) {
      const failureCode =
        error instanceof CognitiveFusionFailure ? error.code : 'DEPENDENCY_UNAVAILABLE';
      this.records.set(key, { requestHash: input.requestHash, failureCode });
      throw new CognitiveFusionFailure(failureCode);
    }
  }
}

function fixture(
  overrides: {
    authenticated?: boolean;
    authorized?: boolean;
    active?: boolean;
    integrity?: 'VERIFIED' | 'FAILED';
    provenance?: 'VERIFIED' | 'INVALID';
    contextValidUntil?: string;
    omitContextValidUntil?: boolean;
  } = {},
  receiptOverride?: FusionReceiptRepository,
) {
  const contextValidUntil =
    overrides.contextValidUntil ?? new Date(Date.now() + 60_000).toISOString();
  const receiptExecute = vi.fn(
    async (input: Parameters<FusionReceiptRepository['execute']>[0]) => ({
      result: await input.produce(
        '2026-09-09T00:00:00.000Z',
        input.fusionRequestId,
        input.fusionResultId,
        input.requestId,
        input.correlationId,
      ),
      replay: false,
    }),
  );
  const receipt: FusionReceiptRepository = receiptOverride ?? { execute: receiptExecute };
  const evidenceResolve = vi.fn().mockResolvedValue({
    projection_schema_version: '1.0.0',
    evidence_id: uuid(3),
    tenant_id: tenantId,
    evidence_version: 1,
    integrity_state: overrides.integrity ?? 'VERIFIED',
    provenance_state: overrides.provenance ?? 'VERIFIED',
    source_trust_state: 'TRUSTED',
    derivation_state: 'ORIGINAL',
    derivation_id: null,
    classification: 'INTERNAL',
    opaque_blob_reference: uuid(8),
    canonical_owner: 'ACS-XCAP-005',
    canonicalization_identifier: 'xcap005-evidence-metadata-v1',
    resolved_at: '2026-09-09T00:00:00.000Z',
  });
  const service = new CognitiveCyberFusionM0Service(
    {
      configured: true,
      authenticate: vi
        .fn()
        .mockResolvedValue(
          overrides.authenticated === false ? null : { subject: 'issuer|subject' },
        ),
    },
    {
      authorize: vi
        .fn()
        .mockResolvedValue({ allowed: overrides.authorized !== false, reason: 'test' }),
    },
    {
      resolveMembership: vi
        .fn()
        .mockResolvedValue(overrides.active === false ? null : { userId: uuid(5), tenantId }),
      issueContext: vi.fn().mockResolvedValue({
        userId: uuid(5),
        tenantId,
        contextToken: uuid(6),
        ...(overrides.omitContextValidUntil ? {} : { validUntil: contextValidUntil }),
      }),
    } as never,
    {
      listActiveMembershipsBySubject: vi
        .fn()
        .mockResolvedValue(
          overrides.active === false ? [] : [{ userId: uuid(5), tenantId, membershipId: uuid(7) }],
        ),
    },
    { resolve: evidenceResolve },
    receipt,
    { recordDenied: vi.fn() },
    300,
  );
  return { service, receiptExecute, evidenceResolve, contextValidUntil };
}

describe('ACS-XCAP-011 Cognitive Fusion M0 service', () => {
  it('produces a deterministic metadata-only result through the bounded receipt', async () => {
    const { service, receiptExecute } = fixture();
    const outcome = await service.request('Bearer opaque', tenantId, command, {
      requestId: uuid(9),
      correlationId: uuid(10),
    });
    expect(outcome.result.status).toBe('COMPLETED');
    expect(outcome.result.assertions).toHaveLength(1);
    expect(outcome.result.hypotheses).toEqual([]);
    expect(outcome.result.response_candidates).toEqual([]);
    expect(
      outcome.result.confidence.every(({ state, value }) => state === 'UNKNOWN' && value === null),
    ).toBe(true);
    expect(receiptExecute).toHaveBeenCalledOnce();
  });
  it('fails closed for authentication, membership and Fusion authority', async () => {
    await expect(
      fixture({ authenticated: false }).service.request(undefined, tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    await expect(
      fixture({ active: false }).service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_INACTIVE' });
    await expect(
      fixture({ authorized: false }).service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  });
  it('rejects cross-tenant, integrity and provenance failures before success persistence', async () => {
    const foreign = {
      ...command,
      evidence_references: [{ ...command.evidence_references[0], tenant_id: uuid(11) }],
    };
    await expect(
      fixture().service.request('Bearer opaque', tenantId, foreign, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'CROSS_TENANT_REFERENCE' });
    await expect(
      fixture({ integrity: 'FAILED' }).service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_INTEGRITY_FAILED' });
    await expect(
      fixture({ provenance: 'INVALID' }).service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_PROVENANCE_INVALID' });
  });
  it('rejects client tenant authority and unsupported policy versions', async () => {
    await expect(
      fixture().service.request(
        'Bearer opaque',
        tenantId,
        { ...command, tenant_id: uuid(12) },
        { requestId: uuid(9), correlationId: uuid(10) },
      ),
    ).rejects.toMatchObject({ code: 'TENANT_CONTEXT_INVALID' });
    await expect(
      fixture().service.request(
        'Bearer opaque',
        tenantId,
        { ...command, policy_version: '2.0.0' },
        { requestId: uuid(9), correlationId: uuid(10) },
      ),
    ).rejects.toBeInstanceOf(CognitiveFusionFailure);
  });
  it('revalidates an optional server context assertion and binds it after evidence provenance', async () => {
    const requestId = uuid(9);
    const { service, contextValidUntil } = fixture();
    const outcome = await service.request(
      'Bearer opaque',
      tenantId,
      {
        ...command,
        context_snapshot_reference: {
          snapshot_id: requestId,
          tenant_id: tenantId,
          user_id: uuid(5),
          membership_id: uuid(7),
          membership_status: 'ACTIVE',
          context_permission: 'platform.context.read',
          source_revision: 'platform-context-request-projection-v1',
          projection_version: '1.0.0',
          policy_version: '1.0.0',
          captured_at: new Date(Date.now() - 1_000).toISOString(),
          valid_until: contextValidUntil,
        },
      },
      { requestId, correlationId: uuid(10) },
    );

    expect(outcome.result.provenance.input_bindings).toHaveLength(2);
    expect(outcome.result.provenance.input_bindings[1]).toMatchObject({
      canonical_owner: 'ACS-PLATFORM-CONTEXT',
      integrity_state: 'NOT_APPLICABLE',
      resolved_resource_id: requestId,
    });
  });
  it('fails closed for stale or detached context assertions', async () => {
    const requestId = uuid(9);
    await expect(
      fixture().service.request(
        'Bearer opaque',
        tenantId,
        {
          ...command,
          context_snapshot_reference: {
            snapshot_id: requestId,
            tenant_id: tenantId,
            user_id: uuid(5),
            membership_id: uuid(7),
            membership_status: 'ACTIVE',
            context_permission: 'platform.context.read',
            source_revision: 'platform-context-request-projection-v1',
            projection_version: '1.0.0',
            policy_version: '1.0.0',
            captured_at: new Date(Date.now() - 60_000).toISOString(),
            valid_until: new Date(Date.now() - 1_000).toISOString(),
          },
        },
        { requestId, correlationId: uuid(10) },
      ),
    ).rejects.toMatchObject({ code: 'CONTEXT_STALE' });
  });
  it('denies mismatched, expired, or missing canonical context expiry', async () => {
    const requestId = uuid(9);
    const snapshot = (validUntil: string) => ({
      ...command,
      context_snapshot_reference: {
        snapshot_id: requestId,
        tenant_id: tenantId,
        user_id: uuid(5),
        membership_id: uuid(7),
        membership_status: 'ACTIVE' as const,
        context_permission: 'platform.context.read' as const,
        source_revision: 'platform-context-request-projection-v1' as const,
        projection_version: '1.0.0' as const,
        policy_version: '1.0.0' as const,
        captured_at: new Date(Date.now() - 60_000).toISOString(),
        valid_until: validUntil,
      },
    });
    const future = new Date(Date.now() + 120_000).toISOString();
    await expect(
      fixture({ contextValidUntil: new Date(Date.now() + 60_000).toISOString() }).service.request(
        'Bearer opaque',
        tenantId,
        snapshot(future),
        { requestId, correlationId: uuid(10) },
      ),
    ).rejects.toMatchObject({ code: 'CONTEXT_STALE' });
    const expired = new Date(Date.now() - 1_000).toISOString();
    await expect(
      fixture({ contextValidUntil: expired }).service.request(
        'Bearer opaque',
        tenantId,
        snapshot(expired),
        { requestId, correlationId: uuid(10) },
      ),
    ).rejects.toMatchObject({ code: 'CONTEXT_STALE' });
    await expect(
      fixture({ omitContextValidUntil: true }).service.request(
        'Bearer opaque',
        tenantId,
        snapshot(future),
        { requestId, correlationId: uuid(10) },
      ),
    ).rejects.toMatchObject({ code: 'CONTEXT_STALE' });
  });
  it('replays an exact command without resolving evidence or synthesizing again', async () => {
    const receipts = new MemoryReceiptRepository();
    const { service, evidenceResolve } = fixture({}, receipts);
    const first = await service.request('Bearer opaque', tenantId, command, {
      requestId: uuid(9),
      correlationId: uuid(10),
    });
    const replay = await service.request('Bearer opaque', tenantId, command, {
      requestId: uuid(11),
      correlationId: uuid(12),
    });
    expect(first.replay).toBe(false);
    expect(replay).toEqual({ result: first.result, replay: true });
    expect(evidenceResolve).toHaveBeenCalledOnce();
  });
  it('rejects divergent replay under the same tenant-scoped idempotency key', async () => {
    const receipts = new MemoryReceiptRepository();
    const { service } = fixture({}, receipts);
    await service.request('Bearer opaque', tenantId, command, {
      requestId: uuid(9),
      correlationId: uuid(10),
    });
    await expect(
      service.request(
        'Bearer opaque',
        tenantId,
        {
          ...command,
          reasoning_purpose: 'EVIDENCE_METADATA_SYNTHESIS',
          requested_reasoning_mode: 'DETERMINISTIC_SYNTHESIS',
        },
        { requestId: uuid(11), correlationId: uuid(12) },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('replays a bounded failure without invoking the canonical evidence owner again', async () => {
    const receipts = new MemoryReceiptRepository();
    const { service, evidenceResolve } = fixture({}, receipts);
    evidenceResolve.mockRejectedValueOnce(
      new CognitiveFusionFailure('REFERENCE_OWNER_UNAVAILABLE'),
    );
    await expect(
      service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(9),
        correlationId: uuid(10),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_OWNER_UNAVAILABLE' });
    await expect(
      service.request('Bearer opaque', tenantId, command, {
        requestId: uuid(11),
        correlationId: uuid(12),
      }),
    ).rejects.toMatchObject({ code: 'REFERENCE_OWNER_UNAVAILABLE' });
    expect(evidenceResolve).toHaveBeenCalledOnce();
  });
});
