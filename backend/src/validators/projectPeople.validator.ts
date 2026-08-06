import { z } from "zod";

export const addProjectPersonSchema = z.object({
  people_id: z.string().uuid(),
  role_in_project: z.string().min(1),
});

export type AddProjectPersonInput = z.infer<typeof addProjectPersonSchema>;
