import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerRegistryPanel } from './PartnerRegistry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const partner = {
  id: '70000000-0000-4000-8000-000000000011',
  partner_code: 'PARTNER-A',
  display_name: 'Partner A',
  status: 'ACTIVE',
  version: 1,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};
const list = (data = [partner]) =>
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
const detail = (data = partner) =>
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
  <PartnerRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);

describe('Partner Registry UI', () => {
  it('loads a real Partner detail with semantic controls', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(detail());
    vi.stubGlobal('fetch', fetchMock);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Partner A' }));
    expect(await screen.findByRole('heading', { name: 'Partner A' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit partner' })).toBeVisible();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/api/v1/commercial/partners/${partner.id}`);
  });
  it('creates with only the canonical Partner fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(list([partner]));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
    render(panel());
    await userEvent.type(await screen.findByLabelText('Partner code'), 'PARTNER-A');
    await userEvent.type(screen.getByLabelText('Partner display name'), 'Partner A');
    await userEvent.click(screen.getByRole('button', { name: 'Create partner' }));
    const create = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(create[0]).toBe('/api/api/v1/commercial/partners');
    expect(create[1].body).toBe('{"partner_code":"PARTNER-A","display_name":"Partner A"}');
  });
  it.each([
    [401, /Authentication is required/],
    [403, /Partner access is forbidden/],
    [409, /Partner data changed/],
    [500, /Partner Registry is unavailable/],
  ])('renders an accessible safe state for %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(undefined, { status }))),
    );
    render(panel());
    expect(await screen.findByText(message)).toBeVisible();
  });
});
