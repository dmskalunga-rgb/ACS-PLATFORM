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
  opportunityCreateSchema,
  opportunityEnvelopeSchema,
  opportunityListEnvelopeSchema,
  opportunityUpdateSchema,
  proposalAssignSchema,
  proposalCreateSchema,
  proposalEnvelopeSchema,
  proposalLineCreateSchema,
  proposalLineUpdateSchema,
  proposalListEnvelopeSchema,
  proposalTransitionSchema,
  proposalUpdateSchema,
  contractAssignSchema,
  contractCreateSchema,
  contractEnvelopeSchema,
  contractLineCreateSchema,
  contractLineUpdateSchema,
  contractListEnvelopeSchema,
  contractTransitionSchema,
  contractUpdateSchema,
  subscriptionAssignSchema,
  subscriptionCreateSchema,
  subscriptionEnvelopeSchema,
  subscriptionListEnvelopeSchema,
  subscriptionRenewSchema,
  subscriptionTransitionSchema,
  subscriptionUpdateSchema,
  entitlementAssignSchema,
  entitlementCreateSchema,
  entitlementEnvelopeSchema,
  entitlementListEnvelopeSchema,
  entitlementTransitionSchema,
  entitlementUpdateSchema,
  machineMeasurementIngestSchema,
  measurementCorrectionCreateSchema,
  measurementSourceCreateSchema,
  ratePlanCreateSchema,
  ratePlanDraftUpdateSchema,
  ratingApplicabilityCreateSchema,
  rerateSchema,
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
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
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
import { PostgresOpportunityRegistryRepository } from './postgres-opportunity-registry.js';
import { PostgresProposalRegistryRepository } from './postgres-proposal-registry.js';
import { PostgresContractRegistryRepository } from './postgres-contract-registry.js';
import { PostgresSubscriptionRegistryRepository } from './postgres-subscription-registry.js';
import { PostgresEntitlementRegistryRepository } from './postgres-entitlement-registry.js';
import { PostgresUsageMeteringRepository } from './postgres-usage-metering.js';
import { PostgresRatingRepository } from './postgres-rating.js';
import { CustomerRegistryFailure, CustomerRegistryService } from './customer-registry.js';
import { LeadRegistryFailure, LeadRegistryService } from './lead-registry.js';
import { PlanCatalogFailure, PlanCatalogService } from './plan-catalog.js';
import { PartnerRegistryFailure, PartnerRegistryService } from './partner-registry.js';
import { OpportunityRegistryFailure, OpportunityRegistryService } from './opportunity-registry.js';
import {
  ProposalRegistryFailure,
  ProposalRegistryService,
  PROPOSAL_ACCEPT,
  PROPOSAL_APPROVE,
  PROPOSAL_CANCEL,
  PROPOSAL_EXPIRE,
  PROPOSAL_REJECT,
  PROPOSAL_REVISE,
  PROPOSAL_SEND,
} from './proposal-registry.js';
import {
  CONTRACT_ACTIVATE,
  CONTRACT_APPROVE,
  CONTRACT_CANCEL,
  CONTRACT_REVISE,
  CONTRACT_TERMINATE,
  ContractRegistryFailure,
  ContractRegistryService,
} from './contract-registry.js';
import {
  emitContractReviseDiagnostic,
  emitFastifyContractReviseDiagnostic,
} from './contract-revise-diagnostic.js';
import {
  SUBSCRIPTION_ACTIVATE,
  SUBSCRIPTION_CANCEL,
  SUBSCRIPTION_REQUEST_ACTIVATION,
  SUBSCRIPTION_RESUME,
  SUBSCRIPTION_SUSPEND,
  SUBSCRIPTION_TERMINATE,
  SubscriptionRegistryFailure,
  SubscriptionRegistryService,
} from './subscription-registry.js';
import {
  ENTITLEMENT_ACTIVATE,
  ENTITLEMENT_CANCEL,
  ENTITLEMENT_REQUEST_ACTIVATION,
  ENTITLEMENT_RESUME,
  ENTITLEMENT_SUSPEND,
  ENTITLEMENT_TERMINATE,
  EntitlementRegistryFailure,
  EntitlementRegistryService,
} from './entitlement-registry.js';
import {
  MachineUsageIngestionService,
  UsageMeteringFailure,
  UsageMeteringService,
} from './usage-metering.js';
import { RatingFailure, RatingService } from './rating.js';
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
    readonly opportunityRegistryService?: OpportunityRegistryService;
    readonly proposalRegistryService?: ProposalRegistryService;
    readonly contractRegistryService?: ContractRegistryService;
    readonly subscriptionRegistryService?: SubscriptionRegistryService;
    readonly entitlementRegistryService?: EntitlementRegistryService;
    readonly usageMeteringService?: UsageMeteringService;
    readonly machineUsageIngestionService?: MachineUsageIngestionService;
    readonly ratingService?: RatingService;
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
  let opportunityRepository: PostgresOpportunityRegistryRepository | undefined;
  let opportunityRegistryService = options.opportunityRegistryService;
  let proposalRepository: PostgresProposalRegistryRepository | undefined;
  let proposalRegistryService = options.proposalRegistryService;
  let contractRepository: PostgresContractRegistryRepository | undefined;
  let contractRegistryService = options.contractRegistryService;
  let subscriptionRepository: PostgresSubscriptionRegistryRepository | undefined;
  let subscriptionRegistryService = options.subscriptionRegistryService;
  let entitlementRepository: PostgresEntitlementRegistryRepository | undefined;
  let entitlementRegistryService = options.entitlementRegistryService;
  let usageMeteringRepository: PostgresUsageMeteringRepository | undefined;
  let usageMeteringService = options.usageMeteringService;
  let machineUsageIngestionService = options.machineUsageIngestionService;
  let ratingRepository: PostgresRatingRepository | undefined;
  let ratingService = options.ratingService;
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
    if (configuration.opportunityDatabaseUrl !== undefined) {
      opportunityRepository = new PostgresOpportunityRegistryRepository(
        configuration.opportunityDatabaseUrl,
      );
      opportunityRegistryService = new OpportunityRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        opportunityRepository,
        securityAuditRepository,
      );
    }
    if (configuration.proposalDatabaseUrl !== undefined) {
      proposalRepository = new PostgresProposalRegistryRepository(
        configuration.proposalDatabaseUrl,
      );
      proposalRegistryService = new ProposalRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        proposalRepository,
        securityAuditRepository,
      );
    }
    if (configuration.contractDatabaseUrl !== undefined) {
      contractRepository = new PostgresContractRegistryRepository(
        configuration.contractDatabaseUrl,
      );
      contractRegistryService = new ContractRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        contractRepository,
        securityAuditRepository,
      );
    }
    if (configuration.subscriptionDatabaseUrl !== undefined) {
      subscriptionRepository = new PostgresSubscriptionRegistryRepository(
        configuration.subscriptionDatabaseUrl,
      );
      subscriptionRegistryService = new SubscriptionRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        subscriptionRepository,
        securityAuditRepository,
      );
    }
    if (configuration.entitlementDatabaseUrl !== undefined) {
      entitlementRepository = new PostgresEntitlementRegistryRepository(
        configuration.entitlementDatabaseUrl,
      );
      entitlementRegistryService = new EntitlementRegistryService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        entitlementRepository,
        securityAuditRepository,
      );
    }
    if (
      configuration.usageMeteringDatabaseUrl !== undefined &&
      configuration.machineContextIssuerDatabaseUrl !== undefined
    ) {
      usageMeteringRepository = new PostgresUsageMeteringRepository(
        configuration.usageMeteringDatabaseUrl,
        configuration.machineContextIssuerDatabaseUrl,
      );
      usageMeteringService = new UsageMeteringService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        usageMeteringRepository,
        securityAuditRepository,
      );
      machineUsageIngestionService = new MachineUsageIngestionService(usageMeteringRepository);
    }
    if (configuration.ratingDatabaseUrl !== undefined) {
      ratingRepository = new PostgresRatingRepository(configuration.ratingDatabaseUrl);
      ratingService = new RatingService(
        identity,
        new RepositoryAuthorizationPort(postgresRepository),
        postgresRepository,
        ratingRepository,
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
        opportunityRepository?.close(),
        proposalRepository?.close(),
        contractRepository?.close(),
        subscriptionRepository?.close(),
        entitlementRepository?.close(),
        usageMeteringRepository?.close(),
        ratingRepository?.close(),
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
    emitFastifyContractReviseDiagnostic('ON_REQUEST', 'success');
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

  const opportunityError = (
    error: OpportunityRegistryFailure,
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
                error.code === 'DUPLICATE_OPPORTUNITY_CODE' ||
                error.code === 'INVALID_TRANSITION' ||
                error.code === 'TERMINAL_OPPORTUNITY'
              ? 409
              : error.code === 'INVALID_REFERENCE'
                ? 400
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
  const opportunityUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'OPPORTUNITY_REGISTRY_NOT_CONFIGURED',
          message: 'Opportunity Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const opportunityInput = (request: { headers: Record<string, unknown> }) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const opportunityKey = (request: { headers: Record<string, unknown> }) => {
    const key = request.headers['idempotency-key'];
    return typeof key === 'string' && uuidSchema.safeParse(key).success ? key : null;
  };
  const opportunityParam = (request: { params: unknown }) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).opportunityId
        : undefined,
    );
  const invalidOpportunity = (
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
  app.post('/api/v1/commercial/opportunities', async (request, reply) => {
    if (!opportunityRegistryService) return opportunityUnavailable(request, reply);
    const tenant = opportunityInput(request),
      key = opportunityKey(request),
      body = opportunityCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidOpportunity(request, reply);
    try {
      return opportunityEnvelopeSchema.parse(
        await opportunityRegistryService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof OpportunityRegistryFailure)
        return opportunityError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/opportunities', async (request, reply) => {
    if (!opportunityRegistryService) return opportunityUnavailable(request, reply);
    const tenant = opportunityInput(request),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !q.success) return invalidOpportunity(request, reply);
    try {
      return opportunityListEnvelopeSchema.parse(
        await opportunityRegistryService.list(
          request.headers.authorization,
          tenant.data,
          q.data.limit,
          q.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof OpportunityRegistryFailure)
        return opportunityError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/opportunities/:opportunityId', async (request, reply) => {
    if (!opportunityRegistryService) return opportunityUnavailable(request, reply);
    const tenant = opportunityInput(request),
      id = opportunityParam(request);
    if (!tenant.success || !id.success) return invalidOpportunity(request, reply);
    try {
      return opportunityEnvelopeSchema.parse(
        await opportunityRegistryService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof OpportunityRegistryFailure)
        return opportunityError(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/opportunities/:opportunityId', async (request, reply) => {
    if (!opportunityRegistryService) return opportunityUnavailable(request, reply);
    const tenant = opportunityInput(request),
      id = opportunityParam(request),
      key = opportunityKey(request),
      body = opportunityUpdateSchema.safeParse(request.body);
    if (!tenant.success || !id.success || !key || !body.success)
      return invalidOpportunity(request, reply);
    try {
      return opportunityEnvelopeSchema.parse(
        await opportunityRegistryService.update(
          request.headers.authorization,
          tenant.data,
          id.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof OpportunityRegistryFailure)
        return opportunityError(error, request, reply);
      throw error;
    }
  });

  const proposalError = (
    error: ProposalRegistryFailure,
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND' || error.code === 'INVALID_REFERENCE'
            ? 404
            : ['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'DUPLICATE_PROPOSAL_CODE'].includes(
                  error.code,
                )
              ? 409
              : ['INVALID_TRANSITION', 'TERMINAL_PROPOSAL', 'INVALID_VALUE'].includes(error.code)
                ? 400
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
  const proposalUnavailable = (
    request: { id: string; correlationId: string },
    reply: { status(code: number): { send(value: unknown): unknown } },
  ) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'PROPOSAL_REGISTRY_NOT_CONFIGURED',
          message: 'Proposal Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const proposalTenant = (request: { headers: Record<string, unknown> }) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const proposalKey = (request: { headers: Record<string, unknown> }) => {
    const key = request.headers['idempotency-key'];
    return typeof key === 'string' && uuidSchema.safeParse(key).success ? key : null;
  };
  const proposalId = (request: { params: unknown }) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).proposalId
        : undefined,
    );
  const proposalLineId = (request: { params: unknown }) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).lineId
        : undefined,
    );
  const invalidProposal = (
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
  const proposalRoute = async <TBody>(
    request: FastifyRequest,
    reply: FastifyReply,
    body: ZodType<TBody>,
    call: (
      service: ProposalRegistryService,
      tenant: string,
      id: string,
      key: string,
      value: TBody,
      lineId?: string,
    ) => Promise<unknown>,
    line = false,
  ) => {
    if (!proposalRegistryService) return proposalUnavailable(request, reply);
    const tenant = proposalTenant(request);
    const id = proposalId(request);
    const key = proposalKey(request);
    const parsed = body.safeParse(request.body);
    const parsedLineId = line ? proposalLineId(request) : undefined;
    if (
      !tenant.success ||
      !id.success ||
      !key ||
      !parsed.success ||
      (parsedLineId !== undefined && !parsedLineId.success)
    )
      return invalidProposal(request, reply);
    const lineId = parsedLineId?.success === true ? parsedLineId.data : undefined;
    try {
      return proposalEnvelopeSchema.parse(
        await call(proposalRegistryService, tenant.data, id.data, key, parsed.data, lineId),
      );
    } catch (error) {
      if (error instanceof ProposalRegistryFailure) return proposalError(error, request, reply);
      throw error;
    }
  };
  app.post('/api/v1/commercial/proposals', async (request, reply) => {
    if (!proposalRegistryService) return proposalUnavailable(request, reply);
    const tenant = proposalTenant(request),
      key = proposalKey(request),
      body = proposalCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidProposal(request, reply);
    try {
      return proposalEnvelopeSchema.parse(
        await proposalRegistryService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ProposalRegistryFailure) return proposalError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/proposals', async (request, reply) => {
    if (!proposalRegistryService) return proposalUnavailable(request, reply);
    const tenant = proposalTenant(request),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !q.success) return invalidProposal(request, reply);
    try {
      return proposalListEnvelopeSchema.parse(
        await proposalRegistryService.list(
          request.headers.authorization,
          tenant.data,
          q.data.limit,
          q.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ProposalRegistryFailure) return proposalError(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/proposals/:proposalId', async (request, reply) => {
    if (!proposalRegistryService) return proposalUnavailable(request, reply);
    const tenant = proposalTenant(request),
      id = proposalId(request);
    if (!tenant.success || !id.success) return invalidProposal(request, reply);
    try {
      return proposalEnvelopeSchema.parse(
        await proposalRegistryService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ProposalRegistryFailure) return proposalError(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/proposals/:proposalId', async (request, reply) =>
    proposalRoute(request, reply, proposalUpdateSchema, (s, t, id, k, v) =>
      s.update(request.headers.authorization, t, id, k, v, metadata(request)),
    ),
  );
  app.post('/api/v1/commercial/proposals/:proposalId/assign', async (request, reply) =>
    proposalRoute(request, reply, proposalAssignSchema, (s, t, id, k, v) =>
      s.assign(request.headers.authorization, t, id, k, v, metadata(request)),
    ),
  );
  app.post('/api/v1/commercial/proposals/:proposalId/lines', async (request, reply) =>
    proposalRoute(request, reply, proposalLineCreateSchema, (s, t, id, k, v) =>
      s.line(request.headers.authorization, t, id, undefined, k, 'create', v, metadata(request)),
    ),
  );
  app.patch('/api/v1/commercial/proposals/:proposalId/lines/:lineId', async (request, reply) =>
    proposalRoute(
      request,
      reply,
      proposalLineUpdateSchema,
      (s, t, id, k, v, lineId) =>
        s.line(request.headers.authorization, t, id, lineId, k, 'update', v, metadata(request)),
      true,
    ),
  );
  app.delete('/api/v1/commercial/proposals/:proposalId/lines/:lineId', async (request, reply) =>
    proposalRoute(
      request,
      reply,
      proposalTransitionSchema,
      (s, t, id, k, v, lineId) =>
        s.line(request.headers.authorization, t, id, lineId, k, 'delete', v, metadata(request)),
      true,
    ),
  );
  for (const [path, transition, action] of [
    ['submit', 'submit', 'commercial.proposal.update'],
    ['return-to-draft', 'return-to-draft', PROPOSAL_APPROVE],
    ['approve', 'approve', PROPOSAL_APPROVE],
    ['revise', 'revise', PROPOSAL_REVISE],
    ['send', 'send', PROPOSAL_SEND],
    ['accept', 'accept', PROPOSAL_ACCEPT],
    ['reject', 'reject', PROPOSAL_REJECT],
    ['cancel', 'cancel', PROPOSAL_CANCEL],
    ['expire', 'expire', PROPOSAL_EXPIRE],
  ] as const)
    app.post(`/api/v1/commercial/proposals/:proposalId/${path}`, async (request, reply) =>
      proposalRoute(request, reply, proposalTransitionSchema, (s, t, id, k, v) =>
        s.transition(
          request.headers.authorization,
          t,
          id,
          k,
          transition,
          action,
          v,
          metadata(request),
        ),
      ),
    );

  const contractFailure = (
    error: ContractRegistryFailure,
    request: FastifyRequest,
    reply: FastifyReply,
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : ['DUPLICATE_CONTRACT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT'].includes(error.code)
              ? 409
              : [
                    'INVALID_REFERENCE',
                    'INVALID_TRANSITION',
                    'TERMINAL_CONTRACT',
                    'INVALID_VALUE',
                  ].includes(error.code)
                ? 400
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
  const contractUnavailable = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'CONTRACT_REGISTRY_NOT_CONFIGURED',
          message: 'Contract Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const contractTenant = (request: FastifyRequest) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const contractKey = (request: FastifyRequest) =>
    typeof request.headers['idempotency-key'] === 'string' &&
    uuidSchema.safeParse(request.headers['idempotency-key']).success
      ? request.headers['idempotency-key']
      : null;
  const contractId = (request: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).contractId
        : undefined,
    );
  const contractLineId = (request: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).lineId
        : undefined,
    );
  const invalidContract = (request: FastifyRequest, reply: FastifyReply) =>
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
  const contractRoute = async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    schema: ZodType<T>,
    call: (
      service: ContractRegistryService,
      tenant: string,
      id: string,
      key: string,
      value: T,
      lineId?: string,
    ) => Promise<unknown>,
    line = false,
  ) => {
    emitContractReviseDiagnostic('HTTP_HANDLER', 'enter');
    if (!contractRegistryService) return contractUnavailable(request, reply);
    const tenant = contractTenant(request),
      id = contractId(request),
      key = contractKey(request),
      body = schema.safeParse(request.body),
      parsedLine = line ? contractLineId(request) : undefined;
    if (
      !tenant.success ||
      !id.success ||
      !key ||
      !body.success ||
      (parsedLine && !parsedLine.success)
    )
      return invalidContract(request, reply);
    try {
      const envelope = contractEnvelopeSchema.parse(
        await call(
          contractRegistryService,
          tenant.data,
          id.data,
          key,
          body.data,
          parsedLine?.success ? parsedLine.data : undefined,
        ),
      );
      emitContractReviseDiagnostic('HTTP_HANDLER', 'success', { httpStatus: 200 });
      return envelope;
    } catch (error) {
      emitContractReviseDiagnostic('HTTP_HANDLER', 'failure', { error });
      if (error instanceof ContractRegistryFailure) return contractFailure(error, request, reply);
      throw error;
    }
  };
  app.post('/api/v1/commercial/contracts', async (request, reply) => {
    if (!contractRegistryService) return contractUnavailable(request, reply);
    const tenant = contractTenant(request),
      key = contractKey(request),
      body = contractCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidContract(request, reply);
    try {
      return contractEnvelopeSchema.parse(
        await contractRegistryService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ContractRegistryFailure) return contractFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/contracts', async (request, reply) => {
    if (!contractRegistryService) return contractUnavailable(request, reply);
    const tenant = contractTenant(request),
      query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: z.uuid().optional(),
        })
        .strict()
        .safeParse(request.query);
    if (!tenant.success || !query.success) return invalidContract(request, reply);
    try {
      return contractListEnvelopeSchema.parse(
        await contractRegistryService.list(
          request.headers.authorization,
          tenant.data,
          query.data.limit,
          query.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ContractRegistryFailure) return contractFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/contracts/:contractId', async (request, reply) => {
    if (!contractRegistryService) return contractUnavailable(request, reply);
    const tenant = contractTenant(request),
      id = contractId(request);
    if (!tenant.success || !id.success) return invalidContract(request, reply);
    try {
      return contractEnvelopeSchema.parse(
        await contractRegistryService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof ContractRegistryFailure) return contractFailure(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/contracts/:contractId', async (request, reply) =>
    contractRoute(request, reply, contractUpdateSchema, (s, t, id, key, v) =>
      s.update(request.headers.authorization, t, id, key, v, metadata(request)),
    ),
  );
  app.post('/api/v1/commercial/contracts/:contractId/assign', async (request, reply) =>
    contractRoute(request, reply, contractAssignSchema, (s, t, id, key, v) =>
      s.assign(request.headers.authorization, t, id, key, v, metadata(request)),
    ),
  );
  app.post('/api/v1/commercial/contracts/:contractId/lines', async (request, reply) =>
    contractRoute(request, reply, contractLineCreateSchema, (s, t, id, key, v) =>
      s.line(request.headers.authorization, t, id, undefined, key, 'create', v, metadata(request)),
    ),
  );
  app.patch('/api/v1/commercial/contracts/:contractId/lines/:lineId', async (request, reply) =>
    contractRoute(
      request,
      reply,
      contractLineUpdateSchema,
      (s, t, id, key, v, lineId) =>
        s.line(request.headers.authorization, t, id, lineId, key, 'update', v, metadata(request)),
      true,
    ),
  );
  app.delete('/api/v1/commercial/contracts/:contractId/lines/:lineId', async (request, reply) =>
    contractRoute(
      request,
      reply,
      contractTransitionSchema,
      (s, t, id, key, v, lineId) =>
        s.line(request.headers.authorization, t, id, lineId, key, 'delete', v, metadata(request)),
      true,
    ),
  );
  for (const [path, transition, action] of [
    ['submit', 'submit', 'commercial.contract.update'],
    ['return-to-draft', 'return-to-draft', CONTRACT_APPROVE],
    ['approve', 'approve', CONTRACT_APPROVE],
    ['revise', 'revise', CONTRACT_REVISE],
    ['activate', 'activate', CONTRACT_ACTIVATE],
    ['cancel', 'cancel', CONTRACT_CANCEL],
    ['terminate', 'terminate', CONTRACT_TERMINATE],
  ] as const)
    app.post(`/api/v1/commercial/contracts/:contractId/${path}`, async (request, reply) =>
      contractRoute(request, reply, contractTransitionSchema, (s, t, id, key, v) =>
        s.transition(
          request.headers.authorization,
          t,
          id,
          key,
          transition,
          action,
          v,
          metadata(request),
        ),
      ),
    );

  const subscriptionFailure = (
    error: SubscriptionRegistryFailure,
    request: FastifyRequest,
    reply: FastifyReply,
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : ['DUPLICATE_SUBSCRIPTION', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT'].includes(
                  error.code,
                )
              ? 409
              : [
                    'INVALID_REFERENCE',
                    'INVALID_TRANSITION',
                    'TERMINAL_SUBSCRIPTION',
                    'INVALID_VALUE',
                  ].includes(error.code)
                ? 400
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
  const subscriptionUnavailable = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'SUBSCRIPTION_REGISTRY_NOT_CONFIGURED',
          message: 'Subscription Registry dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const subscriptionTenant = (request: FastifyRequest) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const subscriptionKey = (request: FastifyRequest) =>
    typeof request.headers['idempotency-key'] === 'string' &&
    uuidSchema.safeParse(request.headers['idempotency-key']).success
      ? request.headers['idempotency-key']
      : null;
  const subscriptionId = (request: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).subscriptionId
        : undefined,
    );
  const invalidSubscription = (request: FastifyRequest, reply: FastifyReply) =>
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
  const subscriptionRoute = async <T>(
    request: FastifyRequest,
    reply: FastifyReply,
    schema: ZodType<T>,
    call: (
      service: SubscriptionRegistryService,
      tenant: string,
      id: string,
      key: string,
      value: T,
    ) => Promise<unknown>,
  ) => {
    if (!subscriptionRegistryService) return subscriptionUnavailable(request, reply);
    const tenant = subscriptionTenant(request);
    const id = subscriptionId(request);
    const key = subscriptionKey(request);
    const body = schema.safeParse(request.body);
    if (!tenant.success || !id.success || !key || !body.success)
      return invalidSubscription(request, reply);
    try {
      return subscriptionEnvelopeSchema.parse(
        await call(subscriptionRegistryService, tenant.data, id.data, key, body.data),
      );
    } catch (error) {
      if (error instanceof SubscriptionRegistryFailure)
        return subscriptionFailure(error, request, reply);
      throw error;
    }
  };
  app.post('/api/v1/commercial/subscriptions', async (request, reply) => {
    if (!subscriptionRegistryService) return subscriptionUnavailable(request, reply);
    const tenant = subscriptionTenant(request);
    const key = subscriptionKey(request);
    const body = subscriptionCreateSchema.safeParse(request.body);
    if (!tenant.success || !key || !body.success) return invalidSubscription(request, reply);
    try {
      return subscriptionEnvelopeSchema.parse(
        await subscriptionRegistryService.create(
          request.headers.authorization,
          tenant.data,
          key,
          body.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof SubscriptionRegistryFailure)
        return subscriptionFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/subscriptions', async (request, reply) => {
    if (!subscriptionRegistryService) return subscriptionUnavailable(request, reply);
    const tenant = subscriptionTenant(request);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        cursor: z.uuid().optional(),
      })
      .strict()
      .safeParse(request.query);
    if (!tenant.success || !query.success) return invalidSubscription(request, reply);
    try {
      return subscriptionListEnvelopeSchema.parse(
        await subscriptionRegistryService.list(
          request.headers.authorization,
          tenant.data,
          query.data.limit,
          query.data.cursor,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof SubscriptionRegistryFailure)
        return subscriptionFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/subscriptions/:subscriptionId', async (request, reply) => {
    if (!subscriptionRegistryService) return subscriptionUnavailable(request, reply);
    const tenant = subscriptionTenant(request);
    const id = subscriptionId(request);
    if (!tenant.success || !id.success) return invalidSubscription(request, reply);
    try {
      return subscriptionEnvelopeSchema.parse(
        await subscriptionRegistryService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
      );
    } catch (error) {
      if (error instanceof SubscriptionRegistryFailure)
        return subscriptionFailure(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/subscriptions/:subscriptionId', async (request, reply) =>
    subscriptionRoute(request, reply, subscriptionUpdateSchema, (service, tenant, id, key, value) =>
      service.update(request.headers.authorization, tenant, id, key, value, metadata(request)),
    ),
  );
  app.post('/api/v1/commercial/subscriptions/:subscriptionId/assign', async (request, reply) =>
    subscriptionRoute(request, reply, subscriptionAssignSchema, (service, tenant, id, key, value) =>
      service.assign(request.headers.authorization, tenant, id, key, value, metadata(request)),
    ),
  );
  for (const [path, transition, action] of [
    ['request-activation', 'request-activation', SUBSCRIPTION_REQUEST_ACTIVATION],
    ['activate', 'activate', SUBSCRIPTION_ACTIVATE],
    ['suspend', 'suspend', SUBSCRIPTION_SUSPEND],
    ['resume', 'resume', SUBSCRIPTION_RESUME],
    ['cancel', 'cancel', SUBSCRIPTION_CANCEL],
    ['terminate', 'terminate', SUBSCRIPTION_TERMINATE],
  ] as const)
    app.post(`/api/v1/commercial/subscriptions/:subscriptionId/${path}`, async (request, reply) =>
      subscriptionRoute(
        request,
        reply,
        subscriptionTransitionSchema,
        (service, tenant, id, key, value) =>
          service.transition(
            request.headers.authorization,
            tenant,
            id,
            key,
            transition,
            action,
            value,
            metadata(request),
          ),
      ),
    );
  app.post('/api/v1/commercial/subscriptions/:subscriptionId/renew', async (request, reply) =>
    subscriptionRoute(request, reply, subscriptionRenewSchema, (service, tenant, id, key, value) =>
      service.renew(request.headers.authorization, tenant, id, key, value, metadata(request)),
    ),
  );

  const entitlementFail = (
    e: EntitlementRegistryFailure,
    req: FastifyRequest,
    reply: FastifyReply,
  ) =>
    reply
      .status(
        e.code === 'UNAUTHENTICATED'
          ? 401
          : e.code === 'NOT_FOUND'
            ? 404
            : ['DUPLICATE_ENTITLEMENT', 'STALE_VERSION', 'IDEMPOTENCY_CONFLICT'].includes(e.code)
              ? 409
              : [
                    'INVALID_REFERENCE',
                    'INVALID_TRANSITION',
                    'TERMINAL_ENTITLEMENT',
                    'INVALID_VALUE',
                  ].includes(e.code)
                ? 400
                : 403,
      )
      .send(
        errorEnvelopeSchema.parse({
          error: {
            code: e.code,
            message: e.message,
            request_id: req.id,
            correlation_id: req.correlationId,
          },
        }),
      );
  const entitlementTenant = (r: FastifyRequest) => z.uuid().safeParse(r.headers['x-acs-tenant-id']);
  const entitlementId = (r: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof r.params === 'object' && r.params !== null
        ? (r.params as Record<string, unknown>).entitlementId
        : undefined,
    );
  const entitlementKey = (r: FastifyRequest) =>
    typeof r.headers['idempotency-key'] === 'string' &&
    uuidSchema.safeParse(r.headers['idempotency-key']).success
      ? r.headers['idempotency-key']
      : null;
  const entitlementUnavailable = (r: FastifyRequest, reply: FastifyReply) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'ENTITLEMENT_REGISTRY_NOT_CONFIGURED',
          message: 'Entitlement Registry dependencies are not configured.',
          request_id: r.id,
          correlation_id: r.correlationId,
        },
      }),
    );
  app.post('/api/v1/commercial/entitlements', async (r, reply) => {
    if (!entitlementRegistryService) return entitlementUnavailable(r, reply);
    const t = entitlementTenant(r),
      k = entitlementKey(r),
      b = entitlementCreateSchema.safeParse(r.body);
    if (!t.success || !k || !b.success) return reply.status(400).send();
    try {
      return entitlementEnvelopeSchema.parse(
        await entitlementRegistryService.create(
          r.headers.authorization,
          t.data,
          k,
          b.data,
          metadata(r),
        ),
      );
    } catch (e) {
      if (e instanceof EntitlementRegistryFailure) return entitlementFail(e, r, reply);
      throw e;
    }
  });
  app.get('/api/v1/commercial/entitlements', async (r, reply) => {
    if (!entitlementRegistryService) return entitlementUnavailable(r, reply);
    const t = entitlementTenant(r);
    if (!t.success) return reply.status(400).send();
    try {
      return entitlementListEnvelopeSchema.parse(
        await entitlementRegistryService.list(
          r.headers.authorization,
          t.data,
          25,
          undefined,
          metadata(r),
        ),
      );
    } catch (e) {
      if (e instanceof EntitlementRegistryFailure) return entitlementFail(e, r, reply);
      throw e;
    }
  });
  app.get('/api/v1/commercial/entitlements/:entitlementId', async (r, reply) => {
    if (!entitlementRegistryService) return entitlementUnavailable(r, reply);
    const t = entitlementTenant(r),
      id = entitlementId(r);
    if (!t.success || !id.success) return reply.status(400).send();
    try {
      return entitlementEnvelopeSchema.parse(
        await entitlementRegistryService.get(r.headers.authorization, t.data, id.data, metadata(r)),
      );
    } catch (e) {
      if (e instanceof EntitlementRegistryFailure) return entitlementFail(e, r, reply);
      throw e;
    }
  });
  const entitlementMutate = async <T>(
    r: FastifyRequest,
    reply: FastifyReply,
    schema: ZodType<T>,
    f: (id: string, key: string, value: T) => Promise<unknown>,
  ) => {
    if (!entitlementRegistryService) return entitlementUnavailable(r, reply);
    const t = entitlementTenant(r),
      id = entitlementId(r),
      k = entitlementKey(r),
      b = schema.safeParse(r.body);
    if (!t.success || !id.success || !k || !b.success) return reply.status(400).send();
    try {
      return entitlementEnvelopeSchema.parse(await f(id.data, k, b.data));
    } catch (e) {
      if (e instanceof EntitlementRegistryFailure) return entitlementFail(e, r, reply);
      throw e;
    }
  };
  app.patch('/api/v1/commercial/entitlements/:entitlementId', (r, reply) =>
    entitlementMutate(r, reply, entitlementUpdateSchema, (id, k, v) =>
      entitlementRegistryService!.update(
        r.headers.authorization,
        entitlementTenant(r).data!,
        id,
        k,
        v,
        metadata(r),
      ),
    ),
  );
  app.post('/api/v1/commercial/entitlements/:entitlementId/assign', (r, reply) =>
    entitlementMutate(r, reply, entitlementAssignSchema, (id, k, v) =>
      entitlementRegistryService!.assign(
        r.headers.authorization,
        entitlementTenant(r).data!,
        id,
        k,
        v,
        metadata(r),
      ),
    ),
  );
  for (const [path, transition, action] of [
    ['request-activation', 'request-activation', ENTITLEMENT_REQUEST_ACTIVATION],
    ['activate', 'activate', ENTITLEMENT_ACTIVATE],
    ['suspend', 'suspend', ENTITLEMENT_SUSPEND],
    ['resume', 'resume', ENTITLEMENT_RESUME],
    ['cancel', 'cancel', ENTITLEMENT_CANCEL],
    ['terminate', 'terminate', ENTITLEMENT_TERMINATE],
  ] as const)
    app.post(`/api/v1/commercial/entitlements/:entitlementId/${path}`, (r, reply) =>
      entitlementMutate(r, reply, entitlementTransitionSchema, (id, k, v) =>
        entitlementRegistryService!.transition(
          r.headers.authorization,
          entitlementTenant(r).data!,
          id,
          k,
          transition,
          action,
          v,
          metadata(r),
        ),
      ),
    );

  const usageFailure = (
    error: UsageMeteringFailure,
    request: FastifyRequest,
    reply: FastifyReply,
  ) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : ['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'SOURCE_EVENT_CONFLICT'].includes(
                  error.code,
                )
              ? 409
              : ['INVALID_REFERENCE', 'INVALID_TIMESTAMP'].includes(error.code)
                ? 400
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
  const usageTenant = (request: FastifyRequest) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const usageSourceId = (request: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).sourceId
        : undefined,
    );
  const usageMeasurementId = (request: FastifyRequest) =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).measurementId
        : undefined,
    );
  const usageUnavailable = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'USAGE_METERING_NOT_CONFIGURED',
          message: 'Usage/Metering dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  app.post('/api/v1/commercial/usage/sources', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request),
      body = measurementSourceCreateSchema.safeParse(request.body);
    if (!tenant.success || !body.success) return reply.status(400).send();
    try {
      return await usageMeteringService.registerSource(
        request.headers.authorization,
        tenant.data,
        body.data,
        metadata(request),
      );
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/usage/sources', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request);
    if (!tenant.success) return reply.status(400).send();
    try {
      return {
        data: await usageMeteringService.listSources(
          request.headers.authorization,
          tenant.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/usage/sources/:sourceId', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request),
      id = usageSourceId(request);
    if (!tenant.success || !id.success) return reply.status(400).send();
    try {
      return {
        data: await usageMeteringService.getSource(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  for (const [path, status] of [
    ['disable', 'DISABLED'],
    ['reactivate', 'ACTIVE'],
    ['revoke', 'REVOKED'],
  ] as const)
    app.post(`/api/v1/commercial/usage/sources/:sourceId/${path}`, async (request, reply) => {
      if (!usageMeteringService) return usageUnavailable(request, reply);
      const tenant = usageTenant(request),
        id = usageSourceId(request);
      if (!tenant.success || !id.success) return reply.status(400).send();
      try {
        return {
          data: await usageMeteringService.transitionSource(
            request.headers.authorization,
            tenant.data,
            id.data,
            status,
            metadata(request),
          ),
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
        throw error;
      }
    });
  app.post(
    '/api/v1/commercial/usage/sources/:sourceId/rotate-credential',
    async (request, reply) => {
      if (!usageMeteringService) return usageUnavailable(request, reply);
      const tenant = usageTenant(request),
        id = usageSourceId(request);
      if (!tenant.success || !id.success) return reply.status(400).send();
      try {
        return await usageMeteringService.rotateCredential(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        );
      } catch (error) {
        if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
        throw error;
      }
    },
  );
  app.post('/api/v1/commercial/usage/ingest', async (request, reply) => {
    if (!machineUsageIngestionService) return usageUnavailable(request, reply);
    const credentialId = request.headers['x-acs-source-credential-id'],
      secret = request.headers['x-acs-source-credential'],
      body = machineMeasurementIngestSchema.safeParse(request.body);
    if (
      typeof credentialId !== 'string' ||
      !uuidSchema.safeParse(credentialId).success ||
      typeof secret !== 'string' ||
      secret.length < 32 ||
      !body.success
    )
      return reply.status(400).send();
    try {
      return await machineUsageIngestionService.ingest(
        credentialId,
        secret,
        body.data,
        metadata(request),
      );
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/usage/measurements', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request);
    if (!tenant.success) return reply.status(400).send();
    try {
      return {
        data: await usageMeteringService.listMeasurements(
          request.headers.authorization,
          tenant.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/usage/measurements/:measurementId', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request),
      id = usageMeasurementId(request);
    if (!tenant.success || !id.success) return reply.status(400).send();
    try {
      return {
        data: await usageMeteringService.getMeasurement(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });
  app.post(
    '/api/v1/commercial/usage/measurements/:measurementId/corrections',
    async (request, reply) => {
      if (!usageMeteringService) return usageUnavailable(request, reply);
      const tenant = usageTenant(request),
        id = usageMeasurementId(request),
        key = request.headers['idempotency-key'];
      const parsed = measurementCorrectionCreateSchema.safeParse({
        ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
        measurement_id: id.success ? id.data : undefined,
      });
      if (
        !tenant.success ||
        !id.success ||
        typeof key !== 'string' ||
        !uuidSchema.safeParse(key).success ||
        !parsed.success
      )
        return reply.status(400).send();
      try {
        return await usageMeteringService.correct(
          request.headers.authorization,
          tenant.data,
          key,
          parsed.data,
          metadata(request),
        );
      } catch (error) {
        if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
        throw error;
      }
    },
  );
  app.get('/api/v1/commercial/usage/aggregates', async (request, reply) => {
    if (!usageMeteringService) return usageUnavailable(request, reply);
    const tenant = usageTenant(request);
    if (!tenant.success) return reply.status(400).send();
    try {
      return {
        data: await usageMeteringService.listAggregates(
          request.headers.authorization,
          tenant.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId, next_cursor: null },
      };
    } catch (error) {
      if (error instanceof UsageMeteringFailure) return usageFailure(error, request, reply);
      throw error;
    }
  });

  const ratingTenant = (request: FastifyRequest) =>
    z.uuid().safeParse(request.headers['x-acs-tenant-id']);
  const ratingId = (request: FastifyRequest, field = 'ratePlanId') =>
    uuidSchema.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>)[field]
        : undefined,
    );
  const ratingIdempotencyKey = (request: FastifyRequest) => {
    const key = request.headers['idempotency-key'];
    return typeof key === 'string' ? uuidSchema.safeParse(key) : uuidSchema.safeParse(undefined);
  };
  const ratingFailure = (error: RatingFailure, request: FastifyRequest, reply: FastifyReply) =>
    reply
      .status(
        error.code === 'UNAUTHENTICATED'
          ? 401
          : error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'CONFLICT'
              ? 409
              : error.code === 'INVALID_INPUT' || error.code === 'INVALID_REFERENCE'
                ? 400
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
  const ratingUnavailable = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(503).send(
      errorEnvelopeSchema.parse({
        error: {
          code: 'RATING_NOT_CONFIGURED',
          message: 'Rating dependencies are not configured.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  app.post('/api/v1/commercial/rating/rate-plans', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      body = ratePlanCreateSchema.safeParse(request.body),
      key = ratingIdempotencyKey(request);
    if (!tenant.success || !body.success || !key.success) return reply.status(400).send();
    try {
      return {
        data: await ratingService.create(
          request.headers.authorization,
          tenant.data,
          key.data,
          body.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/rating/rate-plans', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request);
    if (!tenant.success) return reply.status(400).send();
    try {
      return {
        data: await ratingService.list(
          request.headers.authorization,
          tenant.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/rating/rate-plans/:ratePlanId', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      id = ratingId(request);
    if (!tenant.success || !id.success) return reply.status(400).send();
    try {
      return {
        data: await ratingService.get(
          request.headers.authorization,
          tenant.data,
          id.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.patch('/api/v1/commercial/rating/rate-plans/:ratePlanId', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      id = ratingId(request),
      body = ratePlanDraftUpdateSchema.safeParse(request.body),
      key = ratingIdempotencyKey(request);
    if (!tenant.success || !id.success || !body.success || !key.success)
      return reply.status(400).send();
    try {
      return {
        data: await ratingService.update(
          request.headers.authorization,
          tenant.data,
          id.data,
          key.data,
          body.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  for (const transition of ['submit', 'approve', 'activate', 'supersede', 'retire'] as const)
    app.post(
      `/api/v1/commercial/rating/rate-plans/:ratePlanId/${transition}`,
      async (request, reply) => {
        if (!ratingService) return ratingUnavailable(request, reply);
        const tenant = ratingTenant(request),
          id = ratingId(request),
          key = ratingIdempotencyKey(request),
          body = z
            .object({ expected_version: z.number().int().positive() })
            .safeParse(request.body);
        if (!tenant.success || !id.success || !key.success || !body.success)
          return reply.status(400).send();
        try {
          return {
            data: await ratingService.transition(
              request.headers.authorization,
              tenant.data,
              id.data,
              transition,
              body.data.expected_version,
              key.data,
              metadata(request),
            ),
            meta: { request_id: request.id, correlation_id: request.correlationId },
          };
        } catch (error) {
          if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
          throw error;
        }
      },
    );
  app.post('/api/v1/commercial/rating/applicability', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      body = ratingApplicabilityCreateSchema.safeParse(request.body),
      key = ratingIdempotencyKey(request);
    if (!tenant.success || !body.success || !key.success) return reply.status(400).send();
    try {
      return {
        data: await ratingService.applicability(
          request.headers.authorization,
          tenant.data,
          key.data,
          body.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.get('/api/v1/commercial/rating/rated-facts', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request);
    if (!tenant.success) return reply.status(400).send();
    try {
      return {
        data: await ratingService.facts(
          request.headers.authorization,
          tenant.data,
          metadata(request),
        ),
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.post('/api/v1/commercial/rating/execute', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      body = z.object({ usage_aggregate_id: z.uuid() }).safeParse(request.body),
      key = request.headers['idempotency-key'];
    if (
      !tenant.success ||
      !body.success ||
      typeof key !== 'string' ||
      !uuidSchema.safeParse(key).success
    )
      return reply.status(400).send();
    try {
      return await ratingService.execute(
        request.headers.authorization,
        tenant.data,
        body.data.usage_aggregate_id,
        key,
        metadata(request),
      );
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
      throw error;
    }
  });
  app.post('/api/v1/commercial/rating/rated-facts/:ratedFactId/rerate', async (request, reply) => {
    if (!ratingService) return ratingUnavailable(request, reply);
    const tenant = ratingTenant(request),
      id = ratingId(request, 'ratedFactId'),
      body = rerateSchema.safeParse(request.body),
      key = request.headers['idempotency-key'];
    if (
      !tenant.success ||
      !id.success ||
      !body.success ||
      typeof key !== 'string' ||
      !uuidSchema.safeParse(key).success
    )
      return reply.status(400).send();
    try {
      return await ratingService.rerate(
        request.headers.authorization,
        tenant.data,
        id.data,
        body.data.usage_aggregate_id,
        body.data.reason,
        key,
        metadata(request),
      );
    } catch (error) {
      if (error instanceof RatingFailure) return ratingFailure(error, request, reply);
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
    emitContractReviseDiagnostic('HTTP_ERROR_MAP', 'failure', { error, httpStatus: 500 });
    emitFastifyContractReviseDiagnostic('ERROR_HANDLER', 'failure', {
      error,
      httpStatus: 500,
    });
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
