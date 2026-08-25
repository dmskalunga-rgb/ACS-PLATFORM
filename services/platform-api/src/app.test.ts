import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema, platformContextSchema } from '@acs/contracts';
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
    expect(document.paths['/api/v1/commercial/customers']).toBeDefined();
    expect(document.paths['/api/v1/commercial/customers/{customerId}']).toBeDefined();
    expect(response.body).toContain('developmentBearer');
    expect(response.body).toContain('Development/test identity only');
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
      resolveMembership: (subject, requestedTenantId) =>
        Promise.resolve(
          subject === 'oidc|alice' && requestedTenantId === tenantId
            ? {
                tenantDisplayName: 'Tenant A',
                tenantId,
                tenantSlug: 'tenant-a',
                userId,
              }
            : null,
        ),
      isActionAuthorized: () => Promise.resolve(true),
      issueContext: (subject, requestedTenantId) =>
        Promise.resolve(
          subject === 'oidc|alice' && requestedTenantId === tenantId
            ? {
                contextToken: randomUUID(),
                tenantDisplayName: 'Tenant A',
                tenantId,
                tenantSlug: 'tenant-a',
                userId,
              }
            : null,
        ),
      readAndAudit: (context) => Promise.resolve(context),
    };
    const contextApp = await buildApp(configuration, {
      logger: false,
      platformContextService: new PlatformContextService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(repository),
        repository,
        { recordDenied: () => Promise.resolve() },
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
      expect(() => platformContextSchema.parse(response.json())).not.toThrow();
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

  it('enforces the real rate limit and resets state for a fresh application instance', async () => {
    const rateLimitOptions = {
      logger: false,
      testRateLimit: { max: 2, timeWindow: '1 minute' },
    } as const;
    const rateLimitedApp = await buildApp(configuration, rateLimitOptions);
    try {
      expect((await rateLimitedApp.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      expect((await rateLimitedApp.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);

      const rejected = await rateLimitedApp.inject({ method: 'GET', url: '/health' });
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers['x-ratelimit-limit']).toBe('2');
      expect(rejected.headers['retry-after']).toBeDefined();
      expect(errorEnvelopeSchema.parse(rejected.json()).error).toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'The request rate limit was exceeded. Retry later.',
      });
      expect(rejected.body).not.toContain('Rate limit exceeded');
    } finally {
      await rateLimitedApp.close();
    }

    const freshApp = await buildApp(configuration, rateLimitOptions);
    try {
      expect((await freshApp.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally {
      await freshApp.close();
    }
  });

  it('keeps unknown internal failures on the bounded canonical 500 response', async () => {
    const repository: TenantContextRepository = {
      resolveMembership: () => Promise.resolve(null),
      isActionAuthorized: () => Promise.resolve(false),
      issueContext: () => Promise.resolve(null),
      readAndAudit: (context) => Promise.resolve(context),
    };
    const internalFailureApp = await buildApp(configuration, {
      logger: false,
      platformContextService: new PlatformContextService(
        new DevelopmentHeaderIdentityAdapter(),
        new RepositoryAuthorizationPort(repository),
        repository,
        {
          recordDenied: () => Promise.reject(new Error('sensitive internal diagnostic')),
        },
      ),
    });
    try {
      const response = await internalFailureApp.inject({
        method: 'GET',
        url: '/api/v1/platform/context',
        headers: { 'x-acs-tenant-id': 'not-a-uuid' },
      });
      expect(response.statusCode).toBe(500);
      expect(errorEnvelopeSchema.parse(response.json()).error).toMatchObject({
        code: 'FOUNDATION_INTERNAL_ERROR',
        message: 'The technical request could not be completed.',
      });
      expect(response.body).not.toContain('sensitive internal diagnostic');
    } finally {
      await internalFailureApp.close();
    }
  });
});
