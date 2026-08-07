import { z } from "zod";

const ENTITY_TYPES = [
  "client",
  "project",
  "environment",
  "server",
  "credential_reference",
  "people",
  "resource",
  "resource_version",
  "schedule",
  "user",
] as const;

const ACTIONS = ["create", "update", "delete", "restore"] as const;

export const listActivityLogsQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["created_at"]),
  order: z.enum(["asc", "desc"]),
  entity_type: z.enum(ENTITY_TYPES).optional(),
  entity_id: z.string().uuid().optional(),
  action: z.enum(ACTIONS).optional(),
  changed_by: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ListActivityLogsQuery = z.infer<typeof listActivityLogsQuerySchema>;
