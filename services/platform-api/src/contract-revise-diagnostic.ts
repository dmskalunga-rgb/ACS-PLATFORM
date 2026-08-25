export type ContractReviseDiagnosticLayer =
  | 'HTTP_HANDLER'
  | 'CONTRACT_SERVICE'
  | 'CONTRACT_REPOSITORY_ENTRY'
  | 'POSTGRES_TRANSACTION'
  | 'HTTP_ERROR_MAP'
  | 'PERFORMANCE_HARNESS';
export type ContractReviseDiagnosticPhase = 'enter' | 'success' | 'failure';
export type FastifyContractRevisePhase = 'REQUEST_DISPATCH' | 'ON_REQUEST' | 'ERROR_HANDLER';

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

export const emitFastifyContractReviseDiagnostic = (
  phase: FastifyContractRevisePhase,
  result: ContractReviseDiagnosticPhase,
  options: { error?: unknown; httpStatus?: number | null } = {},
) => {
  if (
    process.env.ACS_ENV !== 'test' ||
    process.env.CI !== 'true' ||
    process.env.ACS_CONTRACT_PERFORMANCE_DIAGNOSTIC !== 'true'
  )
    return;
  const error = options.error;
  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : null;
  const errorCode =
    statusCode === 429 ? 'FASTIFY_RATE_LIMIT' : error === undefined ? null : 'UNCLASSIFIED';
  const errorName =
    error === undefined
      ? null
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
    `[ACS_SAFE_FASTIFY_LIFECYCLE] ${JSON.stringify({
      operation: 'CONTRACT_REVISE_MS',
      phase,
      result,
      error_name: errorName,
      error_code: errorCode,
      http_status: httpStatus,
    })}\n`,
  );
};
