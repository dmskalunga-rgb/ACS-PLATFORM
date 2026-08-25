import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RatingRegistryPanel } from './RatingRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ids = {
  tenant: '80000000-0000-4000-8000-000000000001',
  plan: '80000000-0000-4000-8000-000000000002',
  version: '80000000-0000-4000-8000-000000000003',
  membership: '80000000-0000-4000-8000-000000000004',
  fact: '80000000-0000-4000-8000-000000000005',
  subscription: '80000000-0000-4000-8000-000000000006',
  entitlement: '80000000-0000-4000-8000-000000000007',
  usage: '80000000-0000-4000-8000-000000000008',
};
const version = {
  id: ids.version,
  rate_plan_id: ids.plan,
  tenant_id: ids.tenant,
  version_number: 1,
  status: 'DRAFT' as const,
  currency_code: 'USD' as const,
  currency_minor_scale: 2 as const,
  effective_from: '2026-08-24T00:00:00.000Z',
  effective_to: null,
  created_by_membership_id: ids.membership,
  approved_by_membership_id: null,
  activated_by_membership_id: null,
  expected_version: 1,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
};
const plan = {
  id: ids.plan,
  tenant_id: ids.tenant,
  code: 'RATING-HOURLY',
  name: 'Hourly Rating',
  owner_membership_id: ids.membership,
  created_at: version.created_at,
  updated_at: version.updated_at,
  versions: [version],
};
const fact = {
  id: ids.fact,
  tenant_id: ids.tenant,
  subscription_id: ids.subscription,
  entitlement_id: ids.entitlement,
  usage_aggregate_id: ids.usage,
  usage_window: 'HOURLY' as const,
  measurement_type: 'api.request',
  quantity: '2.5000',
  unit: 'request',
  rate_plan_id: ids.plan,
  rate_plan_version_id: ids.version,
  pricing_model: 'PER_UNIT' as const,
  currency_code: 'USD' as const,
  rate_evidence: { unit_rate: '0.10200000' },
  pre_tax_amount: '0.2600',
  rounding_mode: 'HALF_UP' as const,
  calculation_version: 1,
  status: 'RATED' as const,
  supersedes_rated_fact_id: null,
  rerating_reason: null,
  created_at: version.created_at,
};
const meta = {
  request_id: '80000000-0000-4000-8000-000000000009',
  correlation_id: '80000000-0000-4000-8000-000000000010',
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, meta }), { status });
const panel = () => (
  <RatingRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId={ids.tenant} />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
  return fetchMock;
};

describe('Rating Registry UI acceptance matrix', () => {
  it('RAT-WEB-001 lists Rate Plans, exposes version history and immutable Rated Facts', async () => {
    install([response([plan]), response([fact]), response(plan)]);
    render(panel());
    await userEvent.click((await screen.findAllByRole('button', { name: 'View' }))[0]!);
    expect(await screen.findByText(/Version 1: DRAFT/)).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'View' })[1]!);
    expect(await screen.findByText(/Immutable financial history/)).toBeVisible();
    expect(screen.getAllByText('USD 0.2600')).toHaveLength(2);
  });

  it('RAT-WEB-002 creates and updates a DRAFT through authoritative APIs', async () => {
    const fetchMock = install([
      response([]),
      response([]),
      response(plan),
      response({ ...plan, name: 'Updated Rating' }),
    ]);
    render(panel());
    fireEvent.change(await screen.findByLabelText('Rate Plan code'), {
      target: { value: plan.code },
    });
    fireEvent.change(screen.getByLabelText('Rate Plan name'), { target: { value: plan.name } });
    await userEvent.click(screen.getByRole('button', { name: 'Create Rate Plan' }));
    fireEvent.change(await screen.findByLabelText('DRAFT name'), {
      target: { value: 'Updated Rating' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save DRAFT' }));
    expect(
      JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string),
    ).toMatchObject({ expected_version: 1 });
  });

  it('RAT-WEB-003 submits lifecycle commands and bounds self-approval failures', async () => {
    install([
      response([plan]),
      response([]),
      response(plan),
      new Response(undefined, { status: 403 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'View' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(await screen.findByText('Rating access is forbidden.')).toBeVisible();
  });

  it('RAT-WEB-004 presents authoritative pricing model, currency and no financial controls', async () => {
    install([response([plan]), response([fact])]);
    render(panel());
    expect(await screen.findByText('PER_UNIT')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Billing|Invoice|Payment/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /adjust|credit|debit/i })).toBeNull();
  });

  it('RAT-WEB-005 submits append-only manual rerating with the fact lineage', async () => {
    const fetchMock = install([
      response([plan]),
      response([fact]),
      response({
        ...fact,
        id: '80000000-0000-4000-8000-000000000012',
        supersedes_rated_fact_id: ids.fact,
        rerating_reason: 'Corrected usage',
      }),
    ]);
    render(panel());
    await userEvent.click((await screen.findAllByRole('button', { name: 'View' }))[1]!);
    fireEvent.change(await screen.findByLabelText('Manual rerating reason'), {
      target: { value: 'Corrected usage' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Rerate' }));
    expect(
      JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string),
    ).toMatchObject({ rated_fact_id: ids.fact, usage_aggregate_id: ids.usage });
  });

  it.each([
    [400, /input is invalid/],
    [401, /Authentication is required/],
    [403, /access is forbidden/],
    [404, /was not found/],
    [409, /changed/],
    [500, /temporarily unavailable/],
  ])('RAT-WEB-006 bounds HTTP %s errors without infrastructure detail', async (status, text) => {
    install([new Response(undefined, { status }), response([])]);
    render(panel());
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByText(/SQLSTATE|trusted context|database role/i)).toBeNull();
  });
});
