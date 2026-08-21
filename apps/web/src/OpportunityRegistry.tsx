import {
  opportunityEnvelopeSchema,
  opportunityListEnvelopeSchema,
  opportunityStageSchema,
  type Opportunity,
} from '@acs/contracts';
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

const transitions: Record<Opportunity['stage'], Opportunity['stage'][]> = {
  QUALIFICATION: ['DISCOVERY', 'LOST'],
  DISCOVERY: ['PROPOSAL', 'LOST'],
  PROPOSAL: ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

export function OpportunityRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [state, setState] = useState<State>('loading');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    opportunity_code: '',
    title: '',
    owner_membership_id: '',
    probability_percent: '',
    expected_close_date: '',
  });
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/opportunities?limit=25`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const data = opportunityListEnvelopeSchema.parse(await response.json()).data;
      setOpportunities(data);
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
  const populate = (opportunity: Opportunity) => {
    setSelected(opportunity);
    setForm({
      opportunity_code: opportunity.opportunity_code,
      title: opportunity.title,
      owner_membership_id: opportunity.owner_membership_id,
      probability_percent: opportunity.probability_percent?.toString() ?? '',
      expected_close_date: opportunity.expected_close_date ?? '',
    });
  };
  const view = async (id: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/opportunities/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      populate(opportunityEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('error');
    }
  };
  const body = (includeCode: boolean) => ({
    ...(includeCode ? { opportunity_code: form.opportunity_code } : {}),
    title: form.title,
    owner_membership_id: form.owner_membership_id,
    probability_percent: form.probability_percent === '' ? null : Number(form.probability_percent),
    expected_close_date: form.expected_close_date === '' ? null : form.expected_close_date,
  });
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/opportunities`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body(true)),
      });
      if (!response.ok) return fail(response.status);
      populate(opportunityEnvelopeSchema.parse(await response.json()).data);
      setEditing(false);
      await load();
    } catch {
      setState('error');
    }
  };
  const update = async (event: React.FormEvent, stage?: Opportunity['stage']) => {
    event.preventDefault();
    if (!selected) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/opportunities/${selected.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...(stage === undefined ? body(true) : { stage }),
          expected_version: selected.version,
        }),
      });
      if (!response.ok) return fail(response.status);
      populate(opportunityEnvelopeSchema.parse(await response.json()).data);
      setEditing(false);
      await load();
    } catch {
      setState('error');
    }
  };
  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Opportunity Registry</h2>
      <form onSubmit={(event) => void create(event)}>
        <label htmlFor="opportunity-code">Opportunity code</label>
        <input
          id="opportunity-code"
          required
          maxLength={80}
          value={form.opportunity_code}
          onChange={(event) => setForm({ ...form, opportunity_code: event.target.value })}
        />
        <label htmlFor="opportunity-title">Title</label>
        <input
          id="opportunity-title"
          required
          maxLength={160}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <label htmlFor="opportunity-owner">Owner membership ID</label>
        <input
          id="opportunity-owner"
          required
          value={form.owner_membership_id}
          onChange={(event) => setForm({ ...form, owner_membership_id: event.target.value })}
        />
        <label htmlFor="opportunity-probability">Probability percent</label>
        <input
          id="opportunity-probability"
          type="number"
          min="0"
          max="100"
          value={form.probability_percent}
          onChange={(event) => setForm({ ...form, probability_percent: event.target.value })}
        />
        <label htmlFor="opportunity-close-date">Expected close date</label>
        <input
          id="opportunity-close-date"
          type="date"
          value={form.expected_close_date}
          onChange={(event) => setForm({ ...form, expected_close_date: event.target.value })}
        />
        <button type="submit" disabled={state === 'loading'}>
          Create opportunity
        </button>
      </form>
      {state === 'loading' && <p role="status">Loading opportunities…</p>}
      {state === 'empty' && <p>No opportunities are registered.</p>}
      {state === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Opportunity access is forbidden.</p>}
      {state === 'not-found' && <p className="warning">The selected opportunity was not found.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Opportunity data changed. Reload before retrying.</p>
          <button type="button" onClick={() => void load()}>
            Reload opportunities
          </button>
        </>
      )}
      {state === 'error' && (
        <p className="warning">Opportunity Registry is unavailable. No data was fabricated.</p>
      )}
      {state === 'success' && (
        <ul>
          {opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <button type="button" onClick={() => void view(opportunity.id)}>
                {opportunity.title}
              </button>{' '}
              · {opportunity.stage}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="opportunity-detail">
          <h3 id="opportunity-detail">{selected.title}</h3>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)}>
              Edit opportunity
            </button>
          ) : (
            <form onSubmit={(event) => void update(event)}>
              <label htmlFor="opportunity-edit-title">Title</label>
              <input
                id="opportunity-edit-title"
                required
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <label htmlFor="opportunity-edit-probability">Probability percent</label>
              <input
                id="opportunity-edit-probability"
                type="number"
                min="0"
                max="100"
                value={form.probability_percent}
                onChange={(event) => setForm({ ...form, probability_percent: event.target.value })}
              />
              <label htmlFor="opportunity-edit-close-date">Expected close date</label>
              <input
                id="opportunity-edit-close-date"
                type="date"
                value={form.expected_close_date}
                onChange={(event) => setForm({ ...form, expected_close_date: event.target.value })}
              />
              <button type="submit">Save opportunity</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </form>
          )}
          {transitions[selected.stage].map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={(event) => void update(event, opportunityStageSchema.parse(stage))}
            >
              Move to {stage}
            </button>
          ))}
        </section>
      )}
    </section>
  );
}
