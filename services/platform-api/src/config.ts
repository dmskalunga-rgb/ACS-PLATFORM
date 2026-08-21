import { z } from 'zod';

const configurationSchema = z.object({
  ACS_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  ACS_HOST: z.string().min(1).default('0.0.0.0'),
  ACS_IDENTITY_MODE: z.enum(['development-header', 'oidc', 'not-configured']).optional(),
  ACS_OIDC_ALLOWED_ALGORITHMS: z.string().default('RS256'),
  ACS_OIDC_AUDIENCE: z.string().min(1).optional(),
  ACS_OIDC_CLOCK_TOLERANCE_SECONDS: z.coerce.number().int().min(0).max(300).default(60),
  ACS_OIDC_ISSUER: z.url().optional(),
  ACS_OIDC_JWKS_CACHE_MS: z.coerce.number().int().min(1000).max(86_400_000).default(300_000),
  ACS_OIDC_JWKS_COOLDOWN_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  ACS_OIDC_JWKS_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(2_000),
  ACS_OIDC_JWKS_URI: z.url().optional(),
  ACS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ACS_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ACS_WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url().optional(),
  ACS_CONTEXT_RESOLVER_DATABASE_URL: z.url().optional(),
  ACS_SECURITY_AUDIT_DATABASE_URL: z.url().optional(),
  ACS_TENANT_DATABASE_URL: z.url().optional(),
  ACS_TENANT_ADMIN_DATABASE_URL: z.url().optional(),
  ACS_CUSTOMER_DATABASE_URL: z.url().optional(),
  ACS_LEAD_DATABASE_URL: z.url().optional(),
  ACS_PLAN_DATABASE_URL: z.url().optional(),
  ACS_PARTNER_DATABASE_URL: z.url().optional(),
  ACS_OPPORTUNITY_DATABASE_URL: z.url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
});

export interface PlatformConfiguration {
  readonly databaseUrl?: string;
  readonly environment: 'development' | 'test' | 'staging' | 'production';
  readonly host: string;
  readonly identityMode: 'development-header' | 'oidc' | 'not-configured';
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly otlpEndpoint?: string;
  readonly oidc?: OidcConfiguration;
  readonly port: number;
  readonly resolverDatabaseUrl?: string;
  readonly securityAuditDatabaseUrl?: string;
  readonly tenantDatabaseUrl?: string;
  readonly tenantAdminDatabaseUrl?: string;
  readonly customerDatabaseUrl?: string;
  readonly leadDatabaseUrl?: string;
  readonly planDatabaseUrl?: string;
  readonly partnerDatabaseUrl?: string;
  readonly opportunityDatabaseUrl?: string;
  readonly webOrigin: string;
}

export interface OidcConfiguration {
  readonly allowedAlgorithms: readonly ('RS256' | 'PS256' | 'ES256')[];
  readonly audience: string;
  readonly clockToleranceSeconds: number;
  readonly issuer: string;
  readonly jwksCacheMs: number;
  readonly jwksCooldownMs: number;
  readonly jwksTimeoutMs: number;
  readonly jwksUri: string;
}

