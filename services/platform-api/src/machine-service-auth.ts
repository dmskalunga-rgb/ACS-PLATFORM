import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type { IdentityAdapter, TenantContextRepository } from './platform-context.js';

export const MACHINE_PROVISION = 'platform.machine_principals.provision';
export const MACHINE_CREDENTIAL_MANAGE = 'platform.machine_credentials.manage';
export const MACHINE_PERMISSION_MANAGE = 'platform.machine_permissions.manage';
export type MachinePrincipalType = 'MACHINE' | 'SERVICE' | 'AUTOMATION';
export type MachineMetadata = { readonly requestId: string; readonly correlationId: string };
export type MachineActor = MachineMetadata & {
  readonly actorUserId: string;
  readonly contextToken: string;
  readonly tenantId: string;
};
export type AuthenticatedMachineIdentity = Readonly<{
  principalId: string;
  principalType: MachinePrincipalType;
  tenantId: string;
  credentialId: string;
  authenticationMethod: 'ACS_ROTATABLE_CREDENTIAL';
}>;
export type StoredMachineCredential = {
  credentialId: string;
  principalId: string;
  principalType: MachinePrincipalType;
  tenantId: string;
  verifier: string;
  credentialStatus: 'ACTIVE' | 'REVOKED' | 'SUPERSEDED';
  principalStatus: 'ACTIVE' | 'DISABLED' | 'REVOKED';
  expiresAt: string;
};
export type IssuedMachineCredential = {
  credentialId: string;
  credential: string;
  expiresAt: string;
};

export class MachineAuthenticationFailure extends Error {
  constructor(readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_REQUEST') {
    super('Machine service operation is unavailable.');
  }
}

export interface MachineAuthenticationRepository {
  provision(
    input: MachineActor & {
      principalType: MachinePrincipalType;
      externalBinding: string;
      credentialId: string;
      verifier: string;
      expiresAt: string;
    },
  ): Promise<string>;
  rotate(
    input: MachineActor & {
      principalId: string;
      expectedCredentialId: string;
      credentialId: string;
      verifier: string;
      expiresAt: string;
    },
  ): Promise<void>;
  revoke(input: MachineActor & { principalId: string; credentialId: string }): Promise<void>;
  disable(input: MachineActor & { principalId: string }): Promise<void>;
  setPermission(
    input: MachineActor & { principalId: string; permission: string; grant: boolean },
  ): Promise<void>;
  resolveCredential(credentialId: string): Promise<StoredMachineCredential | null>;
  issueContext(identity: AuthenticatedMachineIdentity, permission: string): Promise<string | null>;
}

function hash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function credential(lifetimeSeconds: number): IssuedMachineCredential & { verifier: string } {
  const secret = randomBytes(32).toString('base64url');
  return {
    credentialId: randomUUID(),
    credential: secret,
    verifier: hash(secret),
    expiresAt: new Date(Date.now() + lifetimeSeconds * 1000).toISOString(),
  };
}

function verifierMatches(left: string, right: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
  );
}

