import {
  contractEnvelopeSchema,
  contractListEnvelopeSchema,
  tenantAdministrationSchema,
  type Contract,
} from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type ViewState =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'failed';

const actions: Record<Contract['status'], readonly string[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['return-to-draft', 'approve'],
  APPROVED: ['revise', 'activate', 'cancel'],
  ACTIVE: ['terminate'],
  CANCELLED: [],
  TERMINATED: [],
};
const labels: Record<string, string> = {
  submit: 'Submit for approval',
  'return-to-draft': 'Return to draft',
  approve: 'Approve',
  revise: 'Revise',
  activate: 'Activate',
  cancel: 'Cancel',
  terminate: 'Terminate',
};

export function ContractRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [items, setItems] = useState<Contract[]>([]);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [editing, setEditing] = useState(false);
  const [sourceProposalId, setSourceProposalId] = useState('');
  const [title, setTitle] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [ownerMembershipId, setOwnerMembershipId] = useState('');
  const [ownerOptions, setOwnerOptions] = useState<{ id: string }[] | null>(null);
  const [line, setLine] = useState({ plan_id: '', quantity: '1', unit_price: '0.0000' });
  const headers = useCallback(
    (idempotency = false) => ({
      authorization,
      'x-acs-tenant-id': tenantId,
      'content-type': 'application/json',
      ...(idempotency ? { 'idempotency-key': crypto.randomUUID() } : {}),
    }),
    [authorization, tenantId],
  );
  const fail = useCallback((status: number) => {
    setState(
      status === 400
        ? 'validation'
        : status === 401
          ? 'unauthenticated'
          : status === 403
            ? 'forbidden'
            : status === 404
              ? 'not-found'
              : status === 409
                ? 'conflict'
                : 'failed',
    );
  }, []);
  const apply = (contract: Contract) => {
    setSelected(contract);
    setItems((current) => [contract, ...current.filter((item) => item.id !== contract.id)]);
    setTitle(contract.title);
    setEffectiveFrom(contract.effective_from?.slice(0, 16) ?? '');
    setEffectiveUntil(contract.effective_until?.slice(0, 16) ?? '');
    setOwnerMembershipId(contract.owner_membership_id);
    setState('ready');
  };
  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/contracts?limit=25`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const contracts = contractListEnvelopeSchema.parse(await response.json()).data;
      setItems(contracts);
      setState(contracts.length ? 'ready' : 'empty');
    } catch {
      setState('failed');
    }
  }, [apiBaseUrl, fail, headers]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const detail = async (id: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/contracts/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      apply(contractEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('failed');
    }
  };
  const mutation = async (path: string, body: object, method = 'POST') => {
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: headers(true),
        body: JSON.stringify(body),
      });
      if (!response.ok) return fail(response.status);
      apply(contractEnvelopeSchema.parse(await response.json()).data);
      setEditing(false);
    } catch {
      setState('failed');
    }
  };
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    void mutation('/api/v1/commercial/contracts', { source_proposal_id: sourceProposalId });
  };
  const loadOwnerOptions = async () => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/platform/tenants/${tenantId}/administration`,
        { headers: { authorization } },
      );
      if (!response.ok) return fail(response.status);
      const active = tenantAdministrationSchema
        .parse(await response.json())
        .data.memberships.filter((membership) => membership.status === 'ACTIVE');
      setOwnerOptions(active);
      if (active[0] && !active.some((membership) => membership.id === ownerMembershipId))
        setOwnerMembershipId(active[0].id);
    } catch {
      setState('failed');
    }
  };
  const terminal = selected && ['CANCELLED', 'TERMINATED'].includes(selected.status);
  const editable = selected?.status === 'DRAFT';
  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Contract Registry</h2>
      <form onSubmit={create}>
        <label htmlFor="contract-source-proposal">Accepted Proposal ID</label>
        <input
          id="contract-source-proposal"
          required
          value={sourceProposalId}
          onChange={(event) => setSourceProposalId(event.target.value)}
        />
        <p>
          Creating a Contract is explicit; acceptance of a Proposal does not create one
          automatically.
        </p>
        <button type="submit" disabled={state === 'loading'}>
          Create Contract from accepted Proposal
        </button>
      </form>
      {state === 'loading' && <p role="status">Loading Contracts…</p>}
      {state === 'empty' && <p>No Contracts are registered.</p>}
      {state === 'validation' && (
        <p className="warning">Contract input or source eligibility is invalid.</p>
      )}
      {state === 'unauthenticated' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Contract access is forbidden.</p>}
      {state === 'not-found' && <p className="warning">The selected Contract was not found.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Contract data changed. Reload before retrying.</p>
          <button type="button" onClick={() => void load()}>
            Reload Contracts
          </button>
        </>
      )}
      {state === 'failed' && (
        <p className="warning">Contract Registry is unavailable. No data was fabricated.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Contracts">
          {items.map((contract) => (
            <li key={contract.id}>
              <button type="button" onClick={() => void detail(contract.id)}>
                {contract.title}
              </button>{' '}
              · {contract.status} · revision {contract.revision_number}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="contract-detail">
          <h3 id="contract-detail">{selected.title}</h3>
          <p>
            Status: <strong>{selected.status}</strong> · Revision {selected.revision_number} ·
            Version {selected.version}
          </p>
          <p>
            Origin Proposal: <code>{selected.source_proposal_code}</code> (
            {selected.source_proposal_id})
          </p>
          <p>
            Authoritative totals: {selected.currency_code} {selected.contract_subtotal} subtotal ·{' '}
            {selected.currency_code} {selected.grand_total} grand total
          </p>
          <p>
            Effective dates: {selected.effective_from ?? 'not set'} —{' '}
            {selected.effective_until ?? 'not set'}
          </p>
          {editable && !editing && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit Contract
            </button>
          )}
          {editable && editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutation(
                  `/api/v1/commercial/contracts/${selected.id}`,
                  {
                    title,
                    effective_from:
                      effectiveFrom === '' ? null : new Date(effectiveFrom).toISOString(),
                    effective_until:
                      effectiveUntil === '' ? null : new Date(effectiveUntil).toISOString(),
                    expected_version: selected.version,
                  },
                  'PATCH',
                );
              }}
            >
              <label htmlFor="contract-edit-title">Title</label>
              <input
                id="contract-edit-title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <label htmlFor="contract-effective-from">Effective from</label>
              <input
                id="contract-effective-from"
                type="datetime-local"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
              <label htmlFor="contract-effective-until">Effective until</label>
              <input
                id="contract-effective-until"
                type="datetime-local"
                value={effectiveUntil}
                onChange={(event) => setEffectiveUntil(event.target.value)}
              />
              <button type="submit">Save Contract</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel edit
              </button>
            </form>
          )}
          {editable && (
            <>
              {ownerOptions === null ? (
                <button type="button" onClick={() => void loadOwnerOptions()}>
                  Load active owner options
                </button>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutation(`/api/v1/commercial/contracts/${selected.id}/assign`, {
                      owner_membership_id: ownerMembershipId,
                      expected_version: selected.version,
                    });
                  }}
                >
                  <label htmlFor="contract-owner">Owner membership</label>
                  <select
                    id="contract-owner"
                    required
                    value={ownerMembershipId}
                    onChange={(event) => setOwnerMembershipId(event.target.value)}
                  >
                    {ownerOptions.map((membership) => (
                      <option key={membership.id} value={membership.id}>
                        {membership.id}
                      </option>
                    ))}
                  </select>
                  <button type="submit" disabled={ownerOptions.length === 0}>
                    Assign owner
                  </button>
                </form>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutation(`/api/v1/commercial/contracts/${selected.id}/lines`, {
                    ...line,
                    expected_version: selected.version,
                  });
                }}
              >
                <h4>Add line item</h4>
                <label htmlFor="contract-line-plan">Plan ID</label>
                <input
                  id="contract-line-plan"
                  required
                  value={line.plan_id}
                  onChange={(event) => setLine({ ...line, plan_id: event.target.value })}
                />
                <label htmlFor="contract-line-quantity">Quantity</label>
                <input
                  id="contract-line-quantity"
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => setLine({ ...line, quantity: event.target.value })}
                />
                <label htmlFor="contract-line-price">Unit price</label>
                <input
                  id="contract-line-price"
                  required
                  inputMode="decimal"
                  value={line.unit_price}
                  onChange={(event) => setLine({ ...line, unit_price: event.target.value })}
                />
                <button type="submit">Add line item</button>
              </form>
            </>
          )}
          <h4>Line items</h4>
          <ul aria-label="Contract line items">
            {selected.lines.map((item) => (
              <li key={item.id}>
                {editable ? (
                  <EditableContractLine
                    item={item}
                    onRemove={() => {
                      void mutation(
                        `/api/v1/commercial/contracts/${selected.id}/lines/${item.id}`,
                        { expected_version: selected.version },
                        'DELETE',
                      );
                    }}
                    onSave={(quantity, unitPrice) => {
                      void mutation(
                        `/api/v1/commercial/contracts/${selected.id}/lines/${item.id}`,
                        {
                          quantity,
                          unit_price: unitPrice,
                          expected_version: selected.version,
                        },
                        'PATCH',
                      );
                    }}
                  />
                ) : (
                  <>
                    {item.plan_name_snapshot}: {item.quantity} × {selected.currency_code}{' '}
                    {item.unit_price} = {selected.currency_code} {item.line_subtotal}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div aria-label="Contract lifecycle actions">
            {actions[selected.status].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() =>
                  void mutation(`/api/v1/commercial/contracts/${selected.id}/${action}`, {
                    expected_version: selected.version,
                  })
                }
              >
                {labels[action]}
              </button>
            ))}
          </div>
          {terminal && <p role="status">This terminal Contract is immutable.</p>}
          {selected.status === 'APPROVED' && (
            <p>Revising returns this Contract to DRAFT for a new approval cycle.</p>
          )}
        </section>
      )}
    </section>
  );
}

function EditableContractLine({
  item,
  onRemove,
  onSave,
}: {
  readonly item: Contract['lines'][number];
  readonly onRemove: () => void;
  readonly onSave: (quantity: string, unitPrice: string) => void;
}) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [unitPrice, setUnitPrice] = useState(item.unit_price);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(quantity, unitPrice);
      }}
    >
      <span>{item.plan_name_snapshot}: </span>
      <label>
        Quantity{' '}
        <input
          aria-label={`Quantity for Contract line ${item.line_number}`}
          required
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <label>
        Unit price{' '}
        <input
          aria-label={`Unit price for Contract line ${item.line_number}`}
          required
          inputMode="decimal"
          value={unitPrice}
          onChange={(event) => setUnitPrice(event.target.value)}
        />
      </label>
      <button type="submit">Save line {item.line_number}</button>
      <button type="button" onClick={onRemove}>
        Remove line {item.line_number}
      </button>
    </form>
  );
}
