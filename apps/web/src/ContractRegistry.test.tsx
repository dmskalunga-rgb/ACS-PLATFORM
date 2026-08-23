import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractRegistryPanel } from './ContractRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const contract = {
  id: '70000000-0000-4000-8000-000000000201',
  source_proposal_id: '70000000-0000-4000-8000-000000000202',
  source_proposal_revision_number: 1,
  source_proposal_code: 'PRP-ACCEPTED',
  title: 'Contract A',
  opportunity_id: '70000000-0000-4000-8000-000000000203',
  customer_id: null,
  partner_id: null,
  owner_membership_id: '70000000-0000-4000-8000-000000000204',
  created_by_membership_id: '70000000-0000-4000-8000-000000000205',
  currency_code: 'USD',
  status: 'DRAFT' as const,
  effective_from: null,
  effective_until: null,
  revision_number: 1,
  version: 1,
  contract_subtotal: '10.0000',
  grand_total: '10.0000',
  approved_by_membership_id: null,
  approved_at: null,
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:00:00.000Z',
  lines: [
    {
      id: '70000000-0000-4000-8000-000000000206',
      line_number: 1,
      source_proposal_line_item_id: '70000000-0000-4000-8000-000000000207',
      plan_id: '70000000-0000-4000-8000-000000000208',
      plan_name_snapshot: 'Starter',
      description_snapshot: 'Core',
      quantity: '1.0000',
      unit_price: '10.0000',
      line_subtotal: '10.0000',
      created_at: '2026-08-26T00:00:00.000Z',
      updated_at: '2026-08-26T00:00:00.000Z',
    },
  ],
};
const meta = {
  request_id: '50000000-0000-4000-8000-000000000201',
  correlation_id: '60000000-0000-4000-8000-000000000201',
};
const response = (data: unknown, status = 200, list = false) =>
  new Response(
    JSON.stringify({ data, meta: { ...meta, ...(list ? { next_cursor: null } : {}) } }),
    {
      status,
    },
  );
const list = (items = [contract]) => response(items, 200, true);
const panel = () => (
  <ContractRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000201' });
  return fetchMock;
};

