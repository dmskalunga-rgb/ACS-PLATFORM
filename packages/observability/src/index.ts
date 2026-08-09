import { createHash } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

export const LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'secret',
  'token',
] as const;

export function createStructuredLogger(configuration: {
  readonly level: string;
  readonly serviceName: string;
}): Logger {
  const options: LoggerOptions = {
    base: { service_name: configuration.serviceName },
    level: configuration.level,
    redact: { paths: [...LOG_REDACTION_PATHS], censor: '[REDACTED]' },
  };
  return pino(options);
}

export function createMetricsRegistry(serviceName: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service_name: serviceName });
  collectDefaultMetrics({ register: registry, prefix: 'acs_' });
  const requests = new Counter({
    name: 'acs_http_requests_total',
    help: 'Total HTTP requests handled by the FOUNDATION service.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });
  return { registry, requests };
}

export function setActiveTenantTraceContext(tenantId: string, action: string): void {
  trace.getActiveSpan()?.setAttributes({
    'acs.authorization.action': action,
    'acs.tenant.context_verified': true,
    'acs.tenant.fingerprint': createHash('sha256').update(tenantId).digest('hex'),
  });
}

export function sanitizeErrorForLog(error: unknown): Readonly<Record<string, unknown>> {
  if (!(error instanceof Error)) return { error_type: 'unknown' };
  const code = (error as Error & { code?: unknown }).code;
  return {
    error_name: error.name,
    ...(typeof code === 'string' ? { error_code: code } : {}),
  };
}

export function startTelemetry(configuration: {
  readonly endpoint?: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
}) {
  if (configuration.endpoint === undefined || configuration.endpoint === '') {
    return { enabled: false as const, shutdown: async () => Promise.resolve() };
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: configuration.serviceName,
      [ATTR_SERVICE_VERSION]: configuration.serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter({ url: configuration.endpoint }),
  });
  sdk.start();
  return { enabled: true as const, shutdown: async () => sdk.shutdown() };
}
