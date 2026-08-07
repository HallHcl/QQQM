import { z } from "zod";

const RESOURCE_TYPES = [
  "runbook",
  "sop",
  "architecture",
  "troubleshooting",
  "faq",
  "link",
  "pdf",
] as const;

const CONTENT_REQUIRED_TYPES = new Set(["runbook", "sop", "troubleshooting", "faq"]);

export const createResourceSchema = z
  .object({
    project_id: z.string().uuid().optional(),
    type: z.enum(RESOURCE_TYPES),
    title: z.string().min(1),
    category: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    content: z.string().optional(),
    external_url: z.string().optional(),
    commit_message: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (CONTENT_REQUIRED_TYPES.has(data.type) && !data.content) {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: `content is required for type "${data.type}"`,
      });
    }
    if (data.type === "link") {
      if (!data.external_url) {
        ctx.addIssue({
          code: "custom",
          path: ["external_url"],
          message: 'external_url is required for type "link"',
        });
      } else if (!/^https:\/\/.+/.test(data.external_url)) {
        ctx.addIssue({
          code: "custom",
          path: ["external_url"],
          message: "external_url must be a valid https URL",
        });
      }
    }
  });

// content/external_url/file_path/type are intentionally omitted: metadata
// updates never touch versioned content or the resource's type. Content
// changes only go through POST /:id/versions. The controller rejects any
// request body that includes those fields before this schema even runs.
export const updateMetadataSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  updated_at: z.string().min(1),
});

export const createResourceVersionSchema = z
  .object({
    content: z.string().optional(),
    external_url: z.string().optional(),
    commit_message: z.string().optional(),
  })
  .refine((data) => Boolean(data.content) || Boolean(data.external_url), {
    message: "At least one of content or external_url must be present",
    path: ["content"],
  });

export const listResourcesQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["title", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  search: z.string().optional(),
  project_id: z.string().uuid().optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateMetadataInput = z.infer<typeof updateMetadataSchema>;
export type CreateResourceVersionInput = z.infer<typeof createResourceVersionSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
