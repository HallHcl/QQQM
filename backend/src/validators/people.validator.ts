import { z } from "zod";

const PEOPLE_TYPES = [
  "internal_engineer",
  "vendor",
  "client_contact",
  "project_owner",
  "approver",
] as const;

export const createPersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  type: z.enum(PEOPLE_TYPES),
  notes: z.string().optional(),
});

export const updatePersonSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  type: z.enum(PEOPLE_TYPES).optional(),
  notes: z.string().optional(),
  updated_at: z.string().min(1),
});

export const listPeopleQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["name", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  search: z.string().optional(),
  type: z.enum(PEOPLE_TYPES).optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export const linkClientSchema = z.object({
  client_id: z.string().uuid(),
  relationship_type: z.string().optional(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type ListPeopleQuery = z.infer<typeof listPeopleQuerySchema>;
export type LinkClientInput = z.infer<typeof linkClientSchema>;
