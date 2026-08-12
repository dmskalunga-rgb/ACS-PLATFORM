export interface ContextClientConfiguration {
  readonly accessToken?: string;
  readonly developmentIdentitySubject?: string;
  readonly onSignIn?: () => void;
  readonly onSignOut?: () => void | Promise<void>;
  readonly tenantId?: string;
}

export function resolveContextClientConfiguration(input: {
  readonly developmentIdentitySubject?: string;
  readonly isDevelopment: boolean;
  readonly tenantId?: string;
}): ContextClientConfiguration {
  if (!input.isDevelopment) return {};
  return {
    ...(input.developmentIdentitySubject === undefined
      ? {}
      : { developmentIdentitySubject: input.developmentIdentitySubject }),
    ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
  };
}
