import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerRegistryPanel } from './CustomerRegistry.js';

afterEach(() => vi.unstubAllGlobals());

describe('Customer Registry UI', () => {
  it('renders empty state and creates through the real API contract', async () => {
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
              display_name: 'Acme',
              reference_code: null,
              contact_email: null,
              status: 'ACTIVE',
              version: 1,
              created_at: '2026-08-18T00:00:00.000Z',
              updated_at: '2026-08-18T00:00:00.000Z',
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
      <CustomerRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />,
    );
    expect(await screen.findByText('No customers are registered.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Display name'), 'Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/api/v1/commercial/customers',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    [401, /Authentication is required/],
    [403, /Customer access is forbidden/],
    [500, /Customer Registry is unavailable/],
  ])('renders safe state for %s', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(undefined, { status }))),
    );
    render(
      <CustomerRegistryPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />,
    );
    expect(await screen.findByText(message)).toBeVisible();
  });
});
