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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

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

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="foundation-title">
        <p className="eyebrow">ACS · Enterprise AI-Driven Cyber Defense Platform</p>
        <h1 id="foundation-title">Engineering Foundation</h1>
        <p className="lede">
          Phase 0 establishes technical contracts and delivery controls. No functional 5.x domain is
          enabled.
        </p>
        <span className="badge">FOUNDATION</span>
      </section>
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
    </main>
  );
}
