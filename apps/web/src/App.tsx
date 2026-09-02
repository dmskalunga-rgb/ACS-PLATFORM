import { useEffect, useState } from 'react';
import { useBrowserAuth } from './auth/auth-context.js';

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

export function App({ apiBaseUrl = '/api' }: { readonly apiBaseUrl?: string }) {
  const { authentication, membership, tenantContext, signIn, signOut, selectMembership } =
    useBrowserAuth();
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });
  const activeMemberships = membership.kind === 'ready' ? membership.response.data.memberships : [];

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
  }, [apiBaseUrl]);

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="foundation-title">
        <p className="eyebrow">ACS · Enterprise AI-Driven Cyber Defense Platform</p>
        <h1 id="foundation-title">Platform Foundation</h1>
        <p className="lede">
          Authenticated access is established by OIDC and active membership discovery.
        </p>
        <span className="badge">PHASE 1 · IDENTITY FOUNDATION</span>
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
        <section
          className="status-card"
          aria-live="polite"
          aria-busy={
            authentication === 'loading' ||
            membership.kind === 'loading' ||
            tenantContext.kind === 'loading'
          }
        >
          <h2>Tenant membership</h2>
          {(authentication === 'loading' || authentication === 'callback-processing') && (
            <p>Restoring authenticated session…</p>
          )}
          {authentication === 'unauthenticated' && (
            <button type="button" onClick={() => void signIn()}>
              Sign in
            </button>
          )}
          {authentication === 'authenticating' && <p>Redirecting to the identity provider…</p>}
          {authentication === 'session-expired' && (
            <p className="warning">Session expired. Sign in again.</p>
          )}
          {authentication === 'error' && (
            <p className="warning">Authentication could not be completed. Access remains closed.</p>
          )}
          {authentication === 'authenticated' && membership.kind === 'loading' && (
            <p>Resolving active memberships…</p>
          )}
          {authentication === 'authenticated' && membership.kind === 'no-active-membership' && (
            <p className="warning">NO_ACTIVE_MEMBERSHIP</p>
          )}
          {authentication === 'authenticated' && membership.kind === 'forbidden' && (
            <p className="warning">Membership access is forbidden.</p>
          )}
          {authentication === 'authenticated' && membership.kind === 'unavailable' && (
            <p className="warning">Membership service unavailable. Access remains closed.</p>
          )}
          {authentication === 'authenticated' &&
            tenantContext.kind === 'selection-required' &&
            membership.kind === 'ready' && (
              <>
                <p>Select an active tenant to continue.</p>
                <ul>
                  {activeMemberships.map((candidate) => (
                    <li key={candidate.membership_id}>
                      <button
                        type="button"
                        onClick={() => void selectMembership(candidate.membership_id)}
                      >
                        {candidate.tenant.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          {authentication === 'authenticated' && tenantContext.kind === 'loading' && (
            <p>Establishing server-authorized tenant context…</p>
          )}
          {authentication === 'authenticated' && tenantContext.kind === 'forbidden' && (
            <p className="warning">Tenant context access is forbidden.</p>
          )}
          {authentication === 'authenticated' && tenantContext.kind === 'not-found' && (
            <p className="warning">Selected tenant context is unavailable.</p>
          )}
          {authentication === 'authenticated' && tenantContext.kind === 'unavailable' && (
            <p className="warning">Tenant context service unavailable. Access remains closed.</p>
          )}
          {tenantContext.kind === 'ready' && (
            <>
              <dl>
                <div>
                  <dt>Tenant</dt>
                  <dd>{tenantContext.response.data.tenant.display_name}</dd>
                </div>
                <div>
                  <dt>Membership</dt>
                  <dd>{tenantContext.response.data.membership.status}</dd>
                </div>
              </dl>
              {activeMemberships.length > 1 && (
                <>
                  <p>Switch tenant</p>
                  <ul>
                    {activeMemberships.map((candidate) => (
                      <li key={candidate.membership_id}>
                        <button
                          type="button"
                          onClick={() => void selectMembership(candidate.membership_id)}
                        >
                          {candidate.tenant.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {authentication === 'authenticated' && (
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
