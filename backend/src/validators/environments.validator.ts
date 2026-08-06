import { z } from "zod";

export const createEnvironmentSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateEnvironmentSchema = createEnvironmentSchema.partial();

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
