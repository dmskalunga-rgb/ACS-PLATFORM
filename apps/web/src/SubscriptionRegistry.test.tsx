import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionRegistryPanel } from './SubscriptionRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const subscription = {
  id: '70000000-0000-4000-8000-000000000301',
  source_contract_id: '70000000-0000-4000-8000-000000000302',
  source_contract_revision_number: 1,
  customer_id: '70000000-0000-4000-8000-000000000303',
  owner_membership_id: '70000000-0000-4000-8000-000000000304',
  created_by_membership_id: '70000000-0000-4000-8000-000000000305',
  status: 'DRAFT' as const,
  effective_from: '2026-09-01T00:00:00.000Z',
  effective_until: '2026-10-01T00:00:00.000Z',
  revision_number: 1,
  version: 1,
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
};
const contract = {
  id: subscription.source_contract_id,
  source_proposal_id: '70000000-0000-4000-8000-000000000306',
  source_proposal_revision_number: 1,
  source_proposal_code: 'PRP-1',
  title: 'Active Contract',
  opportunity_id: '70000000-0000-4000-8000-000000000307',
  customer_id: subscription.customer_id,
  partner_id: null,
  owner_membership_id: subscription.owner_membership_id,
  created_by_membership_id: subscription.created_by_membership_id,
  currency_code: 'USD',
  status: 'ACTIVE',
  effective_from: subscription.effective_from,
  effective_until: subscription.effective_until,
  revision_number: 1,
  version: 1,
  contract_subtotal: '1.0000',
  grand_total: '1.0000',
  approved_by_membership_id: null,
  approved_at: null,
  created_at: subscription.created_at,
  updated_at: subscription.updated_at,
  lines: [],
};
const meta = {
  request_id: '50000000-0000-4000-8000-000000000301',
  correlation_id: '60000000-0000-4000-8000-000000000301',
};
const response = (data: unknown, status = 200, list = false) =>
  new Response(
    JSON.stringify({ data, meta: { ...meta, ...(list ? { next_cursor: null } : {}) } }),
    { status },
  );
const panel = () => (
  <SubscriptionRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000301' });
  return fetchMock;
};

describe('Subscription Registry UI acceptance matrix', () => {
  it('SUB-WEB-001 renders loading and empty states', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    );
    render(panel());
    expect(await screen.findByRole('status')).toHaveTextContent('Loading Subscriptions');
    resolve(response([], 200, true));
    expect(await screen.findByText('No Subscriptions are registered.')).toBeVisible();
  });
  it('SUB-WEB-002/003 lists, details and shows authoritative origin', async () => {
    install([response([subscription], 200, true), response(subscription)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: subscription.id }));
    expect(await screen.findByText(/Immutable Contract origin:/)).toBeVisible();
    expect(screen.getByText(subscription.customer_id)).toBeVisible();
  });
  it('SUB-WEB-004 creates from a real eligible ACTIVE Contract endpoint', async () => {
    const fetchMock = install([
      response([], 200, true),
      response([contract], 200, true),
      response(subscription),
    ]);
    render(panel());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Load eligible ACTIVE Contracts' }),
    );
    fireEvent.change(screen.getByLabelText('Effective start'), {
      target: { value: '2026-09-01T00:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create Subscription' }));
    const call = fetchMock.mock.calls.at(-1)!;
    expect(call[0]).toContain('/api/v1/commercial/subscriptions');
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({
      contract_id: contract.id,
    });
  });
  it('SUB-WEB-005 updates DRAFT and assigns an authoritative active owner', async () => {
    const administration = {
      memberships: [
        {
          id: subscription.owner_membership_id,
          user_id: subscription.created_by_membership_id,
          status: 'ACTIVE',
          version: 1,
          roles: [],
        },
      ],
      roles: [],
    };
    install([
      response([subscription], 200, true),
      response(subscription),
      response({ ...subscription, version: 2 }),
      response(administration),
      response({
        ...subscription,
        owner_membership_id: subscription.owner_membership_id,
        version: 3,
      }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: subscription.id }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Subscription' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Subscription' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Load active owner options' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Assign owner' }));
    expect(await screen.findByText(/Version 3/)).toBeVisible();
  });
  it.each([
    ['request-activation', 'PENDING_ACTIVATION'],
    ['activate', 'ACTIVE'],
    ['suspend', 'SUSPENDED'],
    ['resume', 'ACTIVE'],
    ['cancel', 'CANCELLED'],
    ['terminate', 'TERMINATED'],
  ])('SUB-WEB-006 lifecycle %s uses authoritative endpoints', async (action, status) => {
    const source =
      action === 'activate'
        ? { ...subscription, status: 'PENDING_ACTIVATION' as const }
        : action === 'suspend' || action === 'cancel' || action === 'terminate'
          ? { ...subscription, status: 'ACTIVE' as const }
          : action === 'resume'
            ? { ...subscription, status: 'SUSPENDED' as const }
            : subscription;
    install([
      response([source], 200, true),
      response(source),
      response({ ...source, status, version: 2 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: source.id }));
    await userEvent.click(screen.getByRole('button', { name: labelsFor(action) }));
    expect(await screen.findByText(status)).toBeVisible();
  });
  it('SUB-WEB-007 renews explicitly without financial implication', async () => {
    const active = { ...subscription, status: 'ACTIVE' as const };
    install([
      response([active], 200, true),
      response(active),
      response({ ...active, effective_until: '2026-11-01T00:00:00.000Z', version: 2 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: active.id }));
    await userEvent.click(screen.getByRole('button', { name: 'Renew explicitly' }));
    expect(await screen.findByText(/Version 2/)).toBeVisible();
  });
  it('SUB-WEB-008 represents terminal immutability', async () => {
    const terminal = { ...subscription, status: 'TERMINATED' as const };
    install([response([terminal], 200, true), response(terminal)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: terminal.id }));
    expect(await screen.findByText(/terminal Subscription is immutable/)).toBeVisible();
    expect(
      screen.queryByLabelText('Subscription lifecycle actions')?.querySelectorAll('button'),
    ).toHaveLength(0);
  });
  it.each([
    [400, /input or Contract eligibility is invalid/],
    [401, /Authentication is required/],
    [403, /Subscription access is forbidden/],
    [404, /selected Subscription was not found/],
    [409, /Subscription data changed/],
    [500, /Subscription Registry is unavailable/],
  ])('SUB-WEB-009..014 handles bounded HTTP %s errors', async (status, text) => {
    install([new Response(undefined, { status })]);
    render(panel());
    expect(await screen.findByText(text)).toBeVisible();
  });
  it('SUB-WEB-015 reloads after conflict', async () => {
    install([
      response([subscription], 200, true),
      response(subscription),
      new Response(undefined, { status: 409 }),
      response([], 200, true),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: subscription.id }));
    await userEvent.click(screen.getByRole('button', { name: 'Request activation' }));
    expect(await screen.findByText('No Subscriptions are registered.')).toBeVisible();
  });
  it('SUB-WEB-016 accessibility exposes labels, status and keyboard-operable actions', async () => {
    install([response([subscription], 200, true), response(subscription)]);
    render(panel());
    expect(await screen.findByRole('button', { name: subscription.id })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: subscription.id }));
    expect(await screen.findByLabelText('Subscription lifecycle actions')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Subscription Registry' })).toBeVisible();
  });
});
function labelsFor(action: string) {
  return {
    'request-activation': 'Request activation',
    activate: 'Activate',
    suspend: 'Suspend',
    resume: 'Resume',
    cancel: 'Cancel',
    terminate: 'Terminate',
  }[action]!;
}
