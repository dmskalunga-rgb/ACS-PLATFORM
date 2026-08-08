import { z } from 'zod';

const configurationSchema = z.object({
  ACS_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  ACS_HOST: z.string().min(1).default('0.0.0.0'),
  ACS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ACS_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ACS_WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
});

export interface PlatformConfiguration {
  readonly databaseUrl?: string;
  readonly environment: 'development' | 'test' | 'staging' | 'production';
  readonly host: string;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly otlpEndpoint?: string;
  readonly port: number;
  readonly webOrigin: string;
}

export function loadConfiguration(
  source: Readonly<Record<string, string | undefined>> = process.env,
): PlatformConfiguration {
  const parsed = configurationSchema.parse(source);
  return {
    ...(parsed.DATABASE_URL === undefined ? {} : { databaseUrl: parsed.DATABASE_URL }),
    environment: parsed.ACS_ENV,
    host: parsed.ACS_HOST,
    logLevel: parsed.ACS_LOG_LEVEL,
    ...(parsed.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: parsed.OTEL_EXPORTER_OTLP_ENDPOINT }),
    port: parsed.ACS_PORT,
    webOrigin: parsed.ACS_WEB_ORIGIN,
  };
}
