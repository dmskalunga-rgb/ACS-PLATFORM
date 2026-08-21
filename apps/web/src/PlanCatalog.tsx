import {
  planEnvelopeSchema,
  planFeatureEnvelopeSchema,
  planFeatureListEnvelopeSchema,
  planListEnvelopeSchema,
  type Plan,
  type PlanFeature,
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
export function PlanCatalogPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [state, setState] = useState<State>('loading');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [featureName, setFeatureName] = useState('');
  const [featureCode, setFeatureCode] = useState('');
  const [editingPlan, setEditingPlan] = useState(false);
  const [editingFeature, setEditingFeature] = useState<PlanFeature | null>(null);
  const headers = useCallback(
    () => ({ authorization, 'x-acs-tenant-id': tenantId }),
    [authorization, tenantId],
  );
  const status = (code: number) =>
    setState(
      code === 401
        ? 'unauthorized'
        : code === 403
          ? 'forbidden'
          : code === 409
            ? 'conflict'
            : 'error',
    );
  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans?limit=25`, {
        headers: headers(),
      });
      if (!r.ok) {
        if (r.status === 404) {
          setSelected(null);
          setFeatures([]);
          setState('not-found');
          return;
        }
        return status(r.status);
      }
      const data = planListEnvelopeSchema.parse(await r.json()).data;
      setPlans(data);
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
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans/${id}`, { headers: headers() });
      if (!r.ok) {
        if (r.status === 404) {
          setSelected(null);
          setFeatures([]);
          setState('not-found');
          return;
        }
        return status(r.status);
      }
      const plan = planEnvelopeSchema.parse(await r.json()).data;
      setSelected(plan);
      setName(plan.name);
      setCode(plan.plan_code);
      const f = await fetch(`${apiBaseUrl}/api/v1/commercial/plans/${id}/features?limit=25`, {
        headers: headers(),
      });
      if (!f.ok) return status(f.status);
      setFeatures(planFeatureListEnvelopeSchema.parse(await f.json()).data);
    } catch {
      setState('error');
    }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ plan_code: code, name }),
      });
      if (!r.ok) return status(r.status);
      setCode('');
      setName('');
      await load();
    } catch {
      setState('error');
    }
  };
  const lifecycle = async () => {
    if (!selected) return;
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans/${selected.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
          expected_version: selected.version,
        }),
      });
      if (!r.ok) return status(r.status);
      setSelected(planEnvelopeSchema.parse(await r.json()).data);
      await load();
    } catch {
      setState('error');
    }
  };
  const savePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans/${selected.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ plan_code: code, name, expected_version: selected.version }),
      });
      if (!r.ok) return status(r.status);
      setSelected(planEnvelopeSchema.parse(await r.json()).data);
      setEditingPlan(false);
      await load();
    } catch {
      setState('error');
    }
  };
  const saveFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !editingFeature) return;
    try {
      const r = await fetch(
        `${apiBaseUrl}/api/v1/commercial/plans/${selected.id}/features/${editingFeature.id}`,
        {
          method: 'PATCH',
          headers: {
            ...headers(),
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            feature_code: featureCode,
            name: featureName,
            expected_version: editingFeature.version,
          }),
        },
      );
      if (!r.ok) return status(r.status);
      const feature = planFeatureEnvelopeSchema.parse(await r.json()).data;
      setFeatures((items) => items.map((item) => (item.id === feature.id ? feature : item)));
      setEditingFeature(null);
    } catch {
      setState('error');
    }
  };
  const addFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      const r = await fetch(`${apiBaseUrl}/api/v1/commercial/plans/${selected.id}/features`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ feature_code: featureCode, name: featureName }),
      });
      if (!r.ok) return status(r.status);
      const feature = planFeatureEnvelopeSchema.parse(await r.json()).data;
      setFeatures((items) => [...items, feature]);
      setFeatureCode('');
      setFeatureName('');
    } catch {
      setState('error');
    }
  };
  return (
    <section className="status-card" aria-live="polite" aria-busy={state === 'loading'}>
      <h2>Plan Catalog</h2>
      <form onSubmit={(e) => void create(e)}>
        <label htmlFor="plan-code">Plan code</label>
        <input
          id="plan-code"
          required
          maxLength={80}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <label htmlFor="plan-name">Plan name</label>
        <input
          id="plan-name"
          required
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={state === 'loading'}>
          Create plan
        </button>
      </form>
      {state === 'loading' && <p>Loading plans…</p>}
      {state === 'empty' && <p>No plans are registered.</p>}
      {state === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state === 'forbidden' && <p className="warning">Plan access is forbidden.</p>}
      {state === 'conflict' && (
        <>
          <p className="warning">Plan data changed. Reload before retrying.</p>
          <button type="button" onClick={() => void load()}>
            Reload plans
          </button>
        </>
      )}
      {state === 'not-found' && <p className="warning">The selected plan was not found.</p>}
      {state === 'error' && (
        <p className="warning">Plan Catalog is unavailable. No data was fabricated.</p>
      )}
      {state === 'success' && (
        <ul>
          {plans.map((plan) => (
            <li key={plan.id}>
              <button type="button" onClick={() => void view(plan.id)}>
                {plan.name}
              </button>{' '}
              · {plan.status}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <section aria-labelledby="plan-detail">
          <h3 id="plan-detail">{selected.name}</h3>
          {!editingPlan ? (
            <button type="button" onClick={() => setEditingPlan(true)}>
              Edit plan
            </button>
          ) : (
            <form onSubmit={(e) => void savePlan(e)}>
              <label htmlFor="plan-edit-code">Plan code</label>
              <input
                id="plan-edit-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <label htmlFor="plan-edit-name">Plan name</label>
              <input
                id="plan-edit-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit">Save plan</button>
              <button type="button" onClick={() => setEditingPlan(false)}>
                Cancel
              </button>
            </form>
          )}
          <button type="button" onClick={() => void lifecycle()}>
            {selected.status === 'ACTIVE' ? 'Inactivate plan' : 'Activate plan'}
          </button>
          <h4>Plan features</h4>
          <ul>
            {features.map((feature) => (
              <li key={feature.id}>
                {feature.name}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setEditingFeature(feature);
                    setFeatureCode(feature.feature_code);
                    setFeatureName(feature.name);
                  }}
                >
                  Edit feature
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void addFeature(e)}>
            <label htmlFor="feature-code">Feature code</label>
            <input
              id="feature-code"
              required
              maxLength={80}
              value={featureCode}
              onChange={(e) => setFeatureCode(e.target.value)}
            />
            <label htmlFor="feature-name">Feature name</label>
            <input
              id="feature-name"
              required
              maxLength={160}
              value={featureName}
              onChange={(e) => setFeatureName(e.target.value)}
            />
            <button type="submit">Add feature</button>
          </form>
          {editingFeature && (
            <form onSubmit={(e) => void saveFeature(e)}>
              <label htmlFor="feature-edit-code">Feature code</label>
              <input
                id="feature-edit-code"
                required
                value={featureCode}
                onChange={(e) => setFeatureCode(e.target.value)}
              />
              <label htmlFor="feature-edit-name">Feature name</label>
              <input
                id="feature-edit-name"
                required
                value={featureName}
                onChange={(e) => setFeatureName(e.target.value)}
              />
              <button type="submit">Save feature</button>
              <button type="button" onClick={() => setEditingFeature(null)}>
                Cancel
              </button>
            </form>
          )}
        </section>
      )}
    </section>
  );
}
