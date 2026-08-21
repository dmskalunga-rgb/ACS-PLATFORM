import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadRegistryPanel } from './LeadRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Lead Registry UI', () => {
  const lead = {
    id: '70000000-0000-4000-8000-000000000011',
    display_name: 'Acme Prospect',
    source: 'MANUAL',
    contact_name: null,
    contact_email: null,
    status: 'NEW',
    version: 1,
    created_at: '2026-08-21T00:00:00.000Z',
    updated_at: '2026-08-21T00:00:00.000Z',
  };
  const list = (data = [lead]) =>
    new Response(
      JSON.stringify({
        data,
        meta: {
          request_id: '50000000-0000-4000-8000-000000000011',
          correlation_id: '60000000-0000-4000-8000-000000000011',
          next_cursor: null,
        },
      }),
      { status: 200 },
    );
  const detail = (data = lead) =>
    new Response(
      JSON.stringify({
        data,
        meta: {
          request_id: '50000000-0000-4000-8000-000000000012',
          correlation_id: '60000000-0000-4000-8000-000000000012',
        },
      }),
      { status: 200 },
    );
  const panel = () => (
    <LeadRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
  );

  it('loads a selected Lead from the real detail endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(detail());
    vi.stubGlobal('fetch', fetchMock);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByRole('heading', { name: 'Lead details' })).toBeVisible();
    const detailCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(detailCall[0]).toBe(`/api/api/v1/commercial/leads/${lead.id}`);
    expect(detailCall[1].headers).toMatchObject({
      authorization: 'Bearer token',
      'x-acs-tenant-id': 'tenant-a',
    });
  });

  it('renders safe not-found detail state without mutation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(new Response(undefined, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'View' }));
    expect(await screen.findByText('Lead details are unavailable.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Lead details' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false);
  });

  it('edits an allowlisted field with expected_version', async () => {
    const updated = { ...lead, display_name: 'Updated Prospect', version: 2 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail(updated))
      .mockResolvedValueOnce(list([updated]));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'View' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit lead' }));
    const editName = document.getElementById('lead-edit-name') as HTMLInputElement;
    await userEvent.clear(editName);
    await userEvent.type(editName, 'Updated Prospect');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const updateCall = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(updateCall[0]).toBe(`/api/api/v1/commercial/leads/${lead.id}`);
    expect(updateCall[1].method).toBe('PATCH');
    expect(updateCall[1].body).toContain('"expected_version":1');
    expect((await screen.findAllByText('Updated Prospect')).length).toBeGreaterThanOrEqual(1);
  });

  it('shows conflict and reloads current representation without retrying update', async () => {
    const current = { ...lead, display_name: 'Server current', version: 2 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(list())
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(new Response(undefined, { status: 409 }))
      .mockResolvedValueOnce(detail(current));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'View' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit lead' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Lead data changed or the request was already used.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reload current lead' }));
    expect((document.getElementById('lead-edit-name') as HTMLInputElement).value).toBe(
      'Server current',
    );
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toHaveLength(1);
  });
  it('renders an empty state and creates through the Lead API contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            meta: {
              request_id: '50000000-0000-4000-8000-000000000011',
              correlation_id: '60000000-0000-4000-8000-000000000011',
              next_cursor: null,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: '70000000-0000-4000-8000-000000000011',
              display_name: 'Acme Prospect',
              source: 'MANUAL',
              contact_name: null,
              contact_email: null,
              status: 'NEW',
              version: 1,
              created_at: '2026-08-21T00:00:00.000Z',
              updated_at: '2026-08-21T00:00:00.000Z',
            },
            meta: {
              request_id: '50000000-0000-4000-8000-000000000022',
              correlation_id: '60000000-0000-4000-8000-000000000022',
              idempotent_replay: false,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [],
            meta: {
              request_id: '50000000-0000-4000-8000-000000000033',
              correlation_id: '60000000-0000-4000-8000-000000000033',
              next_cursor: null,
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
    render(
      <LeadRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />,
    );
    expect(await screen.findByText('No leads are registered.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Display name'), 'Acme Prospect');
    await userEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/api/v1/commercial/leads',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [401, /Authentication is required/],
    [403, /Lead access is forbidden/],
    [500, /Lead Registry is unavailable/],
  ])('renders safe state for %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(undefined, { status }))),
    );
    render(
      <LeadRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />,
    );
    expect(await screen.findByText(message)).toBeVisible();
  });
});
