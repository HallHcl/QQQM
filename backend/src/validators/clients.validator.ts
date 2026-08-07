import { z } from "zod";

export const createClientSchema = z.object({
  name: z.string().min(1),
  status: z.string().optional(),
  description: z.string().optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  updated_at: z.string().min(1),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
