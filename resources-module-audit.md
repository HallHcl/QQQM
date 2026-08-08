# Resources Module Audit (Part 24 pre-work)

Audit-only. No code changes made. All claims below are sourced from direct reads of:
`backend/src/routes/resources.routes.ts`, `backend/src/services/resources.service.ts`,
`backend/src/validators/resources.validator.ts`, `backend/src/controllers/resources.controller.ts`,
`backend/src/db/migrations/001_init.sql`, `backend/src/__tests__/resources.test.ts`,
`frontend/src/api/generated/schema.d.ts`, `frontend/src/types/index.ts`,
`frontend/src/hooks/useResources.ts`, `frontend/src/hooks/useResourceVersions.ts`, and everything
under `frontend/src/features/resources/`.

No RBAC claim below is sourced from the RBAC matrix — every role gate is quoted directly from
`resources.routes.ts`.

---

## 1. Focus Area 1 — resources ↔ resource_versions relationship

**Route file structure**: there is no separate `resource_versions.routes.ts`. All version endpoints
are mounted under the same router as `resources.routes.ts`, nested under `/api/resources/:id/...`:

```
GET    /api/resources                    list()                 no role gate (any authenticated user)
POST   /api/resources                    create()                admin, member
GET    /api/resources/:id                getOne()                no role gate
PATCH  /api/resources/:id                updateMetadataHandler() admin only
DELETE /api/resources/:id                remove()                admin only
POST   /api/resources/:id/restore        restore()                admin only
GET    /api/resources/:id/versions       listVersionsHandler()   no role gate
GET    /api/resources/:id/versions/:versionId  getVersionHandler()  no role gate
POST   /api/resources/:id/versions       createVersionHandler()  admin, member
```

**Schema, verified from `001_init.sql`**:

`resources`:
```
id UUID PK
project_id UUID REFERENCES projects(id) ON DELETE CASCADE   -- nullable
type resource_type_enum NOT NULL
title TEXT NOT NULL
category TEXT                                                -- nullable, free text
tags JSONB NOT NULL DEFAULT '[]'
current_version_id UUID                                      -- FK to resource_versions, added as a
                                                               -- separate ALTER TABLE after the
                                                               -- resource_versions table exists
created_at, updated_at, deleted_at
```

`resource_versions`:
```
id UUID PK
resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE
version_number INT NOT NULL
content TEXT                                                  -- nullable
content_hash TEXT NOT NULL
external_url TEXT                                             -- nullable
file_path TEXT                                                -- nullable, currently always NULL —
                                                               -- no code path ever writes it (no
                                                               -- upload endpoint exists, see 4 below)
commit_message TEXT                                           -- nullable
author_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT
created_at TIMESTAMPTZ
UNIQUE(resource_id, version_number)
```

`resource_versions` has **no `updated_at` and no `deleted_at` column at all** — not omitted from an
otherwise-standard shape, genuinely absent from the table.

**`current_version_id` lifecycle — verified from `resources.service.ts`**:

- **Create is atomic, single request.** `createResource()` runs inside one `withTransaction`:
  insert `resources` row → compute `content_hash` → insert `resource_versions` row with
  `version_number = 1` → `UPDATE resources SET current_version_id = ...` → activity log — all in the
  same transaction. The function's own doc comment states the invariant explicitly: *"A resource row
  with no version must never be observable outside this function."* The frontend does **not** need to
  orchestrate two separate calls for initial creation — `POST /api/resources` accepts `content` /
  `external_url` / `commit_message` directly alongside the metadata fields and produces a fully-formed
  resource+v1 in one round trip. This is also declared explicitly in the generated schema's operation
  comment: *"Create a resource with its initial version (admin or member) — atomic: resource + v1 +
  activity log or nothing."*
- **Subsequent versions are a separate endpoint.** `POST /api/resources/:id/versions` is the only way
  to add version 2+; it also updates `current_version_id` to the new version and bumps
  `resources.updated_at`, in its own transaction.

