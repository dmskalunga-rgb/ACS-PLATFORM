import { partnerEnvelopeSchema, partnerListEnvelopeSchema, type Partner } from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type State =
  | 'loading'
  | 'empty'
  | 'success'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'not-found'
  | 'error';
export function PartnerRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [state, setState] = useState<State>('loading');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selected, setSelected] = useState<Partner | null>(null);
  const [partnerCode, setPartnerCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [editing, setEditing] = useState(false);
  const headers = useCallback(
    () => ({ authorization, 'x-acs-tenant-id': tenantId }),
    [authorization, tenantId],
  );
  const fail = (code: number) =>
    setState(
      code === 401
        ? 'unauthorized'
        : code === 403
          ? 'forbidden'
          : code === 404
            ? 'not-found'
            : code === 409
              ? 'conflict'
              : 'error',
    );
  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/partners?limit=25`, {
        headers: headers(),
      });
      if (!r.ok) return fail(r.status);
      const data = partnerListEnvelopeSchema.parse(await r.json()).data;
      setPartners(data);
      setState(data.length ? 'success' : 'empty');
    } catch {
      setState('error');
    }
  }, [apiBaseUrl, headers]);
  useEffect(() => {
    // The loader owns the complete real API state transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const view = async (id: string) => {
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/partners/${id}`, {
        headers: headers(),
      });
      if (!r.ok) return fail(r.status);
      const v = partnerEnvelopeSchema.parse(await r.json()).data;
      setSelected(v);
      setPartnerCode(v.partner_code);
      setDisplayName(v.display_name);
    } catch {
      setState('error');
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/partners`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ partner_code: partnerCode, display_name: displayName }),
      });
      if (!r.ok) return fail(r.status);
      setPartnerCode('');
      setDisplayName('');
      await load();
    } catch {
      setState('error');
    }
  };
  const update = async (event: React.FormEvent, status?: Partner['status']) => {
    event.preventDefault();
    if (!selected) return;
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/partners/${selected.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...(status === undefined
            ? { partner_code: partnerCode, display_name: displayName }
            : { status }),
          expected_version: selected.version,
        }),
      });
      if (!r.ok) return fail(r.status);
      setSelected(partnerEnvelopeSchema.parse(await r.json()).data);
      setEditing(false);
      await load();
    } catch {
      setState('error');
    }
  };
  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Partner Registry</h2>
      <form onSubmit={(event) => void create(event)}>
        <label htmlFor="partner-code">Partner code</label>
        <input
          id="partner-code"
          required
          maxLength={80}
          value={partnerCode}
          onChange={(e) => setPartnerCode(e.target.value)}
        />
        <label htmlFor="partner-display-name">Partner display name</label>
        <input
          id="partner-display-name"
          required
          maxLength={160}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button type="submit" disabled={state === 'loading'}>
          Create partner
        </button>
      </form>
      {state === 'loading' && <p>Loading partners…</p>}
      {state === 'empty' && <p>No partners are registered.</p>}
      {state === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Partner access is forbidden.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Partner data changed. Reload before retrying.</p>
          <button type="button" onClick={() => void load()}>
            Reload partners
          </button>
        </>
      )}
      {state === 'not-found' && <p className="warning">The selected partner was not found.</p>}
      {state === 'error' && (
        <p className="warning">Partner Registry is unavailable. No data was fabricated.</p>
      )}
      {state === 'success' && (
        <ul>
          {partners.map((partner) => (
            <li key={partner.id}>
              <button type="button" onClick={() => void view(partner.id)}>
                {partner.display_name}
              </button>{' '}
              · {partner.status}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="partner-detail">
          <h3 id="partner-detail">{selected.display_name}</h3>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)}>
              Edit partner
            </button>
          ) : (
            <form onSubmit={(event) => void update(event)}>
              <label htmlFor="partner-edit-code">Partner code</label>
              <input
                id="partner-edit-code"
                required
                maxLength={80}
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value)}
              />
              <label htmlFor="partner-edit-name">Partner display name</label>
              <input
                id="partner-edit-name"
                required
                maxLength={160}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <button type="submit">Save partner</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={(event) =>
              void update(event, selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
            }
          >
            {selected.status === 'ACTIVE' ? 'Inactivate partner' : 'Activate partner'}
          </button>
        </section>
      )}
    </section>
  );
}