describe('Contract Registry UI acceptance matrix', () => {
  it('CTR-WEB-001 announces loading and empty states', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    );
    render(panel());
    expect(await screen.findByRole('status')).toHaveTextContent('Loading Contracts');
    resolve(list([]));
    expect(await screen.findByText('No Contracts are registered.')).toBeVisible();
  });
  it('CTR-WEB-002/003 renders a real list, detail and authoritative totals', async () => {
    install([list(), response(contract)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    expect(await screen.findByRole('heading', { name: 'Contract A' })).toBeVisible();
    expect(screen.getByText(/USD 10.0000 grand total/)).toBeVisible();
    expect(screen.getByText(/PRP-ACCEPTED/)).toBeVisible();
  });
  it('CTR-WEB-004 creates only from an explicit accepted Proposal reference', async () => {
    const fetchMock = install([list([]), response(contract)]);
    render(panel());
    await userEvent.type(
      await screen.findByLabelText('Accepted Proposal ID'),
      contract.source_proposal_id,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Contract from accepted Proposal' }),
    );
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      source_proposal_id: contract.source_proposal_id,
    });
  });
  it('CTR-WEB-005 updates a DRAFT with expected_version and effective dates', async () => {
    const updated = { ...contract, title: 'Updated Contract', version: 2 };
    const fetchMock = install([list(), response(contract), response(updated)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Contract' }));
    const title = screen.getByLabelText('Title', { selector: '#contract-edit-title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Updated Contract');
    fireEvent.change(screen.getByLabelText('Effective from'), {
      target: { value: '2027-01-01T00:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save Contract' }));
    expect(JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string)).toMatchObject({
      title: 'Updated Contract',
      expected_version: 1,
    });
  });
  it('CTR-WEB-006 manages DRAFT line add, update and removal through API endpoints', async () => {
    const fetchMock = install([
      list(),
      response(contract),
      response({ ...contract, version: 2 }),
      response({ ...contract, version: 3 }),
      response({ ...contract, version: 4, lines: [] }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    await userEvent.type(screen.getByLabelText('Plan ID'), contract.lines[0]!.plan_id);
    await userEvent.click(screen.getByRole('button', { name: 'Add line item' }));
    expect(fetchMock.mock.calls[2]![0]).toBe(
      `/api/api/v1/commercial/contracts/${contract.id}/lines`,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save line 1' }));
    expect(fetchMock.mock.calls[3]![0]).toBe(
      `/api/api/v1/commercial/contracts/${contract.id}/lines/${contract.lines[0]!.id}`,
    );
    expect((fetchMock.mock.calls[3]![1] as RequestInit).method).toBe('PATCH');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove line 1' }));
    expect((fetchMock.mock.calls[4]![1] as RequestInit).method).toBe('DELETE');
  });
  it('CTR-WEB-006 selects an active owner from authoritative tenant administration data', async () => {
    const administration = {
      data: {
        memberships: [
          {
            id: contract.owner_membership_id,
            user_id: '70000000-0000-4000-8000-000000000209',
            status: 'ACTIVE',
            version: 1,
            roles: [],
          },
        ],
        roles: [],
      },
      meta,
    };
    const fetchMock = install([
      list(),
      response(contract),
      new Response(JSON.stringify(administration), { status: 200 }),
      response({ ...contract, version: 2 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Load active owner options' }));
    expect(await screen.findByLabelText('Owner membership')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Assign owner' }));
    expect(fetchMock.mock.calls[3]![0]).toBe(
      `/api/api/v1/commercial/contracts/${contract.id}/assign`,
    );
  });
  it.each([
    ['DRAFT', 'Submit for approval', 'submit'],
    ['PENDING_APPROVAL', 'Return to draft', 'return-to-draft'],
    ['PENDING_APPROVAL', 'Approve', 'approve'],
    ['APPROVED', 'Revise', 'revise'],
    ['APPROVED', 'Activate', 'activate'],
    ['APPROVED', 'Cancel', 'cancel'],
    ['ACTIVE', 'Terminate', 'terminate'],
  ] as const)('CTR-WEB-007 calls the legal %s lifecycle endpoint', async (status, label, path) => {
    const current = { ...contract, status };
    const fetchMock = install([list(), response(current), response({ ...current, version: 2 })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(fetchMock.mock.calls[2]![0]).toBe(
      `/api/api/v1/commercial/contracts/${contract.id}/${path}`,
    );
    expect(JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string)).toEqual({
      expected_version: 1,
    });
  });
  it('CTR-WEB-008 represents revision and terminal immutability without invalid controls', async () => {
    install([list(), response({ ...contract, status: 'TERMINATED', revision_number: 2 })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    expect(await screen.findByText('This terminal Contract is immutable.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit Contract' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
  });
  it.each([
    [400, /input or source eligibility is invalid/],
    [401, /Authentication is required/],
    [403, /Contract access is forbidden/],
    [404, /selected Contract was not found/],
    [409, /Contract data changed/],
    [500, /Contract Registry is unavailable/],
  ])('CTR-WEB-009..014 renders bounded %s errors', async (status, message) => {
    install([new Response(undefined, { status })]);
    render(panel());
    expect(await screen.findByText(message)).toBeVisible();
  });
  it('CTR-WEB-015 reloads authoritative state after a 409 conflict', async () => {
    install([list(), response(contract), new Response(undefined, { status: 409 }), list([])]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Contract A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reload Contracts' }));
    expect(await screen.findByText('No Contracts are registered.')).toBeVisible();
  });
  it('CTR-WEB-016 accessibility exposes semantic labels and keyboard-operable actions', async () => {
    install([list(), response(contract)]);
    render(panel());
    expect(await screen.findByLabelText('Accepted Proposal ID')).toBeRequired();
    await userEvent.tab();
    expect(
      screen.getByRole('button', { name: 'Create Contract from accepted Proposal' }),
    ).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Contract A' }));
    expect(await screen.findByLabelText('Contract lifecycle actions')).toBeVisible();
    expect(screen.getByLabelText('Contract line items')).toBeVisible();
  });
});