**Immutability — confirmed.** Grep of `resources.routes.ts` shows no PATCH/PUT/DELETE route for
`/api/resources/:id/versions/:versionId` — only `GET` (single) and `POST` (create new) exist on that
path family. There is no service function that updates or deletes a row in `resource_versions`.
Combined with the missing `updated_at`/`deleted_at` columns, immutability is a real, structurally
enforced property, not just a convention.

**`content_hash` — computed backend-side, always.** `computeContentHash()` in `resources.service.ts`
runs `sha256` over `content ?? external_url ?? ""` server-side in both `createResource()` and
`createVersion()`. The `createResourceSchema` / `createResourceVersionSchema` validators (Zod) have no
`content_hash` field at all — the frontend has no way to submit one and never needs to. The service
file's own top-of-function comment states its purpose precisely: *"content_hash exists ONLY for
integrity verification, duplicate-content detection, and audit trail. It is never a lookup key,
identity, or unique constraint — resource_versions.id (UUID) is the sole identity for a version."*
There is no DB-level unique constraint on `content_hash` (confirmed from the migration — only
`UNIQUE(resource_id, version_number)` exists on that table), so nothing rejects a duplicate-content
version at the database layer.

**Duplicate-content signal that does exist**: `createVersion()` compares the new content's hash
against the *current* version's hash (not all prior versions) and returns a **non-blocking**
`{ version, warning: "Content identical to current version" }` in the `201` response body when they
match. This is a same-request advisory signal, not a hash-collision/dedup mechanism across the whole
history. The frontend hook `useCreateResourceVersion` explicitly unwraps `data.version` and drops
`warning` — the comment in the hook says why: *"warning fires when the new content is byte-identical
to the current version) — unwrapped here since nothing currently surfaces the warning in the UI."* So
today this signal is computed and returned by the API but is silently discarded by the frontend.

**Row-lock serialization — confirmed backend-only, no client-visible retry signal.**
`createVersion()` does `SELECT id, current_version_id FROM resources WHERE id = $1 ... FOR UPDATE`
before computing `MAX(version_number) + 1`. This blocks concurrent version-creation requests against
the same resource until the first transaction commits or rolls back; it does not raise a 409 or any
other conflict status for the client to react to — a concurrent caller simply waits (its query blocks
inside the transaction) and then proceeds with a correctly-computed next number. There is no
retry-needed status code or header anywhere in the route/controller/service for this path. Test 2 in
`resources.test.ts` (`[Test 2] concurrent version creation: 5 simultaneous requests get distinct
sequential version_numbers`) exercises exactly this and expects 5 successful 201s with sequential
numbers, not any 409s. Confirmed: zero frontend implication beyond a request that may sit slightly
longer under contention.

**Fetch-by-version_number**: does not exist. `GET /api/resources/:id/versions/:versionId` — verified
from `getVersion()` in the service — looks up by `resource_versions.id` (the UUID), not
`version_number`. There is no endpoint that accepts a version number in the URL. If a build ticket
wants "jump to v3" by number, the frontend must first resolve number→UUID via the list endpoint (which
does return `version_number` per row) before calling the detail endpoint.

