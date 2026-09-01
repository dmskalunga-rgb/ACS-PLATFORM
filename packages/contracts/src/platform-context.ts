import { z } from 'zod';

export const platformContextSchema = z.object({
  data: z.object({
    user_id: z.uuid(),
    tenant: z.object({
      id: z.uuid(),
      slug: z.string().min(1),
      display_name: z.string().min(1),
    }),
    membership: z.object({ status: z.literal('ACTIVE') }),
    permissions: z.tuple([z.literal('platform.context.read')]),
  }),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
  }),
});

export type PlatformContextResponse = z.infer<typeof platformContextSchema>;

export const activeMembershipBootstrapSchema = z.object({
  data: z.object({
    memberships: z.array(
      z.object({
        membership_id: z.uuid(),
        status: z.literal('ACTIVE'),
        tenant: z.object({
          id: z.uuid(),
          slug: z.string().min(1),
          display_name: z.string().min(1),
        }),
      }),
    ),
  }),
  meta: z.object({
    request_id: z.uuid(),
    correlation_id: z.uuid(),
  }),
});

export type ActiveMembershipBootstrapResponse = z.infer<typeof activeMembershipBootstrapSchema>;
