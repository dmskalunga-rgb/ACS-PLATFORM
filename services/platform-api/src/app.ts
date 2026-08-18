import { randomUUID } from 'node:crypto';
import {
  administrationMutationResultSchema,
  customerCreateSchema,
  customerEnvelopeSchema,
  customerListEnvelopeSchema,
  customerUpdateSchema,
  errorEnvelopeSchema,
  membershipStatusMutationSchema,
  platformContextSchema,
  roleMutationSchema,
  tenantAdministrationSchema,
} from '@acs/contracts';
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
  type IdentityAdapter,
} from './platform-context.js';
import {
  PostgresSecurityAuditRepository,
  PostgresTenantContextRepository,
} from './postgres-platform-context.js';
import { PostgresTenantAdminRepository } from './postgres-tenant-administration.js';
import { PostgresCustomerRepository } from './postgres-customer-registry.js';
import { CustomerRegistryFailure, CustomerRegistryService } from './customer-registry.js';
import {
  TenantAdministrationFailure,
  TenantAdministrationService,
} from './tenant-administration.js';

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
    readonly tenantAdministrationService?: TenantAdministrationService;
    readonly customerRegistryService?: CustomerRegistryService;
  } = {},
) {
  const logger = createStructuredLogger({
    level: configuration.logLevel,
    serviceName: 'acs-platform-api',
  });
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    genReqId: () => randomUUID(),
    ...(options.logger === false ? { logger: false } : { loggerInstance: logger }),
  });
  const { authenticationDuration, authentications, registry, requests } =
    createMetricsRegistry('acs-platform-api');
  let postgresRepository: (TenantContextRepository & { close(): Promise<void> }) | undefined;
  let securityAuditRepository: PostgresSecurityAuditRepository | undefined;
  let platformContextService = options.platformContextService;
  let tenantAdministrationService = options.tenantAdministrationService;
  let tenantAdminRepository: PostgresTenantAdminRepository | undefined;
  let customerRepository: PostgresCustomerRepository | undefined;
  let customerRegistryService = options.customerRegistryService;
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
    const identity: IdentityAdapter =
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
    if (configuration.tenantAdminDatabaseUrl !== undefined) {
      tenantAdminRepository = new PostgresTenantAdminRepository(
        configuration.tenantAdminDatabaseUrl,
      );
      tenantAdministrationService = new TenantAdministrationService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        tenantAdminRepository,
        securityAuditRepository,
      );
    }
    if (configuration.customerDatabaseUrl !== undefined) {
      customerRepository = new PostgresCustomerRepository(configuration.customerDatabaseUrl);
      customerRegistryService = new CustomerRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        customerRepository,
        securityAuditRepository,
      );
    }
  }
  if (postgresRepository !== undefined && securityAuditRepository !== undefined) {
    app.addHook('onClose', async () => {
      await Promise.all([
        postgresRepository?.close(),
        securityAuditRepository?.close(),
        tenantAdminRepository?.close(),
        customerRepository?.close(),
      ]);
    });
  }

  await app.register(cors, { credentials: false, origin: configuration.webOrigin });
  await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'ACS Platform and Commercial Customer Registry API',
        version: '0.1.0-phase-2-customer-registry',
        description:
          'Governed platform foundation plus the authorized tenant-scoped Customer Registry slice.',
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

  const adminRouteSchema = {
    security: [
      configuration.identityMode === 'oidc' ? { oidcBearer: [] } : { developmentBearer: [] },
    ],
    params: {
      type: 'object',
      required: ['tenantId'],
      properties: {
        tenantId: { type: 'string', format: 'uuid' },
        membershipId: { type: 'string', format: 'uuid' },
        roleId: { type: 'string', format: 'uuid' },
      },
    },
    headers: {
      type: 'object',
      properties: {
        authorization: { type: 'string' },
        'idempotency-key': { type: 'string', format: 'uuid' },
      },
    },
  } as const;
  const metadata = (request: { id: string; correlationId: string }) => ({
    correlationId: request.correlationId,
    requestId: request.id,
  });
  const adminError = (
    error: TenantAdministrationFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) => {
    const status =
      error.code === 'UNAUTHENTICATED'
        ? 401
        : error.code === 'STALE_VERSION' || error.code === 'IDEMPOTENCY_CONFLICT'
          ? 409
          : error.code === 'INVALID_TARGET'
            ? 404
            : 403;
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
  };
  app.get(
    '/api/v1/platform/tenants/:tenantId/administration',
    { schema: adminRouteSchema },
    async (request, reply) => {
      if (!tenantAdministrationService)
        return reply.status(503).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'TENANT_ADMIN_NOT_CONFIGURED',
              message: 'Tenant administration dependencies are not configured.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      const { tenantId } = request.params as { tenantId: string };
      try {
        return tenantAdministrationSchema.parse(
          await tenantAdministrationService.list(
            request.headers.authorization,
            tenantId,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof TenantAdministrationFailure) return adminError(error, request, reply);
        throw error;
      }
    },
  );
  app.put(
    '/api/v1/platform/tenants/:tenantId/memberships/:membershipId/status',
    { schema: adminRouteSchema },
    async (request, reply) => {
      if (!tenantAdministrationService)
        return reply.status(503).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'TENANT_ADMIN_NOT_CONFIGURED',
              message: 'Tenant administration dependencies are not configured.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      const { tenantId, membershipId } = request.params as {
        tenantId: string;
        membershipId: string;
      };
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !uuidSchema.safeParse(key).success)
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_IDEMPOTENCY_KEY',
              message: 'A UUID idempotency key is required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      const body = membershipStatusMutationSchema.safeParse(request.body);
      if (!body.success)
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'The membership mutation is invalid.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return administrationMutationResultSchema.parse(
          await tenantAdministrationService.status(
            request.headers.authorization,
            tenantId,
            membershipId,
            body.data.status,
            body.data.expected_version,
            key,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof TenantAdministrationFailure) return adminError(error, request, reply);
        throw error;
      }
    },
  );
  for (const method of ['PUT', 'DELETE'] as const)
    app.route({
      method,
      url: '/api/v1/platform/tenants/:tenantId/memberships/:membershipId/roles/:roleId',
      schema: adminRouteSchema,
      handler: async (request, reply) => {
        if (!tenantAdministrationService)
          return reply.status(503).send(
            errorEnvelopeSchema.parse({
              error: {
                code: 'TENANT_ADMIN_NOT_CONFIGURED',
                message: 'Tenant administration dependencies are not configured.',
                request_id: request.id,
                correlation_id: request.correlationId,
              },
            }),
          );
        const { tenantId, membershipId, roleId } = request.params as {
          tenantId: string;
          membershipId: string;
          roleId: string;
        };
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || !uuidSchema.safeParse(key).success)
          return reply.status(400).send(
            errorEnvelopeSchema.parse({
              error: {
                code: 'INVALID_IDEMPOTENCY_KEY',
                message: 'A UUID idempotency key is required.',
                request_id: request.id,
                correlation_id: request.correlationId,
              },
            }),
          );
        const body = roleMutationSchema.safeParse(request.body);
        if (!body.success)
          return reply.status(400).send(
            errorEnvelopeSchema.parse({
              error: {
                code: 'INVALID_REQUEST',
                message: 'The role mutation is invalid.',
                request_id: request.id,
                correlation_id: request.correlationId,
              },
            }),
          );
        try {
          return administrationMutationResultSchema.parse(
            await tenantAdministrationService.role(
              request.headers.authorization,
              tenantId,
              membershipId,
              roleId,
              method === 'PUT',
              body.data.expected_version,
              key,
              metadata(request),
            ),
          );
        } catch (error) {
          if (error instanceof TenantAdministrationFailure)
            return adminError(error, request, reply);
          throw error;
        }
      },
    });

  const customerRouteSchema = {
    security: [
      configuration.identityMode === 'oidc' ? { oidcBearer: [] } : { developmentBearer: [] },
    ],
    headers: {
      type: 'object',
      properties: {
        authorization: { type: 'string' },
        'x-acs-tenant-id': { type: 'string', format: 'uuid' },
        'idempotency-key': { type: 'string', format: 'uuid' },
      },
    },
  } as const;
  const customerError = (
    error: CustomerRegistryFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) => {
    const status =
      error.code === 'UNAUTHENTICATED'
        ? 401
        : error.code === 'FORBIDDEN'
          ? 403
          : error.code === 'NOT_FOUND'
            ? 404
            : 409;
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
  };
  const customerTenant = (request: { headers: Record<string, unknown> }) => {
    const value = request.headers['x-acs-tenant-id'];
    return typeof value === 'string' ? uuidSchema.safeParse(value) : undefined;
  };
  const customerUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'CUSTOMER_REGISTRY_NOT_CONFIGURED',
          message: 'Customer Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  app.post(
    '/api/v1/commercial/customers',
    {
      schema: {
        ...customerRouteSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['display_name'],
          properties: {
            display_name: { type: 'string', minLength: 1, maxLength: 160 },
            reference_code: { type: ['string', 'null'], minLength: 1, maxLength: 80 },
            contact_email: { type: ['string', 'null'], format: 'email', maxLength: 254 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!customerRegistryService) return customerUnavailable(request, reply);
      const tenant = customerTenant(request);
      const key = request.headers['idempotency-key'];
      const body = customerCreateSchema.safeParse(request.body);
      if (
        tenant?.success !== true ||
        typeof key !== 'string' ||
        !uuidSchema.safeParse(key).success ||
        !body.success
      )
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Tenant, idempotency key and customer payload are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return customerEnvelopeSchema.parse(
          await customerRegistryService.create(
            request.headers.authorization,
            tenant.data,
            key,
            body.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof CustomerRegistryFailure) return customerError(error, request, reply);
        throw error;
      }
    },
  );
  app.get(
    '/api/v1/commercial/customers',
    {
      schema: {
        ...customerRouteSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            cursor: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!customerRegistryService) return customerUnavailable(request, reply);
      const tenant = customerTenant(request);
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
      if (tenant?.success !== true || !query.success)
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'A valid tenant and bounded pagination are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return customerListEnvelopeSchema.parse(
          await customerRegistryService.list(
            request.headers.authorization,
            tenant.data,
            query.data.limit,
            query.data.cursor,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof CustomerRegistryFailure) return customerError(error, request, reply);
        throw error;
      }
    },
  );
  app.get(
    '/api/v1/commercial/customers/:customerId',
    {
      schema: {
        ...customerRouteSchema,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['customerId'],
          properties: { customerId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      if (!customerRegistryService) return customerUnavailable(request, reply);
      const tenant = customerTenant(request);
      const customerId = uuidSchema.safeParse(
        (request.params as { customerId?: string }).customerId,
      );
      if (tenant?.success !== true || !customerId.success)
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Valid tenant and customer identifiers are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return customerEnvelopeSchema.parse(
          await customerRegistryService.get(
            request.headers.authorization,
            tenant.data,
            customerId.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof CustomerRegistryFailure) return customerError(error, request, reply);
        throw error;
      }
    },
  );
  app.patch(
    '/api/v1/commercial/customers/:customerId',
    {
      schema: {
        ...customerRouteSchema,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['customerId'],
          properties: { customerId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expected_version'],
          properties: {
            display_name: { type: 'string', minLength: 1, maxLength: 160 },
            reference_code: { type: ['string', 'null'], minLength: 1, maxLength: 80 },
            contact_email: { type: ['string', 'null'], format: 'email', maxLength: 254 },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
            expected_version: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!customerRegistryService) return customerUnavailable(request, reply);
      const tenant = customerTenant(request);
      const key = request.headers['idempotency-key'];
      const customerId = uuidSchema.safeParse(
        (request.params as { customerId?: string }).customerId,
      );
      const body = customerUpdateSchema.safeParse(request.body);
      if (
        tenant?.success !== true ||
        !customerId.success ||
        typeof key !== 'string' ||
        !uuidSchema.safeParse(key).success ||
        !body.success
      )
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Valid tenant, customer, idempotency key and update are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return customerEnvelopeSchema.parse(
          await customerRegistryService.update(
            request.headers.authorization,
            tenant.data,
            customerId.data,
            key,
            body.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof CustomerRegistryFailure) return customerError(error, request, reply);
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
    if (error instanceof Error && 'validation' in error && Array.isArray(error.validation)) {
      return reply.status(400).send(
        errorEnvelopeSchema.parse({
          error: {
            code: 'INVALID_REQUEST',
            message: 'The request does not match the published API contract.',
            request_id: request.id,
            correlation_id: request.correlationId,
          },
        }),
      );
    }
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