export function loadConfiguration(
  source: Readonly<Record<string, string | undefined>> = process.env,
): PlatformConfiguration {
  const parsed = configurationSchema.parse(source);
  const identityMode =
    parsed.ACS_IDENTITY_MODE ??
    (parsed.ACS_ENV === 'development' || parsed.ACS_ENV === 'test'
      ? 'development-header'
      : 'not-configured');
  if (
    identityMode === 'development-header' &&
    parsed.ACS_ENV !== 'development' &&
    parsed.ACS_ENV !== 'test'
  ) {
    throw new Error('The development identity adapter is prohibited in staging and production.');
  }
  const allowedAlgorithms = parsed.ACS_OIDC_ALLOWED_ALGORITHMS.split(',').map((value) =>
    value.trim(),
  );
  if (!allowedAlgorithms.every((value) => ['RS256', 'PS256', 'ES256'].includes(value))) {
    throw new Error('OIDC allowed algorithms contain an unsupported value.');
  }
  let oidc: OidcConfiguration | undefined;
  if (identityMode === 'oidc') {
    if (
      parsed.ACS_OIDC_ISSUER === undefined ||
      parsed.ACS_OIDC_AUDIENCE === undefined ||
      parsed.ACS_OIDC_JWKS_URI === undefined
    ) {
      throw new Error('OIDC mode requires issuer, audience, and JWKS URI configuration.');
    }
    if (
      parsed.ACS_ENV !== 'test' &&
      (!parsed.ACS_OIDC_ISSUER.startsWith('https://') ||
        !parsed.ACS_OIDC_JWKS_URI.startsWith('https://'))
    ) {
      throw new Error('OIDC issuer and JWKS URI must use HTTPS outside the test environment.');
    }
    oidc = {
      allowedAlgorithms: allowedAlgorithms as OidcConfiguration['allowedAlgorithms'],
      audience: parsed.ACS_OIDC_AUDIENCE,
      clockToleranceSeconds: parsed.ACS_OIDC_CLOCK_TOLERANCE_SECONDS,
      issuer: parsed.ACS_OIDC_ISSUER,
      jwksCacheMs: parsed.ACS_OIDC_JWKS_CACHE_MS,
      jwksCooldownMs: parsed.ACS_OIDC_JWKS_COOLDOWN_MS,
      jwksTimeoutMs: parsed.ACS_OIDC_JWKS_TIMEOUT_MS,
      jwksUri: parsed.ACS_OIDC_JWKS_URI,
    };
  }
  return {
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    environment: parsed.ACS_ENV,
    host: parsed.ACS_HOST,
    identityMode,
    logLevel: parsed.ACS_LOG_LEVEL,
    ...(oidc === undefined ? {} : { oidc }),
    ...(parsed.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT }),
    port: parsed.ACS_PORT,
    ...(parsed.ACS_CONTEXT_RESOLVER_DATABASE_URL === undefined
      ? {}
      : { resolverDatabaseUrl: parsed.ACS_CONTEXT_RESOLVER_DATABASE_URL }),
    ...(parsed.ACS_SECURITY_AUDIT_DATABASE_URL === undefined
      ? {}
      : { securityAuditDatabaseUrl: parsed.ACS_SECURITY_AUDIT_DATABASE_URL }),
    ...(parsed.ACS_TENANT_DATABASE_URL === undefined
      ? {}
      : { tenantDatabaseUrl: parsed.ACS_TENANT_DATABASE_URL }),
    ...(parsed.ACS_TENANT_ADMIN_DATABASE_URL === undefined
      ? {}
      : { tenantAdminDatabaseUrl: parsed.ACS_TENANT_ADMIN_DATABASE_URL }),
    ...(parsed.ACS_CUSTOMER_DATABASE_URL === undefined
      ? {}
      : { customerDatabaseUrl: parsed.ACS_CUSTOMER_DATABASE_URL }),
    ...(parsed.ACS_LEAD_DATABASE_URL === undefined
      ? {}
      : { leadDatabaseUrl: parsed.ACS_LEAD_DATABASE_URL }),
    ...(parsed.ACS_PLAN_DATABASE_URL === undefined
      ? {}
      : { planDatabaseUrl: parsed.ACS_PLAN_DATABASE_URL }),
    ...(parsed.ACS_PARTNER_DATABASE_URL === undefined
      ? {}
      : { partnerDatabaseUrl: parsed.ACS_PARTNER_DATABASE_URL }),
    ...(parsed.ACS_OPPORTUNITY_DATABASE_URL === undefined
      ? {}
      : { opportunityDatabaseUrl: parsed.ACS_OPPORTUNITY_DATABASE_URL }),
    webOrigin: parsed.ACS_WEB_ORIGIN,
  };
}