**List-all-versions-for-a-resource**: exists — `GET /api/resources/:id/versions`, paginated
(`page`/`per_page`, standard `Pagination` shape), ordered `version_number DESC` (newest first),
returns `ResourceVersionSummary[]` (`id, version_number, commit_message, created_at, author`) —
**no `content` field**, by design (the service function's comment: *"Git-log-style: version_number,
author, commit_message, created_at — no content."*). Full content requires the separate per-version
`GET .../versions/:versionId` call.

---

## 2. Focus Area 2 — metadata vs. content, cleanly separated in the API

**Fields verified as living on `resources` (metadata)**: `id, project_id, type, title, category, tags,
current_version_id, created_at, updated_at, deleted_at`.

**Fields verified as living on `resource_versions` (content)**: `id, resource_id, version_number,
content, content_hash, external_url, file_path, commit_message, author_id, created_at`.

**PATCH is metadata-only, and this is actively enforced, not just conventional.** Two independent
layers block content from leaking into the metadata-update path:
1. `updateMetadataHandler()` in the controller checks the raw request body for
   `["content", "external_url", "file_path", "type"]` via `IMMUTABLE_METADATA_FIELDS` and throws a
   `400 VALIDATION_ERROR` naming the offending field **before** the Zod schema even runs, if present.
2. `updateMetadataSchema` (Zod) itself only defines `title`, `category`, `tags`, `updated_at` — it has
   no `content`/`external_url`/`type` fields to accept even if the controller check were bypassed.

So: **two distinct mutations are required**, confirmed — `PATCH /api/resources/:id` for metadata
(title/category/tags) and `POST /api/resources/:id/versions` for content. There is no conflation
anywhere in the current API. `type` is immutable after creation entirely (no endpoint changes it,
confirmed by its explicit presence in `IMMUTABLE_METADATA_FIELDS` and absence from
`updateMetadataSchema`) — worth flagging since this wasn't explicitly called out in the brief.

---

## 3. Focus Area 3 — resource type: real enum, with real type-specific validation

**It is a genuine Postgres enum**, not free text: `CREATE TYPE resource_type_enum AS ENUM
('runbook','sop','architecture','troubleshooting','faq','link','pdf')` (`001_init.sql:12`). Mirrored
exactly in the Zod validator's `RESOURCE_TYPES` const and in the generated schema's `ResourceType`.

This is **7 values**, not the 5 named in the project briefing (`link, runbook, sop, faq,
troubleshooting`) — the briefing's list omits `architecture` and `pdf`. Confirmed independently from
three sources (DB enum, Zod validator, generated schema) so this is solid, not a typo risk.

**Type-specific server-side validation is real and enforced twice** (schema `superRefine` in the
validator, and `assertTypeRequirements()` again in the service as defense-in-depth):
- `CONTENT_REQUIRED_TYPES = {runbook, sop, troubleshooting, faq}` — these 4 types require a non-empty
  `content` string; a request without it gets `400 VALIDATION_ERROR` with `field: "content"`.
- `type === "link"` requires `external_url`, and it must match `/^https:\/\/.+/` (enforced by the Zod
  validator's regex) — a non-https or missing URL gets `400` with `field: "external_url"`.
- `architecture` and `pdf` have **no type-specific requirement** — either `content` or `external_url`
  works for them (the only floor is `createResourceVersionSchema`'s generic `.refine()` that at least
  one of `content`/`external_url` must be present for version creation).

So a build ticket does need type-conditional form fields: `link` needs a URL input with https
validation, the 4 content-required types need content to be non-empty, and `architecture`/`pdf` are
unconstrained beyond "give me something." This validation applies identically at creation
(`POST /resources`) and at every subsequent version (`POST /resources/:id/versions`) — both routes run
through the same `assertTypeRequirements`/schema logic pattern, though note `type` itself can never
change after creation (see Focus Area 2), so a version can't switch a resource from `link` to
`runbook` requirements mid-history.

---

## 4. Focus Area 4 — existing frontend Resources UI, precise inventory

`frontend/src/features/resources/` contains:
- `ResourcesPage.tsx`
- `components/ResourceEditor.tsx`
- `components/ResourceFilterBar.tsx`
- `components/ResourceList.tsx`
- `components/VersionHistoryPanel.tsx` — **not mentioned in the project briefing, and not a dead
  shell.** This is real, working version-history UI that already exists.

### `ResourcesPage.tsx`
Master-detail layout: `ResourceList` (left) + selected-resource detail card (right) containing
`VersionHistoryPanel`. Uses `useResources(filters)` directly — **no `usePagination` hook**, no page
controls, no page-size control. The hook queries the API without `page`/`per_page` params at all, so
it silently gets the API's default (`page=1, per_page=20`) and there is no way in the current UI to
see resource #21 onward. This is a real, functional gap versus the established reference pattern
(Clients/Projects/Environments/Servers all drive their lists through `usePagination`).

There is **no delete or restore UI** anywhere in the Resources feature — no delete button, no
`ConfirmDialog` usage, no `deleted=true` view toggle, despite `useDeleteResource()` existing (unused)
in `useResources.ts` and `POST /:id/restore` existing on the backend. `restoreResource` is not called
from the frontend at all.

There is **no `RequireRole` gating** anywhere in the Resources feature files. The "New resource"
button and "Add version" button render unconditionally for any authenticated user, even though the
backend requires `admin` or `member` for both `POST /resources` and `POST /resources/:id/versions`,
and admin-only for `PATCH`/`DELETE`/`restore`. A `viewer`-role user would see fully-enabled
create/version buttons that 403 on submit — no gating, no disabled state, no explanatory copy.

### `ResourceEditor.tsx`
Single dialog component handling both `mode="create"` and `mode="new-version"` via a prop, not two
separate components. **Metadata-only fields (`title`, `type`, `project_id`, `category`) are correctly
shown only in `mode="create"`** — confirms the component already respects the metadata/content split
described in Focus Area 2, it does not let a "new version" submission touch metadata. Content fields
(`content`, `external_url`, `commit_message`) are shared between both modes. Does **not** offer
type-conditional required-field enforcement client-side (e.g. no visual indication that `content` is
required for `runbook` or `external_url` is required for `link`) — it relies entirely on the backend
400 response, with no visible surfacing of that validation error in the form (no error state rendering
was found in this component).

Uses `ProjectPicker` (the shared picker component, consistent with other modules' reference pattern).

### `ResourceFilterBar.tsx`
Search + type filter (hardcoded `RESOURCE_TYPES` array, duplicated from `ResourceEditor.tsx` rather
than imported from one shared source — both hardcode the same 7-value list independently) + `ProjectPicker`
with `includeAllOption`. No `deleted`-state filter (consistent with there being no restore/soft-delete
UI at all).

### `ResourceList.tsx`
Plain list, no pagination controls, renders `title`/`type` badge/`category`. Does not show
`current_version` info (author, version number, last-updated) even though `ResourceListItem` from the
API includes a `current_version` summary — that data is fetched but unused in this component.

### `VersionHistoryPanel.tsx` — real, working version-history UI
This is the component the briefing didn't know about. It:
- Calls `useResourceVersions(resourceId)` for the git-log-style list (no content), renders each as a
  `v{version_number}` badge + commit message + author + timestamp, with the highest `version_number`
  visually marked as HEAD (left border accent).
- On selecting an item, calls `useResourceVersion(resourceId, versionId)` to fetch full content for
  that specific version (a second network round-trip per selection, matching the API's two-tier
  list/detail shape).
- Renders `content` (as `<pre>`), `external_url` (as a link), or `file_path` (as inert text — dead
  weight today since nothing ever writes `file_path`, see below) depending on which is populated.
- Defaults to showing the newest version's content on load (`activeVersionId = selectedVersionId ??
  versions[0]?.id`, and the list is already sorted newest-first).

What it does **not** do: no diff between versions, no "restore this old version as current" action, no
pagination for the version list itself (fetches whatever the default page returns), no way to
copy/download a version's content, no display of the `content_hash` value anywhere in the UI.

### `useResources.ts` / `useResourceVersions.ts` — confirmed still legacy axios
Both hooks import `api` from `@/lib/api` (a plain axios instance) and hand-roll TypeScript interfaces
(`CreateResourceInput`, `ResourceVersionSummary`, etc.) rather than using `apiClient` +
`components["schemas"][...]` from the generated OpenAPI schema, the pattern `useServers.ts` (and
Clients/Projects/Environments) already use. This is exactly the "Part 22d note" legacy-axios debt
mentioned in the brief, confirmed still true. Concretely this means: no compile-time guarantee these
hooks match the real API shape (e.g. `CreateResourceInput.tags?: unknown[]` vs. the schema's
`tags?: string[]`), and no shared `unwrapApiResult` error handling.

**Full call-site inventory for `useResources`/`useResourceVersions`** (grepped across
`frontend/src`):
- `frontend/src/features/resources/components/ResourceEditor.tsx` — `useCreateResource`,
  `useCreateResourceVersion`
- `frontend/src/features/resources/components/ResourceFilterBar.tsx` — imports `ResourceFilters` type
  only
- `frontend/src/features/resources/components/VersionHistoryPanel.tsx` — `useResourceVersion`,
  `useResourceVersions`
- `frontend/src/features/resources/ResourcesPage.tsx` — `useResources`
- `frontend/src/features/environments/components/VpnResourcePicker.tsx` — **`useResources`**, a
  real cross-module consumer outside the Resources feature. This picker lets the Environments module
  select a resource as `environments.vpn_resource_id` (confirmed as a real column/flow by
  `resources.test.ts`'s `environments.vpn_resource_id` test block: *"can be set via PATCH
  /api/environments/:id and appears in the environment response"*). **Any change to
  `useResources`'s query shape, return shape, or migration to `apiClient` must account for this
  consumer**, the same way Servers' Focus Area 5 in the prior audit had to account for cross-module
  hook consumers.
- `useDeleteResource` — exported, zero call sites anywhere in the frontend.

No other file in `frontend/src` references `useResourceVersions`/`useResources`/`useCreateResource`/
`useUpdateResource`/`useDeleteResource`/`useCreateResourceVersion`.

**No dead/partial version-UI code exists elsewhere** — a repo-wide grep for `resource_versions`,
`version_number`, `content_hash`, `current_version_id` across `frontend/src` turns up matches only
within the files already inventoried above (`VersionHistoryPanel.tsx`, `useResourceVersions.ts`,
generated `schema.d.ts`, `types/index.ts`). Nothing hiding in another feature folder.

**`file_path` is dead on both ends today.** The column exists on `resource_versions`, the type surface
carries it end-to-end, and `VersionHistoryPanel.tsx` will render it if present — but no create/update
path ever writes a non-null value (`createResource`/`createVersion` in the service always insert
`NULL` for `file_path`; there is no upload endpoint). `useResourceVersions.ts` has an explicit comment
confirming this was deliberate: *"useUploadResourceVersion was removed: POST /resources/:id/upload no
longer exists on the backend (the file-upload flow was dropped when the Resources module was rebuilt —
see backend Part 14 notes)."* Any ticket should treat `file_path`/`pdf`-type file upload as
out-of-scope unless a new backend upload endpoint is explicitly planned.

---

## 5. Focus Area 5 — RBAC, verified directly from `resources.routes.ts`

| Action | Route | Role gate (verbatim from routes file) |
|---|---|---|
| List resources | `GET /api/resources` | none — any authenticated user |
| Get resource detail | `GET /api/resources/:id` | none — any authenticated user |
| **Create resource (metadata + v1 content, atomic)** | `POST /api/resources` | `requireAnyRole(["admin","member"])` |
| **Update resource metadata** | `PATCH /api/resources/:id` | `requireRole("admin")` — admin only |
| Soft-delete resource | `DELETE /api/resources/:id` | `requireRole("admin")` — admin only |
| Restore resource | `POST /api/resources/:id/restore` | `requireRole("admin")` — admin only |
| List versions | `GET /api/resources/:id/versions` | none — any authenticated user |
| Get one version | `GET /api/resources/:id/versions/:versionId` | none — any authenticated user |
| **Create new version (content)** | `POST /api/resources/:id/versions` | `requireAnyRole(["admin","member"])` |

**The briefing's "metadata PATCH is admin-only while version creation is admin+member" split is
confirmed exactly as stated**, verified directly from the routes file, not the matrix. The asymmetry
is real: a `member` can create a brand-new resource (which bundles metadata + v1 content in one
atomic call, admin+member gated) and can append new content versions to an existing resource
(admin+member gated), but **cannot rename/re-categorize/re-tag an existing resource** — that single
`PATCH` is admin-only. So `member`s can create and evolve content but not edit metadata after the
fact. This has a real UX consequence: a `member` who creates a resource with a typo'd title has no
self-service fix — only an admin can correct it. Worth flagging explicitly to whoever scopes the
create/edit forms, since it means the "create" form (member-accessible) and any future "edit metadata"
affordance (admin-only) are not just RBAC-gated variants of the same form in terms of who can reach
them, matching the pattern `ResourceEditor.tsx` already partially reflects (its `mode="create"` fields
are metadata, but the component doesn't gate on role at all today, see Focus Area 4).

Also confirmed: `resource_versions` itself has **no independent RBAC surface** beyond the two routes
above — there's no separate "who can view an old version's content" restriction; anyone authenticated
who can see the resource can see all its version history and content.

---

## 6. Focus Area 6 — optimistic locking / 409 reality

**`resources` (metadata) — yes, standard pattern, verified.** `updateMetadataSchema` requires
`updated_at: z.string().min(1)`, and `updateMetadata()` in the service does the same
millisecond-truncated compare-and-swap every other module uses:
```sql
WHERE id = $1
  AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
  AND deleted_at IS NULL
```
A stale `updated_at` produces `0` matched rows → `409 CONFLICT` with message *"Resource was modified by
someone else; refresh and try again."* Confirmed by a dedicated regression test in
`resources.test.ts`: *"returns 409 CONFLICT when updated_at is stale (millisecond-precision regression
test)."* So metadata PATCH needs the same `useConflictResolution`/`ConflictState.tsx` treatment as
every other module's edit form.

**`resource_versions` — no optimistic lock, and correctly so; a 409 is structurally not possible
here, verified from the service code, not assumed.** `createVersion()` takes no `updated_at` (or any
version-identifying field) as input at all — `createResourceVersionSchema` only has
`content`/`external_url`/`commit_message`. There is nothing to go stale: every call to
`POST /resources/:id/versions` is an unconditional append, and the row-lock (`SELECT ... FOR UPDATE`
on the parent `resources` row) is what prevents two concurrent appends from computing the same
`version_number` — it serializes them into two sequential successful versions rather than rejecting
either one. **The only 409 that exists in this whole module outside metadata PATCH is on
`restore`**, and it represents an unrelated business-rule check, not optimistic locking: `restoreResource()`
throws `409 CONFLICT "Resource is not deleted"` if you try to restore something that isn't currently
soft-deleted (confirmed by the test *"restores a deleted resource (200); restoring again returns 409
CONFLICT"*). So: no `updated_at`/conflict-resolution UI is needed anywhere in the versioning flow —
confirmed absence, not oversight, the same caution the brief asked to apply here that Part 23d applied
to CredentialReference's missing `updated_at`.

---

## 7. Standard sections

**API shape mismatches**: none of real consequence found beyond what's noted above (the type-count
discrepancy in the briefing itself, Focus Area 3). The generated `schema.d.ts` types match the backend
Zod validators and DB enum exactly for this module.

**Missing frozen-spec behavior**:
- Pagination: backend fully supports it (`page`, `per_page` up to 100, `sort`, `order`) on both
  `GET /resources` and `GET /resources/:id/versions`; frontend uses neither — no `usePagination`
  integration anywhere in this feature (Focus Area 4).
- Soft-delete/restore for `resources`: backend fully implements it (`deleted_at`, `deleted` query param
  with `false`/`true`/`all` modes, restore endpoint, 409-on-double-restore); **zero frontend UI**
  exists for delete, restore, or viewing deleted resources.
- `resource_versions` correctly has **no soft-delete at all** — no `deleted_at` column, no delete
  route, consistent with immutable/append-only design. Confirmed, not assumed.

**State management**: `useResources`/`useResourceVersions` are the only two hooks in the audited
modules still on legacy axios (`@/lib/api`) with hand-rolled types rather than `apiClient` +
generated-schema types. React Query cache keys look reasonable (`["resources", ...]`,
`["resourceVersions", resourceId, versionId]`) and invalidation on mutation success looks correct
(`useCreateResourceVersion` invalidates both its own key and `["resources", resourceId]` so the parent
resource's `current_version` summary refreshes too).

**Foundation gaps** (same checklist as prior audits):
- No `RequireRole` gating on any Resources UI action (create resource, add version, and — if built —
  metadata edit/delete/restore would all need it; today create/add-version render for everyone).
- No `ConfirmDialog` usage (no delete/restore UI exists to need one yet).
- No `usePagination` integration.
- No `ConflictState`/`useConflictResolution` integration (no metadata-edit UI exists yet to need it —
  only the create/new-version dialog exists, and neither of those paths carries `updated_at`).
- Legacy axios data layer, not `apiClient`.
- Duplicated `RESOURCE_TYPES` array (hardcoded independently in both `ResourceEditor.tsx` and
  `ResourceFilterBar.tsx`) rather than a single shared source — minor, but worth folding into whatever
  ticket touches either file.

---

## Prioritized punch list

### A. Mechanical reuse — follows established patterns from Clients/Projects/Environments/Servers
1. Migrate `useResources.ts`/`useResourceVersions.ts` off legacy axios onto `apiClient` +
   `components["schemas"][...]` generated types — audit the `VpnResourcePicker.tsx` cross-module call
   site as part of this, not after.
2. Wire `usePagination` into `ResourcesPage.tsx`/`ResourceList.tsx` for the resources list (backend
   already supports `page`/`per_page`/`sort`/`order` — pure frontend work).
3. Build metadata-edit UI (`PATCH /resources/:id`) using the same `useConflictResolution` +
   `ConflictState.tsx` pattern as every other module — this is a plain optimistic-locking form, no
   different in shape from Clients/Projects/Environments/Servers' edit forms. Gate it `admin`-only via
   `RequireRole`.
4. Build soft-delete + restore UI (`DELETE` / `POST /:id/restore`) using the established
   `ConfirmDialog` pattern, gated `admin`-only, plus a `deleted` filter/toggle in
   `ResourceFilterBar.tsx` mirroring other modules' deleted-item views.
5. Add `RequireRole(["admin","member"])` gating to the existing "New resource" and "Add version"
   buttons in `ResourcesPage.tsx` — currently ungated, will 403 on submit for `viewer` users today.
6. Wire client-side type-conditional required-field hints into `ResourceEditor.tsx` (content required
   for runbook/sop/troubleshooting/faq; https external_url required for link) — mirrors backend
   validation that already exists; currently the form has no visible enforcement or error-surfacing
   for these 400s.
7. Dedupe the hardcoded `RESOURCE_TYPES` array between `ResourceEditor.tsx` and
   `ResourceFilterBar.tsx` into one shared constant.

### B. Genuinely novel — versioning-specific, no reference module precedent
8. Decide what to do with the currently-discarded `warning: "Content identical to current version"`
   signal from `POST /:id/versions` (see Open Design Questions below).
9. Decide whether/how to extend `VersionHistoryPanel.tsx` (already functional today for
   list+view-content) with anything beyond its current read-only capability — it has no diff view, no
   "restore an old version as current," no content_hash display, no version-list pagination.
10. Decide whether `file_path`/file-upload support for `pdf`-type resources is in scope at all — no
    backend endpoint exists for it currently (deliberately removed per Part 14 notes).

---

## Open Design Questions for Versioning UI — Requires User Decision Before Build

These are unresolved by the audit and need a human decision before Part 24d (or whichever ticket
touches version-creation/history UI beyond what already exists) can be scoped:

1. `VersionHistoryPanel.tsx` already exists and is functional (list + select + view full content of
   any historical version). Is the ask for 24d to **replace/redesign** this, **extend** it, or is it
   considered done and out of scope? The briefing's framing assumed this UI didn't exist yet.
2. The backend returns a `warning` field on `POST /:id/versions` when new content byte-matches the
   current version's content — today the frontend hook silently discards it. Should this be surfaced
   to the user at all (e.g. a confirmation step, a toast, a blocking prompt), and if so, at what point
   in the creation flow (before submit vs. after the 201 response arrives)?
3. Should creating a new version require re-entering the full content from scratch, or should the form
   pre-fill with the current version's content for the user to edit? (No diffing capability exists
   anywhere in the stack today — this is a pure UI/UX decision, not something the API shape forces
   either way.)
4. Is a diff-between-versions view in scope for this phase, or explicitly deferred? (Confirmed nothing
   in the API or frontend does this today — would be new surface area either client-side or requiring
   a new backend capability.)
5. Should there be a way to "restore" an old version as the new current version (effectively:
   re-submit an old version's content as a fresh version)? No such affordance exists today; the backend
   has no dedicated endpoint for it (it would just be a `POST /:id/versions` call pre-filled with old
   content) — is that considered sufficient, or does it need explicit UI framing (e.g. "revert to
   v3")?
6. Should `content_hash` ever be shown to users (e.g. for manual integrity verification), or is it
   purely an internal/audit concern that should stay invisible in the UI? Nothing in the current
   `VersionHistoryPanel.tsx` surfaces it.
7. Where should version history live in the eventual information architecture — inline on a resource
   detail view/page (as it is today, embedded in `ResourcesPage.tsx`'s master-detail layout), or its
   own route (e.g. `/resources/:id/versions`)? This affects whether 24d is scoped as "improve the
   existing panel" or "build a new page."
8. Given `member`s can create resources and new versions but cannot edit metadata (admin-only), should
   the create form and any future metadata-only edit form be visually/structurally distinguished in a
   way that make this asymmetry legible to users, or is a plain role-based button-disable sufficient?

---

## Suggested sub-part breakdown

This is a first-pass split, offered with the explicit caveat that 24d specifically may need further
splitting (e.g. 24d.1 / 24d.2) once the versioning UI questions above are answered by the user — the
scope of "versioning work" is not yet fixed.

- **24a — Resources list + metadata CRUD + RBAC gating** (mechanical reuse items 1, 2, 5, 7 above):
  migrate off legacy axios, wire `usePagination`, add `RequireRole` gating to existing buttons, dedupe
  the type constant.
- **24b — Resources metadata edit + soft-delete/restore** (mechanical reuse items 3, 4, 6): the
  `PATCH`/`DELETE`/`restore` UI with `ConflictState`/`ConfirmDialog`, plus client-side type-conditional
  validation hints on the create form.
- **24c — Version-creation UX decisions** (depends entirely on answers to Open Design Questions 2, 3,
  5, 8 above): whatever the "add a new version" flow becomes once pre-fill/warning-surfacing/revert
  behavior is decided.
- **24d — Version history UI** (depends on answers to Open Design Questions 1, 4, 6, 7): scope is
  currently unclear because a working version-history panel already exists — this ticket may turn out
  to be "leave it, minor polish only" or "significant redesign," which can't be determined until the
  user weighs in. Likely to split further once that's known.
