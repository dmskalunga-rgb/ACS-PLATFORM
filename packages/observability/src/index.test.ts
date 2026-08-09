import { describe, expect, it } from 'vitest';
import { LOG_REDACTION_PATHS, createMetricsRegistry, startTelemetry } from './index.js';

describe('FOUNDATION observability', () => {
  it('redacts authorization and secret-bearing fields', () => {
    expect(LOG_REDACTION_PATHS).toContain('req.headers.authorization');
    expect(LOG_REDACTION_PATHS).toContain('secret');
  });

  it('registers foundation HTTP metrics', async () => {
    const { registry, requests } = createMetricsRegistry('test-service');
    requests.inc({ method: 'GET', route: '/health', status_code: '200' });
    expect(await registry.metrics()).toContain('acs_http_requests_total');
  });

  it('stays explicitly disabled without an OTLP endpoint', () => {
    expect(startTelemetry({ serviceName: 'test', serviceVersion: '0.0.0' }).enabled).toBe(false);
  });
});
