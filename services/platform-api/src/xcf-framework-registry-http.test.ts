import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema, xcfMutationEnvelopeSchema } from '@acs/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';
import { XcfM1Failure } from './xcf-framework-registry.js';
import type { XcfFrameworkRegistryService } from './xcf-framework-registry.js';

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

function publisher() {
  return {
    publisher_id: randomUUID(),
    publisher_key: 'nist',
    legal_name: 'National Institute of Standards and Technology',
    trust_status: 'TRUSTED' as const,
    version: 1,
    created_at: new Date().toISOString(),
  };
}

async function appWith(service: Partial<XcfFrameworkRegistryService>) {
  const app = await buildApp(configuration, {
    logger: false,
    xcfFrameworkRegistryService: service as XcfFrameworkRegistryService,
  });
  apps.push(app);
  return app;
}

describe('XCF M1 Framework Registry HTTP boundary', () => {
  it('fails closed when the server-owned registry runtime is absent', async () => {
    const app = await buildApp(configuration, { logger: false });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/xcf/publishers' });
    expect(response.statusCode).toBe(503);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('XCF_M1_NOT_CONFIGURED');
  });

  it('strips client tenant input and delegates tenant authority to the configured service', async () => {
    const createPublisher = vi.fn().mockResolvedValue({ data: publisher(), replay: false });
    const app = await appWith({ createPublisher });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/xcf/publishers',
      headers: {
        authorization: 'Bearer dev:publisher-admin',
        'idempotency-key': randomUUID(),
        'x-acs-tenant-id': randomUUID(),
      },
      payload: {
        legal_name: 'National Institute of Standards and Technology',
        publisher_key: 'nist',
        trust_status: 'TRUSTED',
        tenant_id: randomUUID(),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(xcfMutationEnvelopeSchema.parse(response.json()).meta.idempotent_replay).toBe(false);
    expect(createPublisher).toHaveBeenCalledOnce();
    expect(createPublisher.mock.calls[0]?.[1]).not.toHaveProperty('tenant_id');
  });

  it('requires a complete protected transition command for source activation', async () => {
    const transitionSource = vi.fn();
    const app = await appWith({ transitionSource });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/xcf/framework-sources/${randomUUID()}/activate`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { expected_version: 1, reason_reference: 'change:123' },
    });

    expect(response.statusCode).toBe(400);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('INVALID_REQUEST');
    expect(transitionSource).not.toHaveBeenCalled();
  });

  it('maps protected-operation denials to a bounded forbidden response', async () => {
    const transitionSource = vi.fn().mockRejectedValue(new XcfM1Failure('MPA_DENIED'));
    const app = await appWith({ transitionSource });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/xcf/framework-sources/${randomUUID()}/activate`,
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        expected_version: 1,
        reason_reference: 'change:123',
        authorization_id: randomUUID(),
        authorization_expected_version: 3,
        attestation_reference: 'attestation:xcf:123',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('MPA_DENIED');
    expect(transitionSource).toHaveBeenCalledOnce();
  });
});
