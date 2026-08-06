import { z } from "zod";

const resourceTypeEnum = z.enum([
  "runbook",
  "sop",
  "architecture",
  "troubleshooting",
  "faq",
  "link",
  "pdf",
]);

export const createResourceSchema = z.object({
  project_id: z.string().uuid().optional(),
  type: resourceTypeEnum,
  title: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.unknown()).optional(),
  content: z.string().optional(),
  external_url: z.string().optional(),
  file_path: z.string().optional(),
  commit_message: z.string().optional(),
});

export const updateResourceSchema = z.object({
  type: resourceTypeEnum.optional(),
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  tags: z.array(z.unknown()).optional(),
});

export const createResourceVersionSchema = z.object({
  content: z.string().optional(),
  external_url: z.string().optional(),
  file_path: z.string().optional(),
  commit_message: z.string().optional(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type CreateResourceVersionInput = z.infer<
  typeof createResourceVersionSchema
>;
