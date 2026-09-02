export interface ContextClientConfiguration {
  readonly apiBaseUrl: string;
}

/** The browser only accepts a same-origin API base; Vite forwards `/api` locally. */
export function resolveContextClientConfiguration(input: {
  readonly apiBaseUrl?: string;
}): ContextClientConfiguration {
  const apiBaseUrl = input.apiBaseUrl?.trim() || '/api';
  if (!apiBaseUrl.startsWith('/') || apiBaseUrl.startsWith('//')) {
    throw new Error('The browser API base must be a same-origin relative path.');
  }
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, '') };
}
