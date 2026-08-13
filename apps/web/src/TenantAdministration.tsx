import { tenantAdministrationSchema, type TenantAdministration } from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'success'; data: TenantAdministration['data'] }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'stale' }
  | { kind: 'error' };
export function TenantAdministrationPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  apiBaseUrl: string;
  authorization: string;
  tenantId: string;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/platform/tenants/${tenantId}/administration`,
        { headers: { accept: 'application/json', authorization } },
      );
      if (response.status === 401) return setState({ kind: 'unauthorized' });
      if (response.status === 403) return setState({ kind: 'forbidden' });
      if (!response.ok) throw new Error('unavailable');
      const parsed = tenantAdministrationSchema.parse(await response.json());
      setState(
        parsed.data.memberships.length === 0
          ? { kind: 'empty' }
          : { kind: 'success', data: parsed.data },
      );
    } catch {
      setState({ kind: 'error' });
    }
  }, [apiBaseUrl, authorization, tenantId]);
  useEffect(() => {
    // The asynchronous loader owns the complete remote-state transition for this API resource.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const changeStatus = async (membership: TenantAdministration['data']['memberships'][number]) => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/platform/tenants/${tenantId}/memberships/${membership.id}/status`,
        {
          method: 'PUT',
          headers: {
            authorization,
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            status: membership.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            expected_version: membership.version,
          }),
        },
      );
      if (response.status === 409) return setState({ kind: 'stale' });
      if (response.status === 401) return setState({ kind: 'unauthorized' });
      if (response.status === 403) return setState({ kind: 'forbidden' });
      if (!response.ok) throw new Error('mutation failed');
      await load();
    } catch {
      setState({ kind: 'error' });
    }
  };
  return (
    <section className="status-card" aria-live="polite" aria-busy={state.kind === 'loading'}>
      <h2>Tenant administration</h2>
      {state.kind === 'loading' && <p>Loading governed memberships…</p>}
      {state.kind === 'empty' && <p>No memberships are available.</p>}
      {state.kind === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state.kind === 'forbidden' && <p className="warning">Administrative access is forbidden.</p>}
      {state.kind === 'stale' && (
        <>
          <p className="warning">Data changed. Refresh before retrying.</p>
          <button onClick={() => void load()}>Refresh</button>
        </>
      )}
      {state.kind === 'error' && (
        <p className="warning">Administration service unavailable. No data was fabricated.</p>
      )}
      {state.kind === 'success' && (
        <ul>
          {state.data.memberships.map((m) => (
            <li key={m.id}>
              <code>{m.user_id}</code> — {m.status} —{' '}
              {m.roles.map((r) => r.display_name).join(', ') || 'No roles'}{' '}
              <button onClick={() => void changeStatus(m)}>
                {m.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
