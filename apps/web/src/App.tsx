import { platformContextSchema, type PlatformContextResponse } from '@acs/contracts';
import { useEffect, useState } from 'react';

interface HealthResponse {
  readonly component: 'FOUNDATION';
  readonly service: string;
  readonly status: string;
  readonly version: string;
}

type HealthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'available'; readonly response: HealthResponse }
  | { readonly kind: 'unavailable' };

type ContextState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'available'; readonly response: PlatformContextResponse }
  | { readonly kind: 'denied' }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'unavailable' };

export interface ContextClientConfiguration {
  readonly developmentIdentitySubject?: string;
  readonly tenantId?: string;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';
export function resolveContextClientConfiguration(input: {
  readonly developmentIdentitySubject?: string;
  readonly isDevelopment: boolean;
  readonly tenantId?: string;
}): ContextClientConfiguration {
  if (!input.isDevelopment) return {};
  return {
    ...(input.developmentIdentitySubject === undefined
      ? {}
      : { developmentIdentitySubject: input.developmentIdentitySubject }),
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
  };
}

const defaultContextConfiguration = resolveContextClientConfiguration({
  isDevelopment: import.meta.env.DEV,
  ...(import.meta.env.VITE_DEV_IDENTITY_SUBJECT === undefined
    ? {}
    : { developmentIdentitySubject: import.meta.env.VITE_DEV_IDENTITY_SUBJECT }),
  ...(import.meta.env.VITE_TENANT_ID === undefined
    ? {}
    : { tenantId: import.meta.env.VITE_TENANT_ID }),
});

export function App({
  contextConfiguration = defaultContextConfiguration,
}: {
  readonly contextConfiguration?: ContextClientConfiguration;
}) {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [context, setContext] = useState<ContextState>(
    contextConfiguration.developmentIdentitySubject === undefined ||
      contextConfiguration.tenantId === undefined
      ? { kind: 'not-configured' }
      : { kind: 'loading' },
  );

  useEffect(() => {
    const controller = new AbortController();
    const loadHealth = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Health endpoint is unavailable.');
        setHealth({ kind: 'available', response: (await response.json()) as HealthResponse });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHealth({ kind: 'unavailable' });
      }
    };
    void loadHealth();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const subject = contextConfiguration.developmentIdentitySubject;
    const tenantId = contextConfiguration.tenantId;
    if (subject === undefined || tenantId === undefined) return;
    const controller = new AbortController();
    const loadContext = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/platform/context`, {
          headers: {
            accept: 'application/json',
            authorization: `Bearer dev:${subject}`,
            'x-acs-tenant-id': tenantId,
          },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          setContext({ kind: 'denied' });
          return;
        }
        if (response.status === 503) {
          setContext({ kind: 'not-configured' });
          return;
        }
        if (!response.ok) throw new Error('Tenant context endpoint is unavailable.');
        setContext({
          kind: 'available',
          response: platformContextSchema.parse(await response.json()),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setContext({ kind: 'unavailable' });
      }
    };
    void loadContext();
    return () => controller.abort();
  }, [contextConfiguration.developmentIdentitySubject, contextConfiguration.tenantId]);

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="foundation-title">
        <p className="eyebrow">ACS · Enterprise AI-Driven Cyber Defense Platform</p>
        <h1 id="foundation-title">Platform Foundation</h1>
        <p className="lede">
          Phase 1 establishes the authenticated, tenant-isolated platform context. No Phase 2 domain
          is enabled.
        </p>
        <span className="badge">PHASE 1</span>
      </section>
      <div className="status-grid">
        <section className="status-card" aria-live="polite" aria-busy={health.kind === 'loading'}>
          <h2>Platform API</h2>
          {health.kind === 'loading' && <p>Checking the real technical endpoint…</p>}
          {health.kind === 'available' && (
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{health.response.status}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{health.response.service}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{health.response.version}</dd>
              </div>
            </dl>
          )}
          {health.kind === 'unavailable' && (
            <p className="warning">Technical service disconnected. No status was fabricated.</p>
          )}
        </section>
        <section className="status-card" aria-live="polite" aria-busy={context.kind === 'loading'}>
          <h2>Tenant context</h2>
          {context.kind === 'loading' && <p>Resolving authenticated tenant membership…</p>}
          {context.kind === 'not-configured' && (
            <p className="warning">NOT_CONFIGURED — identity or tenant context is unavailable.</p>
          )}
          {context.kind === 'denied' && (
            <p className="warning">Access denied. No tenant information was disclosed.</p>
          )}
          {context.kind === 'unavailable' && (
            <p className="warning">Tenant context disconnected. No data was fabricated.</p>
          )}
          {context.kind === 'available' && (
            <dl>
              <div>
                <dt>Tenant</dt>
                <dd>{context.response.data.tenant.display_name}</dd>
              </div>
              <div>
                <dt>Membership</dt>
                <dd>{context.response.data.membership.status}</dd>
              </div>
              <div>
                <dt>Authorized action</dt>
                <dd>{context.response.data.permissions[0]}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>
    </main>
  );
}
