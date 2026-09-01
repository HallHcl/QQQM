import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Shared / cross-cutting components (Step 2)
// ---------------------------------------------------------------------------

export const PaginationSchema = z
  .object({
    page: z.number().int(),
    per_page: z.number().int(),
    total: z.number().int(),
    total_pages: z.number().int(),
  })
  .openapi("Pagination");

// Discrepancy from the design vocabulary, confirmed by grepping the actual
// codebase: only VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, and CONFLICT are
// ever actually set as `code`. 404s and 500s never set a `code` at all (the
// field is simply absent from the JSON response) — NOT_FOUND and
// INTERNAL_ERROR are documented here for completeness/forward-compatibility
// but are not emitted anywhere in the current implementation.
export const ErrorCodeSchema = z
  .enum([
    "VALIDATION_ERROR",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INTERNAL_ERROR",
  ])
  .openapi("ErrorCode");

export const ValidationErrorDetailSchema = z
  .object({
    field: z.string(),
    message: z.string(),
  })
  .openapi("ValidationErrorDetail");

// Arbitrary JSON-object-or-null (activity_logs.old_value/new_value snapshots,
// ApiError.details). `.nullable()` produces the `nullable: true` flag; the
// `.openapi({type, additionalProperties})` override supplies the sibling
// `type` OAS 3.0 requires whenever `nullable` is present (plain `z.unknown()`
// renders as `nullable: true` with no `type` at all, which is invalid).
const JsonObjectOrNullSchema = z
  .unknown()
  .nullable()
  .openapi({ type: "object", additionalProperties: true });

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema.optional(),
      message: z.string(),
      details: JsonObjectOrNullSchema.optional(),
    }),
  })
  .openapi("ErrorResponse");

function paginated<T extends z.ZodTypeAny>(name: string, item: T) {
  return z
    .object({
      data: z.array(item),
      pagination: PaginationSchema,
    })
    .openapi(name);
}

// ---------------------------------------------------------------------------
// Enums (mirrors the DB enum types / zod enums used across validators)
// ---------------------------------------------------------------------------

export const PeopleTypeSchema = z
  .enum(["internal_engineer", "vendor", "client_contact", "project_owner", "approver"])
  .openapi("PeopleType");

export const ResourceTypeSchema = z
  .enum(["runbook", "sop", "architecture", "troubleshooting", "faq", "link", "pdf"])
  .openapi("ResourceType");

export const ServiceTypeSchema = z
  .enum(["application", "database", "proxy", "monitoring", "repository", "metrics", "jump_host", "other"])
  .openapi("ServiceType");

export const AccessMethodSchema = z
  .enum(["ssh", "rdp", "telnet", "web", "other"])
  .openapi("AccessMethod");

export const ScheduleTypeSchema = z.enum(["PM", "MA", "other"]).openapi("ScheduleType");

export const ScheduleStatusSchema = z
  .enum(["pending", "in_progress", "done", "cancelled"])
  .openapi("ScheduleStatus");

export const EntityTypeSchema = z
  .enum([
    "client",
    "project",
    "environment",
    "server",
    "credential_reference",
    "people",
    "resource",
    "resource_version",
    "schedule",
    "user",
  ])
  .openapi("EntityType");

export const ActivityActionSchema = z
  .enum(["create", "update", "delete", "restore"])
  .openapi("ActivityAction");

// ---------------------------------------------------------------------------
// Core entity schemas (Step 2) — mirror actual DB columns / response shapes
// exactly as implemented (cross-checked against types/index.ts and each
// module's service response construction, not assumptions).
// ---------------------------------------------------------------------------

export const RoleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Role");

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email(),
    peopleId: z.string().uuid().nullable(),
    roles: z.array(z.string()),
  })
  .openapi("User");

export const ClientSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Client");

const ClientRefSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const ProjectSchema = z
  .object({
    id: z.string().uuid(),
    client_id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    owner_status: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Project");

export const ProjectDetailSchema = ProjectSchema.extend({
  client: ClientRefSchema,
}).openapi("ProjectDetail");

const ProjectRefSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const EnvironmentSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
    vpn_resource_id: z.string().uuid().nullable(),
  })
  .openapi("Environment");

export const EnvironmentDetailSchema = EnvironmentSchema.extend({
  project: ProjectRefSchema,
}).openapi("EnvironmentDetail");

const EnvironmentRefWithProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  project: ProjectRefSchema,
});

export const ServerSchema = z
  .object({
    id: z.string().uuid(),
    environment_id: z.string().uuid(),
    hostname: z.string(),
    ip_address: z.string().nullable(),
    tech_stack: z.array(z.string()),
    monitoring_url: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
    display_name: z.string(),
    service_type: ServiceTypeSchema.nullable(),
    access_method: AccessMethodSchema.nullable(),
    access_host: z.string(),
    access_port: z.number().int().nullable(),
    access_path: z.string().nullable(),
  })
  .openapi("Server");

export const ServerDetailSchema = ServerSchema.extend({
  environment: EnvironmentRefWithProjectSchema,
}).openapi("ServerDetail");

export const CredentialReferenceSchema = z
  .object({
    id: z.string().uuid(),
    server_id: z.string().uuid(),
    label: z.string(),
    reference_location: z.string(),
    notes: z.string().nullable(),
    created_at: z.string().datetime(),
    applies_to_access_method: AccessMethodSchema.nullable(),
  })
  .openapi("CredentialReference");

const VersionAuthorSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const ResourceVersionSchema = z
  .object({
    id: z.string().uuid(),
    resource_id: z.string().uuid(),
    version_number: z.number().int(),
    content: z.string().nullable(),
    content_hash: z.string(),
    external_url: z.string().nullable(),
    file_path: z.string().nullable(),
    commit_message: z.string().nullable(),
    author_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .openapi("ResourceVersion");

export const ResourceVersionWithAuthorSchema = ResourceVersionSchema.extend({
  author: VersionAuthorSchema,
}).openapi("ResourceVersionWithAuthor");

export const ResourceVersionSummarySchema = z
  .object({
    id: z.string().uuid(),
    version_number: z.number().int(),
    commit_message: z.string().nullable(),
    created_at: z.string().datetime(),
    author: VersionAuthorSchema,
  })
  .openapi("ResourceVersionSummary");

const CurrentVersionSummarySchema = z.object({
  id: z.string().uuid(),
  version_number: z.number().int(),
  created_at: z.string().datetime(),
  author: VersionAuthorSchema,
});

const CurrentVersionDetailSchema = CurrentVersionSummarySchema.extend({
  content: z.string().nullable(),
  external_url: z.string().nullable(),
  file_path: z.string().nullable(),
  content_hash: z.string(),
  commit_message: z.string().nullable(),
});

export const ResourceSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid().nullable(),
    type: ResourceTypeSchema,
    title: z.string(),
    category: z.string().nullable(),
    tags: z.array(z.string()),
    current_version_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Resource");

export const ResourceListItemSchema = ResourceSchema.extend({
  current_version: CurrentVersionSummarySchema.nullable(),
}).openapi("ResourceListItem");

export const ResourceDetailSchema = ResourceSchema.extend({
  current_version: CurrentVersionDetailSchema.nullable(),
}).openapi("ResourceDetail");

export const CreateVersionResultSchema = z
  .object({
    version: ResourceVersionSchema,
    warning: z.string().optional(),
  })
  .openapi("CreateVersionResult");

export const PersonSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    type: PeopleTypeSchema,
    notes: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Person");

const LinkedClientSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  relationship_type: z.string().nullable(),
});

const AccountSummarySchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  active: z.boolean(),
});

export const PersonDetailSchema = PersonSchema.extend({
  clients: z.array(LinkedClientSummarySchema),
  account: AccountSummarySchema.nullable(),
}).openapi("PersonDetail");

