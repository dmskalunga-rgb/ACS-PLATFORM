import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageMeteringRegistryPanel } from './UsageMeteringRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const id = (suffix: string) => `90000000-0000-4000-8000-0000000000${suffix}`;
const source = {
  id: id('01'),
  tenant_id: id('02'),
  name: 'Edge collector',
  descriptor: 'Trusted edge',
  status: 'ACTIVE' as const,
  credential_id: id('03'),
  credential_created_at: '2026-08-23T00:00:00.000Z',
  credential_rotated_at: null,
  version: 1,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};
const measurement = {
  id: id('04'),
  tenant_id: id('02'),
  source_id: id('01'),
  source_event_id: 'edge-1',
  subscription_id: id('05'),
  entitlement_id: id('06'),
  plan_feature_id: null,
  measurement_type: 'api.calls',
  value: 7,
  unit: 'requests',
  event_time: '2026-08-23T00:00:00.000Z',
  received_at: '2026-08-23T00:00:01.000Z',
  processed_at: '2026-08-23T00:00:02.000Z',
  status: 'ACCEPTED' as const,
  schema_version: 1,
  created_at: '2026-08-23T00:00:02.000Z',
};
const aggregate = {
  id: id('07'),
  tenant_id: id('02'),
  subscription_id: id('05'),
  entitlement_id: id('06'),
  plan_feature_id: null,
  measurement_type: 'api.calls',
  unit: 'requests',
  time_bucket: 'HOURLY' as const,
  bucket_start: '2026-08-23T00:00:00.000Z',
  aggregate_value: 7,
  computed_at: '2026-08-23T00:01:00.000Z',
  version: 1,
};
const meta = { request_id: id('08'), correlation_id: id('09') };
const response = (data: unknown, extra: object = {}) =>
  new Response(JSON.stringify({ data, meta: { ...meta, ...extra } }));
const panel = (
  <UsageMeteringRegistryPanel apiBaseUrl="/api" authorization="Bearer signed" tenantId={id('02')} />
);
const install = (items: Response[]) => {
  const mock = vi.fn();
  items.forEach((item) => mock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', mock);
  vi.stubGlobal('crypto', { randomUUID: () => id('10') });
  return mock;
};

describe('Usage/Metering human frontend acceptance', () => {
  it('USG-WEB-001 lists sources and exposes accessible lifecycle controls', async () => {
    install([response([source]), response(source)]);
    render(panel);
    await userEvent.click(await screen.findByRole('button', { name: source.name }));
    expect(await screen.findByRole('button', { name: 'Disable source' })).toBeVisible();
    expect(screen.getByLabelText('Source lifecycle actions')).toBeVisible();
  });
  it('USG-WEB-002 displays a registration credential once and dismisses it from memory', async () => {
    const credential = 'x'.repeat(40);
    install([
      response([]),
      new Response(
        JSON.stringify({
          data: source,
          credential: { credential_id: source.credential_id, credential },
          meta,
        }),
      ),
    ]);
    render(panel);
    await userEvent.type(await screen.findByLabelText('Name'), source.name);
    await userEvent.click(screen.getByRole('button', { name: 'Register source' }));
    expect(await screen.findByText(credential)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss credential' }));
    expect(screen.queryByText(credential)).not.toBeInTheDocument();
  });
  it('USG-WEB-003 keeps machine ingestion absent from browser controls', async () => {
    install([response([])]);
    render(panel);
    await screen.findByText('No sources are available.');
    expect(screen.queryByText(/source_event_id/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ingest/i })).not.toBeInTheDocument();
  });
  it('USG-WEB-004 lists immutable raw measurements and appends a correction', async () => {
    const correction = {
      id: id('11'),
      tenant_id: id('02'),
      measurement_id: measurement.id,
      reason: 'Meter reset',
      compensating_value: -1,
      unit: 'requests',
      status: 'APPLIED',
      created_by_membership_id: id('12'),
      version: 1,
      created_at: '2026-08-23T01:00:00.000Z',
    };
    const mock = install([
      response([]),
      response([measurement]),
      response(measurement),
      response(correction),
    ]);
    render(panel);
    await screen.findByText('No sources are available.');
    await userEvent.click(screen.getByRole('button', { name: 'Measurements' }));
    await userEvent.click(await screen.findByRole('button', { name: measurement.source_event_id }));
    expect(screen.getByText(/Raw measurements are immutable/)).toBeVisible();
    await userEvent.type(screen.getByLabelText('Reason'), 'Meter reset');
    await userEvent.type(screen.getByLabelText('Compensating value'), '-1');
    await userEvent.type(screen.getByLabelText('Unit'), 'requests');
    await userEvent.click(screen.getByRole('button', { name: 'Append correction' }));
    expect((mock.mock.calls.at(-1)![1] as RequestInit).method).toBe('POST');
  });
  it('USG-WEB-005 presents non-financial aggregate semantics', async () => {
    install([response([]), response([aggregate], { next_cursor: null })]);
    render(panel);
    await screen.findByText('No sources are available.');
    await userEvent.click(screen.getByRole('button', { name: 'Aggregates' }));
    expect(
      await screen.findByRole('table', { name: 'Non-financial usage aggregates' }),
    ).toHaveTextContent('7 requests');
    expect(screen.getByText(/No price, invoice or financial semantics/)).toBeVisible();
  });
  it.each([
    [401, /Authentication is required/],
    [403, /access is forbidden/],
    [409, /conflicts with authoritative/],
    [500, /is unavailable/],
  ])('USG-WEB-006 fails closed for HTTP %s', async (status, expected) => {
    install([new Response(undefined, { status })]);
    render(panel);
    expect(await screen.findByText(expected)).toBeVisible();
  });
});
