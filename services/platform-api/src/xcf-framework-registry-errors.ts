export type XcfM1FailureCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_CONTENT'
  | 'CONTENT_TOO_LARGE'
  | 'HASH_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'SOURCE_NOT_TRUSTED'
  | 'SOURCE_UNAVAILABLE'
  | 'ACQUISITION_TIMEOUT'
  | 'PARTIAL_DOWNLOAD'
  | 'LICENSE_INVALID'
  | 'INVALID_TRANSITION'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'MPA_DENIED';

export class XcfM1Failure extends Error {
  constructor(
    readonly code: XcfM1FailureCode,
    message = 'Framework Registry operation is unavailable.',
  ) {
    super(message);
  }
}
