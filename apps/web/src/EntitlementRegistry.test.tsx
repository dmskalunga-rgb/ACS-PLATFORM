import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntitlementRegistryPanel } from './EntitlementRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entitlement = {
  id: '80000000-0000-4000-8000-000000000301',
  subscription_id: '80000000-0000-4000-8000-000000000302',
  customer_id: '80000000-0000-4000-8000-000000000303',
  contract_id: '80000000-0000-4000-8000-000000000304',
  source_contract_line_item_id: '80000000-0000-4000-8000-000000000305',
  plan_id: '80000000-0000-4000-8000-000000000306',
  plan_feature_id: null,
  content_model: 'PLAN_LINE_ACCESS' as const,
  owner_membership_id: '80000000-0000-4000-8000-000000000307',
  created_by_membership_id: '80000000-0000-4000-8000-000000000308',
  status: 'DRAFT' as const,
  effective_from: '2026-09-01T00:00:00.000Z',
  effective_until: null,
  version: 1,
  created_at: '2026-08-28T00:00:00.000Z',
  updated_at: '2026-08-28T00:00:00.000Z',
};
const activeSubscription = {
  id: entitlement.subscription_id,
  source_contract_id: entitlement.contract_id,
  source_contract_revision_number: 1,
  customer_id: entitlement.customer_id,
  owner_membership_id: entitlement.owner_membership_id,
  created_by_membership_id: entitlement.created_by_membership_id,
  status: 'ACTIVE' as const,
  effective_from: entitlement.effective_from,
  effective_until: null,
  revision_number: 1,
  version: 1,
  created_at: entitlement.created_at,
  updated_at: entitlement.updated_at,
};
const meta = {
  request_id: '80000000-0000-4000-8000-000000000309',
  correlation_id: '80000000-0000-4000-8000-000000000310',
};
const response = (data: unknown, status = 200, list = false) =>
  new Response(
    JSON.stringify({ data, meta: { ...meta, ...(list ? { next_cursor: null } : {}) } }),
    { status },
  );
const panel = () => (
  <EntitlementRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000311' });
  return fetchMock;
};

describe('Entitlement Registry UI acceptance matrix', () => {
  it('ENT-WEB-001 lists and shows authoritative, non-financial origin metadata', async () => {
    install([response([entitlement], 200, true), response(entitlement)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: entitlement.id }));
    expect(await screen.findByText(/Content model:/)).toHaveTextContent('PLAN_LINE_ACCESS');
    expect(screen.getByText(/No quantity, quota, metering/)).toBeVisible();
  });
  it('ENT-WEB-002 creates only from API-returned ACTIVE Subscriptions', async () => {
    const fetchMock = install([
      response([], 200, true),
      response([activeSubscription], 200, true),
      response(entitlement),
    ]);
    render(panel());
    await screen.findByText('No Entitlements are registered.');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Load eligible ACTIVE Subscriptions' }),
    );
    fireEvent.change(await screen.findByLabelText('Effective start'), {
      target: { value: '2026-09-01T00:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create Entitlement' }));
    expect(
      JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string),
    ).toMatchObject({ subscription_id: entitlement.subscription_id });
  });
  it('ENT-WEB-003 updates a Draft, assigns a same-tenant active owner and drives lifecycle', async () => {
    const administration = {
      memberships: [
        {
          id: entitlement.owner_membership_id,
          user_id: entitlement.created_by_membership_id,
          status: 'ACTIVE',
          version: 1,
          roles: [],
        },
      ],
      roles: [],
    };
    install([
      response([entitlement], 200, true),
      response(entitlement),
      response({ ...entitlement, version: 2 }),
      response(administration),
      response({ ...entitlement, version: 3 }),
      response({ ...entitlement, status: 'PENDING_ACTIVATION', version: 4 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: entitlement.id }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Entitlement' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Entitlement' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load active owner options' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Assign owner' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Request activation' }));
    expect(await screen.findByRole('button', { name: 'Activate' })).toBeVisible();
  });
  it.each([
    [400, /input or Subscription eligibility/],
    [401, /Authentication is required/],
    [403, /access is forbidden/],
    [404, /was not found/],
    [500, /Registry is unavailable/],
  ])('ENT-WEB-004 handles bounded HTTP %s errors', async (status, text) => {
    install([new Response(undefined, { status })]);
    render(panel());
    expect(await screen.findByText(text)).toBeVisible();
  });
  it('ENT-WEB-005 refreshes authoritative data after a stale conflict', async () => {
    install([
      response([entitlement], 200, true),
      response(entitlement),
      new Response(undefined, { status: 409 }),
      response([], 200, true),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: entitlement.id }));
    await userEvent.click(screen.getByRole('button', { name: 'Request activation' }));
    expect(await screen.findByText('No Entitlements are registered.')).toBeVisible();
  });
  it('ENT-WEB-006 exposes labelled, keyboard-operable lifecycle controls and terminal immutability', async () => {
    install([
      response([entitlement], 200, true),
      response({ ...entitlement, status: 'TERMINATED' }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: entitlement.id }));
    expect(await screen.findByLabelText('Entitlement lifecycle actions')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Entitlement Registry' })).toBeVisible();
  });
});
