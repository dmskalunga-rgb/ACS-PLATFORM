export type ContractReviseDiagnosticLayer =
  | 'HTTP_HANDLER'
  | 'CONTRACT_SERVICE'
  | 'CONTRACT_REPOSITORY_ENTRY'
  | 'POSTGRES_TRANSACTION'
  | 'HTTP_ERROR_MAP'
  | 'PERFORMANCE_HARNESS';
export type ContractReviseDiagnosticPhase = 'enter' | 'success' | 'failure';

const postgresSqlStatePattern = /^[0-9A-Z]{5}$/;
const allowedRuntimeErrorCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT']);

export const emitContractReviseDiagnostic = (
  layer: ContractReviseDiagnosticLayer,
  phase: ContractReviseDiagnosticPhase,
  options: { error?: unknown; httpStatus?: number | null } = {},
) => {
  if (
    process.env.ACS_ENV !== 'test' ||
    process.env.CI !== 'true' ||
    process.env.ACS_CONTRACT_PERFORMANCE_DIAGNOSTIC !== 'true'
  )
    return;
  const error = options.error;
  const candidateCode =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code.toUpperCase()
      : null;
  const sqlstate =
    candidateCode !== null && postgresSqlStatePattern.test(candidateCode) ? candidateCode : null;
  const errorCode =
    sqlstate ??
    (candidateCode !== null && allowedRuntimeErrorCodes.has(candidateCode)
      ? candidateCode
      : error === undefined
        ? null
        : 'UNCLASSIFIED');
  const errorName =
    error === undefined
      ? null
      : sqlstate !== null
        ? 'PostgresError'
        : error instanceof TypeError
          ? 'TypeError'
          : error instanceof Error
            ? error.constructor === Error
              ? 'Error'
              : 'ApplicationError'
            : 'UnknownError';
  const httpStatus =
    typeof options.httpStatus === 'number' && Number.isInteger(options.httpStatus)
      ? options.httpStatus
      : null;
  process.stderr.write(
    `[ACS_SAFE_CONTRACT_BOUNDARY] ${JSON.stringify({
      operation: 'CONTRACT_REVISE_MS',
      layer,
      phase,
      error_name: errorName,
      error_code: errorCode,
      sqlstate,
      http_status: httpStatus,
    })}\n`,
  );
};
