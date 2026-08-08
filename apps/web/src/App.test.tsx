import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => vi.unstubAllGlobals());

describe('FOUNDATION application shell', () => {
  it('renders a verified technical API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              component: 'FOUNDATION',
              service: 'acs-platform-api',
              status: 'ok',
              version: '0.0.0-foundation',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      ),
    );
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Engineering Foundation' })).toBeVisible();
    expect(await screen.findByText('acs-platform-api')).toBeVisible();
    expect(screen.getByText('FOUNDATION')).toBeVisible();
  });

  it('shows disconnected state rather than fabricated data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    render(<App />);
    expect(await screen.findByText(/Technical service disconnected/)).toBeVisible();
  });
});
