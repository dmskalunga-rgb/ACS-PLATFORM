import { createHash, createPublicKey, verify } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {
  xcfFrameworkArtifactSchema,
  type XcfFrameworkObject,
  type XcfFrameworkReleaseIngest,
} from '@acs/contracts';
import { XcfM1Failure } from './xcf-framework-registry-errors.js';

const JSON_MEDIA_TYPE = 'application/json';
const GZIP_MEDIA_TYPES = new Set(['application/gzip', 'application/x-gzip']);
const MAXIMUM_JSON_DEPTH = 16;
const MAXIMUM_OBJECTS = 20_000;
const MAXIMUM_EXPANSION_RATIO = 20;

export type XcfM1QuarantineReason =
  | 'HASH_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'TRUSTED_KEY_UNKNOWN'
  | 'TRUSTED_KEY_UNTRUSTED'
  | 'SIGNATURE_ALGORITHM_UNSUPPORTED'
  | 'PUBLISHER_KEY_MISMATCH'
  | 'MEDIA_TYPE_UNSUPPORTED'
  | 'DECOMPRESSION_LIMIT'
  | 'PARSER_INVALID'
  | 'SCHEMA_INVALID'
  | 'LICENSE_INVALID';

export interface XcfSourceIngestionPolicy {
  readonly sourceId: string;
  readonly publisherId: string;
  readonly publisherTrustStatus: 'TRUSTED' | 'SUSPENDED' | 'REVOKED';
  readonly status: 'VALIDATED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  readonly allowedUriPrefixes: readonly string[];
  readonly sourceFormat: string;
  readonly signaturePolicy: 'DETACHED_ED25519' | 'DETACHED_RSA_SHA256';
  readonly trustedKeyReference: string;
  readonly hashAlgorithm: 'SHA-256';
  readonly licenseIdentity: string;
  readonly licenseVersion: string;
  readonly licenseState: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  readonly licenseAllowedUse: 'ACS_INTERNAL' | 'ACS_INTERNAL_AND_REDISTRIBUTION';
  readonly licenseActivationCompatible: boolean;
  readonly reviewDueAt: Date;
}

export interface XcfAcquiredArtifact {
  readonly bytes: Buffer;
  readonly mediaType: string;
  readonly finalUri: string;
  readonly retrievedAt: Date;
}

export interface XcfArtifactAcquisitionPort {
  acquire(uri: string): Promise<XcfAcquiredArtifact>;
}

export interface XcfTrustedKey {
  readonly reference: string;
  readonly publisherId: string;
  readonly algorithm: 'ED25519' | 'RSA-SHA256';
  readonly publicKeyPem: string;
  readonly status: 'TRUSTED' | 'REVOKED';
}

export interface XcfTrustedKeyResolver {
  resolve(reference: string): Promise<XcfTrustedKey | null>;
}

export interface XcfValidatedArtifact {
  readonly artifactBytes: Buffer;
  readonly artifactSha256: string;
  readonly mediaType: string;
  readonly retrievedAt: string;
  readonly signatureAlgorithm: 'ED25519' | 'RSA-SHA256';
  readonly trustedKeyReference: string;
  readonly signatureVerified: boolean;
  readonly objects: readonly XcfFrameworkObject[];
  readonly licenseIdentity: string | null;
  readonly licenseVersion: string | null;
  readonly quarantineReason?: XcfM1QuarantineReason;
}

export class FetchXcfArtifactAcquisition implements XcfArtifactAcquisitionPort {
  constructor(
    private readonly maximumBytes: number,
    private readonly timeoutMilliseconds = 5_000,
  ) {}

