import { z } from "zod";

const SERVICE_TYPES = [
  "application",
  "database",
  "proxy",
  "monitoring",
  "repository",
  "metrics",
  "jump_host",
  "other",
] as const;

const ACCESS_METHODS = ["ssh", "rdp", "telnet", "web", "other"] as const;

// No whitespace or control characters. Deliberately not an IP/domain regex —
// access_host can be a hostname, IP, or anything else the network resolves.
const accessHostSchema = z
  .string()
  .min(1)
  .refine((value) => !/[\s\x00-\x1F\x7F]/.test(value), {
    message: "access_host must not contain whitespace or control characters",
  });

const accessPathSchema = z
  .string()
  .refine((value) => value.startsWith("/"), {
    message: "access_path must start with /",
  });

export const createServerSchema = z.object({
  environment_id: z.string().uuid(),
  display_name: z.string().min(1),
  hostname: z.string().min(1),
  ip_address: z.string().optional(),
  service_type: z.enum(SERVICE_TYPES),
  access_method: z.enum(ACCESS_METHODS),
  access_host: accessHostSchema,
  access_port: z.number().int().min(1).max(65535).optional(),
  access_path: accessPathSchema.optional(),
  tech_stack: z.array(z.string()).optional().default([]),
  monitoring_url: z.string().url().optional(),
  notes: z.string().optional(),
});

// environment_id is intentionally omitted: servers don't move between
// environments. The controller rejects any request body that includes
// `environment_id` before this schema even runs (same pattern as prior modules).
export const updateServerSchema = z.object({
  display_name: z.string().min(1).optional(),
  hostname: z.string().min(1).optional(),
  ip_address: z.string().optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  access_method: z.enum(ACCESS_METHODS).optional(),
  access_host: accessHostSchema.optional(),
  access_port: z.number().int().min(1).max(65535).optional(),
  access_path: accessPathSchema.optional(),
  tech_stack: z.array(z.string()).optional(),
  monitoring_url: z.string().url().optional(),
  notes: z.string().optional(),
  updated_at: z.string().min(1),
});

export const listServersQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["display_name", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  search: z.string().optional(),
  environment_id: z.string().uuid().optional(),
  service_type: z.enum(SERVICE_TYPES).optional(),
  access_method: z.enum(ACCESS_METHODS).optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
export type ListServersQuery = z.infer<typeof listServersQuerySchema>;
