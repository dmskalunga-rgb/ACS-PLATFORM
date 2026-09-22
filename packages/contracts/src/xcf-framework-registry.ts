import { z } from 'zod';

const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);
const httpsUrl = z
  .url()
  .max(512)
  .refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required.');
export const xcfSha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
export const xcfSignatureAlgorithmSchema = z.enum(['ED25519', 'RSA-SHA256']);
export const xcfLicenseStateSchema = z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']);
export const xcfLicenseAllowedUseSchema = z.enum([
  'ACS_INTERNAL',
  'ACS_INTERNAL_AND_REDISTRIBUTION',
]);
export const xcfFrameworkSourceStatusSchema = z.enum([
  'VALIDATED',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED',
]);
export const xcfFrameworkReleaseStatusSchema = z.enum([
  'INGESTED',
  'APPROVED',
  'ACTIVE',
  'SUPERSEDED',
  'REVOKED',
  'QUARANTINED',
  'REJECTED',
]);

export const xcfPublisherCreateSchema = z.object({
  legal_name: bounded(200),
  publisher_key: bounded(100).regex(/^[a-z][a-z0-9_.-]+$/u),
  trust_status: z.enum(['TRUSTED', 'SUSPENDED', 'REVOKED']),
});

export const xcfFrameworkSourceCreateSchema = z.object({
  publisher_id: z.uuid(),
  framework_key: bounded(100).regex(/^[a-z][a-z0-9_.-]+$/u),
  framework_name: bounded(200),
  canonical_uri: httpsUrl,
  allowed_uri_prefixes: z.array(httpsUrl).min(1).max(16),
  source_format: bounded(64),
  authentication_method: bounded(64),
  signature_policy: z.enum(['DETACHED_ED25519', 'DETACHED_RSA_SHA256']),
  trusted_key_reference: bounded(256),
  hash_algorithm: z.literal('SHA-256'),
  license: bounded(128),
  license_version: bounded(64),
  license_state: xcfLicenseStateSchema,
  license_allowed_use: xcfLicenseAllowedUseSchema,
  license_activation_compatible: z.boolean(),
  redistribution_constraints: bounded(512),
  review_due_at: z.iso.datetime({ offset: true }),
});

export const xcfFrameworkObjectSchema = z.object({
  external_id: bounded(256),
  object_type: bounded(64),
  canonical_payload_sha256: xcfSha256Schema,
  parent_external_id: bounded(256).nullable().optional(),
});

export const xcfFrameworkArtifactObjectSchema = z.object({
  external_id: bounded(256),
  object_type: bounded(64),
  payload: z.record(z.string(), z.unknown()),
  parent_external_id: bounded(256).nullable().optional(),
});

export const xcfFrameworkArtifactSchema = z.object({
  schema_version: z.literal('1.0'),
  publisher_id: z.uuid(),
  source_id: z.uuid(),
  release_version: bounded(128),
  license: z.object({
    identity: bounded(128),
    version: bounded(64),
  }),
  objects: z.array(xcfFrameworkArtifactObjectSchema).max(20_000),
});

export const xcfFrameworkReleaseIngestSchema = z.object({
  source_id: z.uuid(),
  release_version: bounded(128),
  released_at: z.iso.datetime({ offset: true }),
  artifact_uri: httpsUrl,
  expected_sha256: xcfSha256Schema.optional(),
  signature_algorithm: xcfSignatureAlgorithmSchema,
  signature_base64: bounded(16_384),
  validation_policy_version: bounded(64),
  evidence_reference: bounded(256).nullable().optional(),
});

export const xcfExpectedVersionSchema = z.object({
  expected_version: z.number().int().positive(),
  reason_reference: bounded(256),
});

export const xcfProtectedTransitionSchema = xcfExpectedVersionSchema.extend({
  authorization_id: z.uuid(),
  authorization_expected_version: z.number().int().positive(),
  attestation_reference: bounded(256),
});

export const xcfPublisherSchema = z.object({
  publisher_id: z.uuid(),
  publisher_key: z.string(),
  legal_name: z.string(),
  trust_status: z.enum(['TRUSTED', 'SUSPENDED', 'REVOKED']),
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const xcfFrameworkSourceSchema = z.object({
  source_id: z.uuid(),
  publisher_id: z.uuid(),
  framework_id: z.uuid(),
  framework_key: z.string(),
  framework_name: z.string(),
  canonical_uri: z.string(),
  status: xcfFrameworkSourceStatusSchema,
  version: z.number().int().positive(),
  created_at: z.iso.datetime(),
});

export const xcfFrameworkReleaseSchema = z.object({
  release_id: z.uuid(),
  source_id: z.uuid(),
  framework_id: z.uuid(),
  release_version: z.string(),
  artifact_sha256: xcfSha256Schema,
  status: xcfFrameworkReleaseStatusSchema,
  version: z.number().int().positive(),
  object_count: z.number().int().nonnegative(),
  created_at: z.iso.datetime(),
});

export const xcfMutationEnvelopeSchema = z.object({
  data: z.union([xcfPublisherSchema, xcfFrameworkSourceSchema, xcfFrameworkReleaseSchema]),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean(),
  }),
});

export type XcfPublisherCreate = z.infer<typeof xcfPublisherCreateSchema>;
export type XcfFrameworkSourceCreate = z.infer<typeof xcfFrameworkSourceCreateSchema>;
export type XcfFrameworkReleaseIngest = z.infer<typeof xcfFrameworkReleaseIngestSchema>;
export type XcfFrameworkArtifact = z.infer<typeof xcfFrameworkArtifactSchema>;
export type XcfFrameworkObject = z.infer<typeof xcfFrameworkObjectSchema>;
export type XcfExpectedVersion = z.infer<typeof xcfExpectedVersionSchema>;
export type XcfProtectedTransition = z.infer<typeof xcfProtectedTransitionSchema>;
export type XcfPublisher = z.infer<typeof xcfPublisherSchema>;
export type XcfFrameworkSource = z.infer<typeof xcfFrameworkSourceSchema>;
export type XcfFrameworkRelease = z.infer<typeof xcfFrameworkReleaseSchema>;
