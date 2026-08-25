import {
  ratePlanEnvelopeSchema,
  ratePlanListEnvelopeSchema,
  ratedFactEnvelopeSchema,
  ratedFactListEnvelopeSchema,
  subscriptionListEnvelopeSchema,
  type RatePlan,
  type RatedFact,
} from '@acs/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const actions: Record<RatePlan['versions'][number]['status'], readonly string[]> = {
  DRAFT: ['submit'],
  PENDING_APPROVAL: ['approve'],
  APPROVED: ['activate', 'retire'],
  ACTIVE: ['supersede', 'retire'],
  SUPERSEDED: [],
  RETIRED: [],
};

const actionLabel: Record<string, string> = {
  submit: 'Submit for approval',
  approve: 'Approve',
  activate: 'Activate',
  supersede: 'Supersede',
  retire: 'Retire',
};

const formatAmount = (value: string, currency = 'USD') => `${currency} ${value}`;

export function RatingRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [plans, setPlans] = useState<RatePlan[]>([]);
  const [facts, setFacts] = useState<RatedFact[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<RatePlan | null>(null);
  const [selectedFact, setSelectedFact] = useState<RatedFact | null>(null);
  const [state, setState] = useState<ViewState>('loading');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [subscriptions, setSubscriptions] = useState<{ id: string }[]>([]);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reratingReason, setReratingReason] = useState('');

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
  const latest = selectedPlan?.versions.at(-1) ?? null;
  const selectedVersions = useMemo(() => selectedPlan?.versions ?? [], [selectedPlan]);
  const applyPlan = (plan: RatePlan) => {
    setSelectedPlan(plan);
    setDraftName(plan.name);
    setPlans((current) => [plan, ...current.filter((item) => item.id !== plan.id)]);
    setState('ready');
  };
  const applyFact = (fact: RatedFact) => {
    setSelectedFact(fact);
    setFacts((current) => [fact, ...current.filter((item) => item.id !== fact.id)]);
    setState('ready');
  };
  const load = useCallback(async () => {
    setState('loading');
    try {
      const [planResponse, factResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/commercial/rating/rate-plans`, { headers: headers() }),
        fetch(`${apiBaseUrl}/api/v1/commercial/rating/rated-facts`, { headers: headers() }),
      ]);
      if (!planResponse.ok) return fail(planResponse.status);
      if (!factResponse.ok) return fail(factResponse.status);
      const loadedPlans = ratePlanListEnvelopeSchema.parse(await planResponse.json()).data;
      const loadedFacts = ratedFactListEnvelopeSchema.parse(await factResponse.json()).data;
      setPlans(loadedPlans);
      setFacts(loadedFacts);
      setState(loadedPlans.length || loadedFacts.length ? 'ready' : 'empty');
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/rating/rate-plans/${id}`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      applyPlan(ratePlanEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('failed');
    }
  };
  const create = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/rating/rate-plans`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({ code, name }),
      });
      if (!response.ok) return fail(response.status);
      applyPlan(ratePlanEnvelopeSchema.parse(await response.json()).data);
      setCode('');
      setName('');
    } catch {
      setState('failed');
    }
  };
  const update = async () => {
    if (selectedPlan === null || latest === null) return;
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/commercial/rating/rate-plans/${selectedPlan.id}`,
        {
          method: 'PATCH',
          headers: headers(true),
          body: JSON.stringify({ name: draftName, expected_version: latest.expected_version }),
        },
      );
      if (!response.ok) {
        fail(response.status);
        if (response.status === 409) void detail(selectedPlan.id);
        return;
      }
      applyPlan(ratePlanEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('failed');
    }
  };
  const lifecycle = async (action: string) => {
    if (selectedPlan === null || latest === null) return;
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/commercial/rating/rate-plans/${selectedPlan.id}/${action}`,
        {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({ expected_version: latest.expected_version }),
        },
      );
      if (!response.ok) {
        fail(response.status);
        if (response.status === 409) void detail(selectedPlan.id);
        return;
      }
      applyPlan(ratePlanEnvelopeSchema.parse(await response.json()).data);
    } catch {
      setState('failed');
    }
  };
  const loadApplicabilityInputs = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/subscriptions?limit=100`, {
        headers: headers(),
      });
      if (!response.ok) return fail(response.status);
      const active = subscriptionListEnvelopeSchema
        .parse(await response.json())
        .data.filter((subscription) => subscription.status === 'ACTIVE')
        .map(({ id }) => ({ id }));
      setSubscriptions(active);
      if (active[0] !== undefined) setSubscriptionId(active[0].id);
      if (selectedVersions[0] !== undefined) setVersionId(selectedVersions[0].id);
    } catch {
      setState('failed');
    }
  };
  const createApplicability = async () => {
    if (subscriptionId === '' || versionId === '' || effectiveFrom === '') return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/rating/applicability`, {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          subscription_id: subscriptionId,
          rate_plan_version_id: versionId,
          effective_from: new Date(effectiveFrom).toISOString(),
          ...(effectiveTo === '' ? {} : { effective_to: new Date(effectiveTo).toISOString() }),
        }),
      });
      if (!response.ok) return fail(response.status);
      setState('ready');
    } catch {
      setState('failed');
    }
  };
  const rerate = async () => {
    if (selectedFact === null || reratingReason.trim() === '') return;
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/commercial/rating/rated-facts/${selectedFact.id}/rerate`,
        {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify({
            rated_fact_id: selectedFact.id,
            usage_aggregate_id: selectedFact.usage_aggregate_id,
            reason: reratingReason,
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) return fail(response.status);
      applyFact(ratedFactEnvelopeSchema.parse(await response.json()).data);
      setReratingReason('');
    } catch {
      setState('failed');
    }
  };

  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Rating Registry</h2>
      <p>
        Rate selection, decimal calculation, rounding, currency and financial history are
        server-authoritative. This registry does not provide Billing, invoices, tax, discounts, FX,
        credits, debits or manual amount adjustment.
      </p>
      <form
        aria-label="Create Rate Plan"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor="rating-code">Rate Plan code</label>
        <input
          id="rating-code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <label htmlFor="rating-name">Rate Plan name</label>
        <input
          id="rating-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={code.trim() === '' || name.trim() === ''}>
          Create Rate Plan
        </button>
      </form>
      {state === 'loading' && <p role="status">Loading authoritative Rating history…</p>}
      {state === 'empty' && <p>No Rate Plans or Rated Facts are available.</p>}
      {state === 'validation' && (
        <p className="warning" role="alert">
          Rating input is invalid.
        </p>
      )}
      {state === 'unauthenticated' && (
        <p className="warning" role="alert">
          Authentication is required.
        </p>
      )}
      {state === 'forbidden' && (
        <p className="warning" role="alert">
          Rating access is forbidden.
        </p>
      )}
      {state === 'not-found' && (
        <p className="warning" role="alert">
          The selected Rating resource was not found.
        </p>
      )}
      {state === 'conflict' && (
        <p className="warning" role="alert">
          Authoritative Rating state changed. Reload before retrying.
        </p>
      )}
      {state === 'failed' && (
        <p className="warning" role="alert">
          Rating is temporarily unavailable.
        </p>
      )}

      <h3>Rate Plans</h3>
      <table>
        <caption>Tenant-scoped Rate Plans and their current lifecycle state</caption>
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Name</th>
            <th scope="col">Version</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const version = plan.versions.at(-1);
            return (
              <tr key={plan.id}>
                <td>{plan.code}</td>
                <td>{plan.name}</td>
                <td>{version?.version_number ?? '—'}</td>
                <td>{version?.status ?? '—'}</td>
                <td>
                  <button type="button" onClick={() => void detail(plan.id)}>
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedPlan !== null && latest !== null && (
        <section aria-labelledby="rating-plan-detail">
          <h3 id="rating-plan-detail">Rate Plan detail</h3>
          <p>
            <strong>{selectedPlan.code}</strong> — {selectedPlan.name}
          </p>
          <p>
            Current version {latest.version_number}: {latest.status}; currency{' '}
            {latest.currency_code}; effective from {latest.effective_from};{' '}
            {latest.effective_to === null ? 'no end date' : `effective to ${latest.effective_to}`}.
          </p>
          <p>
            Effective and historical versions are immutable financial policy. The API exposes
            authoritative lifecycle metadata; pricing-model evidence is shown on immutable Rated
            Facts.
          </p>
          <ul>
            {selectedPlan.versions.map((version) => (
              <li key={version.id}>
                Version {version.version_number}: {version.status} · {version.currency_code} ·{' '}
                {version.effective_from} — {version.effective_to ?? 'open-ended'}
              </li>
            ))}
          </ul>
          {latest.status === 'DRAFT' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void update();
              }}
            >
              <label htmlFor="rating-draft-name">DRAFT name</label>
              <input
                id="rating-draft-name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
              />
              <button type="submit">Save DRAFT</button>
            </form>
          )}
          <div aria-label="Rate Plan lifecycle actions">
            {actions[latest.status].map((action) => (
              <button key={action} type="button" onClick={() => void lifecycle(action)}>
                {actionLabel[action]}
              </button>
            ))}
          </div>
          <section aria-label="Rating applicability">
            <h4>Subscription applicability</h4>
            <p>
              Assigns a server-authoritative Rate Plan Version to an ACTIVE Subscription. Foreign
              identifiers and overlaps are rejected by the server.
            </p>
            {subscriptions.length === 0 ? (
              <button type="button" onClick={() => void loadApplicabilityInputs()}>
                Load eligible ACTIVE Subscriptions
              </button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void createApplicability();
                }}
              >
                <label htmlFor="rating-subscription">Subscription</label>
                <select
                  id="rating-subscription"
                  value={subscriptionId}
                  onChange={(event) => setSubscriptionId(event.target.value)}
                >
                  {subscriptions.map((subscription) => (
                    <option key={subscription.id} value={subscription.id}>
                      {subscription.id}
                    </option>
                  ))}
                </select>
                <label htmlFor="rating-version">Rate Plan Version</label>
                <select
                  id="rating-version"
                  value={versionId}
                  onChange={(event) => setVersionId(event.target.value)}
                >
                  {selectedVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      Version {version.version_number} — {version.status}
                    </option>
                  ))}
                </select>
                <label htmlFor="rating-effective-from">Effective from</label>
                <input
                  id="rating-effective-from"
                  type="datetime-local"
                  required
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
                <label htmlFor="rating-effective-to">Effective to (optional)</label>
                <input
                  id="rating-effective-to"
                  type="datetime-local"
                  value={effectiveTo}
                  onChange={(event) => setEffectiveTo(event.target.value)}
                />
                <button type="submit">Assign applicability</button>
              </form>
            )}
          </section>
        </section>
      )}
      <h3>Rated Facts</h3>
      <table>
        <caption>Immutable, append-only pre-tax Rating history</caption>
        <thead>
          <tr>
            <th scope="col">Usage window</th>
            <th scope="col">Model</th>
            <th scope="col">Quantity</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((fact) => (
            <tr key={fact.id}>
              <td>{fact.usage_window}</td>
              <td>{fact.pricing_model}</td>
              <td>
                {fact.quantity} {fact.unit}
              </td>
              <td>{formatAmount(fact.pre_tax_amount, fact.currency_code)}</td>
              <td>{fact.status}</td>
              <td>
                <button type="button" onClick={() => setSelectedFact(fact)}>
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedFact !== null && (
        <section aria-labelledby="rated-fact-detail">
          <h3 id="rated-fact-detail">Rated Fact detail</h3>
          <p role="status">
            <strong>Immutable financial history.</strong> Amounts cannot be edited; rerating creates
            an append-only successor.
          </p>
          <dl>
            <div>
              <dt>Subscription</dt>
              <dd>{selectedFact.subscription_id}</dd>
            </div>
            <div>
              <dt>Entitlement</dt>
              <dd>{selectedFact.entitlement_id}</dd>
            </div>
            <div>
              <dt>Usage input / window</dt>
              <dd>
                {selectedFact.usage_aggregate_id} / {selectedFact.usage_window}
              </dd>
            </div>
            <div>
              <dt>Rate Plan / Version</dt>
              <dd>
                {selectedFact.rate_plan_id} / {selectedFact.rate_plan_version_id}
              </dd>
            </div>
            <div>
              <dt>Pricing model</dt>
              <dd>{selectedFact.pricing_model}</dd>
            </div>
            <div>
              <dt>Quantity / unit</dt>
              <dd>
                {selectedFact.quantity} / {selectedFact.unit}
              </dd>
            </div>
            <div>
              <dt>Pre-tax amount</dt>
              <dd>{formatAmount(selectedFact.pre_tax_amount, selectedFact.currency_code)}</dd>
            </div>
            <div>
              <dt>Calculation evidence</dt>
              <dd>Calculation v{selectedFact.calculation_version}; HALF_UP</dd>
            </div>
          </dl>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void rerate();
            }}
          >
            <label htmlFor="rating-rerate-reason">Manual rerating reason</label>
            <input
              id="rating-rerate-reason"
              required
              value={reratingReason}
              onChange={(event) => setReratingReason(event.target.value)}
            />
            <p>
              Manual rerating is append-only. The original Rated Fact is retained and a successor
              logically supersedes it.
            </p>
            <button type="submit" disabled={reratingReason.trim() === ''}>
              Rerate
            </button>
          </form>
        </section>
      )}
    </section>
  );
}
