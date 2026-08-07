import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ActivityLogListResponseSchema,
  ClientListResponseSchema,
  ClientSchema,
  CreateVersionResultSchema,
  CredentialReferenceSchema,
  EnvironmentDetailSchema,
  EnvironmentListResponseSchema,
  EnvironmentSchema,
  ErrorResponseSchema,
  PersonDetailSchema,
  PersonForClientSchema,
  PersonListResponseSchema,
  PersonSchema,
  ProjectDetailSchema,
  ProjectListResponseSchema,
  ProjectPersonEntrySchema,
  ProjectSchema,
  ResourceDetailSchema,
  ResourceListResponseSchema,
  ResourceSchema,
  ResourceVersionListResponseSchema,
  ResourceVersionWithAuthorSchema,
  ScheduleDetailSchema,
  ScheduleListResponseSchema,
  ScheduleSchema,
  ServerDetailSchema,
  ServerListResponseSchema,
  ServerSchema,
  UserSchema,
} from "./schemas";
import { loginSchema, changePasswordSchema } from "../validators/auth.validator";
import { createClientSchema, updateClientSchema } from "../validators/clients.validator";
import { createProjectSchema, updateProjectSchema } from "../validators/projects.validator";
import { addProjectPersonSchema } from "../validators/projectPeople.validator";
import { createEnvironmentSchema, updateEnvironmentSchema } from "../validators/environments.validator";
import { createServerSchema, updateServerSchema } from "../validators/servers.validator";
import {
  createCredentialReferenceSchema,
  updateCredentialReferenceSchema,
} from "../validators/credentialReferences.validator";
import {
  createResourceSchema,
  createResourceVersionSchema,
  updateMetadataSchema,
} from "../validators/resources.validator";
import { createPersonSchema, linkClientSchema, updatePersonSchema } from "../validators/people.validator";
import { createScheduleSchema, updateScheduleSchema } from "../validators/schedules.validator";

export const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT obtained from POST /api/auth/login, sent as `Authorization: Bearer <token>`.",
});
const bearerAuth = [{ bearerAuth: [] }];

// ---------------------------------------------------------------------------
// Small helpers (kept local — not part of the Step 2 shared-schema surface)
// ---------------------------------------------------------------------------

function json(schema: z.ZodTypeAny) {
  return { content: { "application/json": { schema } } };
}

function ok(description: string, schema: z.ZodTypeAny) {
  return { description, ...json(schema) };
}

const errorResponse = (description: string) => ({ description, ...json(ErrorResponseSchema) });

const RESPONSES = {
  400: errorResponse("Validation error"),
  401: errorResponse("Not authenticated"),
  403: errorResponse("Insufficient permissions"),
  404: errorResponse("Not found"),
  409: errorResponse("Conflict"),
};

function errors(...codes: (keyof typeof RESPONSES)[]) {
  const out: Record<string, unknown> = {};
  for (const code of codes) out[code] = RESPONSES[code];
  return out;
}

const IdParam = z.object({ id: z.string().uuid() });

/**
 * Mirrors the actual runtime query-parsing logic in each controller's
 * parseListQuery() — NOT the list*QuerySchema exports in the validators.
 * AUDIT FINDING: those exported zod schemas are never invoked at runtime
 * (controllers hand-parse req.query with defaults instead), and mark
 * page/per_page/sort/order/deleted as required — which is wrong for the
 * actual API surface, where every one of them is optional with a default.
 * This spec follows the real behavior, not the unused validator shape.
 */
