import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema } from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';

const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  logLevel: 'error',
  port: 3000,
  webOrigin: 'http://localhost:5173',
};

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(configuration, { logger: false });
});

afterAll(async () => {
  await app.close();
});

describe('FOUNDATION platform API', () => {
  it('returns a real technical health response and correlation headers', async () => {
    const correlationId = randomUUID();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': correlationId },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.json()).toMatchObject({ component: 'FOUNDATION', status: 'ok' });
  });

  it('publishes an OpenAPI contract for technical endpoints', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    const document = z.object({ paths: z.record(z.string(), z.unknown()) }).parse(response.json());
    expect(document.paths['/health']).toBeDefined();
  });

  it('fails with the standard error envelope for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('FOUNDATION_NOT_FOUND');
  });
});