export const PersonForClientSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    type: PeopleTypeSchema,
    deleted_at: z.string().datetime().nullable(),
    relationship_type: z.string().nullable(),
  })
  .openapi("PersonForClient");

const ProjectPersonPersonSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  type: z.string(),
  deleted_at: z.string().datetime().nullable(),
});

export const ProjectPersonEntrySchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    role_in_project: z.string(),
    created_at: z.string().datetime(),
    person: ProjectPersonPersonSchema,
  })
  .openapi("ProjectPersonEntry");

export const ScheduleSchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid().nullable(),
    server_id: z.string().uuid().nullable(),
    title: z.string(),
    type: ScheduleTypeSchema,
    scheduled_date: z.string(),
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    assigned_to: z.string().uuid(),
    status: ScheduleStatusSchema,
    notes: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    deleted_at: z.string().datetime().nullable(),
  })
  .openapi("Schedule");

export const ScheduleListItemSchema = ScheduleSchema.extend({
  is_overdue: z.boolean(),
}).openapi("ScheduleListItem");

export const ScheduleDetailSchema = ScheduleSchema.extend({
  is_overdue: z.boolean(),
  assigned_to_person: z.object({ id: z.string().uuid(), name: z.string() }),
  project: ProjectRefSchema.nullable(),
  server: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
}).openapi("ScheduleDetail");

const ChangedByPersonSchema = z.object({ id: z.string().uuid(), name: z.string() });

export const ActivityLogSchema = z
  .object({
    id: z.string().uuid(),
    entity_type: EntityTypeSchema,
    entity_id: z.string().uuid(),
    action: ActivityActionSchema,
    changed_by: z.string().uuid(),
    old_value: JsonObjectOrNullSchema,
    new_value: JsonObjectOrNullSchema,
    created_at: z.string().datetime(),
    changed_by_person: ChangedByPersonSchema,
  })
  .openapi("ActivityLog");

// ---------------------------------------------------------------------------
// Paginated list response wrappers
// ---------------------------------------------------------------------------

export const ClientListResponseSchema = paginated("ClientListResponse", ClientSchema);
export const ProjectListResponseSchema = paginated("ProjectListResponse", ProjectSchema);
export const EnvironmentListResponseSchema = paginated("EnvironmentListResponse", EnvironmentSchema);
export const ServerListResponseSchema = paginated("ServerListResponse", ServerSchema);
export const ResourceListResponseSchema = paginated("ResourceListResponse", ResourceListItemSchema);
export const ResourceVersionListResponseSchema = paginated(
  "ResourceVersionListResponse",
  ResourceVersionSummarySchema
);
export const PersonListResponseSchema = paginated("PersonListResponse", PersonSchema);
export const ScheduleListResponseSchema = paginated("ScheduleListResponse", ScheduleListItemSchema);
export const ActivityLogListResponseSchema = paginated("ActivityLogListResponse", ActivityLogSchema);

// ---------------------------------------------------------------------------
// Global search (⌘K palette) — DELIVERY entities only
// ---------------------------------------------------------------------------

export const SearchEntityTypeSchema = z
  .enum(["client", "project", "environment", "server"])
  .openapi("SearchEntityType");

export const SearchHitSchema = z
  .object({
    id: z.string().uuid(),
    type: SearchEntityTypeSchema,
    label: z.string().openapi({
      description:
        "Primary identifying text: the entity's name, or display_name for servers.",
    }),
    secondary: z.string().nullable().openapi({
      description:
        "One distinguishing field — client status, a project's client, an environment's project, a server's IP (falling back to hostname).",
    }),
  })
  .openapi("SearchHit");

export const SearchResultsSchema = z
  .object({
    clients: z.array(SearchHitSchema),
    projects: z.array(SearchHitSchema),
    environments: z.array(SearchHitSchema),
    servers: z.array(SearchHitSchema),
    total: z.number().int().openapi({
      description: "Total hits returned across all four groups, after per-type limiting.",
    }),
  })
  .openapi("SearchResults");