function listQuery<S extends [string, ...string[]]>(
  sortValues: S,
  defaultSort: string,
  extra: z.ZodRawShape = {}
) {
  return z.object({
    page: z.coerce.number().int().min(1).optional().openapi({ description: "Default: 1" }),
    per_page: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .openapi({ description: "Default: 20, max: 100" }),
    sort: z.enum(sortValues).optional().openapi({ description: `Default: ${defaultSort}` }),
    order: z.enum(["asc", "desc"]).optional().openapi({ description: "Default: asc" }),
    deleted: z
      .enum(["false", "true", "all"])
      .optional()
      .openapi({ description: "Default: false" }),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/auth/login",
  tags: ["Auth"],
  operationId: "login",
  summary: "Log in with username and password",
  security: [],
  request: { body: { required: true, ...json(loginSchema) } },
  responses: {
    200: ok("Login succeeded", z.object({ token: z.string(), user: UserSchema })),
    ...errors(401),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  tags: ["Auth"],
  operationId: "getCurrentUser",
  summary: "Get the authenticated user's profile",
  security: bearerAuth,
  responses: { 200: ok("Current user", UserSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["Auth"],
  operationId: "logout",
  summary: "Log out (client-side token discard; no server-side session to invalidate)",
  security: bearerAuth,
  responses: { 200: ok("Logged out", z.object({ message: z.string() })), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/change-password",
  tags: ["Auth"],
  operationId: "changePassword",
  summary: "Change the authenticated user's password",
  security: bearerAuth,
  request: { body: { required: true, ...json(changePasswordSchema) } },
  responses: {
    200: ok("Password changed", z.object({ message: z.string() })),
    ...errors(400, 401),
  },
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/clients",
  tags: ["Clients"],
  operationId: "listClients",
  summary: "List clients",
  security: bearerAuth,
  request: { query: listQuery(["name", "status", "created_at", "updated_at"], "name", { search: z.string().optional() }) },
  responses: { 200: ok("Paginated clients", ClientListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/clients",
  tags: ["Clients"],
  operationId: "createClient",
  summary: "Create a client (admin only)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createClientSchema) } },
  responses: {
    201: ok("Client created", ClientSchema),
    ...errors(400, 401, 403, 409),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/clients/{id}",
  tags: ["Clients"],
  operationId: "getClientById",
  summary: "Get a client by id",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Client", ClientSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/clients/{id}",
  tags: ["Clients"],
  operationId: "updateClient",
  summary: "Update a client (optimistic lock via updated_at)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateClientSchema) } },
  responses: { 200: ok("Client updated", ClientSchema), ...errors(400, 401, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/clients/{id}",
  tags: ["Clients"],
  operationId: "deleteClient",
  summary: "Soft-delete a client (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Client soft-deleted", ClientSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/clients/{id}/restore",
  tags: ["Clients"],
  operationId: "restoreClient",
  summary: "Restore a soft-deleted client (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Client restored", ClientSchema), ...errors(401, 403, 404, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/clients/{id}/people",
  tags: ["Clients"],
  operationId: "getClientPeople",
  summary: "List people linked to a client (reverse of Person <-> Client link)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: {
    200: ok("People linked to this client", z.array(PersonForClientSchema)),
    ...errors(401, 404),
  },
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects",
  tags: ["Projects"],
  operationId: "listProjects",
  summary: "List projects",
  security: bearerAuth,
  request: {
    query: listQuery(["name", "created_at", "updated_at"], "name", {
      search: z.string().optional(),
      client_id: z.string().uuid().optional(),
    }),
  },
  responses: { 200: ok("Paginated projects", ProjectListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/projects",
  tags: ["Projects"],
  operationId: "createProject",
  summary: "Create a project (admin only)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createProjectSchema) } },
  responses: { 201: ok("Project created", ProjectSchema), ...errors(400, 401, 403, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}",
  tags: ["Projects"],
  operationId: "getProjectById",
  summary: "Get a project by id, with its parent client inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Project", ProjectDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}",
  tags: ["Projects"],
  operationId: "updateProject",
  summary: "Update a project (admin only; optimistic lock via updated_at; client_id is not re-parentable)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateProjectSchema) } },
  responses: { 200: ok("Project updated", ProjectSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/projects/{id}",
  tags: ["Projects"],
  operationId: "deleteProject",
  summary: "Soft-delete a project (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Project soft-deleted", ProjectSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/restore",
  tags: ["Projects"],
  operationId: "restoreProject",
  summary: "Restore a soft-deleted project (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Project restored", ProjectSchema), ...errors(401, 403, 404, 409) },
});

// ---------------------------------------------------------------------------
// ProjectPeople (mounted under /api/projects/:id/people)
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/people",
  tags: ["ProjectPeople"],
  operationId: "listProjectPeople",
  summary: "List people assigned to a project (includes soft-deleted people, marked via deleted_at, for history)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Project people", z.array(ProjectPersonEntrySchema)), ...errors(401, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/people",
  tags: ["ProjectPeople"],
  operationId: "addProjectPerson",
  summary: "Assign a person to a project with a role",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(addProjectPersonSchema) } },
  responses: {
    201: ok("Person assigned", ProjectPersonEntrySchema),
    ...errors(400, 401, 404, 409),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/projects/{id}/people/{peopleId}",
  tags: ["ProjectPeople"],
  operationId: "removeProjectPerson",
  summary: "Remove a person from a project",
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid(), peopleId: z.string().uuid() }) },
  responses: {
    200: ok("Person removed", z.object({ message: z.string() })),
    ...errors(401, 404),
  },
});

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/environments",
  tags: ["Environments"],
  operationId: "listEnvironments",
  summary: "List environments",
  security: bearerAuth,
  request: {
    query: listQuery(["name", "created_at", "updated_at"], "name", {
      project_id: z.string().uuid().optional(),
    }),
  },
  responses: { 200: ok("Paginated environments", EnvironmentListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/environments",
  tags: ["Environments"],
  operationId: "createEnvironment",
  summary: "Create an environment (admin only)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createEnvironmentSchema) } },
  responses: { 201: ok("Environment created", EnvironmentSchema), ...errors(400, 401, 403, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/environments/{id}",
  tags: ["Environments"],
  operationId: "getEnvironmentById",
  summary: "Get an environment by id, with its parent project inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Environment", EnvironmentDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/environments/{id}",
  tags: ["Environments"],
  operationId: "updateEnvironment",
  summary: "Update an environment (admin only; optimistic lock; project_id is not re-parentable)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateEnvironmentSchema) } },
  responses: { 200: ok("Environment updated", EnvironmentSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/environments/{id}",
  tags: ["Environments"],
  operationId: "deleteEnvironment",
  summary: "Soft-delete an environment (admin only; cascades to its servers and hard-deletes their credential_references)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Environment soft-deleted", EnvironmentSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/environments/{id}/restore",
  tags: ["Environments"],
  operationId: "restoreEnvironment",
  summary: "Restore a soft-deleted environment (admin only; does not cascade-restore servers)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Environment restored", EnvironmentSchema), ...errors(401, 403, 404, 409) },
});

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/servers",
  tags: ["Servers"],
  operationId: "listServers",
  summary: "List servers",
  security: bearerAuth,
  request: {
    query: listQuery(["display_name", "created_at", "updated_at"], "display_name", {
      search: z.string().optional(),
      environment_id: z.string().uuid().optional(),
      service_type: z.string().optional(),
      access_method: z.string().optional(),
    }),
  },
  responses: { 200: ok("Paginated servers", ServerListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/servers",
  tags: ["Servers"],
  operationId: "createServer",
  summary: "Create a server (admin or member)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createServerSchema) } },
  responses: { 201: ok("Server created", ServerSchema), ...errors(400, 401, 403, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/servers/{id}",
  tags: ["Servers"],
  operationId: "getServerById",
  summary: "Get a server by id, with its environment and that environment's project inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Server", ServerDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/servers/{id}",
  tags: ["Servers"],
  operationId: "updateServer",
  summary: "Update a server (admin or member; optimistic lock; environment_id is not re-parentable)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateServerSchema) } },
  responses: { 200: ok("Server updated", ServerSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/servers/{id}",
  tags: ["Servers"],
  operationId: "deleteServer",
  summary: "Soft-delete a server (admin only; hard-deletes its credential_references)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Server soft-deleted", ServerSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/servers/{id}/restore",
  tags: ["Servers"],
  operationId: "restoreServer",
  summary: "Restore a soft-deleted server (admin only; credential_references hard-deleted at delete time are NOT restored)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Server restored", ServerSchema), ...errors(401, 403, 404, 409) },
});

// ---------------------------------------------------------------------------
// CredentialReferences (nested under /api/servers/:serverId + top-level /api/credential-references/:id)
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/servers/{serverId}/credential-references",
  tags: ["CredentialReferences"],
  operationId: "listServerCredentialReferences",
  summary: "List credential references for a server",
  security: bearerAuth,
  request: { params: z.object({ serverId: z.string().uuid() }) },
  responses: {
    200: ok("Credential references", z.array(CredentialReferenceSchema)),
    ...errors(401, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/servers/{serverId}/credential-references",
  tags: ["CredentialReferences"],
  operationId: "createServerCredentialReference",
  summary: "Create a credential reference for a server (admin or member)",
  security: bearerAuth,
  request: {
    params: z.object({ serverId: z.string().uuid() }),
    body: { required: true, ...json(createCredentialReferenceSchema.omit({ server_id: true })) },
  },
  responses: {
    201: ok("Credential reference created", CredentialReferenceSchema),
    ...errors(400, 401, 403, 404),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/credential-references/{id}",
  tags: ["CredentialReferences"],
  operationId: "getCredentialReferenceById",
  summary: "Get a credential reference by id",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Credential reference", CredentialReferenceSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/credential-references/{id}",
  tags: ["CredentialReferences"],
  operationId: "updateCredentialReference",
  summary: "Update a credential reference (admin or member)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateCredentialReferenceSchema) } },
  responses: { 200: ok("Credential reference updated", CredentialReferenceSchema), ...errors(400, 401, 404) },
});

registry.registerPath({
  method: "delete",
  path: "/api/credential-references/{id}",
  tags: ["CredentialReferences"],
  operationId: "deleteCredentialReference",
  summary: "Hard-delete a credential reference (admin only; no soft delete / restore for this resource)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Credential reference deleted", CredentialReferenceSchema), ...errors(401, 403, 404) },
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/resources",
  tags: ["Resources"],
  operationId: "listResources",
  summary: "List resources (each item includes a lightweight current_version summary, not full content)",
  security: bearerAuth,
  request: {
    query: listQuery(["title", "created_at", "updated_at"], "title", {
      search: z.string().optional(),
      project_id: z.string().uuid().optional(),
      type: z.string().optional(),
    }),
  },
  responses: { 200: ok("Paginated resources", ResourceListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/resources",
  tags: ["Resources"],
  operationId: "createResource",
  summary: "Create a resource with its initial version (admin or member) — atomic: resource + v1 + activity log or nothing",
  security: bearerAuth,
  request: { body: { required: true, ...json(createResourceSchema) } },
  responses: { 201: ok("Resource created", ResourceDetailSchema), ...errors(400, 401, 403) },
});

registry.registerPath({
  method: "get",
  path: "/api/resources/{id}",
  tags: ["Resources"],
  operationId: "getResourceById",
  summary: "Get a resource by id, with full current_version content inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Resource", ResourceDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/resources/{id}",
  tags: ["Resources"],
  operationId: "updateResourceMetadata",
  summary: "Update resource metadata only — title/category/tags (admin only; never touches content or creates a version)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateMetadataSchema) } },
  responses: { 200: ok("Resource metadata updated", ResourceSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/resources/{id}",
  tags: ["Resources"],
  operationId: "deleteResource",
  summary: "Soft-delete a resource (admin only; resource_versions history is never touched)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Resource soft-deleted", ResourceSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/resources/{id}/restore",
  tags: ["Resources"],
  operationId: "restoreResource",
  summary: "Restore a soft-deleted resource (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Resource restored", ResourceSchema), ...errors(401, 403, 404, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/resources/{id}/versions",
  tags: ["Resources"],
  operationId: "listResourceVersions",
  summary: "List a resource's version history, git-log style (newest first, no content)",
  security: bearerAuth,
  request: {
    params: IdParam,
    query: z.object({
      page: z.coerce.number().int().min(1).optional().openapi({ description: "Default: 1" }),
      per_page: z.coerce.number().int().min(1).max(100).optional().openapi({ description: "Default: 20" }),
    }),
  },
  responses: { 200: ok("Paginated version history", ResourceVersionListResponseSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "get",
  path: "/api/resources/{id}/versions/{versionId}",
  tags: ["Resources"],
  operationId: "getResourceVersionById",
  summary: "Get a specific historical version's full content",
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid(), versionId: z.string().uuid() }) },
  responses: { 200: ok("Resource version", ResourceVersionWithAuthorSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/resources/{id}/versions",
  tags: ["Resources"],
  operationId: "createResourceVersion",
  summary: "Create a new version of a resource (admin or member; safe under concurrent requests via row lock)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(createResourceVersionSchema) } },
  responses: {
    201: ok(
      "Version created (response includes a `warning` if content is byte-identical to the previous version)",
      CreateVersionResultSchema
    ),
    ...errors(400, 401, 403, 404),
  },
});

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/people",
  tags: ["People"],
  operationId: "listPeople",
  summary: "List people",
  security: bearerAuth,
  request: {
    query: listQuery(["name", "created_at", "updated_at"], "name", {
      search: z.string().optional(),
      type: z.string().optional(),
    }),
  },
  responses: { 200: ok("Paginated people", PersonListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/people",
  tags: ["People"],
  operationId: "createPerson",
  summary: "Create a person (admin or member)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createPersonSchema) } },
  responses: { 201: ok("Person created", PersonSchema), ...errors(400, 401, 403) },
});

registry.registerPath({
  method: "get",
  path: "/api/people/{id}",
  tags: ["People"],
  operationId: "getPersonById",
  summary: "Get a person by id, with linked clients and (if any) their user account inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Person", PersonDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/people/{id}",
  tags: ["People"],
  operationId: "updatePerson",
  summary: "Update a person (admin or member; optimistic lock)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updatePersonSchema) } },
  responses: { 200: ok("Person updated", PersonSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/people/{id}",
  tags: ["People"],
  operationId: "deletePerson",
  summary: "Soft-delete a person (admin only; also disables their linked user account, if any, blocking login)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Person soft-deleted", PersonSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/people/{id}/restore",
  tags: ["People"],
  operationId: "restorePerson",
  summary: "Restore a soft-deleted person (admin only; also re-enables their linked user account, if it was disabled)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Person restored", PersonSchema), ...errors(401, 403, 404, 409) },
});

registry.registerPath({
  method: "get",
  path: "/api/people/{id}/clients",
  tags: ["People"],
  operationId: "getPersonClients",
  summary: "List clients linked to a person",
  security: bearerAuth,
  request: { params: IdParam },
  responses: {
    200: ok("Linked clients", z.array(z.object({ id: z.string().uuid(), name: z.string(), relationship_type: z.string().nullable() }))),
    ...errors(401, 404),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/people/{id}/clients",
  tags: ["People"],
  operationId: "linkPersonClient",
  summary: "Link a client to a person (admin or member)",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(linkClientSchema) } },
  responses: {
    201: ok("Client linked", z.object({ id: z.string().uuid(), name: z.string(), relationship_type: z.string().nullable() })),
    ...errors(400, 401, 403, 404, 409),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/people/{id}/clients/{clientId}",
  tags: ["People"],
  operationId: "unlinkPersonClient",
  summary: "Unlink a client from a person (admin or member; hard delete of the junction row)",
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid(), clientId: z.string().uuid() }) },
  responses: {
    200: ok("Client unlinked", z.object({ message: z.string() })),
    ...errors(401, 403, 404),
  },
});

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/schedules",
  tags: ["Schedules"],
  operationId: "listSchedules",
  summary: "List schedules (each item includes a computed is_overdue field)",
  security: bearerAuth,
  request: {
    query: listQuery(["scheduled_date", "created_at", "updated_at"], "scheduled_date", {
      project_id: z.string().uuid().optional(),
      status: z.string().optional(),
      from: z.string().optional().openapi({ description: "Lower bound on scheduled_date" }),
      to: z.string().optional().openapi({ description: "Upper bound on scheduled_date" }),
    }),
  },
  responses: { 200: ok("Paginated schedules", ScheduleListResponseSchema), ...errors(401) },
});

registry.registerPath({
  method: "post",
  path: "/api/schedules",
  tags: ["Schedules"],
  operationId: "createSchedule",
  summary: "Create a schedule (admin or member; status is always 'pending' on create)",
  security: bearerAuth,
  request: { body: { required: true, ...json(createScheduleSchema) } },
  responses: { 201: ok("Schedule created", ScheduleSchema), ...errors(400, 401, 403) },
});

registry.registerPath({
  method: "get",
  path: "/api/schedules/{id}",
  tags: ["Schedules"],
  operationId: "getScheduleById",
  summary: "Get a schedule by id, with assignee/project/server inlined",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Schedule", ScheduleDetailSchema), ...errors(401, 404) },
});

registry.registerPath({
  method: "patch",
  path: "/api/schedules/{id}",
  tags: ["Schedules"],
  operationId: "updateSchedule",
  summary:
    "Update a schedule's status/notes (admin or member). Status transitions are validated by a strict state machine; started_at/completed_at are set automatically and cannot be provided directly.",
  security: bearerAuth,
  request: { params: IdParam, body: { required: true, ...json(updateScheduleSchema) } },
  responses: { 200: ok("Schedule updated", ScheduleSchema), ...errors(400, 401, 403, 404, 409) },
});

registry.registerPath({
  method: "delete",
  path: "/api/schedules/{id}",
  tags: ["Schedules"],
  operationId: "deleteSchedule",
  summary: "Soft-delete a schedule (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Schedule soft-deleted", ScheduleSchema), ...errors(401, 403, 404) },
});

registry.registerPath({
  method: "post",
  path: "/api/schedules/{id}/restore",
  tags: ["Schedules"],
  operationId: "restoreSchedule",
  summary: "Restore a soft-deleted schedule (admin only)",
  security: bearerAuth,
  request: { params: IdParam },
  responses: { 200: ok("Schedule restored", ScheduleSchema), ...errors(401, 403, 404, 409) },
});

// ---------------------------------------------------------------------------
// Activity (read-only)
// ---------------------------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/activity-logs",
  tags: ["Activity"],
  operationId: "listActivityLogs",
  summary: "List activity log entries (append-only audit trail; read-only — no write endpoints exist for this resource)",
  security: bearerAuth,
  request: {
    query: z.object({
      page: z.coerce.number().int().min(1).optional().openapi({ description: "Default: 1" }),
      per_page: z.coerce.number().int().min(1).max(100).optional().openapi({ description: "Default: 20" }),
      sort: z.enum(["created_at"]).optional().openapi({ description: "Only sortable field. Default: created_at" }),
      order: z.enum(["asc", "desc"]).optional().openapi({ description: "Default: desc" }),
      entity_type: z.string().optional(),
      entity_id: z.string().uuid().optional(),
      action: z.string().optional(),
      changed_by: z.string().uuid().optional().openapi({ description: "Filters by the people.id who made the change" }),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: { 200: ok("Paginated activity log", ActivityLogListResponseSchema), ...errors(401) },
});
