import type { IdentityAdapter, TrustedIdentity } from './platform-context.js';

export class DevelopmentHeaderIdentityAdapter implements IdentityAdapter {
  readonly configured = true;

  async authenticate(authorizationHeader: string | undefined): Promise<TrustedIdentity | null> {
    if (authorizationHeader === undefined) return null;
    const match = /^Bearer dev:(.{1,255})$/.exec(authorizationHeader);
    return match?.[1] === undefined ? null : { subject: match[1] };
  }
}

export class NotConfiguredIdentityAdapter implements IdentityAdapter {
  readonly configured = false;

  async authenticate(): Promise<null> {
    return null;
  }
}
