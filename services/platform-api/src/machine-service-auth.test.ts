import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MachineAuthenticationFailure,
  MachineAuthenticationService,
  type AuthenticatedMachineIdentity,
  type MachineAuthenticationRepository,
  type StoredMachineCredential,
} from './machine-service-auth.js';
import type { IdentityAdapter, TenantContextRepository } from './platform-context.js';
import type { AuthorizationPort } from '@acs/foundation';

const tenantA = randomUUID();
const tenantB = randomUUID();
const userId = randomUUID();
const meta = { requestId: randomUUID(), correlationId: randomUUID() };

function fixture(allowed = true) {
  const records = new Map<string, StoredMachineCredential>();
  const calls: string[] = [];
  let permission = allowed;
  const repository: MachineAuthenticationRepository = {
    provision(input) {
      const principalId = randomUUID();
      records.set(input.credentialId, {
        credentialId: input.credentialId,
        principalId,
        principalType: input.principalType,
        tenantId: input.tenantId,
        verifier: input.verifier,
        credentialStatus: 'ACTIVE',
        principalStatus: 'ACTIVE',
        expiresAt: input.expiresAt,
      });
      return Promise.resolve(principalId);
    },
    rotate(input) {
      for (const [id, record] of records)
        if (record.principalId === input.principalId && record.credentialStatus === 'ACTIVE')
          records.set(id, { ...record, credentialStatus: 'SUPERSEDED' });
      records.set(input.credentialId, {
        credentialId: input.credentialId,
        principalId: input.principalId,
        principalType: 'SERVICE',
        tenantId: input.tenantId,
        verifier: input.verifier,
        credentialStatus: 'ACTIVE',
        principalStatus: 'ACTIVE',
        expiresAt: input.expiresAt,
      });
      return Promise.resolve();
    },
    revoke(input) {
      const record = records.get(input.credentialId);
      if (!record || record.principalId !== input.principalId)
        throw new MachineAuthenticationFailure('FORBIDDEN');
      records.set(input.credentialId, { ...record, credentialStatus: 'REVOKED' });
      return Promise.resolve();
    },
    disable(input) {
      for (const [id, record] of records)
        if (record.principalId === input.principalId)
          records.set(id, { ...record, principalStatus: 'DISABLED' });
      return Promise.resolve();
    },
    setPermission() {
      permission = true;
      return Promise.resolve();
    },
    resolveCredential(id) {
      return Promise.resolve(records.get(id) ?? null);
    },
    issueContext(identity, action) {
      calls.push(action);
      const record = records.get(identity.credentialId);
      return Promise.resolve(
        record?.credentialStatus === 'ACTIVE' && record.principalStatus === 'ACTIVE' && permission
          ? randomUUID()
          : null,
      );
    },
  };
  const identity: IdentityAdapter = {
    configured: true,
    authenticate: (header) =>
      Promise.resolve(header === 'Bearer human' ? { subject: 'human-subject' } : null),
  };
  const contexts: TenantContextRepository = {
    resolveMembership: (_, tenantId) =>
      Promise.resolve(
        tenantId === tenantA ? { userId, tenantId, tenantSlug: 'a', tenantDisplayName: 'A' } : null,
      ),
    isActionAuthorized: () => Promise.resolve(allowed),
    issueContext: (_, tenantId) =>
      Promise.resolve(
        tenantId === tenantA
          ? {
              userId,
              tenantId,
              tenantSlug: 'a',
              tenantDisplayName: 'A',
              contextToken: randomUUID(),
            }
          : null,
      ),
    readAndAudit: (context) => Promise.resolve(context),
  };
  const authorization: AuthorizationPort = {
    authorize: () => Promise.resolve({ allowed, reason: '', policy_id: 'test' }),
  };
  const service = new MachineAuthenticationService(identity, authorization, contexts, repository);
  return {
    service,
    repository,
    records,
    calls,
    setPermission: (value: boolean) => {
      permission = value;
    },
  };
}

