import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema, platformContextSchema } from '@acs/contracts';
import { FOUNDATION_COMPONENT } from '@acs/foundation';
import {
  createMetricsRegistry,
  createStructuredLogger,
  sanitizeErrorForLog,
} from '@acs/observability';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import { z } from 'zod';
import type { PlatformConfiguration } from './config.js';
import {
  DevelopmentHeaderIdentityAdapter,
  NotConfiguredIdentityAdapter,
  OidcJwtIdentityAdapter,
} from './identity.js';
import {
  PlatformContextFailure,
  PlatformContextService,
  RepositoryAuthorizationPort,
  type TenantContextRepository,
} from './platform-context.js';
import {
  PostgresSecurityAuditRepository,
  PostgresTenantContextRepository,
} from './postgres-platform-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

const uuidSchema = z.uuid();

export async function buildApp(
  configuration: PlatformConfiguration,
  options: {
    readonly logger?: boolean;
    readonly platformContextService?: PlatformContextService;
  } = {},
) {
  const logger = createStructuredLogger({
    level: configuration.logLevel,
    serviceName: 'acs-platform-api',
  });
  const app = Fastify({
    genReqId: () => randomUUID(),
    ...(options.logger === false ? { logger: false } : { loggerInstance: logger }),
  });
  const { authenticationDuration, authentications, registry, requests } =
    createMetricsRegistry('acs-platform-api');
  let postgresRepository: (TenantContextRepository & { close(): Promise<void> }) | undefined;
  let securityAuditRepository: PostgresSecurityAuditRepository | undefined;
  let platformContextService = options.platformContextService;
  let identityStatus: () => string = () =>
    configuration.identityMode === 'not-configured' ? 'not-configured' : 'externally-managed';
  if (
    platformContextService === undefined &&
    configuration.resolverDatabaseUrl !== undefined &&
    configuration.securityAuditDatabaseUrl !== undefined &&
    configuration.tenantDatabaseUrl !== undefined
  ) {
    postgresRepository = new PostgresTenantContextRepository(
      configuration.resolverDatabaseUrl,
      configuration.tenantDatabaseUrl,
    );
    const identity =
      configuration.identityMode === 'development-header'
        ? new DevelopmentHeaderIdentityAdapter()
        : configuration.identityMode === 'oidc' && configuration.oidc !== undefined
          ? new OidcJwtIdentityAdapter(configuration.oidc, (observation) => {
              authentications.inc({ outcome: observation.outcome, reason: observation.reason });
              authenticationDuration.observe(
                { outcome: observation.outcome },
                observation.durationSeconds,
              );
            })
          : new NotConfiguredIdentityAdapter();
    securityAuditRepository = new PostgresSecurityAuditRepository(
      configuration.securityAuditDatabaseUrl,
    );
    identityStatus = () => identity.status ?? 'unknown';
    platformContextService = new PlatformContextService(
      identity,
      new RepositoryAuthorizationPort(postgresRepository),
      postgresRepository,
      securityAuditRepository,
    );
  }
  if (postgresRepository !== undefined && securityAuditRepository !== undefined) {
    app.addHook('onClose', async () => {
      await Promise.all([postgresRepository?.close(), securityAuditRepository?.close()]);
    });
  }

  await app.register(cors, { credentials: false, origin: configuration.webOrigin });
  await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ACS Platform Foundation API',
        version: '0.0.0-foundation',
        description: 'Technical FOUNDATION endpoints only; no ACS 5.x domain API.',
      },
      components: {
        securitySchemes: {
          oidcBearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Production OIDC access token, validated against configured JWKS.',
          },
          developmentBearer: {
            type: 'http',
            scheme: 'bearer',
            description:
              'Development/test identity only. Prohibited in staging and production; not OIDC.',
          },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.decorateRequest('correlationId', '');
  app.addHook('onRequest', async (request, reply) => {
    const supplied = request.headers['x-correlation-id'];
    const parsed = typeof supplied === 'string' ? uuidSchema.safeParse(supplied) : undefined;
    request.correlationId = parsed?.success === true ? parsed.data : request.id;
    void reply.header('x-request-id', request.id);
    void reply.header('x-correlation-id', request.correlationId);
  });
  app.addHook('onResponse', async (request, reply) => {
    requests.inc({
      method: request.method,
      route: request.routeOptions.url ?? 'unmatched',
      status_code: String(reply.statusCode),
    });
  });

  const healthSchema = {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['component', 'service', 'status', 'version'],
        properties: {
          component: { type: 'string', const: 'FOUNDATION' },
          service: { type: 'string' },
          status: { type: 'string' },
          version: { type: 'string' },
        },
      },
    },
  } as const;

  app.get('/health', { schema: healthSchema }, () => ({
    component: FOUNDATION_COMPONENT,
    service: 'acs-platform-api',
    status: 'ok',
    version: '0.0.0-foundation',
  }));
  app.get('/live', { schema: healthSchema }, () => ({
    component: FOUNDATION_COMPONENT,
    service: 'acs-platform-api',
    status: 'alive',
    version: '0.0.0-foundation',
  }));
  app.get('/ready', { schema: healthSchema }, () => ({
    component: FOUNDATION_COMPONENT,
    service: 'acs-platform-api',
    status: 'ready',
    version: '0.0.0-foundation',
  }));
  app.get('/health/identity', () => ({
    configured: configuration.identityMode !== 'not-configured',
    mode: configuration.identityMode,
    status: identityStatus(),
  }));
  app.get('/metrics', async (_request, reply) => {
    void reply.header('content-type', registry.contentType);
    return registry.metrics();
  });
  app.get('/openapi.json', () => app.swagger());

  const contextResponseJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'meta'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['user_id', 'tenant', 'membership', 'permissions'],
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          tenant: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'slug', 'display_name'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              slug: { type: 'string' },
              display_name: { type: 'string' },
            },
          },
          membership: {
            type: 'object',
            additionalProperties: false,
            required: ['status'],
            properties: { status: { type: 'string', const: 'ACTIVE' } },
          },
          permissions: {
            type: 'array',
            minItems: 1,
            maxItems: 1,
            items: { type: 'string', const: 'platform.context.read' },
          },
        },
      },
      meta: {
        type: 'object',
        additionalProperties: false,
        required: ['request_id', 'correlation_id'],
        properties: {
          request_id: { type: 'string', format: 'uuid' },
          correlation_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  } as const;
  const errorResponseJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message', 'request_id', 'correlation_id'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          request_id: { type: 'string', format: 'uuid' },
          correlation_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  } as const;

  app.get(
    '/api/v1/platform/context',
    {
      schema: {
        security: [
          configuration.identityMode === 'oidc' ? { oidcBearer: [] } : { developmentBearer: [] },
        ],
        headers: {
          type: 'object',
          properties: {
            authorization: { type: 'string' },
            'x-acs-tenant-id': { type: 'string' },
          },
        },
        response: {
          200: contextResponseJsonSchema,
          400: errorResponseJsonSchema,
          401: errorResponseJsonSchema,
          403: errorResponseJsonSchema,
          503: errorResponseJsonSchema,
        },
      },
    },
    async (request, reply) => {
      if (platformContextService === undefined) {
        return reply.status(503).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'PLATFORM_CONTEXT_NOT_CONFIGURED',
              message: 'Tenant context dependencies are not configured.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      }
      const tenantHeader = request.headers['x-acs-tenant-id'];
      const parsedTenant =
        typeof tenantHeader === 'string' ? uuidSchema.safeParse(tenantHeader) : undefined;
      if (parsedTenant?.success !== true) {
        await platformContextService.recordRequestDenial(
          'INVALID_TENANT_SELECTOR',
          typeof tenantHeader === 'string' ? tenantHeader : undefined,
          { correlationId: request.correlationId, requestId: request.id },
        );
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_TENANT_SELECTOR',
              message: 'A valid tenant selector is required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      }
      try {
        const response = await platformContextService.read(
          request.headers.authorization,
          parsedTenant.data,
          { correlationId: request.correlationId, requestId: request.id },
        );
        return platformContextSchema.parse(response);
      } catch (error) {
        if (error instanceof PlatformContextFailure) {
          const status =
            error.code === 'UNAUTHENTICATED'
              ? 401
              : error.code === 'TENANT_CONTEXT_DENIED' || error.code === 'PERMISSION_DENIED'
                ? 403
                : 503;
          request.log.warn(
            {
              action: 'platform.context.read',
              correlation_id: request.correlationId,
              outcome: 'DENIED',
              reason: error.code,
            },
            'tenant context access denied',
          );
          return reply.status(status).send(
            errorEnvelopeSchema.parse({
              error: {
                code: error.code,
                message: error.message,
                request_id: request.id,
                correlation_id: request.correlationId,
              },
            }),
          );
        }
        throw error;
      }
    },
  );

  app.setNotFoundHandler(async (request, reply) => {
    const envelope = errorEnvelopeSchema.parse({
      error: {
        code: 'FOUNDATION_NOT_FOUND',
        message: 'The requested technical endpoint does not exist.',
        request_id: request.id,
        correlation_id: request.correlationId,
      },
    });
    return reply.status(404).send(envelope);
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error(
      { error: sanitizeErrorForLog(error), correlation_id: request.correlationId },
      'request failed',
    );
    const envelope = errorEnvelopeSchema.parse({
      error: {
        code: 'FOUNDATION_INTERNAL_ERROR',
        message: 'The technical request could not be completed.',
        request_id: request.id,
        correlation_id: request.correlationId,
      },
    });
    return reply.status(500).send(envelope);
  });

  await app.ready();
  return app;
}