  async acquire(uri: string): Promise<XcfAcquiredArtifact> {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'https:') throw new XcfM1Failure('INVALID_CONTENT');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
    try {
      const response = await fetch(parsed, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { accept: `${JSON_MEDIA_TYPE}, application/gzip` },
      });
      if (!response.ok || response.body === null) throw new XcfM1Failure('SOURCE_UNAVAILABLE');
      const finalUri = response.url || parsed.href;
      if (finalUri !== parsed.href) throw new XcfM1Failure('SOURCE_UNAVAILABLE');
      const declaredLength = response.headers.get('content-length');
      if (declaredLength !== null && Number(declaredLength) > this.maximumBytes)
        throw new XcfM1Failure('CONTENT_TOO_LARGE');
      const chunks: Buffer[] = [];
      let received = 0;
      const reader: ReadableStreamDefaultReader<Uint8Array<ArrayBufferLike>> =
        response.body.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          received += result.value.byteLength;
          if (received > this.maximumBytes) throw new XcfM1Failure('CONTENT_TOO_LARGE');
          chunks.push(Buffer.from(result.value));
        }
      } catch (error) {
        if (error instanceof XcfM1Failure) throw error;
        throw new XcfM1Failure('PARTIAL_DOWNLOAD');
      }
      if (received === 0 || (declaredLength !== null && received !== Number(declaredLength)))
        throw new XcfM1Failure('PARTIAL_DOWNLOAD');
      return {
        bytes: Buffer.concat(chunks),
        mediaType: normalizeMediaType(response.headers.get('content-type')),
        finalUri,
        retrievedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof XcfM1Failure) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new XcfM1Failure('ACQUISITION_TIMEOUT');
      throw new XcfM1Failure('SOURCE_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}

export class ConfiguredXcfTrustedKeyResolver implements XcfTrustedKeyResolver {
  private readonly keys: ReadonlyMap<string, XcfTrustedKey>;

  constructor(keys: readonly XcfTrustedKey[]) {
    this.keys = new Map(keys.map((key) => [key.reference, key]));
  }

  resolve(reference: string) {
    return Promise.resolve(this.keys.get(reference) ?? null);
  }
}

export class XcfFrameworkArtifactValidator {
  constructor(
    private readonly keyResolver: XcfTrustedKeyResolver,
    private readonly maximumArtifactBytes: number,
  ) {}

  async validate(
    policy: XcfSourceIngestionPolicy,
    command: XcfFrameworkReleaseIngest,
    acquired: XcfAcquiredArtifact,
  ): Promise<XcfValidatedArtifact> {
    const artifactSha256 = sha256(acquired.bytes);
    const base = {
      artifactBytes: acquired.bytes,
      artifactSha256,
      mediaType: acquired.mediaType,
      retrievedAt: acquired.retrievedAt.toISOString(),
      signatureAlgorithm: command.signature_algorithm,
      trustedKeyReference: policy.trustedKeyReference,
      signatureVerified: false,
      objects: [] as readonly XcfFrameworkObject[],
      licenseIdentity: null,
      licenseVersion: null,
    };
    if (acquired.bytes.byteLength > this.maximumArtifactBytes)
      return { ...base, quarantineReason: 'DECOMPRESSION_LIMIT' };
    if (command.expected_sha256 !== undefined && command.expected_sha256 !== artifactSha256)
      return { ...base, quarantineReason: 'HASH_MISMATCH' };
    const key = await this.keyResolver.resolve(policy.trustedKeyReference);
    if (key === null) return { ...base, quarantineReason: 'TRUSTED_KEY_UNKNOWN' };
    if (key.status !== 'TRUSTED') return { ...base, quarantineReason: 'TRUSTED_KEY_UNTRUSTED' };
    if (key.publisherId !== policy.publisherId)
      return { ...base, quarantineReason: 'PUBLISHER_KEY_MISMATCH' };
    const expectedAlgorithm =
      policy.signaturePolicy === 'DETACHED_ED25519' ? 'ED25519' : 'RSA-SHA256';
    if (command.signature_algorithm !== expectedAlgorithm || key.algorithm !== expectedAlgorithm)
      return { ...base, quarantineReason: 'SIGNATURE_ALGORITHM_UNSUPPORTED' };
    const signature = decodeBase64(command.signature_base64);
    if (signature === null || !verifySignature(key, acquired.bytes, signature))
      return { ...base, quarantineReason: 'SIGNATURE_INVALID' };
    const verified = { ...base, signatureVerified: true };

    const decoded = decodeArtifact(acquired, this.maximumArtifactBytes);
    if ('reason' in decoded) return { ...verified, quarantineReason: decoded.reason };
    const parsed = parseArtifact(decoded.bytes);
    if ('reason' in parsed) return { ...verified, quarantineReason: parsed.reason };
    const artifact = parsed.artifact;
    if (
      artifact.publisher_id !== policy.publisherId ||
      artifact.source_id !== command.source_id ||
      artifact.release_version !== command.release_version
    )
      return { ...verified, quarantineReason: 'SCHEMA_INVALID' };
    if (
      artifact.license.identity !== policy.licenseIdentity ||
      artifact.license.version !== policy.licenseVersion ||
      policy.licenseState !== 'ACTIVE' ||
      !policy.licenseActivationCompatible
    )
      return {
        ...verified,
        licenseIdentity: artifact.license.identity,
        licenseVersion: artifact.license.version,
        quarantineReason: 'LICENSE_INVALID',
      };
    const identifiers = new Set<string>();
    const objects: XcfFrameworkObject[] = [];
    for (const object of artifact.objects) {
      if (identifiers.has(object.external_id))
        return { ...verified, quarantineReason: 'SCHEMA_INVALID' };
      identifiers.add(object.external_id);
      objects.push({
        external_id: object.external_id,
        object_type: object.object_type,
        canonical_payload_sha256: sha256(
          Buffer.from(JSON.stringify(canonicalValue(object.payload)), 'utf8'),
        ),
        ...(object.parent_external_id === undefined
          ? {}
          : { parent_external_id: object.parent_external_id }),
      });
    }
    return {
      ...verified,
      objects,
      licenseIdentity: artifact.license.identity,
      licenseVersion: artifact.license.version,
    };
  }
}

function normalizeMediaType(value: string | null) {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function decodeArtifact(
  acquired: XcfAcquiredArtifact,
  maximumArtifactBytes: number,
): { readonly bytes: Buffer } | { readonly reason: XcfM1QuarantineReason } {
  if (acquired.mediaType === JSON_MEDIA_TYPE) return { bytes: acquired.bytes };
  if (!GZIP_MEDIA_TYPES.has(acquired.mediaType)) return { reason: 'MEDIA_TYPE_UNSUPPORTED' };
  try {
    const bytes = gunzipSync(acquired.bytes, { maxOutputLength: maximumArtifactBytes });
    if (
      bytes.byteLength > maximumArtifactBytes ||
      bytes.byteLength > acquired.bytes.byteLength * MAXIMUM_EXPANSION_RATIO
    )
      return { reason: 'DECOMPRESSION_LIMIT' };
    return { bytes };
  } catch {
    return { reason: 'DECOMPRESSION_LIMIT' };
  }
}

function parseArtifact(
  bytes: Buffer,
):
  | { readonly artifact: ReturnType<typeof xcfFrameworkArtifactSchema.parse> }
  | { readonly reason: XcfM1QuarantineReason } {
  const text = bytes.toString('utf8');
  if (!isUtf8RoundTrip(text, bytes) || !isBoundedJsonDepth(text, MAXIMUM_JSON_DEPTH))
    return { reason: 'PARSER_INVALID' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { reason: 'PARSER_INVALID' };
  }
  const parsed = xcfFrameworkArtifactSchema.safeParse(value);
  if (!parsed.success || parsed.data.objects.length > MAXIMUM_OBJECTS)
    return { reason: 'SCHEMA_INVALID' };
  return { artifact: parsed.data };
}

function isUtf8RoundTrip(text: string, bytes: Buffer) {
  return Buffer.from(text, 'utf8').equals(bytes);
}

function isBoundedJsonDepth(text: string, maximumDepth: number) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maximumDepth) return false;
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return !quoted && depth === 0;
}

function decodeBase64(value: string) {
  const decoded = Buffer.from(value, 'base64');
  return decoded.length > 0 &&
    decoded.toString('base64').replace(/=+$/u, '') === value.replace(/=+$/u, '')
    ? decoded
    : null;
}

function verifySignature(key: XcfTrustedKey, bytes: Buffer, signature: Buffer) {
  try {
    const publicKey = createPublicKey(key.publicKeyPem);
    return key.algorithm === 'ED25519'
      ? verify(null, bytes, publicKey, signature)
      : verify('sha256', bytes, publicKey, signature);
  } catch {
    return false;
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined && child !== null)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  return value;
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
