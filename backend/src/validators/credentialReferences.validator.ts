import { z } from "zod";

export const createCredentialReferenceSchema = z.object({
  server_id: z.string().uuid(),
  label: z.string().min(1),
  reference_location: z.string().min(1),
  notes: z.string().optional(),
});

export const updateCredentialReferenceSchema =
  createCredentialReferenceSchema.partial();

export type CreateCredentialReferenceInput = z.infer<
  typeof createCredentialReferenceSchema
>;
export type UpdateCredentialReferenceInput = z.infer<
  typeof updateCredentialReferenceSchema
>;
