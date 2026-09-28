import { errorEnvelopeSchema } from '@acs/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  HumanGenesisAuthorizationFailure,
  type HumanGenesisService,
} from './human-governance-genesis.js';
import {
  PrincipalClassificationFailure,
  type PrincipalClassificationService,
} from './principal-classification.js';

const uuid = z.uuid();
const candidate = z
  .object({
    principal_id: uuid,
    person_id: uuid,
    evidence_reference: uuid,
  })
  .strict();
const genesisBody = z
  .object({
    manifest: z
      .object({
        genesis_id: uuid,
        manifest_version: z.literal('1.0.0'),
        purpose: z.literal('HUMAN_PRINCIPAL_GENESIS_AUTHORIZATION'),
        tenant_id: uuid,
        candidates: z.tuple([candidate, candidate, candidate]),
        authorized_executor_identity: uuid,
        trust_root_id: z.string().regex(/^ACS-HGR-[0-9]{3,}$/),
        issued_at: z.iso.datetime({ offset: true }),
        not_before: z.iso.datetime({ offset: true }),
        expires_at: z.iso.datetime({ offset: true }),
        nonce: uuid,
        manifest_hash: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    signature: z.string().min(1).max(2048),
  })
  .strict();
const classificationBody = z
  .object({
    principal_type: z.enum(['SERVICE', 'MACHINE', 'AUTOMATION', 'AI_AGENT', 'UNKNOWN']),
    status: z.enum(['VERIFIED', 'SUSPENDED', 'REVOKED']),
    policy_version: z.string().min(1).max(80),
    evidence_id: uuid,
    expected_version: z.number().int().nonnegative(),
  })
  .strict();
const humanRequestBody = z
  .object({
    evidence_id: uuid,
    policy_version: z.string().min(1).max(80),
    expected_version: z.number().int().nonnegative(),
  })
  .strict();
const humanLifecycleBody = z
  .object({
    transition: z.enum(['SUSPEND', 'REACTIVATE', 'REVOKE']),
    reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
    evidence_id: uuid,
    expected_version: z.number().int().positive(),
    idempotency_key: uuid,
  })
  .strict();

export function registerHumanPrincipalRoutes(
  app: FastifyInstance,
  genesis: HumanGenesisService | undefined,
  classification: PrincipalClassificationService | undefined,
): void {
  const failure = (request: FastifyRequest, reply: FastifyReply, status: number, code: string) =>
    reply.status(status).send(
      errorEnvelopeSchema.parse({
        error: {
          code,
          message: 'Human principal operation is unavailable.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const metadata = (request: FastifyRequest) => ({
    requestId: request.id,
    correlationId: request.correlationId,
  });
  const tenant = (request: FastifyRequest) => uuid.safeParse(request.headers['x-acs-tenant-id']);
  const parameter = (request: FastifyRequest, key: string) =>
    uuid.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>)[key]
        : undefined,
    );
  const handle = (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HumanGenesisAuthorizationFailure)
      return failure(request, reply, 403, 'HUMAN_GENESIS_DENIED');
    if (error instanceof PrincipalClassificationFailure)
      return failure(
        request,
        reply,
        error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : 409,
        error.code,
      );
    throw error;
  };
  app.post('/api/v1/platform/human-genesis', async (request, reply) => {
    if (!genesis) return failure(request, reply, 503, 'HUMAN_PRINCIPAL_NOT_CONFIGURED');
    const body = genesisBody.safeParse(request.body);
    if (!body.success) return failure(request, reply, 400, 'INVALID_REQUEST');
    try {
      await genesis.execute(
        request.headers.authorization,
        body.data.manifest,
        body.data.signature,
        metadata(request),
      );
      return {
        data: { genesis_id: body.data.manifest.genesis_id, status: 'COMPLETED' },
        meta: { request_id: request.id, correlation_id: request.correlationId },
      };
    } catch (error) {
      return handle(error, request, reply);
    }
  });
  app.post('/api/v1/platform/principals/:targetUserId/classifications', async (request, reply) => {
    if (!classification) return failure(request, reply, 503, 'HUMAN_PRINCIPAL_NOT_CONFIGURED');
    const selected = tenant(request),
      target = parameter(request, 'targetUserId');
    const body = classificationBody.safeParse(request.body);
    if (!selected.success || !target.success || !body.success)
      return failure(request, reply, 400, 'INVALID_REQUEST');
    try {
      return {
        data: await classification.set(
          request.headers.authorization,
          selected.data,
          {
            targetUserId: target.data,
            principalType: body.data.principal_type,
            status: body.data.status,
            policyVersion: body.data.policy_version,
            evidenceId: body.data.evidence_id,
            expectedVersion: body.data.expected_version,
          },
          metadata(request),
        ),
      };
    } catch (error) {
      return handle(error, request, reply);
    }
  });
  app.post('/api/v1/platform/principals/:targetUserId/human-requests', async (request, reply) => {
    if (!classification) return failure(request, reply, 503, 'HUMAN_PRINCIPAL_NOT_CONFIGURED');
    const selected = tenant(request),
      target = parameter(request, 'targetUserId');
    const body = humanRequestBody.safeParse(request.body);
    if (!selected.success || !target.success || !body.success)
      return failure(request, reply, 400, 'INVALID_REQUEST');
    try {
      return {
        data: await classification.requestHuman(
          request.headers.authorization,
          selected.data,
          {
            targetUserId: target.data,
            evidenceId: body.data.evidence_id,
            policyVersion: body.data.policy_version,
            expectedVersion: body.data.expected_version,
          },
          metadata(request),
        ),
      };
    } catch (error) {
      return handle(error, request, reply);
    }
  });
  app.post('/api/v1/platform/principals/:targetUserId/human-lifecycle', async (request, reply) => {
    if (!classification) return failure(request, reply, 503, 'HUMAN_PRINCIPAL_NOT_CONFIGURED');
    const selected = tenant(request),
      target = parameter(request, 'targetUserId');
    const body = humanLifecycleBody.safeParse(request.body);
    if (!selected.success || !target.success || !body.success)
      return failure(request, reply, 400, 'INVALID_REQUEST');
    try {
      return {
        data: await classification.transitionHuman(
          request.headers.authorization,
          selected.data,
          {
            targetUserId: target.data,
            transition: body.data.transition,
            reasonCode: body.data.reason_code,
            evidenceId: body.data.evidence_id,
            expectedVersion: body.data.expected_version,
            idempotencyKey: body.data.idempotency_key,
          },
          metadata(request),
        ),
      };
    } catch (error) {
      return handle(error, request, reply);
    }
  });
  app.post(
    '/api/v1/platform/human-classification-requests/:requestId/verify',
    async (request, reply) => {
      if (!classification) return failure(request, reply, 503, 'HUMAN_PRINCIPAL_NOT_CONFIGURED');
      const selected = tenant(request),
        id = parameter(request, 'requestId');
      if (!selected.success || !id.success) return failure(request, reply, 400, 'INVALID_REQUEST');
      try {
        return {
          data: await classification.verifyHuman(
            request.headers.authorization,
            selected.data,
            id.data,
            metadata(request),
          ),
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );
}
