import { createHash, createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { AuthorizationPort } from '@acs/foundation';
import type {
  IdentityAdapter,
  SecurityAuditPort,
  TenantContextRepository,
} from './platform-context.js';
import type { ClassificationEvidencePort } from './principal-classification.js';

export const HUMAN_GOVERNANCE_ROOT_PURPOSE = 'HUMAN_PRINCIPAL_GENESIS_AUTHORIZATION';
export const HUMAN_GOVERNANCE_ROOT_ALGORITHM = 'ECDSA_P256_SHA256';
export const HUMAN_GENESIS_EXECUTE = 'platform.principals.genesis.execute';

export interface HumanGenesisCandidate {
  readonly principal_id: string;
  readonly person_id: string;
  readonly evidence_reference: string;
}

export interface HumanGenesisManifest {
  readonly genesis_id: string;
  readonly manifest_version: '1.0.0';
  readonly purpose: typeof HUMAN_GOVERNANCE_ROOT_PURPOSE;
  readonly tenant_id: string;
  readonly candidates: readonly HumanGenesisCandidate[];
  readonly authorized_executor_identity: string;
  readonly trust_root_id: string;
  readonly issued_at: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly nonce: string;
  readonly manifest_hash: string;
}

export interface HumanGovernancePublicRoot {
  readonly trustRootId: string;
  readonly purpose: string;
  readonly algorithm: string;
  readonly publicKeyPem: string;
  readonly publicKeyFingerprint: string;
  readonly version: number;
  readonly status: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
  readonly notBefore: string;
  readonly notAfter: string;
  readonly revokedAt: string | null;
}

export interface HumanGovernancePublicRootPort {
  resolve(trustRootId: string): Promise<HumanGovernancePublicRoot | null>;
}

export class HumanGenesisAuthorizationFailure extends Error {
  constructor() {
    super('Human genesis authorization is unavailable.');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MANIFEST_KEYS = [
  'authorized_executor_identity',
  'candidates',
  'expires_at',
  'genesis_id',
  'issued_at',
  'manifest_hash',
  'manifest_version',
  'nonce',
  'not_before',
  'purpose',
  'tenant_id',
  'trust_root_id',
].sort();
const CANDIDATE_KEYS = ['evidence_reference', 'person_id', 'principal_id'];

function hasExactKeys(value: unknown, expected: readonly string[]): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === expected.join('\0')
  );
}

/** RFC 8785-compatible for this contract's string-only, array/object JSON subset. */
export function canonicalGenesisJson(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalGenesisJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.some(([, item]) => item === undefined))
      throw new HumanGenesisAuthorizationFailure();
    return `{${entries
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalGenesisJson(item)}`)
      .join(',')}}`;
  }
  throw new HumanGenesisAuthorizationFailure();
}

function manifestFields(manifest: HumanGenesisManifest) {
  return {
    authorized_executor_identity: manifest.authorized_executor_identity,
    candidates: manifest.candidates.map((candidate) => ({
      evidence_reference: candidate.evidence_reference,
      person_id: candidate.person_id,
      principal_id: candidate.principal_id,
    })),
    expires_at: manifest.expires_at,
    genesis_id: manifest.genesis_id,
    issued_at: manifest.issued_at,
    manifest_version: manifest.manifest_version,
    nonce: manifest.nonce,
    not_before: manifest.not_before,
    purpose: manifest.purpose,
    tenant_id: manifest.tenant_id,
    trust_root_id: manifest.trust_root_id,
  };
}

function canonicalPayload(manifest: HumanGenesisManifest): string {
  return canonicalGenesisJson(manifestFields(manifest));
}

export function humanGenesisManifestHash(manifest: HumanGenesisManifest): string {
  return createHash('sha256').update(canonicalPayload(manifest), 'utf8').digest('hex');
}

export function canonicalSignedGenesisManifest(manifest: HumanGenesisManifest): string {
  return canonicalGenesisJson({
    ...manifestFields(manifest),
    manifest_hash: manifest.manifest_hash,
  });
}

function validInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function publicKey(root: HumanGovernancePublicRoot): KeyObject {
  const key = createPublicKey(root.publicKeyPem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
    throw new HumanGenesisAuthorizationFailure();
  const fingerprint = createHash('sha256')
    .update(key.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  if (fingerprint !== root.publicKeyFingerprint) throw new HumanGenesisAuthorizationFailure();
  return key;
}

export class HumanGenesisAuthorizationVerifier {
  constructor(private readonly roots: HumanGovernancePublicRootPort) {}

  async verify(
    manifest: HumanGenesisManifest,
    signatureBase64: string,
    expectedTenantId: string,
    expectedExecutorIdentity: string,
    now = new Date(),
  ): Promise<string> {
    try {
      if (
        !hasExactKeys(manifest, MANIFEST_KEYS) ||
        manifest.manifest_version !== '1.0.0' ||
        manifest.purpose !== HUMAN_GOVERNANCE_ROOT_PURPOSE ||
        manifest.tenant_id !== expectedTenantId ||
        manifest.authorized_executor_identity !== expectedExecutorIdentity ||
        ![
          manifest.genesis_id,
          manifest.tenant_id,
          manifest.nonce,
          manifest.authorized_executor_identity,
        ].every((value) => UUID.test(value)) ||
        !SHA256.test(manifest.manifest_hash) ||
        manifest.candidates.length !== 3 ||
        manifest.candidates.some(
          (candidate) =>
            !hasExactKeys(candidate, CANDIDATE_KEYS) ||
            ![candidate.principal_id, candidate.person_id, candidate.evidence_reference].every(
              (value) => UUID.test(value),
            ),
        ) ||
        new Set(manifest.candidates.map((candidate) => candidate.principal_id)).size !== 3 ||
        new Set(manifest.candidates.map((candidate) => candidate.person_id)).size !== 3 ||
        humanGenesisManifestHash(manifest) !== manifest.manifest_hash
      ) {
        throw new HumanGenesisAuthorizationFailure();
      }
      const issued = validInstant(manifest.issued_at);
      const notBefore = validInstant(manifest.not_before);
      const expires = validInstant(manifest.expires_at);
      const current = now.getTime();
      if (
        issued === null ||
        notBefore === null ||
        expires === null ||
        issued > current ||
        notBefore > current ||
        expires <= current ||
        issued > notBefore ||
        notBefore >= expires
      )
        throw new HumanGenesisAuthorizationFailure();
      const root = await this.roots.resolve(manifest.trust_root_id);
      if (
        root === null ||
        root.trustRootId !== manifest.trust_root_id ||
        root.purpose !== HUMAN_GOVERNANCE_ROOT_PURPOSE ||
        root.algorithm !== HUMAN_GOVERNANCE_ROOT_ALGORITHM ||
        root.status !== 'ACTIVE' ||
        root.revokedAt !== null ||
        root.version < 1 ||
        (validInstant(root.notBefore) ?? Infinity) > current ||
        (validInstant(root.notAfter) ?? -Infinity) <= current ||
        !BASE64.test(signatureBase64)
      )
        throw new HumanGenesisAuthorizationFailure();
      const signature = Buffer.from(signatureBase64, 'base64');
      if (signature.length === 0 || signature.toString('base64') !== signatureBase64)
        throw new HumanGenesisAuthorizationFailure();
      const verifier = createVerify('sha256');
      verifier.update(canonicalSignedGenesisManifest(manifest));
      verifier.end();
      if (!verifier.verify(publicKey(root), signature))
        throw new HumanGenesisAuthorizationFailure();
      return manifest.manifest_hash;
    } catch {
      throw new HumanGenesisAuthorizationFailure();
    }
  }
}

export interface HumanGenesisRepository {
  execute(input: {
    readonly contextToken: string;
    readonly executorUserId: string;
    readonly manifest: HumanGenesisManifest;
    readonly signatureBase64: string;
    readonly requestId: string;
    readonly correlationId: string;
  }): Promise<boolean>;
}

/** The technical executor is authenticated but never becomes the signing authority. */
export class HumanGenesisService {
  constructor(
    private readonly identity: IdentityAdapter,
    private readonly authorization: AuthorizationPort,
    private readonly contexts: TenantContextRepository,
    private readonly verifier: HumanGenesisAuthorizationVerifier,
    private readonly evidence: ClassificationEvidencePort,
    private readonly repository: HumanGenesisRepository,
    private readonly securityAudit: SecurityAuditPort,
  ) {}

  async execute(
    authorizationHeader: string | undefined,
    manifest: HumanGenesisManifest,
    signatureBase64: string,
    metadata: { readonly requestId: string; readonly correlationId: string },
  ): Promise<void> {
    let actorSubject: string | undefined;
    try {
      const authenticated = await this.identity.authenticate(authorizationHeader);
      if (authenticated === null) throw new HumanGenesisAuthorizationFailure();
      actorSubject = authenticated.subject;
      const membership = await this.contexts.resolveMembership(
        authenticated.subject,
        manifest.tenant_id,
      );
      if (membership === null || membership.userId !== manifest.authorized_executor_identity)
        throw new HumanGenesisAuthorizationFailure();
      const decision = await this.authorization.authorize({
        action: HUMAN_GENESIS_EXECUTE,
        resource: 'platform:human-principal-genesis',
        subject_id: membership.userId,
        tenant_id: manifest.tenant_id,
        attributes: {},
      });
      if (!decision.allowed) throw new HumanGenesisAuthorizationFailure();
      const context = await this.contexts.issueContext(
        authenticated.subject,
        manifest.tenant_id,
        HUMAN_GENESIS_EXECUTE,
      );
      if (
        context === null ||
        context.userId !== membership.userId ||
        context.tenantId !== manifest.tenant_id
      )
        throw new HumanGenesisAuthorizationFailure();
      await this.verifier.verify(manifest, signatureBase64, manifest.tenant_id, membership.userId);
      for (const candidate of manifest.candidates) {
        const result = await this.evidence.validate({
          tenantId: manifest.tenant_id,
          evidenceReference: candidate.evidence_reference,
          ...metadata,
        });
        if (result !== 'VALID') throw new HumanGenesisAuthorizationFailure();
      }
      if (
        !(await this.repository.execute({
          contextToken: context.contextToken,
          executorUserId: membership.userId,
          manifest,
          signatureBase64,
          ...metadata,
        }))
      )
        throw new HumanGenesisAuthorizationFailure();
    } catch {
      await this.securityAudit.recordDenied({
        action: HUMAN_GENESIS_EXECUTE,
        ...(actorSubject === undefined ? {} : { actorSubject }),
        correlationId: metadata.correlationId,
        reasonCode: 'HUMAN_GENESIS_DENIED',
        requestId: metadata.requestId,
        requestedTenantId: manifest.tenant_id,
      });
      throw new HumanGenesisAuthorizationFailure();
    }
  }
}
