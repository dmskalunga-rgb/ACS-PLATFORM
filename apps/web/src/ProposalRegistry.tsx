import { proposalEnvelopeSchema, proposalListEnvelopeSchema, type Proposal } from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type State =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'failed';

type DraftForm = {
  proposal_code: string;
  title: string;
  opportunity_id: string;
  currency_code: string;
  valid_until: string;
};

const allowedActions: Record<Proposal['status'], readonly string[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['return-to-draft', 'approve'],
  APPROVED: ['revise', 'send', 'cancel'],
  SENT: ['accept', 'reject', 'cancel', 'expire'],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};
const actionLabels: Record<string, string> = {
  submit: 'Submit for approval',
  'return-to-draft': 'Return to draft',
  approve: 'Approve',
  revise: 'Revise',
  send: 'Send',
  accept: 'Accept',
  reject: 'Reject',
  cancel: 'Cancel',
  expire: 'Expire',
};
const blankForm: DraftForm = {
  proposal_code: '',
  title: '',
  opportunity_id: '',
  currency_code: 'USD',
  valid_until: '',
};

export function ProposalRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [state, setState] = useState<State>('loading');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftForm>(blankForm);
  const [line, setLine] = useState({ plan_id: '', quantity: '1', unit_price: '0.00' });
  const [owner, setOwner] = useState('');
  const headers = useCallback(
    (key?: string) => ({
      'content-type': 'application/json',
      authorization,
      'x-acs-tenant-id': tenantId,
      ...(key ? { 'idempotency-key': key } : {}),
    }),
    [authorization, tenantId],
  );
  const failure = useCallback((status: number) => {
    setState(
      status === 401
        ? 'unauthenticated'
        : status === 403
          ? 'forbidden'
          : status === 404
            ? 'not-found'
            : status === 409
              ? 'conflict'
              : status === 400
                ? 'validation'
                : 'failed',
    );
  }, []);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/proposals?limit=25`, {
        headers: headers(),
      });
      if (!response.ok) return failure(response.status);
      const data = proposalListEnvelopeSchema.parse(await response.json()).data;
      setItems(data);
      setState(data.length ? 'ready' : 'empty');
    } catch {
      setState('failed');
    }
  }, [apiBaseUrl, failure, headers]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const apply = (proposal: Proposal) => {
    setSelected(proposal);
    setItems((current) => [proposal, ...current.filter((item) => item.id !== proposal.id)]);
    setForm({
      proposal_code: proposal.proposal_code,
      title: proposal.title,
      opportunity_id: proposal.opportunity_id,
      currency_code: proposal.currency_code,
      valid_until: proposal.valid_until.slice(0, 16),
    });
    setOwner(proposal.owner_membership_id);
    setState('ready');
  };
  const select = async (id: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/proposals/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return failure(response.status);
      apply(proposalEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('failed');
    }
  };
  const formPayload = (includeCode: boolean) => ({
    ...(includeCode ? { proposal_code: form.proposal_code } : {}),
    title: form.title,
    opportunity_id: form.opportunity_id,
    currency_code: form.currency_code,
    valid_until: new Date(form.valid_until).toISOString(),
  });
  const mutate = async (url: string, method: string, body: unknown) => {
    try {
      const response = await fetch(`${apiBaseUrl}${url}`, {
        method,
        headers: headers(crypto.randomUUID()),
        body: JSON.stringify(body),
      });
      if (!response.ok) return failure(response.status);
      apply(proposalEnvelopeSchema.parse(await response.json()).data);
      return true;
    } catch {
      setState('failed');
      return false;
    }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await mutate('/api/v1/commercial/proposals', 'POST', formPayload(true));
    if (ok) setEditing(false);
  };
  const update = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const ok = await mutate(`/api/v1/commercial/proposals/${selected.id}`, 'PATCH', {
      ...formPayload(false),
      expected_version: selected.version,
    });
    if (ok) setEditing(false);
  };
  const transition = (action: string) =>
    selected &&
    mutate(`/api/v1/commercial/proposals/${selected.id}/${action}`, 'POST', {
      expected_version: selected.version,
    });
  const assign = () =>
    selected &&
    mutate(`/api/v1/commercial/proposals/${selected.id}/assign`, 'POST', {
      owner_membership_id: owner,
      expected_version: selected.version,
    });
  const addLine = (event: React.FormEvent) => {
    event.preventDefault();
    return (
      selected &&
      mutate(`/api/v1/commercial/proposals/${selected.id}/lines`, 'POST', {
        ...line,
        expected_version: selected.version,
      })
    );
  };
  const updateLine = (id: string, quantity: string, unitPrice: string) =>
    selected &&
    mutate(`/api/v1/commercial/proposals/${selected.id}/lines/${id}`, 'PATCH', {
      quantity,
      unit_price: unitPrice,
      expected_version: selected.version,
    });
  const removeLine = (id: string) =>
    selected &&
    mutate(`/api/v1/commercial/proposals/${selected.id}/lines/${id}`, 'DELETE', {
      expected_version: selected.version,
    });
  const reload = () => {
    setState('loading');
    void load();
  };
  const canEdit = selected?.status === 'DRAFT';

  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Proposal / quotation registry</h2>
      <form onSubmit={(event) => void create(event)}>
        <label htmlFor="proposal-code">Proposal code</label>
        <input
          id="proposal-code"
          required
          maxLength={80}
          value={form.proposal_code}
          onChange={(event) => setForm({ ...form, proposal_code: event.target.value })}
        />
        <label htmlFor="proposal-title">Title</label>
        <input
          id="proposal-title"
          required
          maxLength={160}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <label htmlFor="proposal-opportunity">Opportunity ID</label>
        <input
          id="proposal-opportunity"
          required
          value={form.opportunity_id}
          onChange={(event) => setForm({ ...form, opportunity_id: event.target.value })}
        />
        <label htmlFor="proposal-currency">Currency</label>
        <input
          id="proposal-currency"
          required
          maxLength={3}
          value={form.currency_code}
          onChange={(event) =>
            setForm({ ...form, currency_code: event.target.value.toUpperCase() })
          }
        />
        <label htmlFor="proposal-valid-until">Valid until</label>
        <input
          id="proposal-valid-until"
          type="datetime-local"
          required
          value={form.valid_until}
          onChange={(event) => setForm({ ...form, valid_until: event.target.value })}
        />
        <button type="submit" disabled={state === 'loading'}>
          Create proposal
        </button>
      </form>
      {state === 'loading' && <p role="status">Loading proposals…</p>}
      {state === 'empty' && <p>No proposals are registered.</p>}
      {state === 'unauthenticated' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Proposal access is forbidden.</p>}
      {state === 'not-found' && <p className="warning">The selected proposal was not found.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Proposal data changed. Reload before retrying.</p>
          <button type="button" onClick={reload}>
            Reload proposals
          </button>
        </>
      )}
      {state === 'validation' && (
        <p className="warning">Proposal input or lifecycle state is invalid.</p>
      )}
      {state === 'failed' && (
        <p className="warning">Proposal Registry is unavailable. No data was fabricated.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Proposals">
          {items.map((proposal) => (
            <li key={proposal.id}>
              <button type="button" onClick={() => void select(proposal.id)}>
                {proposal.title}
              </button>{' '}
              · {proposal.status} · revision {proposal.revision_number}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="proposal-detail">
          <h3 id="proposal-detail">{selected.title}</h3>
          <p>
            Status: <strong>{selected.status}</strong> · Revision {selected.revision_number}
          </p>
          <p>
            Totals: {selected.currency_code} {selected.proposal_subtotal} subtotal ·{' '}
            {selected.currency_code} {selected.grand_total} grand total
          </p>
          {canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit proposal
            </button>
          )}
          {editing && canEdit && (
            <form onSubmit={(event) => void update(event)}>
              <label htmlFor="proposal-edit-title">Title</label>
              <input
                id="proposal-edit-title"
                required
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <label htmlFor="proposal-edit-valid-until">Valid until</label>
              <input
                id="proposal-edit-valid-until"
                type="datetime-local"
                required
                value={form.valid_until}
                onChange={(event) => setForm({ ...form, valid_until: event.target.value })}
              />
              <button type="submit">Save proposal</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel edit
              </button>
            </form>
          )}
          {canEdit && (
            <>
              <form onSubmit={(event) => void addLine(event)}>
                <h4>Add line item</h4>
                <label htmlFor="proposal-line-plan">Plan ID</label>
                <input
                  id="proposal-line-plan"
                  required
                  value={line.plan_id}
                  onChange={(event) => setLine({ ...line, plan_id: event.target.value })}
                />
                <label htmlFor="proposal-line-quantity">Quantity</label>
                <input
                  id="proposal-line-quantity"
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => setLine({ ...line, quantity: event.target.value })}
                />
                <label htmlFor="proposal-line-price">Unit price</label>
                <input
                  id="proposal-line-price"
                  required
                  inputMode="decimal"
                  value={line.unit_price}
                  onChange={(event) => setLine({ ...line, unit_price: event.target.value })}
                />
                <button type="submit">Add line item</button>
              </form>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void assign();
                }}
              >
                <label htmlFor="proposal-owner">Owner membership ID</label>
                <input
                  id="proposal-owner"
                  required
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                />
                <button type="submit">Assign owner</button>
              </form>
            </>
          )}
          <h4>Line items</h4>
          <ul aria-label="Proposal line items">
            {selected.lines.map((item) => (
              <li key={item.id}>
                {canEdit ? (
                  <EditableLine item={item} onSave={updateLine} onRemove={removeLine} />
                ) : (
                  <>
                    {item.plan_name_snapshot}: {item.quantity} × {selected.currency_code}{' '}
                    {item.unit_price} = {selected.currency_code} {item.line_subtotal}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div aria-label="Proposal lifecycle actions">
            {allowedActions[selected.status].map((action) => (
              <button type="button" key={action} onClick={() => void transition(action)}>
                {actionLabels[action]}
              </button>
            ))}
          </div>
          {['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(selected.status) && (
            <p role="status">This terminal proposal is immutable.</p>
          )}
        </section>
      )}
    </section>
  );
}

function EditableLine({
  item,
  onSave,
  onRemove,
}: {
  readonly item: Proposal['lines'][number];
  readonly onSave: (id: string, quantity: string, unitPrice: string) => unknown;
  readonly onRemove: (id: string) => unknown;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [unitPrice, setUnitPrice] = useState(item.unit_price);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(item.id, quantity, unitPrice);
      }}
    >
      <span>{item.plan_name_snapshot}: </span>
      <label>
        Quantity{' '}
        <input
          aria-label={`Quantity for line ${item.line_number}`}
          required
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <label>
        Unit price{' '}
        <input
          aria-label={`Unit price for line ${item.line_number}`}
          required
          inputMode="decimal"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
        />
      </label>
      <button type="submit">Save line {item.line_number}</button>
      <button type="button" onClick={() => void onRemove(item.id)}>
        Remove line {item.line_number}
      </button>
    </form>
  );
}
