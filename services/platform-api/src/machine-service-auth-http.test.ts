import { randomUUID } from 'node:crypto';
import { errorEnvelopeSchema } from '@acs/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import type { PlatformConfiguration } from './config.js';
import {
  MachineAuthenticationFailure,
  type MachineAuthenticationService,
} from './machine-service-auth.js';

const tenantId = randomUUID();
const principalId = randomUUID();
const credentialId = randomUUID();
const configuration: PlatformConfiguration = {
  environment: 'test',
  host: '127.0.0.1',
  identityMode: 'development-header',
  logLevel: 'error',
  port: 3000,
  webOrigin: 'http://localhost:5173',
};
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function appWith(service: Partial<MachineAuthenticationService>) {
  const app = await buildApp(configuration, {
    logger: false,
    machineAuthenticationService: service as MachineAuthenticationService,
  });
  apps.push(app);
  return app;
}

describe('canonical Machine/Service HTTP boundary', () => {
  it('fails closed without server bindings', async () => {
    const app = await buildApp(configuration, { logger: false });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
    });
    expect(response.statusCode).toBe(503);
    expect(errorEnvelopeSchema.parse(response.json()).error.code).toBe(
      'MACHINE_AUTH_NOT_CONFIGURED',
    );
  });

  it('binds human provisioning to the tenant selector and never accepts caller principal authority', async () => {
    const provision = vi.fn().mockResolvedValue({
      principalId,
      credential: {
        credentialId,
        credential: 'test-only-credential',
        expiresAt: new Date().toISOString(),
      },
    });
    const app = await appWith({ provision });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers: { authorization: 'Bearer dev:alice', 'x-acs-tenant-id': tenantId },
      payload: {
        principal_type: 'SERVICE',
        external_binding: 'service:test',
        principal_id: randomUUID(),
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(provision).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/platform/machine-identities',
      headers: { authorization: 'Bearer dev:alice', 'x-acs-tenant-id': tenantId },
      payload: { principal_type: 'SERVICE', external_binding: 'service:test' },
    });
    expect(response.statusCode).toBe(200);
    expect(
      z.object({ data: z.object({ principal_id: z.uuid() }) }).parse(response.json()).data
        .principal_id,
    ).toBe(principalId);
    expect(provision).toHaveBeenCalledWith(
      'Bearer dev:alice',
      tenantId,
      'SERVICE',
      'service:test',
      expect.objectContaining({
        requestId: expect.any(String) as unknown,
        correlationId: expect.any(String) as unknown,
      }),
    );
  });

  it('uses only credential headers for machine authentication and flattens failure semantics', async () => {
    const authenticate = vi
      .fn()
      .mockRejectedValueOnce(new MachineAuthenticationFailure('UNAUTHENTICATED'))
      .mockResolvedValueOnce({
        principalId,
        principalType: 'SERVICE',
        tenantId,
        credentialId,
        authenticationMethod: 'ACS_ROTATABLE_CREDENTIAL',
      });
    const app = await appWith({ authenticate });
    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/machine-identities/self',
      headers: { 'x-acs-machine-credential-id': credentialId, 'x-acs-machine-credential': 'wrong' },
    });
    expect(denied.statusCode).toBe(401);
    expect(errorEnvelopeSchema.parse(denied.json()).error.code).toBe('UNAUTHENTICATED');
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/machine-identities/self',
      headers: {
        'x-acs-machine-credential-id': credentialId,
        'x-acs-machine-credential': 'test-only',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(
      z.object({ data: z.object({ principal_id: z.uuid() }) }).parse(response.json()).data
        .principal_id,
    ).toBe(principalId);
    expect(response.body).not.toContain('test-only');
  });

  it('delegates rotation, revocation, disablement and permission changes to the service', async () => {
    const rotate = vi.fn().mockResolvedValue({
      credentialId,
      credential: 'test-only-credential',
      expiresAt: new Date().toISOString(),
    });
    const revoke = vi.fn().mockResolvedValue(undefined);
    const disable = vi.fn().mockResolvedValue(undefined);
    const setPermission = vi.fn().mockResolvedValue(undefined);
    const app = await appWith({ rotate, revoke, disable, setPermission });
    const headers = { authorization: 'Bearer dev:alice', 'x-acs-tenant-id': tenantId };
    const url = `/api/v1/platform/machine-identities/${principalId}`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/rotate-credential`,
          headers,
          payload: { current_credential_id: credentialId },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/revoke-credential`,
          headers,
          payload: { credential_id: credentialId },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'POST', url: `${url}/disable`, headers })).statusCode).toBe(
      200,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${url}/permissions`,
          headers,
          payload: { permission_key: 'platform.context.read', grant: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(rotate).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(disable).toHaveBeenCalledOnce();
    expect(setPermission).toHaveBeenCalledOnce();
  });
});
