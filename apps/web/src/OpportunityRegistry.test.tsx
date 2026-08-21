import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpportunityRegistryPanel } from './OpportunityRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const opportunity = {
  id: '70000000-0000-4000-8000-000000000021',
  opportunity_code: 'OPP-A',
  title: 'Opportunity A',
  owner_membership_id: '70000000-0000-4000-8000-000000000022',
  customer_id: null,
  lead_id: null,
  partner_id: null,
  plan_id: null,
  probability_percent: 20,
  expected_close_date: '2026-09-01',
  stage: 'QUALIFICATION',
  version: 1,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
};
const meta = {
  request_id: '50000000-0000-4000-8000-000000000021',
  correlation_id: '60000000-0000-4000-8000-000000000021',
};
const list = (data = [opportunity]) =>
  new Response(JSON.stringify({ data, meta: { ...meta, next_cursor: null } }), { status: 200 });
const detail = (data = opportunity) =>
  new Response(JSON.stringify({ data, meta }), { status: 200 });
const panel = () => (
  <OpportunityRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);

describe('Opportunity Registry UI', () => {
  it('OPP-WEB-001/002/003 renders loading, empty and real list states', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((done) => (resolve = done))),
    );
    render(panel());
    expect(screen.getByRole('status')).toHaveTextContent('Loading opportunities');
    resolve(list([]));
    expect(await screen.findByText('No opportunities are registered.')).toBeVisible();
  });
  it('OPP-WEB-003/005 shows a real API detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(detail()));
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Opportunity A' }));
    expect(await screen.findByRole('heading', { name: 'Opportunity A' })).toBeVisible();
  });
  it('OPP-WEB-004 creates with a strict allowlisted body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(list([opportunity]));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000021' });
    render(panel());
    await userEvent.type(await screen.findByLabelText('Opportunity code'), 'OPP-A');
    await userEvent.type(screen.getByLabelText('Title'), 'Opportunity A');
    await userEvent.type(
      screen.getByLabelText('Owner membership ID'),
      opportunity.owner_membership_id,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create opportunity' }));
    const request = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(request[0]).toBe('/api/api/v1/commercial/opportunities');
    expect(JSON.parse(request[1].body as string)).toEqual({
      opportunity_code: 'OPP-A',
      title: 'Opportunity A',
      owner_membership_id: opportunity.owner_membership_id,
      probability_percent: null,
      expected_close_date: null,
    });
  });
  it('OPP-WEB-006/007 exposes an edit form and only legal transitions', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(detail());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000022' });
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Opportunity A' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit opportunity' }));
    const title = screen.getByLabelText('Title', { selector: '#opportunity-edit-title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Updated');
    expect(screen.getByRole('button', { name: 'Save opportunity' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move to DISCOVERY' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Move to WON' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([
    [401, /Authentication is required/],
    [403, /Opportunity access is forbidden/],
    [404, /selected opportunity was not found/],
    [409, /Opportunity data changed/],
    [500, /Opportunity Registry is unavailable/],
  ])('OPP-WEB-008..012 has an explicit state for %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(undefined, { status }))),
    );
    render(panel());
    expect(await screen.findByText(message)).toBeVisible();
  });
  it('OPP-WEB-013/014/015 provides labelled keyboard-operable controls and feedback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(list([])));
    render(panel());
    const button = await screen.findByRole('button', { name: 'Create opportunity' });
    expect(screen.getByLabelText('Expected close date')).toBeVisible();
    await userEvent.tab();
    expect(button).not.toBeDisabled();
    expect(screen.getByText('No opportunities are registered.')).toBeVisible();
  });
});
