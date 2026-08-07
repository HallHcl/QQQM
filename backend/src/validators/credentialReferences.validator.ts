import { z } from "zod";

const ACCESS_METHODS = ["ssh", "rdp", "telnet", "web", "other"] as const;

export const createCredentialReferenceSchema = z.object({
  server_id: z.string().uuid(),
  label: z.string().min(1),
  reference_location: z.string().min(1),
  applies_to_access_method: z.enum(ACCESS_METHODS).optional(),
  notes: z.string().optional(),
});

export const updateCredentialReferenceSchema = z.object({
  label: z.string().min(1).optional(),
  reference_location: z.string().min(1).optional(),
  applies_to_access_method: z.enum(ACCESS_METHODS).optional(),
  notes: z.string().optional(),
});

export type CreateCredentialReferenceInput = z.infer<
  typeof createCredentialReferenceSchema
>;
export type UpdateCredentialReferenceInput = z.infer<
  typeof updateCredentialReferenceSchema
>;
