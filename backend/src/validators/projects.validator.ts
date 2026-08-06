import { z } from "zod";

export const createProjectSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  owner_status: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
