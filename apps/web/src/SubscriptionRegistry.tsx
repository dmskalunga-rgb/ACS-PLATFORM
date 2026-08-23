import {
  contractListEnvelopeSchema,
  subscriptionEnvelopeSchema,
  subscriptionListEnvelopeSchema,
  tenantAdministrationSchema,
  type Subscription,
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

const actions: Record<Subscription['status'], readonly string[]> = {
  DRAFT: ['request-activation'],
  PENDING_ACTIVATION: ['activate'],
  ACTIVE: ['suspend', 'cancel', 'terminate', 'renew'],
  SUSPENDED: ['resume', 'cancel', 'terminate'],
  CANCELLED: [],
  TERMINATED: [],
};
const labels: Record<string, string> = {
  'request-activation': 'Request activation',
  activate: 'Activate',
  suspend: 'Suspend',
  resume: 'Resume',
  cancel: 'Cancel',
  terminate: 'Terminate',
  renew: 'Renew explicitly',
};

export function SubscriptionRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [items, setItems] = useState<Subscription[]>([]);
  const [selected, setSelected] = useState<Subscription | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [contracts, setContracts] = useState<{ id: string }[]>([]);
  const [contractId, setContractId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editing, setEditing] = useState(false);
  const [owners, setOwners] = useState<{ id: string }[] | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const headers = useCallback(
    (idempotency = false) => ({
      authorization,
      'x-acs-tenant-id': tenantId,
      'content-type': 'application/json',
      ...(idempotency ? { 'idempotency-key': crypto.randomUUID() } : {}),
    }),
    [authorization, tenantId],
  );
  const fail = useCallback(
    (status: number) =>
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
      ),
    [],
  );
  const apply = (subscription: Subscription) => {
    setSelected(subscription);
    setItems((current) => [subscription, ...current.filter((item) => item.id !== subscription.id)]);
    setStart(subscription.effective_from.slice(0, 16));
    setEnd(subscription.effective_until?.slice(0, 16) ?? '');
    setOwnerId(subscription.owner_membership_id);
    setState('ready');
  };
  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/subscriptions?limit=100`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const subscriptions = subscriptionListEnvelopeSchema.parse(await response.json()).data;
      setItems(subscriptions);
      setState(subscriptions.length ? 'ready' : 'empty');
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/subscriptions/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      apply(subscriptionEnvelopeSchema.parse(await response.json()).data);
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
      if (!response.ok) {
        fail(response.status);
        if (response.status === 409) void load();
        return;
      }
      apply(subscriptionEnvelopeSchema.parse(await response.json()).data);
      setEditing(false);
    } catch {
      setState('failed');
    }
  };
  const loadContracts = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/contracts?limit=100`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const eligible = contractListEnvelopeSchema
        .parse(await response.json())
        .data.filter((contract) => contract.status === 'ACTIVE')
        .map(({ id }) => ({ id }));
      setContracts(eligible);
      if (eligible[0] && contractId === '') setContractId(eligible[0].id);
    } catch {
      setState('failed');
    }
  };
  const loadOwners = async () => {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/platform/tenants/${tenantId}/administration`,
        { headers: { authorization } },
      );
      if (!response.ok) return fail(response.status);
      const active = tenantAdministrationSchema
        .parse(await response.json())
        .data.memberships.filter((membership) => membership.status === 'ACTIVE');
      setOwners(active);
      if (active[0] && !active.some((membership) => membership.id === ownerId))
        setOwnerId(active[0].id);
    } catch {
      setState('failed');
    }
  };
  const terminal = selected !== null && ['CANCELLED', 'TERMINATED'].includes(selected.status);
  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Subscription Registry</h2>
      <section aria-label="Create Subscription">
        {contracts.length === 0 ? (
          <button type="button" onClick={() => void loadContracts()}>
            Load eligible ACTIVE Contracts
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutation('/api/v1/commercial/subscriptions', {
                contract_id: contractId,
                effective_from: new Date(start).toISOString(),
                ...(end === '' ? {} : { effective_until: new Date(end).toISOString() }),
              });
            }}
          >
            <label htmlFor="subscription-contract">ACTIVE Contract</label>
            <select
              id="subscription-contract"
              required
              value={contractId}
              onChange={(event) => setContractId(event.target.value)}
            >
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.id}
                </option>
              ))}
            </select>
            <label htmlFor="subscription-start">Effective start</label>
            <input
              id="subscription-start"
              type="datetime-local"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <label htmlFor="subscription-end">Effective end (optional)</label>
            <input
              id="subscription-end"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <p>
              Creation is explicit. Contract activation does not create a Subscription
              automatically.
            </p>
            <button type="submit" disabled={contractId === '' || start === ''}>
              Create Subscription
            </button>
          </form>
        )}
      </section>
      {state === 'loading' && <p role="status">Loading Subscriptions…</p>}
      {state === 'empty' && <p>No Subscriptions are registered.</p>}
      {state === 'validation' && (
        <p className="warning">Subscription input or Contract eligibility is invalid.</p>
      )}
      {state === 'unauthenticated' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Subscription access is forbidden.</p>}
      {state === 'not-found' && <p className="warning">The selected Subscription was not found.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Subscription data changed. Authoritative state was reloaded.</p>
          <button type="button" onClick={() => void load()}>
            Reload Subscriptions
          </button>
        </>
      )}
      {state === 'failed' && (
        <p className="warning">Subscription Registry is unavailable. No data was fabricated.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Subscriptions">
          {items.map((subscription) => (
            <li key={subscription.id}>
              <button type="button" onClick={() => void detail(subscription.id)}>
                {subscription.id}
              </button>{' '}
              · {subscription.status} · revision {subscription.revision_number}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="subscription-detail">
          <h3 id="subscription-detail">Subscription {selected.id}</h3>
          <p>
            Status: <strong>{selected.status}</strong> · Revision {selected.revision_number} ·
            Version {selected.version}
          </p>
          <p>
            Immutable Contract origin: <code>{selected.source_contract_id}</code> · source revision{' '}
            {selected.source_contract_revision_number}
          </p>
          <p>
            Authoritative Customer origin: <code>{selected.customer_id}</code>
          </p>
          <p>
            Effective dates: {selected.effective_from} — {selected.effective_until ?? 'open ended'}
          </p>
          {selected.status === 'DRAFT' && !editing && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit Subscription
            </button>
          )}
          {selected.status === 'DRAFT' && editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutation(
                  `/api/v1/commercial/subscriptions/${selected.id}`,
                  {
                    effective_from: new Date(start).toISOString(),
                    effective_until: end === '' ? null : new Date(end).toISOString(),
                    expected_version: selected.version,
                  },
                  'PATCH',
                );
              }}
            >
              <label htmlFor="subscription-edit-start">Effective start</label>
              <input
                id="subscription-edit-start"
                type="datetime-local"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <label htmlFor="subscription-edit-end">Effective end</label>
              <input
                id="subscription-edit-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
              <button type="submit">Save Subscription</button>
              <button type="button" onClick={() => setEditing(false)}>
                Cancel edit
              </button>
            </form>
          )}
          {selected.status === 'DRAFT' &&
            (owners === null ? (
              <button type="button" onClick={() => void loadOwners()}>
                Load active owner options
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutation(`/api/v1/commercial/subscriptions/${selected.id}/assign`, {
                    owner_membership_id: ownerId,
                    expected_version: selected.version,
                  });
                }}
              >
                <label htmlFor="subscription-owner">Owner membership</label>
                <select
                  id="subscription-owner"
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                >
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.id}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={owners.length === 0}>
                  Assign owner
                </button>
              </form>
            ))}
          <div aria-label="Subscription lifecycle actions">
            {actions[selected.status].map((action) =>
              action === 'renew' ? (
                <form
                  key={action}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutation(`/api/v1/commercial/subscriptions/${selected.id}/renew`, {
                      effective_until: new Date(end).toISOString(),
                      expected_version: selected.version,
                    });
                  }}
                >
                  <label htmlFor="subscription-renew-end">Renewal end date</label>
                  <input
                    id="subscription-renew-end"
                    type="datetime-local"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                  <button type="submit">{labels[action]}</button>
                </form>
              ) : (
                <button
                  key={action}
                  type="button"
                  onClick={() =>
                    void mutation(`/api/v1/commercial/subscriptions/${selected.id}/${action}`, {
                      expected_version: selected.version,
                    })
                  }
                >
                  {labels[action]}
                </button>
              ),
            )}
          </div>
          {terminal && (
            <p role="status">
              This terminal Subscription is immutable. No downstream entitlement, usage or financial
              action is created.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
