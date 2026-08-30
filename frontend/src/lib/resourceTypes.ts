import type { ResourceType } from "@/hooks/useResources";

// The 7 real values (verified against the resource_type_enum in
// backend/src/db/migrations/001_init.sql, the Zod validator, and the
// generated OpenAPI schema — NOT the 5-value list from earlier project
// docs, which omitted architecture and pdf). Single source of truth,
// previously hardcoded independently and identically in ResourceEditorSheet.tsx
// and ResourceFilterBar.tsx.
export const RESOURCE_TYPES: ResourceType[] = [
  "runbook",
  "sop",
  "architecture",
  "troubleshooting",
  "faq",
  "link",
  "pdf",
];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  runbook: "Runbook",
  sop: "SOP",
  architecture: "Architecture",
  troubleshooting: "Troubleshooting",
  faq: "FAQ",
  link: "Link",
  pdf: "PDF",
};

// Server-enforced (assertTypeRequirements in resources.service.ts,
// mirrored in createResourceSchema's superRefine): these 4 types require
// non-empty content; `link` requires an https external_url. architecture
// and pdf have no type-specific requirement beyond "some content field".
const CONTENT_REQUIRED_TYPES = new Set<ResourceType>([
  "runbook",
  "sop",
  "troubleshooting",
  "faq",
]);

const HTTPS_URL_PATTERN = /^https:\/\/.+/;

export interface ResourceContentFieldErrors {
  content?: string;
  external_url?: string;
}

/**
 * Client-side mirror of the backend's type-conditional content validation,
 * so create-mode can show a field error before hitting the network instead
 * of only after a 400. Shared (not duplicated) so Part 24d's new-version
 * work — which needs the identical rule set — can call this directly
 * instead of re-deriving it.
 */
export function validateResourceContentFields(
  type: ResourceType,
  content: string,
  externalUrl: string
): ResourceContentFieldErrors {
  const errors: ResourceContentFieldErrors = {};

  if (CONTENT_REQUIRED_TYPES.has(type) && !content.trim()) {
    errors.content = `Content is required for type "${RESOURCE_TYPE_LABELS[type]}".`;
  }

  if (type === "link") {
    if (!externalUrl.trim()) {
      errors.external_url = 'External URL is required for type "Link".';
    } else if (!HTTPS_URL_PATTERN.test(externalUrl.trim())) {
      errors.external_url = "External URL must be a valid https:// URL.";
    }
  }

  return errors;
}
