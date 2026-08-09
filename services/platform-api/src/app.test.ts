import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema } from '@acs/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';
import {
  PlatformContextService,
  RepositoryAuthorizationPort,
  type TenantContextRepository,
} from './platform-context.js';
import { DevelopmentHeaderIdentityAdapter } from './identity.js';

const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
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
    expect(document.paths['/api/v1/platform/context']).toBeDefined();
  });

  it('reports tenant context as not configured without database boundaries', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/context',
      headers: { 'x-acs-tenant-id': randomUUID() },
    });
    expect(response.statusCode).toBe(503);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe(
      'PLATFORM_CONTEXT_NOT_CONFIGURED',
    );
  });

  it('serves the authenticated and audited tenant context through the versioned API', async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    const repository: TenantContextRepository = {
      resolveMembership: async (subject, requestedTenantId) =>
        subject === 'oidc|alice' && requestedTenantId === tenantId
          ? {
              tenantDisplayName: 'Tenant A',
              tenantId,
              tenantSlug: 'tenant-a',
              userId,
            }
          : null,
      isActionAuthorized: async () => true,
      issueContext: async (subject, requestedTenantId) =>
        subject === 'oidc|alice' && requestedTenantId === tenantId
          ? {
              contextToken: randomUUID(),
              tenantDisplayName: 'Tenant A',
              tenantId,
              tenantSlug: 'tenant-a',
              userId,
            }
          : null,
      readAndAudit: async (context) => context,
    };
    const contextApp = await buildApp(configuration, {
      logger: false,
      platformContextService: new PlatformContextService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(repository),
        repository,
        { recordDenied: async () => undefined },
      ),
    });
    try {
      const response = await contextApp.inject({
        method: 'GET',
        url: '/api/v1/platform/context',
        headers: {
          authorization: 'Bearer dev:oidc|alice',
          'x-acs-tenant-id': tenantId,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: {
          user_id: userId,
          tenant: { id: tenantId, slug: 'tenant-a' },
          permissions: ['platform.context.read'],
        },
      });
    } finally {
      await contextApp.close();
    }
  });

  it('fails with the standard error envelope for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe('FOUNDATION_NOT_FOUND');
  });
});
