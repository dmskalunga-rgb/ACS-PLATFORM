import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthProvider } from './auth/auth-provider.js';
import { createOidcSessionManager, resolveOidcRuntimeConfiguration } from './auth/oidc-session.js';
import { resolveContextClientConfiguration } from './context-client-configuration.js';
import './styles.css';

const root = document.querySelector<HTMLDivElement>('#root');
if (root === null) throw new Error('ACS web root element is missing.');

try {
  const oidc = resolveOidcRuntimeConfiguration(import.meta.env);
  const context = resolveContextClientConfiguration({ apiBaseUrl: oidc.apiBaseUrl });
  const manager = createOidcSessionManager(oidc);
  createRoot(root).render(
    <StrictMode>
      <AuthProvider configuration={{ ...oidc, apiBaseUrl: context.apiBaseUrl }} manager={manager}>
        <App apiBaseUrl={context.apiBaseUrl} />
      </AuthProvider>
    </StrictMode>,
  );
} catch {
  createRoot(root).render(
    <main className="shell">
      <p className="warning">OIDC runtime configuration is unavailable. Access remains closed.</p>
    </main>,
  );
}
