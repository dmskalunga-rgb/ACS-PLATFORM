import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { EvidenceChainOfCustodyFailure } from './evidence-chain-of-custody.js';
import type { PlatformConfiguration } from './config.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const evidenceId = '93000000-0000-4000-8000-000000000001';
const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
  logLevel: 'fatal',
  port: 3000,
  webOrigin: 'http://localhost:5173',
};
const record = {
  evidence_id: evidenceId,
  tenant_id: tenantId,
  evidence_source_id: '91000000-0000-4000-8000-000000000001',
  parent_evidence_id: null,
  record_contract_version: '1.0.0',
  blob_reference_id: '92000000-0000-4000-8000-000000000001',
  media_type: 'text/plain',
  size_bytes: 3,
  content_sha256: 'a'.repeat(64),
  metadata_sha256: 'b'.repeat(64),
  canonicalization_version: 'xcap005-evidence-metadata-v1',
  classification: 'INTERNAL',
  integrity_status: 'VERIFIED',
  operational_status: 'AVAILABLE',
  version: 1,
  created_at: '2026-09-08T00:00:00.000Z',
};

describe('XCAP-005 HTTP boundary', () => {
  const service = {
    collect: vi.fn(),
    read: vi.fn(),
    readContent: vi.fn(),
    verify: vi.fn(),
    derive: vi.fn(),
    governanceFact: vi.fn(),
    protectedOperation: vi.fn(),
    registerSource: vi.fn(),
    transitionSource: vi.fn(),
  };
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(configuration, {
      logger: false,
      evidenceChainOfCustodyService: service as never,
    });
  }, 30000);
  afterAll(async () => app.close());

  it('requires a bounded UUID idempotency key for mutations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantId}/evidence`,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(service.collect).not.toHaveBeenCalled();
  });

  it('returns the canonical collection envelope without exposing content', async () => {
    service.collect.mockResolvedValueOnce({ data: record, replay: false });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/cyberdefense/tenants/${tenantId}/evidence`,
      headers: { 'idempotency-key': '11111111-1111-4111-8111-111111111111' },
      payload: {
        evidence_source_id: record.evidence_source_id,
        source_event_id: 'evt',
        observed_at: '2026-09-08T00:00:00Z',
        media_type: 'text/plain',
        raw_bytes_base64: 'YWNz',
        classification: 'INTERNAL',
        metadata: {},
        retention_policy_id: 'policy',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.body).not.toContain('YWNz');
  });

  it('maps evidence authorization failures to a bounded external envelope', async () => {
    service.read.mockRejectedValueOnce(
      new EvidenceChainOfCustodyFailure('FORBIDDEN', 'Evidence operation is unavailable.'),
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cyberdefense/tenants/${tenantId}/evidence/${evidenceId}`,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
  });

  it('never exposes internal database errors through the evidence contract', async () => {
    service.read.mockRejectedValueOnce(
      Object.assign(new Error('connection includes secret'), { code: '28P01' }),
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/cyberdefense/tenants/${tenantId}/evidence/${evidenceId}`,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('connection includes secret');
  });
});