describe('canonical machine/service authentication', () => {
  it('provisions a tenant-bound service with a non-plaintext verifier and authenticates it', async () => {
    const { service, records } = fixture();
    const { principalId, credential } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    const stored = records.get(credential.credentialId)!;
    expect(stored.principalId).toBe(principalId);
    expect(stored.verifier).toBe(createHash('sha256').update(credential.credential).digest('hex'));
    expect(stored.verifier).not.toContain(credential.credential);
    const authenticated = await service.authenticate(
      credential.credentialId,
      credential.credential,
    );
    expect(authenticated.principalType).toBe('SERVICE');
    expect(authenticated).not.toHaveProperty('userId');
    expect(
      await service.issueTenantContext(authenticated, tenantA, 'future.domain.action'),
    ).toMatch(/^[0-9a-f-]{36}$/);
    await expect(
      service.issueTenantContext(authenticated, tenantB, 'future.domain.action'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies missing, unknown, wrong, expired, revoked and disabled credentials', async () => {
    const { service, records } = fixture();
    const { principalId, credential } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    await expect(service.authenticate(undefined, undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(service.authenticate(randomUUID(), credential.credential)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      service.authenticate(credential.credentialId, 'x'.repeat(43)),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    records.set(credential.credentialId, {
      ...records.get(credential.credentialId)!,
      expiresAt: new Date(0).toISOString(),
    });
    await expect(
      service.authenticate(credential.credentialId, credential.credential),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    records.set(credential.credentialId, {
      ...records.get(credential.credentialId)!,
      expiresAt: credential.expiresAt,
    });
    await service.revoke('Bearer human', tenantA, principalId, credential.credentialId, meta);
    await expect(
      service.authenticate(credential.credentialId, credential.credential),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const rotated = await service.rotate(
      'Bearer human',
      tenantA,
      principalId,
      credential.credentialId,
      meta,
    );
    await service.disable('Bearer human', tenantA, principalId, meta);
    await expect(
      service.authenticate(rotated.credentialId, rotated.credential),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('never accepts a forged principal ID or authentication without permission', async () => {
    const { service, setPermission } = fixture();
    const { credential } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    const forged: AuthenticatedMachineIdentity = {
      principalId: randomUUID(),
      tenantId: tenantA,
      principalType: 'SERVICE',
      credentialId: credential.credentialId,
      authenticationMethod: 'ACS_ROTATABLE_CREDENTIAL',
    };
    await expect(
      service.issueTenantContext(forged, tenantA, 'future.domain.action'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const authenticated = await service.authenticate(
      credential.credentialId,
      credential.credential,
    );
    setPermission(false);
    await expect(
      service.issueTenantContext(authenticated, tenantA, 'future.domain.action'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('denies unauthorized human provisioning before creating credentials', async () => {
    const { service, records } = fixture(false);
    await expect(
      service.provision('Bearer human', tenantA, 'SERVICE', 'internal-service', meta),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(records.size).toBe(0);
  });

  it('denies missing human authentication and accepts only the newly rotated credential', async () => {
    const { service } = fixture();
    await expect(
      service.provision(undefined, tenantA, 'SERVICE', 'internal-service', meta),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const { principalId, credential: old } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    const next = await service.rotate('Bearer human', tenantA, principalId, old.credentialId, meta);
    await expect(service.authenticate(old.credentialId, old.credential)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect((await service.authenticate(next.credentialId, next.credential)).principalId).toBe(
      principalId,
    );
  });

  it('fails closed on repository outage without leaking credential existence', async () => {
    const { service, repository } = fixture();
    const { credential } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    repository.resolveCredential = () => Promise.reject(new Error('test-only repository outage'));
    await expect(
      service.authenticate(credential.credentialId, credential.credential),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Machine service operation is unavailable.',
    });
  });

  it('denies malformed, missing, and unsupported principal authentication states', async () => {
    const { service, records } = fixture();
    const { credential } = await service.provision(
      'Bearer human',
      tenantA,
      'SERVICE',
      'internal-service',
      meta,
    );
    await expect(service.authenticate('not-a-uuid', credential.credential)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(service.authenticate(credential.credentialId, undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const stored = records.get(credential.credentialId)!;
    records.set(credential.credentialId, { ...stored, principalStatus: 'REVOKED' });
    await expect(
      service.authenticate(credential.credentialId, credential.credential),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
