export type ApiFailureKind =
  | 'authentication-required'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'server-error'
  | 'unavailable';

export class AuthenticatedApiClientError extends Error {
  public constructor(readonly kind: ApiFailureKind) {
    super(kind);
  }
}

export function classifyApiStatus(status: number): ApiFailureKind | undefined {
  if (status === 401) return 'authentication-required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status >= 500) return status === 503 ? 'unavailable' : 'server-error';
  return undefined;
}

export class AuthenticatedApiClient {
  public constructor(
    private readonly configuration: {
      readonly apiBaseUrl: string;
      readonly fetchImplementation: typeof fetch;
      readonly getAccessToken: () => Promise<string | undefined>;
      readonly origin: string;
    },
  ) {}

  public async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith('/api/v1/')) throw new AuthenticatedApiClientError('not-found');
    const token = await this.configuration.getAccessToken();
    if (token === undefined || token.length === 0) {
      throw new AuthenticatedApiClientError('authentication-required');
    }

    const target = new URL(`${this.configuration.apiBaseUrl}${path}`, this.configuration.origin);
    if (target.origin !== this.configuration.origin) {
      throw new AuthenticatedApiClientError('not-found');
    }
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    const response = await this.configuration.fetchImplementation(target, { ...init, headers });
    const failure = classifyApiStatus(response.status);
    if (failure !== undefined) throw new AuthenticatedApiClientError(failure);
    return response;
  }
}
