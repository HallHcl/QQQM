import { z } from "zod";

export const createEnvironmentSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

// project_id is intentionally omitted: environments don't move between
// projects. The controller rejects any request body that includes
// `project_id` before this schema even runs (same pattern as Projects
// rejecting `client_id` re-parenting).
export const updateEnvironmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  vpn_resource_id: z.string().uuid().nullable().optional(),
  updated_at: z.string().min(1),
});

export const listEnvironmentsQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["name", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  project_id: z.string().uuid().optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
export type ListEnvironmentsQuery = z.infer<typeof listEnvironmentsQuerySchema>;
