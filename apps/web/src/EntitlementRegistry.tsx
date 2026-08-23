import {
  entitlementEnvelopeSchema,
  entitlementListEnvelopeSchema,
  subscriptionListEnvelopeSchema,
  tenantAdministrationSchema,
  type Entitlement,
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

const actions: Record<Entitlement['status'], readonly string[]> = {
  DRAFT: ['request-activation'],
  PENDING_ACTIVATION: ['activate'],
  ACTIVE: ['suspend', 'cancel', 'terminate'],
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
};

export function EntitlementRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [items, setItems] = useState<Entitlement[]>([]);
  const [selected, setSelected] = useState<Entitlement | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [subscriptions, setSubscriptions] = useState<{ id: string }[]>([]);
  const [subscriptionId, setSubscriptionId] = useState('');
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
  const apply = (entitlement: Entitlement) => {
    setSelected(entitlement);
    setItems((current) => [entitlement, ...current.filter((item) => item.id !== entitlement.id)]);
    setStart(entitlement.effective_from.slice(0, 16));
    setEnd(entitlement.effective_until?.slice(0, 16) ?? '');
    setOwnerId(entitlement.owner_membership_id);
    setState('ready');
  };
  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/entitlements`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const entitlements = entitlementListEnvelopeSchema.parse(await response.json()).data;
      setItems(entitlements);
      setState(entitlements.length ? 'ready' : 'empty');
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/entitlements/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      apply(entitlementEnvelopeSchema.parse(await response.json()).data);
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
      apply(entitlementEnvelopeSchema.parse(await response.json()).data);
      setEditing(false);
    } catch {
      setState('failed');
    }
  };
  const loadSubscriptions = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/subscriptions?limit=100`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const eligible = subscriptionListEnvelopeSchema
        .parse(await response.json())
        .data.filter((subscription) => subscription.status === 'ACTIVE')
        .map(({ id }) => ({ id }));
      setSubscriptions(eligible);
      if (eligible[0] && subscriptionId === '') setSubscriptionId(eligible[0].id);
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
      <h2>Entitlement Registry</h2>
      <section aria-label="Create Entitlement">
        {subscriptions.length === 0 ? (
          <button type="button" onClick={() => void loadSubscriptions()}>
            Load eligible ACTIVE Subscriptions
          </button>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutation('/api/v1/commercial/entitlements', {
                subscription_id: subscriptionId,
                effective_from: new Date(start).toISOString(),
                ...(end === '' ? {} : { effective_until: new Date(end).toISOString() }),
              });
            }}
          >
            <label htmlFor="entitlement-subscription">ACTIVE Subscription</label>
            <select
              id="entitlement-subscription"
              required
              value={subscriptionId}
              onChange={(event) => setSubscriptionId(event.target.value)}
            >
              {subscriptions.map((subscription) => (
                <option key={subscription.id} value={subscription.id}>
                  {subscription.id}
                </option>
              ))}
            </select>
            <label htmlFor="entitlement-start">Effective start</label>
            <input
              id="entitlement-start"
              type="datetime-local"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <label htmlFor="entitlement-end">Effective end (optional)</label>
            <input
              id="entitlement-end"
              type="datetime-local"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
            <p>
              Creation is explicit. Subscription activation never creates an Entitlement
              automatically.
            </p>
            <button type="submit" disabled={subscriptionId === '' || start === ''}>
              Create Entitlement
            </button>
          </form>
        )}
      </section>
      {state === 'loading' && <p role="status">Loading Entitlements…</p>}
      {state === 'empty' && <p>No Entitlements are registered.</p>}
      {state === 'validation' && (
        <p className="warning">Entitlement input or Subscription eligibility is invalid.</p>
      )}
      {state === 'unauthenticated' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Entitlement access is forbidden.</p>}
      {state === 'not-found' && <p className="warning">The selected Entitlement was not found.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Entitlement data changed. Authoritative state was reloaded.</p>
          <button type="button" onClick={() => void load()}>
            Reload Entitlements
          </button>
        </>
      )}
      {state === 'failed' && (
        <p className="warning">Entitlement Registry is unavailable. No data was fabricated.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Entitlements">
          {items.map((entitlement) => (
            <li key={entitlement.id}>
              <button type="button" onClick={() => void detail(entitlement.id)}>
                {entitlement.id}
              </button>{' '}
              · {entitlement.status} · version {entitlement.version}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="entitlement-detail">
          <h3 id="entitlement-detail">Entitlement {selected.id}</h3>
          <p>
            Status: <strong>{selected.status}</strong> · Version {selected.version}
          </p>
          <p>
            Authoritative origin: Subscription <code>{selected.subscription_id}</code> · Customer{' '}
            <code>{selected.customer_id}</code> · Contract <code>{selected.contract_id}</code> ·
            Plan <code>{selected.plan_id}</code>
            {selected.plan_feature_id ? (
              <>
                {' '}
                · Plan Feature <code>{selected.plan_feature_id}</code>
              </>
            ) : null}
          </p>
          <p>
            Content model: <strong>{selected.content_model}</strong>. No quantity, quota, metering,
            price or billing amount is represented.
          </p>
          <p>
            Effective dates: {selected.effective_from} — {selected.effective_until ?? 'open ended'}
          </p>
          {selected.status === 'DRAFT' && !editing && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit Entitlement
            </button>
          )}
          {selected.status === 'DRAFT' && editing && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void mutation(
                  `/api/v1/commercial/entitlements/${selected.id}`,
                  {
                    effective_from: new Date(start).toISOString(),
                    effective_until: end === '' ? null : new Date(end).toISOString(),
                    expected_version: selected.version,
                  },
                  'PATCH',
                );
              }}
            >
              <label htmlFor="entitlement-edit-start">Effective start</label>
              <input
                id="entitlement-edit-start"
                type="datetime-local"
                required
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <label htmlFor="entitlement-edit-end">Effective end</label>
              <input
                id="entitlement-edit-end"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
              <button type="submit">Save Entitlement</button>
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
                  void mutation(`/api/v1/commercial/entitlements/${selected.id}/assign`, {
                    owner_membership_id: ownerId,
                    expected_version: selected.version,
                  });
                }}
              >
                <label htmlFor="entitlement-owner">Owner membership</label>
                <select
                  id="entitlement-owner"
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
          <div aria-label="Entitlement lifecycle actions">
            {actions[selected.status].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() =>
                  void mutation(`/api/v1/commercial/entitlements/${selected.id}/${action}`, {
                    expected_version: selected.version,
                  })
                }
              >
                {labels[action]}
              </button>
            ))}
          </div>
          {terminal && (
            <p role="status">
              This terminal Entitlement is immutable. It does not create usage, billing or other
              downstream side effects.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
