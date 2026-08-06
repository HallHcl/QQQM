import { z } from "zod";

export const createServerSchema = z.object({
  environment_id: z.string().uuid(),
  hostname: z.string().min(1),
  ip_address: z.string().optional(),
  tech_stack: z.array(z.unknown()).optional(),
  monitoring_url: z.string().optional(),
  notes: z.string().optional(),
});

export const updateServerSchema = createServerSchema.partial();

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
