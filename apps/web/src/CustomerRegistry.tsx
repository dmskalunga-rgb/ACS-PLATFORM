import { customerEnvelopeSchema, customerListEnvelopeSchema, type Customer } from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'success'; customers: Customer[] }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'conflict' }
  | { kind: 'error' };

export function CustomerRegistryPanel({
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
  const [referenceCode, setReferenceCode] = useState('');
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/customers?limit=25`, {
        headers: { accept: 'application/json', ...headers() },
      });
      if (!response.ok) return classify(response.status);
      const customers = customerListEnvelopeSchema.parse(await response.json()).data;
      setState(customers.length === 0 ? { kind: 'empty' } : { kind: 'success', customers });
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
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/customers`, {
        method: 'POST',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          display_name: displayName,
          ...(referenceCode === '' ? {} : { reference_code: referenceCode }),
        }),
      });
      if (!response.ok) return classify(response.status);
      customerEnvelopeSchema.parse(await response.json());
      setDisplayName('');
      setReferenceCode('');
      await load();
    } catch {
      setState({ kind: 'error' });
    }
  };
  const edit = async (customer: Customer) => {
    const nextName = window.prompt('Customer display name', customer.display_name)?.trim();
    if (!nextName || nextName === customer.display_name) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/commercial/customers/${customer.id}`, {
        method: 'PATCH',
        headers: {
          ...headers(),
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ display_name: nextName, expected_version: customer.version }),
      });
      if (!response.ok) return classify(response.status);
      await load();
    } catch {
      setState({ kind: 'error' });
    }
  };
  return (
    <section className="status-card customer-registry" aria-live="polite">
      <h2>Commercial Customer Registry</h2>
      <form onSubmit={(event) => void create(event)}>
        <label htmlFor="customer-name">Display name</label>
        <input
          id="customer-name"
          required
          maxLength={160}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <label htmlFor="customer-reference">Reference code (optional)</label>
        <input
          id="customer-reference"
          maxLength={80}
          value={referenceCode}
          onChange={(event) => setReferenceCode(event.target.value)}
        />
        <button type="submit">Create customer</button>
      </form>
      {state.kind === 'loading' && <p>Loading customers…</p>}
      {state.kind === 'empty' && <p>No customers are registered.</p>}
      {state.kind === 'unauthorized' && <p className="warning">Authentication is required.</p>}
      {state.kind === 'forbidden' && <p className="warning">Customer access is forbidden.</p>}
      {state.kind === 'conflict' && (
        <p className="warning">Customer data changed or the reference is already used.</p>
      )}
      {state.kind === 'error' && (
        <p className="warning">Customer Registry is unavailable. No data was fabricated.</p>
      )}
      {state.kind === 'success' && (
        <ul className="customer-list">
          {state.customers.map((customer) => (
            <li key={customer.id}>
              <span>
                <strong>{customer.display_name}</strong>
                <small>
                  {customer.reference_code ?? 'No reference'} · {customer.status}
                </small>
              </span>
              <button type="button" onClick={() => void edit(customer)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
