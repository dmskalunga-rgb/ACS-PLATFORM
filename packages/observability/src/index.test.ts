import { describe, expect, it } from 'vitest';
import {
  LOG_REDACTION_PATHS,
  createMetricsRegistry,
  createStructuredLogger,
  sanitizeErrorForLog,
  startTelemetry,
} from './index.js';

describe('FOUNDATION observability', () => {
  it('redacts authorization and secret-bearing fields', () => {
    expect(LOG_REDACTION_PATHS).toContain('req.headers.authorization');
    expect(LOG_REDACTION_PATHS).toContain('secret');
  });

  it('does not emit bearer tokens, JWT payloads, signing keys, or client secrets', () => {
    let output = '';
    const destination = {
      write(chunk: string) {
        output += chunk;
      },
    };
    const logger = createStructuredLogger({ destination, level: 'info', serviceName: 'test' });
    logger.info({
      accessToken: 'header.payload.signature',
      clientSecret: 'client-secret-value',
      jwtPayload: { email: 'alice@example.test', sub: 'alice' },
      req: { headers: { authorization: 'Bearer header.payload.signature' } },
      signingKey: 'private-key-value',
    });
    expect(output).not.toContain('header.payload.signature');
    expect(output).not.toContain('alice@example.test');
    expect(output).not.toContain('private-key-value');
    expect(output).not.toContain('client-secret-value');
    expect(output).toContain('[REDACTED]');
  });

  it('registers foundation HTTP metrics', async () => {
    const { registry, requests } = createMetricsRegistry('test-service');
    requests.inc({ method: 'GET', route: '/health', status_code: '200' });
    expect(await registry.metrics()).toContain('acs_http_requests_total');
  });

  it('stays explicitly disabled without an OTLP endpoint', () => {
    expect(startTelemetry({ serviceName: 'test', serviceVersion: '0.0.0' }).enabled).toBe(false);
  });

  it('sanitizes database errors before structured logging', () => {
    const error = Object.assign(
      new Error('password=secret SELECT * FROM users postgresql://user:pass@host/db'),
      { code: '42501' },
    );
    expect(sanitizeErrorForLog(error)).toEqual({ error_name: 'Error', error_code: '42501' });
  });
});
