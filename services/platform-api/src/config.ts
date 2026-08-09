import { z } from 'zod';

const configurationSchema = z.object({
  ACS_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  ACS_HOST: z.string().min(1).default('0.0.0.0'),
  ACS_IDENTITY_MODE: z.enum(['development-header', 'not-configured']).optional(),
  ACS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ACS_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ACS_WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url().optional(),
  ACS_CONTEXT_RESOLVER_DATABASE_URL: z.url().optional(),
  ACS_TENANT_DATABASE_URL: z.url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
});

export interface PlatformConfiguration {
  readonly databaseUrl?: string;
  readonly environment: 'development' | 'test' | 'staging' | 'production';
  readonly host: string;
  readonly identityMode: 'development-header' | 'not-configured';
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly otlpEndpoint?: string;
  readonly port: number;
  readonly resolverDatabaseUrl?: string;
  readonly tenantDatabaseUrl?: string;
  readonly webOrigin: string;
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
  return {
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    environment: parsed.ACS_ENV,
    host: parsed.ACS_HOST,
    identityMode,
    logLevel: parsed.ACS_LOG_LEVEL,
    ...(parsed.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT }),
    port: parsed.ACS_PORT,
    ...(parsed.ACS_CONTEXT_RESOLVER_DATABASE_URL === undefined
      ? {}
      : { resolverDatabaseUrl: parsed.ACS_CONTEXT_RESOLVER_DATABASE_URL }),
    ...(parsed.ACS_TENANT_DATABASE_URL === undefined
      ? {}
      : { tenantDatabaseUrl: parsed.ACS_TENANT_DATABASE_URL }),
    webOrigin: parsed.ACS_WEB_ORIGIN,
  };
}
