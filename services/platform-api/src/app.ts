import { randomUUID } from 'node:crypto';
import {
  administrationMutationResultSchema,
  customerCreateSchema,
  customerEnvelopeSchema,
  customerListEnvelopeSchema,
  customerUpdateSchema,
  leadCreateSchema,
  leadEnvelopeSchema,
  leadListEnvelopeSchema,
  leadUpdateSchema,
  planCreateSchema,
  planEnvelopeSchema,
  planFeatureCreateSchema,
  planFeatureEnvelopeSchema,
  planFeatureListEnvelopeSchema,
  planFeatureUpdateSchema,
  planListEnvelopeSchema,
  planUpdateSchema,
  partnerCreateSchema,
  partnerEnvelopeSchema,
  partnerListEnvelopeSchema,
  partnerUpdateSchema,
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
import { PostgresLeadRepository } from './postgres-lead-registry.js';
import { PostgresPlanCatalogRepository } from './postgres-plan-catalog.js';
import { PostgresPartnerRegistryRepository } from './postgres-partner-registry.js';
import { CustomerRegistryFailure, CustomerRegistryService } from './customer-registry.js';
import { LeadRegistryFailure, LeadRegistryService } from './lead-registry.js';
import { PlanCatalogFailure, PlanCatalogService } from './plan-catalog.js';
import { PartnerRegistryFailure, PartnerRegistryService } from './partner-registry.js';
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
    readonly leadRegistryService?: LeadRegistryService;
    readonly planCatalogService?: PlanCatalogService;
    readonly partnerRegistryService?: PartnerRegistryService;
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
  let leadRepository: PostgresLeadRepository | undefined;
  let leadRegistryService = options.leadRegistryService;
  let planRepository: PostgresPlanCatalogRepository | undefined;
  let planCatalogService = options.planCatalogService;
  let partnerRepository: PostgresPartnerRegistryRepository | undefined;
  let partnerRegistryService = options.partnerRegistryService;
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
    if (configuration.leadDatabaseUrl !== undefined) {
      leadRepository = new PostgresLeadRepository(configuration.leadDatabaseUrl);
      leadRegistryService = new LeadRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        leadRepository,
        securityAuditRepository,
      );
    }
    if (configuration.planDatabaseUrl !== undefined) {
      planRepository = new PostgresPlanCatalogRepository(configuration.planDatabaseUrl);
      planCatalogService = new PlanCatalogService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        planRepository,
        securityAuditRepository,
      );
    }
    if (configuration.partnerDatabaseUrl !== undefined) {
      partnerRepository = new PostgresPartnerRegistryRepository(configuration.partnerDatabaseUrl);
      partnerRegistryService = new PartnerRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        partnerRepository,
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
        leadRepository?.close(),
        planRepository?.close(),
        partnerRepository?.close(),
      ]);
    });
  }

  await app.register(cors, { credentials: false, origin: configuration.webOrigin });
  await app.register(rateLimit, {
    global: true,
    max: configuration.environment === 'test' ? 1_000 : 100,
    timeWindow: '1 minute',
  });
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

  const leadError = (
    error: LeadRegistryFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) => {
    const status =
      error.code === 'UNAUTHENTICATED'
        ? 401
        : error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'STALE_VERSION' || error.code === 'IDEMPOTENCY_CONFLICT'
            ? 409
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
  const leadUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'LEAD_REGISTRY_NOT_CONFIGURED',
          message: 'Lead Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const leadTenant = customerTenant;
  const leadSchema = {
    ...customerRouteSchema,
    headers: {
      type: 'object',
      required: ['authorization', 'x-acs-tenant-id'],
      properties: {
        authorization: { type: 'string' },
        'x-acs-tenant-id': { type: 'string', format: 'uuid' },
        'idempotency-key': { type: 'string', format: 'uuid' },
      },
    },
  } as const;
  app.post(
    '/api/v1/commercial/leads',
    {
      schema: {
        ...leadSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['display_name'],
          properties: {
            display_name: { type: 'string', minLength: 1, maxLength: 160 },
            source: { type: ['string', 'null'], minLength: 1, maxLength: 80 },
            contact_name: { type: ['string', 'null'], minLength: 1, maxLength: 160 },
            contact_email: { type: ['string', 'null'], format: 'email', maxLength: 254 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!leadRegistryService) return leadUnavailable(request, reply);
      const tenant = leadTenant(request);
      const key = request.headers['idempotency-key'];
      const body = leadCreateSchema.safeParse(request.body);
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
              message: 'Valid tenant, idempotency key and lead are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return leadEnvelopeSchema.parse(
          await leadRegistryService.create(
            request.headers.authorization,
            tenant.data,
            key,
            body.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof LeadRegistryFailure) return leadError(error, request, reply);
        throw error;
      }
    },
  );
  app.get(
    '/api/v1/commercial/leads',
    {
      schema: {
        ...leadSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            cursor: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!leadRegistryService) return leadUnavailable(request, reply);
      const tenant = leadTenant(request);
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
              message: 'Valid tenant and pagination are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return leadListEnvelopeSchema.parse(
          await leadRegistryService.list(
            request.headers.authorization,
            tenant.data,
            query.data.limit,
            query.data.cursor,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof LeadRegistryFailure) return leadError(error, request, reply);
        throw error;
      }
    },
  );
  app.get(
    '/api/v1/commercial/leads/:leadId',
    {
      schema: {
        ...leadSchema,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['leadId'],
          properties: { leadId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      if (!leadRegistryService) return leadUnavailable(request, reply);
      const tenant = leadTenant(request);
      const leadId = uuidSchema.safeParse((request.params as { leadId?: string }).leadId);
      if (tenant?.success !== true || !leadId.success)
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Valid tenant and lead are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return leadEnvelopeSchema.parse(
          await leadRegistryService.get(
            request.headers.authorization,
            tenant.data,
            leadId.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof LeadRegistryFailure) return leadError(error, request, reply);
        throw error;
      }
    },
  );
  app.patch(
    '/api/v1/commercial/leads/:leadId',
    {
      schema: {
        ...leadSchema,
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['leadId'],
          properties: { leadId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['expected_version'],
          properties: {
            display_name: { type: 'string', minLength: 1, maxLength: 160 },
            source: { type: ['string', 'null'], minLength: 1, maxLength: 80 },
            contact_name: { type: ['string', 'null'], minLength: 1, maxLength: 160 },
            contact_email: { type: ['string', 'null'], format: 'email', maxLength: 254 },
            status: { type: 'string', enum: ['NEW', 'QUALIFIED', 'DISQUALIFIED'] },
            expected_version: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!leadRegistryService) return leadUnavailable(request, reply);
      const tenant = leadTenant(request);
      const key = request.headers['idempotency-key'];
      const leadId = uuidSchema.safeParse((request.params as { leadId?: string }).leadId);
      const body = leadUpdateSchema.safeParse(request.body);
      if (
        tenant?.success !== true ||
        !leadId.success ||
        typeof key !== 'string' ||
        !uuidSchema.safeParse(key).success ||
        !body.success
      )
        return reply.status(400).send(
          errorEnvelopeSchema.parse({
            error: {
              code: 'INVALID_REQUEST',
              message: 'Valid tenant, lead, idempotency key and update are required.',
              request_id: request.id,
              correlation_id: request.correlationId,
            },
          }),
        );
      try {
        return leadEnvelopeSchema.parse(
          await leadRegistryService.update(
            request.headers.authorization,
            tenant.data,
            leadId.data,
            key,
            body.data,
            metadata(request),
          ),
        );
      } catch (error) {
        if (error instanceof LeadRegistryFailure) return leadError(error, request, reply);
        throw error;
      }
    },
  );

  const planError = (
    error: PlanCatalogFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'STALE_VERSION' || error.code === 'IDEMPOTENCY_CONFLICT'
              ? 409
              : error.code === 'PLAN_INACTIVE'
                ? 422
                : 403,
      )
      .send(
        errorEnvelopeSchema.parse({
          error: {
            code: error.code,
            message: error.message,
            request_id: request.id,
            correlation_id: request.correlationId,
          },
        }),
      );
  const planUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'PLAN_CATALOG_NOT_CONFIGURED',
          message: 'Plan Catalog dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const planInput = (request: { headers: Record<string, unknown> }) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const planKey = (request: { headers: Record<string, unknown> }) => {
    const key = request.headers['idempotency-key'];
    return typeof key === 'string' && uuidSchema.safeParse(key).success ? key : null;
  };
  const planParam = (request: { params: unknown }, key: string) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>)[key]
        : undefined,
    );
  const invalidPlan = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(400).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Valid tenant, identifiers, request body and idempotency key are required.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  app.post('/api/v1/commercial/plans', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      key = planKey(request),
      body = planCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidPlan(request, reply);
    try {
      return planEnvelopeSchema.parse(
        await planCatalogService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/plans', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !q.success) return invalidPlan(request, reply);
    try {
      return planListEnvelopeSchema.parse(
        await planCatalogService.list(
          request.headers.authorization,
          tenant.data,
          q.data.limit,
          q.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/plans/:planId', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      id = planParam(request, 'planId');
    if (!tenant.success || !id.success) return invalidPlan(request, reply);
    try {
      return planEnvelopeSchema.parse(
        await planCatalogService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/plans/:planId', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      id = planParam(request, 'planId'),
      key = planKey(request),
      body = planUpdateSchema.safeParse(request.body);
    if (!tenant.success || !id.success || !key || !body.success) return invalidPlan(request, reply);
    try {
      return planEnvelopeSchema.parse(
        await planCatalogService.update(
          request.headers.authorization,
          tenant.data,
          id.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.post('/api/v1/commercial/plans/:planId/features', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      id = planParam(request, 'planId'),
      key = planKey(request),
      body = planFeatureCreateSchema.safeParse(request.body);
    if (!tenant.success || !id.success || !key || !body.success) return invalidPlan(request, reply);
    try {
      return planFeatureEnvelopeSchema.parse(
        await planCatalogService.createFeature(
          request.headers.authorization,
          tenant.data,
          id.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/plans/:planId/features', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      id = planParam(request, 'planId'),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !id.success || !q.success) return invalidPlan(request, reply);
    try {
      return planFeatureListEnvelopeSchema.parse(
        await planCatalogService.listFeatures(
          request.headers.authorization,
          tenant.data,
          id.data,
          q.data.limit,
          q.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/plans/:planId/features/:featureId', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      planId = planParam(request, 'planId'),
      featureId = planParam(request, 'featureId');
    if (!tenant.success || !planId.success || !featureId.success)
      return invalidPlan(request, reply);
    try {
      return planFeatureEnvelopeSchema.parse(
        await planCatalogService.getFeature(
          request.headers.authorization,
          tenant.data,
          planId.data,
          featureId.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/plans/:planId/features/:featureId', async (request, reply) => {
    if (!planCatalogService) return planUnavailable(request, reply);
    const tenant = planInput(request),
      planId = planParam(request, 'planId'),
      featureId = planParam(request, 'featureId'),
      key = planKey(request),
      body = planFeatureUpdateSchema.safeParse(request.body);
    if (!tenant.success || !planId.success || !featureId.success || !key || !body.success)
      return invalidPlan(request, reply);
    try {
      return planFeatureEnvelopeSchema.parse(
        await planCatalogService.updateFeature(
          request.headers.authorization,
          tenant.data,
          planId.data,
          featureId.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PlanCatalogFailure) return planError(error, request, reply);
      throw error;
    }
  });

  const partnerError = (
    error: PartnerRegistryFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'STALE_VERSION' ||
                error.code === 'IDEMPOTENCY_CONFLICT' ||
                error.code === 'DUPLICATE_PARTNER_CODE'
              ? 409
              : 403,
      )
      .send(
        errorEnvelopeSchema.parse({
          error: {
            code: error.code,
            message: error.message,
            request_id: request.id,
            correlation_id: request.correlationId,
          },
        }),
      );
  const partnerUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'PARTNER_REGISTRY_NOT_CONFIGURED',
          message: 'Partner Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const partnerInput = (request: { headers: Record<string, unknown> }) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const partnerKey = (request: { headers: Record<string, unknown> }) => {
    const key = request.headers['idempotency-key'];
    return typeof key === 'string' && uuidSchema.safeParse(key).success ? key : null;
  };
  const partnerParam = (request: { params: unknown }) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).partnerId
        : undefined,
    );
  const invalidPartner = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(400).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Valid tenant, identifiers, request body and idempotency key are required.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  app.post('/api/v1/commercial/partners', async (request, reply) => {
    if (!partnerRegistryService) return partnerUnavailable(request, reply);
    const tenant = partnerInput(request),
      key = partnerKey(request),
      body = partnerCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidPartner(request, reply);
    try {
      return partnerEnvelopeSchema.parse(
        await partnerRegistryService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PartnerRegistryFailure) return partnerError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/partners', async (request, reply) => {
    if (!partnerRegistryService) return partnerUnavailable(request, reply);
    const tenant = partnerInput(request),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !q.success) return invalidPartner(request, reply);
    try {
      return partnerListEnvelopeSchema.parse(
        await partnerRegistryService.list(
          request.headers.authorization,
          tenant.data,
          q.data.limit,
          q.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PartnerRegistryFailure) return partnerError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/partners/:partnerId', async (request, reply) => {
    if (!partnerRegistryService) return partnerUnavailable(request, reply);
    const tenant = partnerInput(request),
      id = partnerParam(request);
    if (!tenant.success || !id.success) return invalidPartner(request, reply);
    try {
      return partnerEnvelopeSchema.parse(
        await partnerRegistryService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PartnerRegistryFailure) return partnerError(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/partners/:partnerId', async (request, reply) => {
    if (!partnerRegistryService) return partnerUnavailable(request, reply);
    const tenant = partnerInput(request),
      id = partnerParam(request),
      key = partnerKey(request),
      body = partnerUpdateSchema.safeParse(request.body);
    if (!tenant.success || !id.success || !key || !body.success)
      return invalidPartner(request, reply);
    try {
      return partnerEnvelopeSchema.parse(
        await partnerRegistryService.update(
          request.headers.authorization,
          tenant.data,
          id.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof PartnerRegistryFailure) return partnerError(error, request, reply);
      throw error;
    }
  });

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
