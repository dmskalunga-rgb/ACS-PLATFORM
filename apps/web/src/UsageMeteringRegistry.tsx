import {
  measurementCorrectionEnvelopeSchema,
  measurementSourceRegistrationEnvelopeSchema,
  measurementSourceSchema,
  rawMeasurementSchema,
  usageAggregateListEnvelopeSchema,
  type MeasurementSource,
  type RawMeasurement,
  type UsageAggregate,
} from '@acs/contracts';
import { useCallback, useEffect, useState } from 'react';

type View = 'sources' | 'measurements' | 'aggregates';
type State =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'validation'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'failed';

export function UsageMeteringRegistryPanel({
  apiBaseUrl,
  authorization,
  tenantId,
}: {
  readonly apiBaseUrl: string;
  readonly authorization: string;
  readonly tenantId: string;
}) {
  const [view, setView] = useState<View>('sources');
  const [state, setState] = useState<State>('loading');
  const [sources, setSources] = useState<MeasurementSource[]>([]);
  const [source, setSource] = useState<MeasurementSource | null>(null);
  const [measurements, setMeasurements] = useState<RawMeasurement[]>([]);
  const [measurement, setMeasurement] = useState<RawMeasurement | null>(null);
  const [aggregates, setAggregates] = useState<UsageAggregate[]>([]);
  const [credential, setCredential] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [descriptor, setDescriptor] = useState('');
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const headers = useCallback(
    (write = false) => ({
      authorization,
      'x-acs-tenant-id': tenantId,
      accept: 'application/json',
      ...(write
        ? { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }
        : {}),
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
  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(`${apiBaseUrl}${path}`, init);
      if (!response.ok) {
        fail(response.status);
        return null;
      }
      return response.json() as Promise<unknown>;
    },
    [apiBaseUrl, fail],
  );
  const load = useCallback(
    async (next: View = view) => {
      setState('loading');
      setCredential(null);
      try {
        if (next === 'sources') {
          const body = await request('/api/v1/commercial/usage/sources', { headers: headers() });
          if (!body) return;
          const data = measurementSourceSchema.array().parse((body as { data: unknown }).data);
          setSources(data);
          setState(data.length ? 'ready' : 'empty');
        } else if (next === 'measurements') {
          const body = await request('/api/v1/commercial/usage/measurements', {
            headers: headers(),
          });
          if (!body) return;
          const data = rawMeasurementSchema.array().parse((body as { data: unknown }).data);
          setMeasurements(data);
          setState(data.length ? 'ready' : 'empty');
        } else {
          const now = new Date(),
            from = new Date(now.getTime() - 30 * 86_400_000);
          const query = new URLSearchParams({
            time_bucket: 'HOURLY',
            from: from.toISOString(),
            until: now.toISOString(),
          });
          const body = await request(`/api/v1/commercial/usage/aggregates?${query}`, {
            headers: headers(),
          });
          if (!body) return;
          const data = usageAggregateListEnvelopeSchema.parse(body).data;
          setAggregates(data);
          setState(data.length ? 'ready' : 'empty');
        }
      } catch {
        setState('failed');
      }
    },
    [headers, request, view],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(view), 0);
    return () => clearTimeout(timer);
  }, [load, view]);
  const switchView = (next: View) => {
    setView(next);
    setSource(null);
    setMeasurement(null);
  };
  const selectSource = async (id: string) => {
    const body = await request(`/api/v1/commercial/usage/sources/${id}`, { headers: headers() });
    if (body) {
      setSource(measurementSourceSchema.parse((body as { data: unknown }).data));
      setState('ready');
    }
  };
  const selectMeasurement = async (id: string) => {
    const body = await request(`/api/v1/commercial/usage/measurements/${id}`, {
      headers: headers(),
    });
    if (body) {
      setMeasurement(rawMeasurementSchema.parse((body as { data: unknown }).data));
      setState('ready');
    }
  };
  const register = async () => {
    const body = await request('/api/v1/commercial/usage/sources', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ name, ...(descriptor ? { descriptor } : {}) }),
    });
    if (!body) return;
    const parsed = measurementSourceRegistrationEnvelopeSchema.parse(body);
    setSource(parsed.data);
    setCredential(parsed.credential.credential);
    setSources((items) => [parsed.data, ...items]);
    setState('ready');
    setName('');
    setDescriptor('');
  };
  const sourceAction = async (action: string) => {
    if (!source) return;
    const body = await request(`/api/v1/commercial/usage/sources/${source.id}/${action}`, {
      method: 'POST',
      headers: headers(true),
      body: '{}',
    });
    if (!body) return;
    if (action === 'rotate-credential') {
      const parsed = measurementSourceRegistrationEnvelopeSchema.parse(body);
      setSource(parsed.data);
      setCredential(parsed.credential.credential);
    } else setSource(measurementSourceSchema.parse((body as { data: unknown }).data));
    setState('ready');
  };
  const correct = async () => {
    if (!measurement) return;
    const body = await request(
      `/api/v1/commercial/usage/measurements/${measurement.id}/corrections`,
      {
        method: 'POST',
        headers: headers(true),
        body: JSON.stringify({
          reason,
          compensating_value: Number(value),
          unit,
          expected_version: 1,
        }),
      },
    );
    if (!body) return;
    measurementCorrectionEnvelopeSchema.parse(body);
    setReason('');
    setValue('');
    setUnit('');
    setState('ready');
  };
  return (
    <section
      className="status-card usage-metering"
      aria-live="polite"
      aria-busy={state === 'loading'}
    >
      <h2>Usage / Metering</h2>
      <p>Human administration and non-financial usage visibility. Machine ingestion is API-only.</p>
      <nav aria-label="Usage Metering views">
        {(['sources', 'measurements', 'aggregates'] as const).map((item) => (
          <button
            type="button"
            aria-pressed={view === item}
            key={item}
            onClick={() => switchView(item)}
          >
            {item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      {state === 'loading' && <p role="status">Loading Usage/Metering data…</p>}
      {state === 'empty' && <p>No {view} are available.</p>}
      {state === 'validation' && (
        <p role="alert" className="warning">
          Usage/Metering input is invalid.
        </p>
      )}
      {state === 'unauthenticated' && (
        <p role="alert" className="warning">
          Authentication is required.
        </p>
      )}
      {state === 'forbidden' && (
        <p role="alert" className="warning">
          Usage/Metering access is forbidden.
        </p>
      )}
      {state === 'not-found' && (
        <p role="alert" className="warning">
          The selected record was not found.
        </p>
      )}
      {state === 'conflict' && (
        <p role="alert" className="warning">
          The operation conflicts with authoritative state. Reload and retry.
        </p>
      )}
      {state === 'failed' && (
        <p role="alert" className="warning">
          Usage/Metering is unavailable.
        </p>
      )}
      {view === 'sources' && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void register();
            }}
          >
            <h3>Register measurement source</h3>
            <label htmlFor="usage-source-name">Name</label>
            <input
              id="usage-source-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label htmlFor="usage-source-descriptor">Descriptor (optional)</label>
            <input
              id="usage-source-descriptor"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
            />
            <button type="submit">Register source</button>
          </form>
          {credential && (
            <aside role="status" aria-label="One-time source credential">
              <strong>Copy this credential now.</strong>
              <p>It is displayed once and is not stored by this browser.</p>
              <output>{credential}</output>
              <button type="button" onClick={() => setCredential(null)}>
                Dismiss credential
              </button>
            </aside>
          )}
          <ul aria-label="Measurement sources">
            {sources.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void selectSource(item.id)}>
                  {item.name}
                </button>{' '}
                — {item.status}
              </li>
            ))}
          </ul>
          {source && (
            <section aria-label="Measurement source detail">
              <h3>{source.name}</h3>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{source.status}</dd>
                </div>
                <div>
                  <dt>Credential identifier</dt>
                  <dd>{source.credential_id}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{source.version}</dd>
                </div>
              </dl>
              <div aria-label="Source lifecycle actions">
                {source.status === 'ACTIVE' && (
                  <button type="button" onClick={() => void sourceAction('disable')}>
                    Disable source
                  </button>
                )}
                {source.status === 'DISABLED' && (
                  <button type="button" onClick={() => void sourceAction('reactivate')}>
                    Reactivate source
                  </button>
                )}
                {source.status !== 'REVOKED' && (
                  <>
                    <button type="button" onClick={() => void sourceAction('rotate-credential')}>
                      Rotate credential
                    </button>
                    <button type="button" onClick={() => void sourceAction('revoke')}>
                      Revoke source
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {view === 'measurements' && (
        <>
          <p>Raw measurements are immutable. Corrections append a compensating record.</p>
          <ul aria-label="Raw measurements">
            {measurements.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void selectMeasurement(item.id)}>
                  {item.source_event_id}
                </button>{' '}
                — {item.value} {item.unit}
              </li>
            ))}
          </ul>
          {measurement && (
            <section aria-label="Raw measurement detail">
              <h3>{measurement.source_event_id}</h3>
              <dl>
                <div>
                  <dt>Measurement</dt>
                  <dd>
                    {measurement.value} {measurement.unit}
                  </dd>
                </div>
                <div>
                  <dt>Event time</dt>
                  <dd>{measurement.event_time}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{measurement.status}</dd>
                </div>
              </dl>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void correct();
                }}
              >
                <h4>Append correction</h4>
                <label htmlFor="usage-correction-reason">Reason</label>
                <input
                  id="usage-correction-reason"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <label htmlFor="usage-correction-value">Compensating value</label>
                <input
                  id="usage-correction-value"
                  type="number"
                  step="any"
                  required
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <label htmlFor="usage-correction-unit">Unit</label>
                <input
                  id="usage-correction-unit"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <button type="submit">Append correction</button>
              </form>
            </section>
          )}
        </>
      )}
      {view === 'aggregates' && (
        <>
          <p>
            Hourly and daily operational aggregates only. No price, invoice or financial semantics.
          </p>
          <table>
            <caption>Non-financial usage aggregates</caption>
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Measurement</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.time_bucket} · {item.bucket_start}
                  </td>
                  <td>{item.measurement_type}</td>
                  <td>
                    {item.aggregate_value} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