/** Only identities minted by this service instance may request machine tenant context. */
export class MachineAuthenticationService {
  private readonly authenticated = new WeakSet<object>();
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly repository: MachineAuthenticationRepository,
    private readonly credentialLifetimeSeconds = 86_400,
  ) {
    if (
      !Number.isInteger(credentialLifetimeSeconds) ||
      credentialLifetimeSeconds < 60 ||
      credentialLifetimeSeconds > 2_592_000
    )
      throw new Error('Machine credential lifetime must be between one minute and thirty days.');
  }

  private async actor(
    header: string | undefined,
    tenantId: string,
    action: string,
    meta: MachineMetadata,
  ): Promise<MachineActor> {
    let principal;
    try {
      principal = await this.identity.authenticate(header);
    } catch {
      throw new MachineAuthenticationFailure('UNAUTHENTICATED');
    }
    if (!principal) throw new MachineAuthenticationFailure('UNAUTHENTICATED');
    const membership = await this.contexts.resolveMembership(principal.subject, tenantId);
    if (!membership) throw new MachineAuthenticationFailure('FORBIDDEN');
    const decision = await this.authorization.authorize({
      action,
      resource: 'platform:machine-service-identity',
      subject_id: membership.userId,
      tenant_id: tenantId,
      attributes: {},
    });
    if (!decision.allowed) throw new MachineAuthenticationFailure('FORBIDDEN');
    const context = await this.contexts.issueContext(principal.subject, tenantId, action);
    if (!context || context.userId !== membership.userId || context.tenantId !== tenantId)
      throw new MachineAuthenticationFailure('FORBIDDEN');
    return {
      actorUserId: membership.userId,
      contextToken: context.contextToken,
      tenantId,
      ...meta,
    };
  }

  async provision(
    header: string | undefined,
    tenantId: string,
    principalType: MachinePrincipalType,
    externalBinding: string,
    meta: MachineMetadata,
  ): Promise<{ principalId: string; credential: IssuedMachineCredential }> {
    if (
      !['MACHINE', 'SERVICE', 'AUTOMATION'].includes(principalType) ||
      externalBinding.length < 1 ||
      externalBinding.length > 200
    )
      throw new MachineAuthenticationFailure('INVALID_REQUEST');
    const actor = await this.actor(header, tenantId, MACHINE_PROVISION, meta);
    const issued = credential(this.credentialLifetimeSeconds);
    const principalId = await this.repository.provision({
      ...actor,
      principalType,
      externalBinding,
      credentialId: issued.credentialId,
      verifier: issued.verifier,
      expiresAt: issued.expiresAt,
    });
    return {
      principalId,
      credential: {
        credentialId: issued.credentialId,
        credential: issued.credential,
        expiresAt: issued.expiresAt,
      },
    };
  }

  async rotate(
    header: string | undefined,
    tenantId: string,
    principalId: string,
    expectedCredentialId: string,
    meta: MachineMetadata,
  ): Promise<IssuedMachineCredential> {
    const actor = await this.actor(header, tenantId, MACHINE_CREDENTIAL_MANAGE, meta);
    const issued = credential(this.credentialLifetimeSeconds);
    await this.repository.rotate({
      ...actor,
      principalId,
      expectedCredentialId,
      credentialId: issued.credentialId,
      verifier: issued.verifier,
      expiresAt: issued.expiresAt,
    });
    return {
      credentialId: issued.credentialId,
      credential: issued.credential,
      expiresAt: issued.expiresAt,
    };
  }

  async revoke(
    header: string | undefined,
    tenantId: string,
    principalId: string,
    credentialId: string,
    meta: MachineMetadata,
  ): Promise<void> {
    await this.repository.revoke({
      ...(await this.actor(header, tenantId, MACHINE_CREDENTIAL_MANAGE, meta)),
      principalId,
      credentialId,
    });
  }

  async disable(
    header: string | undefined,
    tenantId: string,
    principalId: string,
    meta: MachineMetadata,
  ): Promise<void> {
    await this.repository.disable({
      ...(await this.actor(header, tenantId, MACHINE_CREDENTIAL_MANAGE, meta)),
      principalId,
    });
  }

  async setPermission(
    header: string | undefined,
    tenantId: string,
    principalId: string,
    permission: string,
    grant: boolean,
    meta: MachineMetadata,
  ): Promise<void> {
    await this.repository.setPermission({
      ...(await this.actor(header, tenantId, MACHINE_PERMISSION_MANAGE, meta)),
      principalId,
      permission,
      grant,
    });
  }

  async authenticate(
    credentialId: string | undefined,
    secret: string | undefined,
  ): Promise<AuthenticatedMachineIdentity> {
    if (
      !credentialId ||
      !secret ||
      !/^[0-9a-f-]{36}$/i.test(credentialId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(secret)
    )
      throw new MachineAuthenticationFailure('UNAUTHENTICATED');
    let record: StoredMachineCredential | null;
    try {
      record = await this.repository.resolveCredential(credentialId);
    } catch {
      throw new MachineAuthenticationFailure('UNAUTHENTICATED');
    }
    if (
      !record ||
      !verifierMatches(hash(secret), record.verifier) ||
      record.credentialStatus !== 'ACTIVE' ||
      record.principalStatus !== 'ACTIVE' ||
      Date.parse(record.expiresAt) <= Date.now() ||
      !['MACHINE', 'SERVICE', 'AUTOMATION'].includes(record.principalType)
    )
      throw new MachineAuthenticationFailure('UNAUTHENTICATED');
    const authenticated: AuthenticatedMachineIdentity = Object.freeze({
      principalId: record.principalId,
      principalType: record.principalType,
      tenantId: record.tenantId,
      credentialId: record.credentialId,
      authenticationMethod: 'ACS_ROTATABLE_CREDENTIAL',
    });
    this.authenticated.add(authenticated);
    return authenticated;
  }

  async issueTenantContext(
    identity: AuthenticatedMachineIdentity,
    requestedTenantId: string,
    permission: string,
  ): Promise<string> {
    if (!this.authenticated.has(identity) || identity.tenantId !== requestedTenantId || !permission)
      throw new MachineAuthenticationFailure('FORBIDDEN');
    const token = await this.repository.issueContext(identity, permission);
    if (!token) throw new MachineAuthenticationFailure('FORBIDDEN');
    return token;
  }
}
