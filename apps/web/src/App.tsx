import { platformContextSchema, type PlatformContextResponse } from '@acs/contracts';
import { useEffect, useState } from 'react';
import {
  resolveContextClientConfiguration,
  type ContextClientConfiguration,
} from './context-client-configuration.js';
import { TenantAdministrationPanel } from './TenantAdministration.js';
import { CustomerRegistryPanel } from './CustomerRegistry.js';
import { LeadRegistryPanel } from './LeadRegistry.js';
import { PlanCatalogPanel } from './PlanCatalog.js';
import { PartnerRegistryPanel } from './PartnerRegistry.js';
import { OpportunityRegistryPanel } from './OpportunityRegistry.js';
import { ProposalRegistryPanel } from './ProposalRegistry.js';
import { ContractRegistryPanel } from './ContractRegistry.js';
import { SubscriptionRegistryPanel } from './SubscriptionRegistry.js';
import { EntitlementRegistryPanel } from './EntitlementRegistry.js';

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
  | { readonly kind: 'expired' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'identity-unavailable' }
  | { readonly kind: 'unavailable' };

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';
const defaultContextConfiguration: ContextClientConfiguration = import.meta.env.DEV
  ? resolveContextClientConfiguration({
      isDevelopment: true,
      ...(import.meta.env.VITE_DEV_IDENTITY_SUBJECT === undefined
        ? {}
        : { developmentIdentitySubject: import.meta.env.VITE_DEV_IDENTITY_SUBJECT }),
      ...(import.meta.env.VITE_TENANT_ID === undefined
        ? {}
        : { tenantId: import.meta.env.VITE_TENANT_ID }),
    })
  : {};

export function App({
  contextConfiguration = defaultContextConfiguration,
}: {
  readonly contextConfiguration?: ContextClientConfiguration;
}) {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const [sessionActive, setSessionActive] = useState(true);
  const hasCredential =
    contextConfiguration.accessToken !== undefined ||
    contextConfiguration.developmentIdentitySubject !== undefined;
  const [context, setContext] = useState<ContextState>(
    !hasCredential || contextConfiguration.tenantId === undefined
      ? { kind: 'not-configured' }
      : { kind: 'loading' },
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
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
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const accessToken = contextConfiguration.accessToken;
    const subject = contextConfiguration.developmentIdentitySubject;
    const tenantId = contextConfiguration.tenantId;
    if (!sessionActive || tenantId === undefined) return;
    const authorization =
      accessToken === undefined
        ? subject === undefined
          ? undefined
          : `Bearer dev:${subject}`
        : `Bearer ${accessToken}`;
    if (authorization === undefined) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/platform/context`, {
          headers: { accept: 'application/json', authorization, 'x-acs-tenant-id': tenantId },
          signal: controller.signal,
        });
        if (response.status === 401) return setContext({ kind: 'expired' });
        if (response.status === 403) return setContext({ kind: 'forbidden' });
        if (response.status === 503) return setContext({ kind: 'identity-unavailable' });
        if (!response.ok) throw new Error('Tenant context endpoint is unavailable.');
        setContext({
          kind: 'available',
          response: platformContextSchema.parse(await response.json()),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setContext({ kind: 'unavailable' });
      }
    })();
    return () => controller.abort();
  }, [
    contextConfiguration.accessToken,
    contextConfiguration.developmentIdentitySubject,
    contextConfiguration.tenantId,
    sessionActive,
  ]);

  const signOut = async () => {
    setSessionActive(false);
    setContext({ kind: 'signed-out' });
    await contextConfiguration.onSignOut?.();
  };

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="foundation-title">
        <p className="eyebrow">ACS · Enterprise AI-Driven Cyber Defense Platform</p>
        <h1 id="foundation-title">Platform Foundation</h1>
        <p className="lede">
          Phase 2 begins with one governed, tenant-scoped Commercial Customer Registry vertical
          slice.
        </p>
        <span className="badge">PHASE 2 · CUSTOMER REGISTRY</span>
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
          {context.kind === 'loading' && <p>Authenticating and resolving tenant membership…</p>}
          {context.kind === 'not-configured' && (
            <>
              <p className="warning">NOT_CONFIGURED — no authenticated session is available.</p>
              {contextConfiguration.onSignIn !== undefined && (
                <button type="button" onClick={contextConfiguration.onSignIn}>
                  Sign in
                </button>
              )}
            </>
          )}
          {context.kind === 'expired' && <p className="warning">Session expired. Sign in again.</p>}
          {context.kind === 'forbidden' && (
            <p className="warning">Access forbidden. No tenant information was disclosed.</p>
          )}
          {context.kind === 'signed-out' && (
            <p className="warning">Signed out. The in-memory session is no longer usable.</p>
          )}
          {context.kind === 'identity-unavailable' && (
            <p className="warning">Identity service unavailable. Access remains closed.</p>
          )}
          {context.kind === 'unavailable' && (
            <p className="warning">Tenant context disconnected. No data was fabricated.</p>
          )}
          {context.kind === 'available' && (
            <>
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
              {contextConfiguration.accessToken !== undefined && (
                <button type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              )}
            </>
          )}
        </section>
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <TenantAdministrationPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <CustomerRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <LeadRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <PlanCatalogPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <PartnerRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <OpportunityRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <ProposalRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <ContractRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <SubscriptionRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
        {context.kind === 'available' && contextConfiguration.tenantId !== undefined && (
          <EntitlementRegistryPanel
            apiBaseUrl={apiBaseUrl}
            tenantId={contextConfiguration.tenantId}
            authorization={
              contextConfiguration.accessToken === undefined
                ? `Bearer dev:${contextConfiguration.developmentIdentitySubject ?? ''}`
                : `Bearer ${contextConfiguration.accessToken}`
            }
          />
        )}
      </div>
    </main>
  );
}
