import { z } from "zod";

export const createProjectSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  owner_status: z.string().optional().default("active"),
});

// client_id is intentionally omitted: re-parenting a project to a different
// client is not supported via PATCH. The controller rejects any request body
// that includes `client_id` before this schema even runs.
export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  owner_status: z.string().optional(),
  updated_at: z.string().min(1),
});

export const listProjectsQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["name", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  search: z.string().optional(),
  client_id: z.string().uuid().optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
