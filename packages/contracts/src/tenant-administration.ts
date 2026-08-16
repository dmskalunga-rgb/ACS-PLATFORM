import { z } from 'zod';

export const membershipStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const tenantRoleSchema = z.object({
  id: z.uuid(),
  role_key: z.string().min(1),
  display_name: z.string().min(1),
  status: membershipStatusSchema,
  permissions: z.array(z.string().min(1)),
});
export const tenantMembershipSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: membershipStatusSchema,
  version: z.number().int().positive(),
  roles: z.array(
    tenantRoleSchema.pick({ id: true, role_key: true, display_name: true, status: true }),
  ),
});
export const tenantAdministrationSchema = z.object({
  data: z.object({
    memberships: z.array(tenantMembershipSchema),
    roles: z.array(tenantRoleSchema),
  }),
  meta: z.object({ request_id: z.uuid(), correlation_id: z.uuid() }),
});
export const membershipStatusMutationSchema = z.object({
  status: membershipStatusSchema,
  expected_version: z.number().int().positive(),
});
export const roleMutationSchema = z.object({ expected_version: z.number().int().positive() });
export const administrationMutationResultSchema = z.object({
  data: z.object({
    membership_id: z.uuid(),
    status: membershipStatusSchema,
    version: z.number().int().positive(),
    changed: z.boolean(),
  }),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
    idempotent_replay: z.boolean(),
  }),
});
export type TenantAdministration = z.infer<typeof tenantAdministrationSchema>;
export type AdministrationMutationResult = z.infer<typeof administrationMutationResultSchema>;
