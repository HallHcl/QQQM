import { z } from "zod";

const peopleTypeEnum = z.enum([
  "internal_engineer",
  "vendor",
  "client_contact",
  "project_owner",
  "approver",
]);

export const createPersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  type: peopleTypeEnum,
  notes: z.string().optional(),
});

export const updatePersonSchema = createPersonSchema.partial();

export const addPeopleClientSchema = z.object({
  client_id: z.string().uuid(),
  relationship_type: z.string().optional(),
});

export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type AddPeopleClientInput = z.infer<typeof addPeopleClientSchema>;
