import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanCatalogPanel } from './PlanCatalog.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const plan = {
  id: '70000000-0000-4000-8000-000000000011',
  plan_code: 'starter',
  name: 'Starter',
  description: null,
  status: 'ACTIVE',
  version: 1,
  created_at: '2026-08-22T00:00:00.000Z',
  updated_at: '2026-08-22T00:00:00.000Z',
};
const feature = {
  id: '70000000-0000-4000-8000-000000000012',
  plan_id: plan.id,
  feature_code: 'core',
  name: 'Core',
  description: null,
  version: 1,
  created_at: plan.created_at,
  updated_at: plan.updated_at,
};
const meta = {
  request_id: '50000000-0000-4000-8000-000000000011',
  correlation_id: '60000000-0000-4000-8000-000000000011',
};
const response = (data: unknown, status = 200, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ data, meta: { ...meta, ...extra } }), { status });
const list = (data = [plan]) => response(data, 200, { next_cursor: null });
const panel = () => (
  <PlanCatalogPanel apiBaseUrl="/api" authorization="Bearer token" tenantId="tenant-a" />
);
const install = (responses: Response[]) => {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('crypto', { randomUUID: () => '80000000-0000-4000-8000-000000000011' });
  return fetchMock;
};

describe('Plan Catalog UI acceptance matrix', () => {
  it('WEB-PLAN-01 loading exposes accessible busy feedback', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(panel());
    expect(document.querySelector('[aria-busy="true"]')).toBeVisible();
    expect(screen.getByText('Loading plans…')).toBeVisible();
  });
  it('WEB-PLAN-02 empty state', async () => {
    install([list([])]);
    render(panel());
    expect(await screen.findByText('No plans are registered.')).toBeVisible();
  });
  it('WEB-PLAN-03 populated list has keyboard buttons', async () => {
    install([list()]);
    render(panel());
    expect(await screen.findByRole('button', { name: 'Starter' })).toBeEnabled();
  });
  it('WEB-PLAN-04 creates only allowlisted fields', async () => {
    const f = install([
      list([]),
      response({ ...plan, name: 'Created' }),
      list([{ ...plan, name: 'Created' }]),
    ]);
    render(panel());
    await userEvent.type(screen.getByLabelText('Plan code'), 'created');
    await userEvent.type(screen.getByLabelText('Plan name'), 'Created');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(JSON.parse((f.mock.calls[1]![1]! as RequestInit).body as string)).toEqual({
      plan_code: 'created',
      name: 'Created',
    });
  });
  it('WEB-PLAN-05 loads Plan detail and Feature list', async () => {
    install([list(), response(plan), response([feature], 200, { next_cursor: null })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    expect(await screen.findByRole('heading', { name: 'Starter' })).toBeVisible();
    expect(screen.getByText('Core')).toBeVisible();
  });
  it('WEB-PLAN-06 renders Plan detail not-found state', async () => {
    install([list(), new Response(undefined, { status: 404 })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    expect(await screen.findByText('The selected plan was not found.')).toBeVisible();
  });
  it('WEB-PLAN-07 edits Plan with expected_version and canonical refresh', async () => {
    const updated = { ...plan, name: 'Updated', version: 2 };
    const f = install([
      list(),
      response(plan),
      response([], 200, { next_cursor: null }),
      response(updated),
      list([updated]),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit plan' }));
    const editName = document.getElementById('plan-edit-name') as HTMLInputElement;
    await userEvent.clear(editName);
    await userEvent.type(editName, 'Updated');
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(JSON.parse((f.mock.calls[3]![1]! as RequestInit).body as string)).toEqual({
      plan_code: 'starter',
      name: 'Updated',
      expected_version: 1,
    });
    expect(await screen.findByRole('heading', { name: 'Updated' })).toBeVisible();
  });
  it('WEB-PLAN-08 changes lifecycle with expected_version', async () => {
    const f = install([
      list(),
      response(plan),
      response([], 200, { next_cursor: null }),
      response({ ...plan, status: 'INACTIVE', version: 2 }),
      list([{ ...plan, status: 'INACTIVE', version: 2 }]),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Inactivate plan' }));
    expect(JSON.parse((f.mock.calls[3]![1]! as RequestInit).body as string)).toEqual({
      status: 'INACTIVE',
      expected_version: 1,
    });
  });
  it('WEB-PLAN-09 shows Feature list', async () => {
    install([list(), response(plan), response([feature], 200, { next_cursor: null })]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    expect(await screen.findByText('Core')).toBeVisible();
  });
  it('WEB-PLAN-10 creates Feature without parent mutation', async () => {
    const f = install([
      list(),
      response(plan),
      response([], 200, { next_cursor: null }),
      response(feature),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    await userEvent.type(screen.getByLabelText('Feature code'), 'core');
    await userEvent.type(screen.getByLabelText('Feature name'), 'Core');
    await userEvent.click(screen.getByRole('button', { name: 'Add feature' }));
    expect(JSON.parse((f.mock.calls[3]![1]! as RequestInit).body as string)).toEqual({
      feature_code: 'core',
      name: 'Core',
    });
  });
  it('WEB-PLAN-11 edits Feature with independent expected_version', async () => {
    const updated = { ...feature, name: 'Core two', version: 2 };
    const f = install([
      list(),
      response(plan),
      response([feature], 200, { next_cursor: null }),
      response(updated),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit feature' }));
    const editName = document.getElementById('feature-edit-name') as HTMLInputElement;
    await userEvent.clear(editName);
    await userEvent.type(editName, 'Core two');
    await userEvent.click(screen.getByRole('button', { name: 'Save feature' }));
    expect(JSON.parse((f.mock.calls[3]![1]! as RequestInit).body as string)).toEqual({
      feature_code: 'core',
      name: 'Core two',
      expected_version: 1,
    });
  });
  it('WEB-PLAN-12 displays unauthorized state', async () => {
    install([new Response(undefined, { status: 401 })]);
    render(panel());
    expect(await screen.findByText('Authentication is required.')).toBeVisible();
  });
  it('WEB-PLAN-13 displays forbidden state', async () => {
    install([new Response(undefined, { status: 403 })]);
    render(panel());
    expect(await screen.findByText('Plan access is forbidden.')).toBeVisible();
  });
  it('WEB-PLAN-14 reconciles stale conflict without blind retry', async () => {
    install([
      list(),
      response(plan),
      response([], 200, { next_cursor: null }),
      new Response(undefined, { status: 409 }),
    ]);
    render(panel());
    await userEvent.click(await screen.findByRole('button', { name: 'Starter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit plan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(await screen.findByText('Plan data changed. Reload before retrying.')).toBeVisible();
  });
  it('WEB-PLAN-15 relies on native required validation labels', () => {
    install([list([])]);
    render(panel());
    const form = screen.getByLabelText('Plan code').closest('form')!;
    expect(form).toBeVisible();
    expect(screen.getByLabelText('Plan code')).toBeRequired();
    expect(screen.getByLabelText('Plan name')).toBeRequired();
  });
  it('WEB-PLAN-16 displays network/API failure safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    render(panel());
    expect(
      await screen.findByText('Plan Catalog is unavailable. No data was fabricated.'),
    ).toBeVisible();
  });
});
