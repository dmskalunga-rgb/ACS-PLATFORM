import { errorEnvelopeSchema } from '@acs/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  MachineAuthenticationFailure,
  type MachineAuthenticationService,
} from './machine-service-auth.js';

const identifier = z.uuid();
const provisionBody = z
  .object({
    principal_type: z.enum(['MACHINE', 'SERVICE', 'AUTOMATION']),
    external_binding: z.string().min(1).max(200),
  })
  .strict();
const revokeBody = z.object({ credential_id: identifier }).strict();
const rotateBody = z.object({ current_credential_id: identifier }).strict();
const permissionBody = z
  .object({ permission_key: z.string().min(1).max(200), grant: z.boolean() })
  .strict();

/** Credential material is accepted only through the machine-auth headers and is never logged. */
export function registerMachineServiceAuthRoutes(
  app: FastifyInstance,
  service: MachineAuthenticationService | undefined,
): void {
  const failure = (code: string, status: number, request: FastifyRequest, reply: FastifyReply) =>
    reply.status(status).send(
      errorEnvelopeSchema.parse({
        error: {
          code,
          message: 'Machine service operation is unavailable.',
          request_id: request.id,
          correlation_id: request.correlationId,
        },
      }),
    );
  const unavailable = (request: FastifyRequest, reply: FastifyReply) =>
    failure('MACHINE_AUTH_NOT_CONFIGURED', 503, request, reply);
  const handle = (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (!(error instanceof MachineAuthenticationFailure)) throw error;
    return failure(
      error.code,
      error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : 400,
      request,
      reply,
    );
  };
  const tenant = (request: FastifyRequest) =>
    identifier.safeParse(request.headers['x-acs-tenant-id']);
  const principal = (request: FastifyRequest) =>
    identifier.safeParse(
      typeof request.params === 'object' && request.params !== null
        ? (request.params as Record<string, unknown>).principalId
        : undefined,
    );
  const meta = (request: FastifyRequest) => ({
    requestId: request.id,
    correlationId: request.correlationId,
  });

  app.post(
    '/api/v1/platform/machine-identities',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const selected = tenant(request),
        body = provisionBody.safeParse(request.body);
      if (!selected.success || !body.success)
        return failure('INVALID_REQUEST', 400, request, reply);
      try {
        const result = await service.provision(
          request.headers.authorization,
          selected.data,
          body.data.principal_type,
          body.data.external_binding,
          meta(request),
        );
        return {
          data: {
            principal_id: result.principalId,
            credential_id: result.credential.credentialId,
            credential: result.credential.credential,
            expires_at: result.credential.expiresAt,
          },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v1/platform/machine-identities/:principalId/rotate-credential',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const selected = tenant(request),
        id = principal(request),
        body = rotateBody.safeParse(request.body);
      if (!selected.success || !id.success || !body.success)
        return failure('INVALID_REQUEST', 400, request, reply);
      try {
        const issued = await service.rotate(
          request.headers.authorization,
          selected.data,
          id.data,
          body.data.current_credential_id,
          meta(request),
        );
        return {
          data: {
            credential_id: issued.credentialId,
            credential: issued.credential,
            expires_at: issued.expiresAt,
          },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v1/platform/machine-identities/:principalId/revoke-credential',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const selected = tenant(request),
        id = principal(request),
        body = revokeBody.safeParse(request.body);
      if (!selected.success || !id.success || !body.success)
        return failure('INVALID_REQUEST', 400, request, reply);
      try {
        await service.revoke(
          request.headers.authorization,
          selected.data,
          id.data,
          body.data.credential_id,
          meta(request),
        );
        return {
          data: { revoked: true },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v1/platform/machine-identities/:principalId/disable',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const selected = tenant(request),
        id = principal(request);
      if (!selected.success || !id.success) return failure('INVALID_REQUEST', 400, request, reply);
      try {
        await service.disable(request.headers.authorization, selected.data, id.data, meta(request));
        return {
          data: { disabled: true },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );

  app.post(
    '/api/v1/platform/machine-identities/:principalId/permissions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const selected = tenant(request),
        id = principal(request),
        body = permissionBody.safeParse(request.body);
      if (!selected.success || !id.success || !body.success)
        return failure('INVALID_REQUEST', 400, request, reply);
      try {
        await service.setPermission(
          request.headers.authorization,
          selected.data,
          id.data,
          body.data.permission_key,
          body.data.grant,
          meta(request),
        );
        return {
          data: { updated: true },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );

  app.get(
    '/api/v1/platform/machine-identities/self',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!service) return unavailable(request, reply);
      const id = request.headers['x-acs-machine-credential-id'];
      const secret = request.headers['x-acs-machine-credential'];
      try {
        const identity = await service.authenticate(
          typeof id === 'string' ? id : undefined,
          typeof secret === 'string' ? secret : undefined,
        );
        return {
          data: {
            principal_id: identity.principalId,
            principal_type: identity.principalType,
            tenant_id: identity.tenantId,
            authentication_method: identity.authenticationMethod,
          },
          meta: { request_id: request.id, correlation_id: request.correlationId },
        };
      } catch (error) {
        return handle(error, request, reply);
      }
    },
  );
}
