import { randomUUID } from 'node:crypto';
import { aiInventoryMutationEnvelopeSchema, errorEnvelopeSchema } from '@acs/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';
import { AiInventoryFailure, type AiInventoryService } from './ai-inventory.js';

const tenantId = '00000000-0000-4000-8000-000000000011';
const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
  logLevel: 'error',
  port: 3000,
  webOrigin: 'http://localhost:5173',
};
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function appWith(service: Partial<AiInventoryService>) {
  const app = await buildApp(configuration, {
    logger: false,
    aiInventoryService: service as AiInventoryService,
  });
  apps.push(app);
  return app;
}

function systemPayload() {
  return {
    system_key: 'fraud.assist',
    name: 'Fraud Assist',
    purpose: 'Decision support.',
    owner_reference: 'owner:risk',
    classification: 'CONFIDENTIAL',
    evidence_reference: 'e3000000-0000-4000-8000-000000000011',
  };
}

function systemResult() {
  return {
    asset_id: randomUUID(),
    kind: 'AI_SYSTEM',
    system_id: null,
    asset_key: 'fraud.assist',
    name: 'Fraud Assist',
    classification: 'CONFIDENTIAL',
    status: 'REGISTERED',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('AIGOV M0A AI Inventory HTTP boundary', () => {
  it('fails closed when server inventory bindings are absent', async () => {
    const app = await buildApp(configuration, { logger: false });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
    });
    expect(response.statusCode).toBe(503);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('AIGOV_M0A_NOT_CONFIGURED');
  });

  it('binds the path tenant and delegates the server authorization decision', async () => {
    const createAsset = vi.fn().mockResolvedValue({ data: systemResult(), replay: false });
    const app = await appWith({ createAsset });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
      headers: { authorization: 'Bearer dev:alice', 'idempotency-key': randomUUID() },
      payload: systemPayload(),
    });
    expect(response.statusCode).toBe(201);
    expect(aiInventoryMutationEnvelopeSchema.parse(response.json()).meta.idempotent_replay).toBe(
      false,
    );
    expect(createAsset).toHaveBeenCalledWith(
      'Bearer dev:alice',
      tenantId,
      { kind: 'AI_SYSTEM', command: systemPayload() },
      expect.any(String),
      expect.objectContaining({
        requestId: expect.any(String) as unknown,
        correlationId: expect.any(String) as unknown,
      }),
    );
  });

  it('rejects caller tenant authority, raw prompt content, and client activation', async () => {
    const createAsset = vi.fn();
    const createVersion = vi.fn();
    const app = await appWith({ createAsset, createVersion });
    for (const payload of [
      { ...systemPayload(), tenant_id: randomUUID() },
      { ...systemPayload(), status: 'ACTIVE' },
      { ...systemPayload(), evidence_reference: 'evidence:untyped' },
      { ...systemPayload(), evidence_reference: undefined },
      { ...systemPayload(), purpose: 'x'.repeat(1001) },
      { ...systemPayload(), client_secret: 'must-not-be-accepted' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
        headers: { 'idempotency-key': randomUUID() },
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    const prompt = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-governance/tenants/${tenantId}/prompt-versions`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        prompt_id: randomUUID(),
        version_label: '1.0',
        content_sha256: 'a'.repeat(64),
        content_reference: 'artifact:prompt:1',
        change_reason: 'Initial registration',
        evidence_reference: 'e3000000-0000-4000-8000-000000000011',
        content: 'secret prompt',
      },
    });
    expect(prompt.statusCode).toBe(400);
    expect(createAsset).not.toHaveBeenCalled();
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('maps AuthorizationPort denial and idempotency conflict to canonical error envelopes', async () => {
    const createAsset = vi
      .fn()
      .mockRejectedValueOnce(new AiInventoryFailure('FORBIDDEN'))
      .mockRejectedValueOnce(new AiInventoryFailure('IDEMPOTENCY_CONFLICT'))
      .mockRejectedValueOnce(new AiInventoryFailure('ALREADY_EXISTS'));
    const app = await appWith({ createAsset });
    for (const [status, code] of [
      [403, 'FORBIDDEN'],
      [409, 'IDEMPOTENCY_CONFLICT'],
      [409, 'ALREADY_EXISTS'],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/ai-governance/tenants/${tenantId}/ai-systems`,
        headers: { 'idempotency-key': randomUUID() },
        payload: systemPayload(),
      });
      expect(response.statusCode).toBe(status);
      const error = errorEnvelopeSchema.parse(response.json()).error;
      expect(error.code).toBe(code);
      expect(error.request_id).toBeTypeOf('string');
      expect(error.correlation_id).toBeTypeOf('string');
    }
  });
});
