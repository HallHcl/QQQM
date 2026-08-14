# QQM — API Contract Summary

A navigable, human-readable summary of the API contract. **`backend/openapi.yaml` remains the
source of truth** for exact request/response shapes — this document is for finding "which role can
call what" and "which cross-cutting rule applies to which entity" quickly, with citations so a
future ticket can trust it instead of re-reading the raw backend source every time.

Every role gate below was re-derived directly from the current `backend/src/routes/*.routes.ts`
file for that module (not copied from `decisions.md`/`progress.md`'s prose), verified 2026-08-12.
All routes are mounted under `/api/...` behind the `auth` middleware
(`backend/src/app.ts:42-52`, `backend/src/middleware/auth.ts`) unless noted otherwise — "Role gate"
below is the *additional* gate on top of that base authentication requirement.

---

## Auth

`backend/src/routes/auth.routes.ts` — mounted at `/api/auth` **without** the global `auth`
middleware wrapper (`backend/src/app.ts:42`); each route opts into `auth` individually.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/auth/login` | POST | none (public) | No `auth` middleware at all (`auth.routes.ts:7`). |
| `/auth/me` | GET | `auth` only | `auth.routes.ts:8`. |
| `/auth/logout` | POST | `auth` only | `auth.routes.ts:9`. Client-side token clear regardless of response. |
| `/auth/change-password` | POST | `auth` only | `auth.routes.ts:10`. Self-service only — no admin "reset another user's password" endpoint exists. |

---

## Clients

`backend/src/routes/clients.routes.ts`, mounted at `/api/clients` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/clients` | GET | none beyond auth | `clients.routes.ts:15`. |
| `/clients` | POST | `requireRole("admin")` | `clients.routes.ts:16`. |
| `/clients/:id` | GET | none beyond auth | `clients.routes.ts:17`. |
| `/clients/:id` | PATCH | **none beyond auth** | `clients.routes.ts:18`. **Update has no role restriction — any authenticated user (admin or member) can edit a client.** This is the one module where the create/update split is genuinely asymmetric with delete. |
| `/clients/:id` | DELETE | `requireRole("admin")` | `clients.routes.ts:19`. |
| `/clients/:id/restore` | POST | `requireRole("admin")` | `clients.routes.ts:20`. |
| `/clients/:id/people` | GET | none beyond auth | `clients.routes.ts:22`. Reverse lookup (people linked to this client). |

---

## Projects

`backend/src/routes/projects.routes.ts`, mounted at `/api/projects` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/projects` | GET | none beyond auth | `projects.routes.ts:7`. |
| `/projects` | POST | `requireRole("admin")` | `projects.routes.ts:8`. |
| `/projects/:id` | GET | none beyond auth | `projects.routes.ts:9`. |
| `/projects/:id` | PATCH | `requireRole("admin")` | `projects.routes.ts:10`. |
| `/projects/:id` | DELETE | `requireRole("admin")` | `projects.routes.ts:11`. |
| `/projects/:id/restore` | POST | `requireRole("admin")` | `projects.routes.ts:12`. |

Create **and** Update are both admin-only here — unlike Clients (see above), there is no
asymmetry between them.

---

## Environments

`backend/src/routes/environments.routes.ts`, mounted at `/api/environments` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/environments` | GET | none beyond auth | `environments.routes.ts:7`. |
| `/environments` | POST | `requireRole("admin")` | `environments.routes.ts:8`. |
| `/environments/:id` | GET | none beyond auth | `environments.routes.ts:9`. |
| `/environments/:id` | PATCH | `requireRole("admin")` | `environments.routes.ts:10`. |
| `/environments/:id` | DELETE | `requireRole("admin")` | `environments.routes.ts:11`. |
| `/environments/:id/restore` | POST | `requireRole("admin")` | `environments.routes.ts:12`. |

**Every write action on Environments is admin-only** — the only module where all four mutating
verbs (create/update/delete/restore) share one uniform, strictest gate. There is no
`requireAnyRole(["admin","member"])` anywhere in this route file.

---

## Servers

`backend/src/routes/servers.routes.ts`, mounted at `/api/servers` with `auth`. Also hosts two
credential-reference sub-routes (see note below).

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/servers` | GET | none beyond auth | `servers.routes.ts:11`. |
| `/servers` | POST | `requireAnyRole(["admin","member"])` | `servers.routes.ts:12`. |
| `/servers/:id` | GET | none beyond auth | `servers.routes.ts:13`. |
| `/servers/:id` | PATCH | `requireAnyRole(["admin","member"])` | `servers.routes.ts:14`. |
| `/servers/:id` | DELETE | `requireRole("admin")` | `servers.routes.ts:15`. |
| `/servers/:id/restore` | POST | `requireRole("admin")` | `servers.routes.ts:16`. |
| `/servers/:serverId/credential-references` | GET | none beyond auth | `servers.routes.ts:18`. Lists via `credentialReferences.controller.listByServer`. |
| `/servers/:serverId/credential-references` | POST | `requireAnyRole(["admin","member"])` | `servers.routes.ts:19-23`. Creates via `credentialReferences.controller.createForServer` — **note this create path is reached through the Servers route file**, gated by Servers' own `requireAnyRole` call, even though the entity is CredentialReference. |

---

## CredentialReferences

`backend/src/routes/credentialReferences.routes.ts`, mounted standalone at
`/api/credential-references` with `auth` — **a separate route file from Servers**, despite most
CredentialReference mutation traffic entering through the Servers routes above (confirms
`decisions.md` #2's claim that this RBAC lives on its own route file rather than being inherited
from Servers).

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/credential-references/:id` | GET | none beyond auth | `credentialReferences.routes.ts:7`. |
| `/credential-references/:id` | PATCH | `requireAnyRole(["admin","member"])` | `credentialReferences.routes.ts:8`. |
| `/credential-references/:id` | DELETE | `requireRole("admin")` | `credentialReferences.routes.ts:9`. **Hard delete — no restore endpoint exists for this entity** (no `POST .../restore` route in this file). |

---

## Resources

`backend/src/routes/resources.routes.ts`, mounted at `/api/resources` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/resources` | GET | none beyond auth | `resources.routes.ts:17`. |
| `/resources` | POST | `requireAnyRole(["admin","member"])` | `resources.routes.ts:18`. |
| `/resources/:id` | GET | none beyond auth | `resources.routes.ts:19`. |
| `/resources/:id` | PATCH | `requireRole("admin")` | `resources.routes.ts:20`. **Metadata update (title/category/tags) is admin-only** — genuinely asymmetric with Create (admin+member) and with version creation (admin+member, below). |
| `/resources/:id` | DELETE | `requireRole("admin")` | `resources.routes.ts:21`. |
| `/resources/:id/restore` | POST | `requireRole("admin")` | `resources.routes.ts:22`. |
| `/resources/:id/versions` | GET | none beyond auth | `resources.routes.ts:24`. |
| `/resources/:id/versions/:versionId` | GET | none beyond auth | `resources.routes.ts:25`. |
| `/resources/:id/versions` | POST | `requireAnyRole(["admin","member"])` | `resources.routes.ts:26`. **Creating a new version is admin+member, while editing the parent resource's metadata is admin-only** — this specific asymmetry is easy to get backwards when scoping a build ticket. |

## ResourceVersions

No dedicated route file — endpoints live under `resources.routes.ts` (above: the three
`/resources/:id/versions...` rows). Listed separately here because it is a distinct entity with
distinct semantics: **append-only, no update or delete endpoint exists at all** — there is no
`PATCH /resources/:id/versions/:versionId` or `DELETE` route anywhere in `resources.routes.ts`.
Once created, a version is permanent.

---

## People

`backend/src/routes/people.routes.ts`, mounted at `/api/people` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/people` | GET | none beyond auth | `people.routes.ts:17`. |
| `/people` | POST | `requireAnyRole(["admin","member"])` | `people.routes.ts:18`. |
| `/people/:id` | GET | none beyond auth | `people.routes.ts:19`. |
| `/people/:id` | PATCH | `requireAnyRole(["admin","member"])` | `people.routes.ts:20`. **Unlike Resources' admin-only metadata PATCH, People's metadata update is admin+member** — same "create vs. update" role pair, unlike Resources where they diverge. |
| `/people/:id` | DELETE | `requireRole("admin")` | `people.routes.ts:21`. |
| `/people/:id/restore` | POST | `requireRole("admin")` | `people.routes.ts:22`. |
| `/people/:id/clients` | GET | none beyond auth | `people.routes.ts:24`. |
| `/people/:id/clients` | POST | `requireAnyRole(["admin","member"])` | `people.routes.ts:25`. Link a client to this person. |
| `/people/:id/clients/:clientId` | DELETE | `requireAnyRole(["admin","member"])` | `people.routes.ts:26`. Unlink. |

---

## ProjectPeople

`backend/src/routes/projectPeople.routes.ts`, mounted at `/api/projects` with `auth`
(`backend/src/app.ts:45` — same base path as Projects, distinct route file).

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/projects/:id/people` | GET | none beyond auth | `projectPeople.routes.ts:7`. Project roster. |
| `/projects/:id/people` | POST | `requireAnyRole(["admin","member"])` | `projectPeople.routes.ts:8`. Add a person to the project roster with a role. |
| `/projects/:id/people/:peopleId` | DELETE | `requireAnyRole(["admin","member"])` | `projectPeople.routes.ts:9`. Remove from roster. |

---

## Schedule

`backend/src/routes/schedules.routes.ts`, mounted at `/api/schedules` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/schedules` | GET | none beyond auth | `schedules.routes.ts:7`. |
| `/schedules` | POST | `requireAnyRole(["admin","member"])` | `schedules.routes.ts:8`. |
| `/schedules/:id` | GET | none beyond auth | `schedules.routes.ts:9`. |
| `/schedules/:id` | PATCH | `requireAnyRole(["admin","member"])` | `schedules.routes.ts:10`. Only `status` and `notes` are editable (`updateScheduleSchema`, `backend/src/validators/schedules.validator.ts:30-34`) — `started_at`/`completed_at` are rejected if present in the body (`backend/src/controllers/schedules.controller.ts:72-83`) and set server-side only, exactly when a valid transition occurs. |
| `/schedules/:id` | DELETE | `requireRole("admin")` | `schedules.routes.ts:11`. |
| `/schedules/:id/restore` | POST | `requireRole("admin")` | `schedules.routes.ts:12`. |

---

## Activity

`backend/src/routes/activityLogs.routes.ts`, mounted at `/api/activity-logs` with `auth`.

| Endpoint | Method | Role gate | Notes |
|---|---|---|---|
| `/activity-logs` | GET | **none beyond auth** | `activityLogs.routes.ts:6`. Read-only, no `requireRole`/`requireAnyRole` at all — any authenticated user (admin or member) can view the full activity log across every entity. There is no per-entity or per-module scoping of who can see what. |

This module has no write endpoints at all — see Cross-cutting rules below for the DB-level
append-only enforcement.

---

## Cross-cutting rules

### Pagination

Verified from each controller's `parseListQuery()` and the matching Zod `list*QuerySchema`.

- **Universal params**: `page` (default 1), `per_page` (default 20, **hard-capped at 100** —
  `Math.min(100, ...)` in every controller, and every validator has `per_page: z.number().int()
  .min(1).max(100)`), `order` (`asc`/`desc`).
- **`sort`**: every list endpoint has a module-specific enum of sortable columns (e.g. Clients:
  `name|status|created_at|updated_at`; Resources: `title|created_at|updated_at`) — falls back to a
  module-specific default column if the value isn't in that module's whitelist, rather than 400ing.
- **`search`**: supported by Clients, Projects, Servers, Resources, People. **Not supported by
  Environments, Schedules, or Activity** — their controllers never read `req.query.search` at all.
- **`deleted` filter — genuinely inconsistent across modules, not documented elsewhere**:
  - Clients uses a **boolean-only** filter: `req.query.deleted === "true"`
    (`backend/src/controllers/clients.controller.ts:35`), and the service branches on a plain
    `boolean` (`clients.service.ts:33` — `params.deleted ? "deleted_at IS NOT NULL" : "deleted_at
    IS NULL"`). **There is no way to fetch both deleted and non-deleted Clients in one request.**
  - Every other module with soft-delete (Projects, Environments, Servers, Resources, People,
    Schedules) uses a **three-state** `deletedMode: "false" | "true" | "all"`
    (e.g. `backend/src/controllers/environments.controller.ts:33-37`), where `"all"` omits the
    `deleted_at` condition entirely and returns both.
  - This is a real, verified asymmetry, and it **is** documented in both `decisions.md` (#11) and
    `progress.md` (deleted-filter fix entry) — see those files for the frontend-side fix and
    remaining backend-frozen caveat.
- **Schedule's list is narrower in filters but wider in date range**: it has `project_id`,
  `status`, `from`, `to`, `deleted` — confirmed **no `search`, no `type`, no `assigned_to`
  filter** (`backend/src/validators/schedules.validator.ts:36-46`), consistent with
  `development-guide.md` §3's claim. It's the only list endpoint with a `from`/`to` date range
  filter besides Activity.
- **Activity's list params are a different shape entirely**: `page`, `per_page`, `order`,
  `entity_type`, `entity_id`, `action`, `changed_by`, `from`, `to` — these 9 are the actual, live
  filters, verified directly from the controller's own hand-parsing
  (`backend/src/controllers/activityLogs.controller.ts:4-27`), not from the validator. **The
  validator (`listActivityLogsQuerySchema`, `backend/src/validators/activityLogs.validator.ts:18-29`)
  is dead code, not just its `sort` field**: it's never imported anywhere else in the backend
  (confirmed by project-wide grep — zero references outside its own declaration file), and
  `activityLogs.routes.ts` attaches no validation middleware at all. The controller hand-parses
  every param itself with no `.parse()`/`.safeParse()` call against this schema.
  `entity_type`/`entity_id`/`action`/`changed_by` are therefore passed through as raw,
  unvalidated strings (parameterized into SQL, so not an injection risk — just no 400 on malformed
  input, e.g. a non-UUID `entity_id` or an unknown `entity_type` silently returns zero rows instead
  of rejecting).
  `sort` is a clear example of the gap between the (unenforced) validator/OpenAPI spec and actual
  behavior: it's documented in `backend/openapi.yaml` (`sort`, enum `["created_at"]`, "Only
  sortable field") and defined in the dead validator, but the controller never reads
  `req.query.sort` at all (`activityLogs.controller.ts:4-27`, no `sort` parsing), and the service
  (`backend/src/services/activityLogs.service.ts:83`) unconditionally `ORDER BY al.created_at` —
  so `sort` is not merely "ignored," it is inert two layers deep (dead validator, dead controller
  read) even though the OpenAPI contract implies it's a real, working parameter.

### Standard error envelope

`{ "error": { "code"?: string, "message": string, "details"?: unknown } }` —
`backend/src/middleware/errorHandler.ts:16-38`.

**Known gap, confirmed still present**: every `ApiError(404, ...)` call in the codebase omits the
`code` argument (grepped all ~30 call sites across every controller/service — zero exceptions), and
the generic 500 fallback (`errorHandler.ts:32-37`, for any non-`ApiError` thrown/uncaught error)
returns `{ error: { message: "Internal server error" } }` with **no `code` key present at all**.
Every other status code consistently includes a `code` (`"VALIDATION_ERROR"`, `"CONFLICT"`,
`"UNAUTHORIZED"`, `"FORBIDDEN"`). The frontend's `ApiError`/`parseApiError`
(`frontend/src/api/errors.ts:1-55`) is written to tolerate this — its own doc-comment states the
gap explicitly (`errors.ts:7-9`) and every consumer must treat `code` as optional.

### PATCH semantics — `updated_at` (optimistic lock) requirement, verified per entity

| Entity | Requires `updated_at` on PATCH? | Verified from |
|---|---|---|
| Client | Yes | `backend/src/validators/clients.validator.ts:13` |
| Project | Yes | `backend/src/validators/projects.validator.ts:17` |
| Environment | Yes | `backend/src/validators/environments.validator.ts:17` |
| Server | Yes | `backend/src/validators/servers.validator.ts:61` |
| Resource (metadata) | Yes | `backend/src/validators/resources.validator.ts:59` |
| Person | Yes | `backend/src/validators/people.validator.ts:25` |
| Schedule | Yes | `backend/src/validators/schedules.validator.ts:33` |
| **CredentialReference** | **No** | `backend/src/validators/credentialReferences.validator.ts:13-18` — `updateCredentialReferenceSchema` has no `updated_at` field at all. |
| **ResourceVersion** | **N/A — no update endpoint exists** | No route in `resources.routes.ts` PATCHes a version. |

### Soft-delete / restore — verified per entity

| Entity | Has soft-delete + restore? | Notes |
|---|---|---|
| Client | Yes | `clients.service.ts:138-174`. |
| Project | Yes | `projects.service.ts:207-267`. Does **not** cascade to Environments/Servers/Schedules. |
| Environment | Yes | `environments.service.ts:234-320`. Cascades: soft-deletes child Servers, hard-deletes their `credential_references`. Restore does **not** cascade-restore Servers (permanent asymmetry). |
| Server | Yes | `servers.service.ts:270-333`. Standalone soft-delete also hard-deletes its own `credential_references`. |
| Resource | Yes (metadata row only) | `resources.service.ts:508-546`. `resource_versions` history is never touched by delete or restore. |
| Person | Yes | `people.service.ts:213-287`. Cascades to disable (soft-delete)/restore a linked `users` row in the same transaction; does **not** touch `people_clients`. |
| Schedule | Yes | `schedules.service.ts:286-324`. No cascade — leaf entity (no table has an FK into `schedules.id`). |
| **CredentialReference** | **Hard-delete only, no restore** | `credentialReferences.service.ts:127-151` issues a real `DELETE`; no `deleted_at` column exists on the table (`001_init.sql:131-139`); no restore route exists (see CredentialReferences table above). |
| **ResourceVersion** | **No delete concept at all** | Append-only; no delete/restore route exists anywhere. |
| ActivityLog | No delete concept, DB-enforced | `001_init.sql:209-222` — `BEFORE UPDATE`/`BEFORE DELETE` triggers unconditionally raise; not even a hard-delete is possible through any path, including direct SQL, short of dropping the trigger. |

### `/v1`-free API convention

Confirmed accurate with no exceptions: every route is mounted at `/api/<resource>` directly
(`backend/src/app.ts:42-52`), and `backend/openapi.yaml`'s `servers` entry is `url: /`
(`openapi.yaml:11-13`, "Same-origin backend") — there is no version segment anywhere in the path
space, in any route file, or in the OpenAPI document.
