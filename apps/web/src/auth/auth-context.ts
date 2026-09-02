import { createContext, useContext } from 'react';
import type { ActiveMembershipBootstrapResponse } from '@acs/contracts';

export type AuthenticationState =
  | 'loading'
  | 'unauthenticated'
  | 'authenticating'
  | 'callback-processing'
  | 'authenticated'
  | 'session-expired'
  | 'error';

export type MembershipState =
  | { readonly kind: 'not-requested' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly response: ActiveMembershipBootstrapResponse }
  | { readonly kind: 'no-active-membership' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'unavailable' };

export interface BrowserAuthContextValue {
  readonly authentication: AuthenticationState;
  readonly membership: MembershipState;
  readonly signIn: () => Promise<void>;
  readonly signOut: () => Promise<void>;
}

export const BrowserAuthContext = createContext<BrowserAuthContextValue | undefined>(undefined);

export function useBrowserAuth(): BrowserAuthContextValue {
  const value = useContext(BrowserAuthContext);
  if (value === undefined) throw new Error('AuthProvider is required.');
  return value;
}
