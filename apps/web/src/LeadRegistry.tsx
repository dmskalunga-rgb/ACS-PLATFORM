import { leadEnvelopeSchema, leadListEnvelopeSchema, type Lead } from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'success'; leads: Lead[] }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'conflict' }
  | { kind: 'error' };

export function LeadRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [displayName, setDisplayName] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSource, setEditSource] = useState('');
  const headers = useCallback(
    () => ({ authorization, 'x-acs-tenant-id': tenantId }),
    [authorization, tenantId],
  );
  const classify = (status: number) => {
    if (status === 401) setState({ kind: 'unauthorized' });
    else if (status === 403) setState({ kind: 'forbidden' });
    else if (status === 409) setState({ kind: 'conflict' });
    else setState({ kind: 'error' });
  };
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/leads?limit=25`, {
        headers: { accept: 'application/json', ...headers() },
      });
      if (!response.ok) return classify(response.status);
      const leads = leadListEnvelopeSchema.parse(await response.json()).data;
      setState(leads.length === 0 ? { kind: 'empty' } : { kind: 'success', leads });
    } catch {
      setState({ kind: 'error' });
    }
  }, [apiBaseUrl, headers]);
  useEffect(() => {
    // The loader owns the complete real API state transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/leads`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ display_name: displayName, ...(source === '' ? {} : { source }) }),
      });
      if (!response.ok) return classify(response.status);
      leadEnvelopeSchema.parse(await response.json());
      setDisplayName('');
      setSource('');
      await load();
    } catch {
      setState({ kind: 'error' });
    }
  };
  const qualify = async (lead: Lead) => {
    if (lead.status !== 'NEW') return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ status: 'QUALIFIED', expected_version: lead.version }),
      });
      if (!response.ok) return classify(response.status);
      leadEnvelopeSchema.parse(await response.json());
      await load();
    } catch {
      setState({ kind: 'error' });
    }
  };
  const view = async (id: string) => {
    setDetail('loading');
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/leads/${id}`, {
        headers: { accept: 'application/json', ...headers() },
      });
      if (response.status === 404 || response.status === 403) return setDetail('not-found');
      if (!response.ok) return setDetail('error');
      const lead = leadEnvelopeSchema.parse(await response.json()).data;
      setSelected(lead);
      setEditName(lead.display_name);
      setEditSource(lead.source ?? '');
      setDetail('idle');
    } catch {
      setDetail('error');
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !editName.trim()) return;
    const response = await fetch(`${apiBaseUrl}/api/v1/commercial/leads/${selected.id}`, {
      method: 'PATCH',
      headers: {
        ...headers(),
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        display_name: editName.trim(),
        source: editSource.trim() || null,
        expected_version: selected.version,
      }),
    });
    if (response.status === 409) return setState({ kind: 'conflict' });
    if (response.status === 401 || response.status === 403) return classify(response.status);
    if (!response.ok) return setDetail(response.status === 404 ? 'not-found' : 'error');
    const lead = leadEnvelopeSchema.parse(await response.json()).data;
    setSelected(lead);
    setEditing(false);
    await load();
  };
  return (
    <section
      className="status-card lead-registry"
      aria-live="polite"
      aria-busy={state.kind === 'loading'}
    >
      <h2>Commercial Lead Registry</h2>
      <form onSubmit={(event) => void create(event)}>
        <label htmlFor="lead-name">Display name</label>
        <input
          id="lead-name"
          required
          maxLength={160}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <label htmlFor="lead-source">Source (optional)</label>
        <input
          id="lead-source"
          maxLength={80}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
        <button type="submit">Create lead</button>
      </form>
      {state.kind === 'loading' && <p>Loading leads…</p>}
      {state.kind === 'empty' && <p>No leads are registered.</p>}
      {state.kind === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state.kind === 'forbidden' && <p className="warning">Lead access is forbidden.</p>}
      {state.kind === 'conflict' && (
        <p className="warning">Lead data changed or the request was already used.</p>
      )}
      {state.kind === 'error' && (
        <p className="warning">Lead Registry is unavailable. No data was fabricated.</p>
      )}
      {state.kind === 'success' && (
        <ul className="lead-list">
          {state.leads.map((lead) => (
            <li key={lead.id}>
              <span>
                <strong>{lead.display_name}</strong>
                <small>
                  {lead.source ?? 'No source'} · {lead.status}
                </small>
              </span>
              <span>
                <button type="button" onClick={() => void view(lead.id)}>
                  View
                </button>
                <button
                  type="button"
                  disabled={lead.status !== 'NEW'}
                  onClick={() => void qualify(lead)}
                >
                  Qualify
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {detail === 'loading' && <p>Loading lead details…</p>}
      {detail === 'not-found' && <p className="warning">Lead details are unavailable.</p>}
      {detail === 'error' && (
        <p className="warning">Lead details are unavailable. No data was fabricated.</p>
      )}
      {selected && detail === 'idle' && (
        <section aria-labelledby="lead-detail">
          <h3 id="lead-detail">Lead details</h3>
          {!editing ? (
            <>
              <p>
                <strong>{selected.display_name}</strong> · {selected.status}
              </p>
              <button type="button" onClick={() => setEditing(true)}>
                Edit lead
              </button>
            </>
          ) : (
            <form onSubmit={(event) => void save(event)}>
              <label htmlFor="lead-edit-name">Display name</label>
              <input
                id="lead-edit-name"
                required
                aria-invalid={!editName.trim()}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
              <label htmlFor="lead-edit-source">Source (optional)</label>
              <input
                id="lead-edit-source"
                value={editSource}
                onChange={(event) => setEditSource(event.target.value)}
              />
              <button type="submit">Save changes</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          )}
        </section>
      )}
      {state.kind === 'conflict' && (
        <button type="button" onClick={() => selected && void view(selected.id)}>
          Reload current lead
        </button>
      )}
    </section>
  );
}
