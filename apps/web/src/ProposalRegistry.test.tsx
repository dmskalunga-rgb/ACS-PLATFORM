import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProposalRegistryPanel } from './ProposalRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const proposal = {
  id: '70000000-0000-4000-8000-000000000091',
  proposal_code: 'PRP-A',
  title: 'Proposal A',
  opportunity_id: '70000000-0000-4000-8000-000000000092',
  customer_id: null,
  partner_id: null,
  owner_membership_id: '70000000-0000-4000-8000-000000000093',
  created_by_membership_id: '70000000-0000-4000-8000-000000000094',
  currency_code: 'USD',
  status: 'DRAFT',
  issued_at: null,
  valid_until: '2027-01-01T00:00:00.000Z',
  revision_number: 1,
  version: 1,
  proposal_subtotal: '10.0000',
  grand_total: '10.0000',
  approved_by_membership_id: null,
  approved_at: null,
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  lines: [
    {
      id: '70000000-0000-4000-8000-000000000095',
      line_number: 1,
      plan_id: '70000000-0000-4000-8000-000000000096',
      plan_name_snapshot: 'Starter',
      description_snapshot: 'Core',
      quantity: '1.0000',
      unit_price: '10.0000',
      line_subtotal: '10.0000',
      created_at: '2026-08-25T00:00:00.000Z',
      updated_at: '2026-08-25T00:00:00.000Z',
    },
  ],
};
const meta = {
  request_id: '50000000-0000-4000-8000-000000000091',
  correlation_id: '60000000-0000-4000-8000-000000000091',
};
const response = (data: unknown, status = 200, list = false) =>
  new Response(
    JSON.stringify({ data, meta: { ...meta, ...(list ? { next_cursor: null } : {}) } }),
    { status },
  );
const list = (items = [proposal]) => response(items, 200, true);
const panel = () => (
  <ProposalRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000091' });
  return fetchMock;
};

describe('Proposal Registry UI acceptance matrix', () => {
  it('PRP-WEB-001 loading and empty states are announced', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    );
    render(panel());
    expect(await screen.findByRole('status')).toHaveTextContent('Loading proposals');
    resolve(list([]));
    expect(await screen.findByText('No proposals are registered.')).toBeVisible();
  });
  it('PRP-WEB-002/003 renders a real API list and detail with server totals', async () => {
    install([list(), response(proposal)]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    expect(await screen.findByRole('heading', { name: 'Proposal A' })).toBeVisible();
    expect(screen.getByText(/USD 10.0000 grand total/)).toBeVisible();
  });
  it('PRP-WEB-004 creates with an allowlisted API body', async () => {
    const f = install([list([]), response(proposal)]);
    render(panel());
    await userEvent.type(await screen.findByLabelText('Proposal code'), 'PRP-A');
    await userEvent.type(screen.getByLabelText('Title'), 'Proposal A');
    await userEvent.type(screen.getByLabelText('Opportunity ID'), proposal.opportunity_id);
    fireEvent.change(screen.getByLabelText('Valid until'), {
      target: { value: '2027-01-01T00:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create proposal' }));
    expect(JSON.parse((f.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      proposal_code: 'PRP-A',
      title: 'Proposal A',
      opportunity_id: proposal.opportunity_id,
      currency_code: 'USD',
    });
  });
  it('PRP-WEB-005/006 edits a DRAFT and manages lines through the API', async () => {
    const f = install([
      list(),
      response(proposal),
      response({ ...proposal, title: 'Updated', version: 2 }),
      response({ ...proposal, version: 3 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit proposal' }));
    const title = screen.getByLabelText('Title', { selector: '#proposal-edit-title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Updated');
    await userEvent.click(screen.getByRole('button', { name: 'Save proposal' }));
    expect(JSON.parse((f.mock.calls[2]![1] as RequestInit).body as string)).toMatchObject({
      title: 'Updated',
      expected_version: 1,
    });
  });
  it('PRP-WEB-007 shows only status-legal lifecycle actions and revision state', async () => {
    install([list(), response({ ...proposal, status: 'APPROVED', revision_number: 2 })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    expect(await screen.findByRole('button', { name: 'Revise' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Send' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.getByText(/Revision 2/)).toBeVisible();
  });
  it.each([
    ['DRAFT', 'Submit for approval', 'submit'],
    ['PENDING_APPROVAL', 'Return to draft', 'return-to-draft'],
    ['PENDING_APPROVAL', 'Approve', 'approve'],
    ['APPROVED', 'Revise', 'revise'],
    ['APPROVED', 'Send', 'send'],
    ['SENT', 'Accept', 'accept'],
    ['SENT', 'Reject', 'reject'],
    ['SENT', 'Cancel', 'cancel'],
    ['SENT', 'Expire', 'expire'],
  ] as const)('PRP-WEB-007 invokes the real %s lifecycle endpoint', async (status, label, path) => {
    const current = { ...proposal, status };
    const f = install([list(), response(current), response({ ...current, version: 2 })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(f.mock.calls[2]![0]).toBe(`/api/api/v1/commercial/proposals/${proposal.id}/${path}`);
    expect(JSON.parse((f.mock.calls[2]![1] as RequestInit).body as string)).toEqual({
      expected_version: 1,
    });
  });
  it('PRP-WEB-006 updates, removes a DRAFT line and assigns an owner through real endpoints', async () => {
    const updated = { ...proposal, lines: [], version: 2 };
    const f = install([
      list(),
      response(proposal),
      response(updated),
      response({ ...updated, version: 3 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
    expect(f.mock.calls[2]![0]).toBe(
      `/api/api/v1/commercial/proposals/${proposal.id}/lines/${proposal.lines[0]!.id}`,
    );
    expect((f.mock.calls[2]![1] as RequestInit).method).toBe('DELETE');
    await userEvent.click(await screen.findByRole('button', { name: 'Assign owner' }));
    expect(f.mock.calls[3]![0]).toBe(`/api/api/v1/commercial/proposals/${proposal.id}/assign`);
  });
  it.each([
    [401, /Authentication is required/],
    [403, /Proposal access is forbidden/],
    [404, /selected proposal was not found/],
    [409, /Proposal data changed/],
    [400, /input or lifecycle state is invalid/],
    [500, /Proposal Registry is unavailable/],
  ])('PRP-WEB-008..013 renders bounded %s errors', async (status, message) => {
    install([new Response(undefined, { status })]);
    render(panel());
    expect(await screen.findByText(message)).toBeVisible();
  });
  it('PRP-WEB-014 conflict reloads authoritative data without blind retry', async () => {
    install([list(), response(proposal), new Response(undefined, { status: 409 }), list([])]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Proposal A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reload proposals' }));
    expect(await screen.findByText('No proposals are registered.')).toBeVisible();
  });
  it('PRP-WEB-015 accessibility exposes labels, required fields and terminal immutability', async () => {
    install([list(), response({ ...proposal, status: 'ACCEPTED' })]);
    render(panel());
    expect(await screen.findByLabelText('Proposal code')).toBeRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Proposal A' }));
    expect(await screen.findByText('This terminal proposal is immutable.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Edit proposal' })).toBeNull();
  });
});
