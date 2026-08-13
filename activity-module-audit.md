# Activity Module Audit (Activity Logs — Read-Only Audit Trail)

Audit-only. No code was modified, refactored, or fixed. All RBAC claims are
sourced directly from `backend/src/routes/activityLogs.routes.ts` and
`backend/src/app.ts`, never from the RBAC matrix (which prior module audits
found unreliable).

---

## 0. Framing check — is Activity actually "purely read-only"?

**Holds, with one nuance worth flagging explicitly.** There is no
`POST /api/activity-logs`, no controller write function, no RBAC-gated
mutation of any kind — `activityLogs.service.ts` literally has a comment
stating "No write functions exist in this module by design" (service, lines
4-6). The DB trigger (`001_init.sql:209-222`) blocks `UPDATE` and `DELETE`
unconditionally at the table level, independent of the API.

The nuance: writes to `activity_logs` **do** happen through the API, just
never through *this* module's own routes — every other module's
create/update/delete/restore controller or service inserts a row via
`logActivity()` (`backend/src/middleware/activityLogger.ts`) inside the same
DB transaction as the entity mutation. So "Activity has no write UI" is
correct; "Activity never receives writes" is not — it receives one on nearly
every mutation anywhere else in the app. This matches the briefing's framing
exactly; flagging only because "read-only from the frontend's perspective"
and "never written to" are two different claims and the ticket should be
scoped against the first, not the second.

---

## 1. Focus Area 1 — the `activity_logs` schema and what it actually records

**Exact schema** (`backend/src/db/migrations/001_init.sql:196-207`):

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type_enum NOT NULL,
  entity_id UUID NOT NULL,
  action activity_action_enum NOT NULL,
  changed_by UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
```

TypeScript mirror at `backend/src/types/index.ts:205-214` matches exactly
(`id, entity_type, entity_id, action, changed_by, old_value, new_value,
created_at`). No `updated_at`/`deleted_at` — correct, since the table is
append-only and has no soft-delete concept of its own.

### `changed_by` — verified FK target and population consistency

- FK target: `changed_by UUID NOT NULL REFERENCES people(id) ON DELETE
  RESTRICT` (`001_init.sql:201`). Confirmed **`people.id`, never `users.id`**
  — matches the briefing exactly. `ON DELETE RESTRICT` means a `people` row
  that has ever acted can never be hard-deleted while its log rows exist
  (people only ever soft-delete anyway, per `people.service.ts`, so this is
  latent, not live).
- Population path, checked at both call-site layers named in the ticket:
  - **Controller layer (Clients)**: `clients.controller.ts:57` —
    `const changedBy = requireChangedBy(req);` then passed straight into
    `logActivity(...)`.
  - **Service layer (everywhere else)**: e.g. `people.service.ts`,
    `environments.service.ts`, `projects.service.ts`, `schedules.service.ts`,
    `servers.service.ts`, `resources.service.ts`, `credentialReferences.service.ts`
    all take an `actingPeopleId: string` parameter that their respective
    controllers populate via the same `requireChangedBy(req)` helper
    (`backend/src/utils/requestContext.ts:4-12`) before calling the service.
  - **Result: identical source of truth regardless of layer** —
    `requireChangedBy()` is the single choke point, it reads
    `req.user.peopleId` (set by the `auth` middleware from the JWT payload)
    and throws a 403 if the authenticated user has no linked `people` row.
    No inconsistency found between the Clients (controller-layer) pattern and
    every other module's (service-layer) pattern.
  - One additional, previously-unlisted call site: `auth.controller.ts:108-115`
    logs `"user"` / `"update"` on password change, also via
    `requireChangedBy(req)` — same rule, no exception.

### Diff payload — confirmed present, field-level, not just an event marker

`old_value JSONB` / `new_value JSONB` store full snapshots (not a computed
diff) of the entity **before** and **after** the mutation:

- Create: `old_value = null`, `new_value` = the full created row
  (e.g. `clients.controller.ts:61`).
- Update: `old_value` = the full pre-update row, `new_value` = the full
  post-update row (e.g. `clients.controller.ts:89`, `environments.service.ts:211`).
- Delete (soft): `old_value`/`new_value` are both full rows, differing at
  minimum in `deleted_at` (verified by `activityLogs.test.ts:387-416`, which
  asserts `new_value.deleted_at` is a timestamp and `old_value.deleted_at`
  is null on a server soft-delete).
- Restore: same shape, inverse of delete, and confirmed to be a **separate
  log row** from the delete row, not a mutation of it (`activityLogs.test.ts:417-432`).

This means the frontend has everything it needs to compute a field-level
diff (compare `old_value[k]` vs `new_value[k]` for every key), but the API
does **not** pre-compute or ship a diff — it's two full JSON object
snapshots, and the frontend would have to do the diffing itself if it wants
to show "what changed" rather than "before/after blobs." See Open Design
Questions.

### `entity_type` / `entity_id` — enum, not free string; verified 1:1 mapping

`entity_type_enum` (`001_init.sql:4-7`):
```
'client','project','environment','server','credential_reference',
'people','resource','resource_version','schedule','user'
```
This is a genuine Postgres enum (not a free string) and matches
`EntityType` in `backend/src/types/index.ts:1-11` exactly, 10 values.

It maps 1:1 to the app's module names with two naming deviations worth
flagging for anyone building filter UI:
- The people module's entity type is `"people"`, not `"person"`.
- There is a 10th value, `"user"`, that has **no corresponding sidebar
  module** — it exists purely for auth-adjacent events (password changes,
  and `people.service.ts:240,282` disabling/re-enabling the linked user
  record on person soft-delete/restore). A filter UI built only from the
  visible module list would miss this value.

**Junction-table actions have no dedicated entity_type** — confirmed by
reading actual call sites, not inferred:
- `projectPeople.service.ts:83,118` (adding/removing a person from a
  project's roster) logs as `entity_type: "project"`, `entity_id:
  projectId`, `action: "update"` — the junction change is folded into the
  parent Project's history, not logged as its own entity.
- `people.service.ts:334,361` (linking/unlinking a person to a client) logs
  as `entity_type: "people"`, `entity_id: peopleId`, `action: "update"` —
  folded into the parent Person's history.

So `ProjectPerson`/`PersonClient` junction actions are real, logged events,
but they surface as an `"update"` on the parent entity, indistinguishable in
`entity_type`/`action` alone from an ordinary field edit — only the
`old_value`/`new_value` shape (a person/link object rather than the parent's
own columns) would tell them apart. Relevant if a future "history for this
record" view wants to render junction changes distinctly from field edits.

`Resource` vs `ResourceVersion` **are** distinct entity types and log
distinctly, confirmed by `activityLogs.test.ts:434-474` (a resource metadata
PATCH logs as `entity_type: "resource"`; creating a new version logs as
`entity_type: "resource_version"`, `entity_id` = the new version's own id).

---

## 2. Focus Area 2 — filtering and querying capability

**Actual, live filter support**, verified by reading `activityLogs.controller.ts:4-27`
directly (not the validator — see the dead-validator finding below, this is
what the controller *actually* parses and the service actually applies):

| Param | Behavior |
|---|---|
| `page` | integer, min 1, default 1 |
| `per_page` | integer, 1–100, default 20 |
| `order` | `asc`/`desc` (case-insensitive), default `desc` |
| `entity_type` | free string passthrough (see validator note) |
| `entity_id` | free string passthrough |
| `action` | free string passthrough |
| `changed_by` | free string passthrough |
| `from` | string, `created_at >= from` |
| `to` | string, `created_at <= to` |
| `sort` | **accepted by neither the controller nor the query builder** — the controller doesn't even read `req.query.sort`; the service always `ORDER BY al.created_at` (`activityLogs.service.ts:83`). Confirms the already-known "dead sort param" finding, and clarifies it further: this isn't a case of "the validator allows `sort` but the service ignores the value" — the controller layer doesn't parse `sort` from the querystring at all. It's inert two layers deep. |

**All filters are AND-combined**, built dynamically in
`activityLogs.service.ts:32-65` as parameterized SQL conditions.

### "All activity for one specific record" — yes, directly supported

`GET /api/activity-logs?entity_id={id}` alone (no `entity_type` needed,
since `entity_id` is a UUID that's effectively unique across entity types in
practice) returns the complete, correctly-ordered history for one record.
Verified functionally by `activityLogs.test.ts` tests `[2]`, `[6]`, `[7]`
(filtering, ordering, and pagination all exercised against a single
`entity_id`). **No dedicated `/entities/:type/:id/activity` endpoint exists
or is needed** — the existing global list endpoint already supports this via
query params. This means a future "view history for this record" link from
any other module's detail page is a client-side-only addition (link to
`/activity?entity_id=X`, or a filtered fetch) — no backend work required.
Confirmed not built today: see Focus Area 3, no such link exists anywhere in
the frontend currently.

### Append-only trigger — precise scope, verified from the migration

`001_init.sql:209-222`:
```sql
CREATE OR REPLACE FUNCTION prevent_activity_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_logs_block_update
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_log_mutation();

CREATE TRIGGER trg_activity_logs_block_delete
  BEFORE DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_log_mutation();
```
Two separate `BEFORE` triggers, one per operation, both `FOR EACH ROW`, both
unconditional (no `WHEN` clause) — blocks **all** `UPDATE`s and **all**
`DELETE`s on the whole table, no exceptions, no role bypass. `INSERT` is
unaffected (correctly — this is how every other module writes to it).
Directly confirmed at runtime by `activityLogs.test.ts` tests `[8]`, `[9]`,
`[10]` (direct SQL `UPDATE`/`DELETE` both throw `/append-only/i`; direct
`INSERT` succeeds).

---

## 3. Focus Area 3 — existing frontend UI inventory

`frontend/src/features/activity/` **is not empty** — a real, working (if
minimal) list view survives from the original scaffold:

- **`ActivityPage.tsx`** (58 lines) — renders a page header, one `<Select>`
  filter (entity type only, hardcoded 10-value list mirroring the enum), and
  delegates to `ActivityTimeline`. Calls `useActivityLogs({ entityType })`
  with no pagination, no other filters wired up.
- **`components/ActivityTimeline.tsx`** (53 lines) — a vertical timeline:
  colored dot + action badge + entity type + timestamp + raw entity UUID per
  row. Renders `log.action`, `log.entity_type`, `log.created_at`,
  `log.entity_id`. **Does not render `changed_by_person`, `old_value`, or
  `new_value` anywhere** — the "who did it" and "what changed" data the API
  provides is fetched but never displayed.
- **`hooks/useActivityLogs.ts`** — **confirmed legacy axios**, not migrated.
  Uses `@/lib/api` (raw `axios.create` instance, `frontend/src/lib/api.ts`)
  directly, not the generated `apiClient`/`unwrapApiResult` pattern every
  reference module (`useSchedules.ts`, `useResources.ts`, etc.) now uses.
  Only supports `entityType`, `entityId`, `from`, `to` as filters — no
  `action`, `changed_by`, `page`, `per_page`, or `order`, despite all of
  those being live, working backend query params (Focus Area 2). Also
  discards the pagination envelope: `queryFn` returns `data.data` only,
  throwing away `data.pagination` — so no caller can ever know if there are
  more rows than the first page.
- **No `useActivityLogs.test.ts`/`.test.tsx` exists** — every other migrated
  hook (`useSchedules.test.tsx`, `useResources.test.tsx`, etc.) has a
  co-located test file; this one has none. Same for the page: no
  `ActivityPage.test.tsx`, where `SchedulePage.test.tsx` exists for the
  reference module. **Zero test coverage on the entire frontend Activity
  surface today.**

### Type gap: hand-rolled `ActivityLog` type is missing a required API field

`frontend/src/types/index.ts:190-199` defines `ActivityLog` with `id,
entity_type, entity_id, action, changed_by, old_value, new_value,
created_at` — but **omits `changed_by_person`**, which the actual API
response always includes (`ActivityLogListResponse` schema,
`backend/openapi.yaml:1045-1055`, marked `required`; also returned by
`activityLogs.service.ts:88-92` unconditionally via an inner `JOIN` on
`people`, so it's never null/absent). The generated schema
(`frontend/src/api/generated/schema.d.ts:1008-1020`) has the correct, full
shape including `changed_by_person`. The hand-rolled type is what
`ActivityTimeline.tsx` and `OverviewPage.tsx` actually import and use — this
is very likely *why* neither ever renders who made a change: the type they
compile against doesn't expose it, even though the JSON on the wire always
has it.

### Query-key collision risk between the two existing consumers — checked, benign

Both `ActivityPage.tsx` (`useActivityLogs({ entityType })`) and
`OverviewPage.tsx` (`useActivityLogs()`, no args) use query key
`["activityLogs", filters]`. React Query's default key hashing is a
stable `JSON.stringify`, which drops `undefined`-valued properties — so
`{}` and `{ entityType: undefined }` hash identically. No cache collision
bug results today, but it's incidental (an artifact of how `undefined` keys
serialize), not a designed-in behavior — worth knowing if either caller's
default filter shape ever gains a non-`undefined` default.

### Existing "recent activity" consumer, confirmed: `OverviewPage.tsx`

`frontend/src/features/overview/OverviewPage.tsx:19,33,35,97-122` calls
`useActivityLogs()` with **no filters at all** and renders
`activity.slice(0, 10)` as a "Recent activity" card (action + entity type +
relative timestamp, via `date-fns`' `formatDistanceToNow`). This is a real,
working cross-feature consumer that any Activity module rebuild must not
break — same pattern as prior audits finding unexpected picker/hook
consumers in other modules. Because the hook throws away pagination and
defaults to `page=1, per_page=20, order=desc` server-side, this card is
implicitly "the 10 most recent activity rows system-wide" — correct today
by coincidence of defaults, not by explicit intent in `OverviewPage.tsx`.

No other consumer of `useActivityLogs` or `/activity-logs` exists anywhere
in the frontend (`grep` confirmed only `ActivityPage.tsx`,
`OverviewPage.tsx`, `useActivityLogs.ts`, and the generated schema file
reference it). No other module's hooks invalidate or reference an
activity-related query key — confirmed via search, none of `useClients.ts`,
`useProjects.ts`, `useServers.ts`, etc. touch `["activityLogs", ...]` on
their own mutations' `onSuccess`. This is expected (mutations don't need to
invalidate a log they don't own) but was worth checking, since a fresh build
might reasonably assume mutation hooks *should* invalidate Activity and
introduce that coupling — no precedent for it exists today, and none is
needed given Activity's own list will simply refetch on its own polling/
mount cadence like every other list view.

---

## 4. Focus Area 4 — RBAC, verified directly from route files

`backend/src/routes/activityLogs.routes.ts` (full file, 9 lines):
```ts
const router = Router();
router.get("/", list);
export default router;
```
No `requireRole` anywhere in this file — the only gate is whatever is
applied when the router is mounted. `backend/src/app.ts:52`:
```ts
app.use("/api/activity-logs", auth, activityLogsRoutes);
```
`auth` (`backend/src/middleware/auth.ts:12-38`) does exactly one thing:
validates the JWT and populates `req.user`. It performs no role check.

**Verified role table:**

| Role | `GET /api/activity-logs` |
|---|---|
| admin | ✅ full access, all filters |
| member (or any other authenticated, non-admin role) | ✅ full access, all filters — identical to admin |
| unauthenticated | ❌ 401 |

**No read-side filtering or redaction by role exists anywhere in the
request path.** Traced the full chain: controller
(`activityLogs.controller.ts`) never reads `req.user.roles`; service
(`activityLogs.service.ts`) never references `req.user` at all (it isn't
passed a user object, only the parsed query params) and builds its `WHERE`
clause purely from client-supplied filters. This directly answers the
ticket's genuinely-novel question: **yes, a `member` can see activity logs
for actions on entities/fields they could not themselves perform or might
not otherwise have list/detail access to** — e.g. an `admin`-only client
hard-delete-adjacent action, a password change event (`entity_type:
"user"`), or a credential reference mutation, are all visible in full
(including `old_value`/`new_value` payloads) to every authenticated user
regardless of role. This is a read-visibility characteristic of the current
backend, not a bug introduced by any prior module — flagging it because the
ticket specifically asked, and because it's a materially different question
from every other module's RBAC audit (which were all about write gates).

`requireRole` is defined in `backend/src/middleware/rbac.ts` and used
elsewhere for `admin`-gated writes (e.g. `clients.routes.ts:16,19,20`) —
confirmed it exists and works as a pattern, just isn't applied here. Given
there are no write endpoints on this router, `RequireRole` is correctly
**N/A** for any frontend UI in this module — there is no admin-only action
to gate.

---

## 5. Focus Area 5 — pagination and scale

Pagination is **enforced, not optional**, at the API level:
`per_page` is clamped `1–100` server-side
(`activityLogs.controller.ts:6-9`, `Math.min(100, Math.max(1, ...))`) — a
caller cannot request an unbounded page size. Default is 20 rows.

This table is written to by every create/update/delete/restore across
Clients, Projects, Environments, Servers, CredentialReferences, Resources,
ResourceVersions, People, ProjectPeople (via Project), PersonClients (via
People), Schedules, and password-change/user-disable events — confirmed by
the full `logActivity()` call-site grep in Focus Area 1, 38 call sites
across 9 files. This is very likely the highest-row-count table in the
system, as the briefing assumes, though no row-count data was available to
confirm quantitatively (out of scope for a static audit).

**Indexes present** (`001_init.sql:206-207`):
- `idx_activity_logs_entity ON activity_logs(entity_type, entity_id)` —
  directly serves the `entity_type=`/`entity_id=` filter combination used
  for "history for one record" lookups.
- `idx_activity_logs_created ON activity_logs(created_at)` — serves the
  default (and only) sort/order, and the `from`/`to` range filters.

No composite index covering `(entity_id, created_at)` together — the
`entity_id` filter and the `ORDER BY created_at` in a per-record history
query would use the entity index for the filter and likely a sort step (or
the created_at index) rather than a single covering index walk. Not
necessarily a real problem at current scale, and out of scope to fix in an
audit, but worth naming since it's the exact query shape ("all activity for
this one record, most recent first") the ticket asks about enabling from
other modules' detail pages.

No index on `changed_by` — the `changed_by=` filter (confirmed live and
tested, `activityLogs.test.ts:190-208`) would do a full scan of whatever
rows survive the other filters. Low risk today since `changed_by` is
typically combined with `entity_id` in practice, but noted for completeness
per the ticket's ask about performance-relevant migration details.

---

## 6. Standard sections

### API shape mismatches

- **Validator (`activityLogs.validator.ts`) is entirely dead code**, not
  just the `sort` field as previously known. `listActivityLogsQuerySchema`
  is defined but never imported anywhere else in the backend (confirmed by
  project-wide grep — zero references outside its own file). The controller
  hand-parses every query param itself
  (`activityLogs.controller.ts:4-27`) with no call to `.safeParse()` or
  `.parse()` against this schema, unlike the Zod-validated create/update
  paths on every other module (e.g. `clients.controller.ts:52`,
  `createClientSchema.safeParse(req.body)`). Practical consequence: `page`/
  `per_page` are coerced defensively in the controller (`parseInt` with
  fallback), but `entity_type`, `action`, `entity_id`, and `changed_by` are
  passed through as **raw, unvalidated strings** straight into a
  parameterized SQL `WHERE` clause. This is not a SQL-injection risk (values
  are parameterized, never interpolated), but it does mean, e.g., an invalid
  `entity_type=foo` silently returns zero rows rather than a 400, and
  `entity_id`/`changed_by` aren't checked to even look like UUIDs before
  hitting the query planner — different behavior from what the validator
  (and the OpenAPI spec, which documents `entity_type` as a closed enum and
  `entity_id`/`changed_by` as `format: uuid`) implies. A frontend built
  strictly against the OpenAPI contract will behave correctly on valid
  input; the mismatch only surfaces on malformed input, where the real API
  is silently lenient rather than rejecting with 400.
- Otherwise, the OpenAPI spec (`backend/openapi.yaml:4429-4520`,
  `ActivityLogListResponse`/`ActivityLog` schemas at lines 1008-1083) and
  the generated TS types (`schema.d.ts`) accurately reflect the controller's
  real, hand-parsed behavior for every param except `sort` (documented as
  accepted; actually silently ignored, per Focus Area 2) and the
  looseness just described.

### Missing frozen-spec behavior

None found. Every documented filter, the pagination envelope shape, the
`changed_by_person` join, and the append-only guarantee all behave exactly
as the OpenAPI spec and migration describe, with the one caveat above
(`sort` is accepted-but-inert, already flagged in both the briefing and this
audit).

### State management

- `useActivityLogs.ts` is a single `useQuery`, no mutations (correctly —
  there's nothing to mutate). No `useMutation`, no `queryClient.invalidateQueries`
  calls exist or are needed in this module.
- Query key `["activityLogs", filters]` is a plain object, hashed
  structurally by React Query — confirmed benign today (see Focus Area 3),
  but a rebuilt hook should key on the same explicit param shape the
  generated client expects (`page, per_page, sort, order, entity_type,
  entity_id, action, changed_by, from, to`) rather than the current
  4-field subset, both for correctness and so the cache key reflects every
  param that actually affects the response.
- No optimistic updates, no conflict resolution (`useConflictResolution`)
  applicability — correctly absent, matches the read-only framing.

### Foundation gaps (same checklist as every prior audit)

| Item | Status |
|---|---|
| `RequireAuth` | Present — Activity route sits inside the top-level `<Route element={<RequireAuth />}>` wrapper in `AppRoutes.tsx:25`, same as every other module. Correct, nothing module-specific needed. |
| `RequireRole` | **N/A, confirmed** — no write actions exist on this module for any role to be gated from (Focus Area 4). |
| `LoadingState`/`EmptyState`/`ErrorState` | **Not used.** `ActivityPage.tsx` hand-rolls a bare `isLoading ? <p>...</p> : ...` and `ActivityTimeline.tsx` hand-rolls its own empty-state paragraph. Neither imports the shared `frontend/src/components/state/{LoadingState,EmptyState,ErrorState}.tsx` components that reference modules use. No error state is handled at all — a failed fetch has no visible UI feedback. |
| `usePagination` | **Not used and not wired.** The shared hook (`frontend/src/hooks/usePagination.ts`) exists, is documented as "not wired into any page yet," and remains true for Activity specifically — `ActivityPage.tsx` has no page/per_page state, no next/prev controls, nothing. Given Focus Area 5's scale argument, this is the single largest concrete gap in the current UI: today's page can only ever show the most recent (up to) 20 rows, full stop, with no way to see anything older. Note `usePagination`'s `deleted: DeletedFilter` field is not applicable to Activity (no `deleted_at` on this table) — a rebuild should use the hook's `page`/`per_page`/`sort`/`order` pieces and ignore/omit `deleted`. |
| generated `apiClient` | **Not used** — confirmed legacy `axios` via `@/lib/api`, detailed in Focus Area 3. |

---

## Prioritized punch list

**Does this module break the "simplest remaining module" expectation?**
No — confirmed. There is genuinely no CRUD, no RBAC-gated write action, no
optimistic locking, and no cascade behavior belonging to this module itself.
Every finding above is either (a) a frontend migration gap identical in kind
to what every prior module needed (legacy axios → generated client,
missing shared state components, missing pagination wiring, missing tests),
or (b) a pre-existing backend looseness (dead validator, no read-side RBAC
filtering) that is out of scope to fix here and doesn't change the shape of
the frontend work. Nothing found requires new backend work, new database
migrations, or introduces any write-path complexity. The module is exactly
as mechanically simple as the briefing expected — the punch list below is a
migration checklist, not a design problem.

1. **Migrate `useActivityLogs.ts` to the generated `apiClient` pattern**,
   matching `useSchedules.ts`'s shape (`apiClient.GET("/api/activity-logs",
   { params: { query: {...} } })` + `unwrapApiResult`). Expose the full
   param set (`page, per_page, order, entity_type, entity_id, action,
   changed_by, from, to`) — every one of these is a live, working, tested
   backend filter today; the current hook only exposes 4 of them for no
   documented reason.
2. **Wire `usePagination`** into `ActivityPage.tsx` — this is the change
   with the most real user impact given the table's scale (Focus Area 5):
   today's list is silently capped at the 20 most recent rows.
3. **Fix the return shape** — stop discarding the `pagination` envelope;
   return it alongside `data`, same pattern `useSchedules` already
   established (`{ ...query, data: query.data?.data, pagination:
   query.data?.pagination }`).
4. **Fix the hand-rolled `ActivityLog` type** (`frontend/src/types/index.ts:190-199`)
   to include `changed_by_person`, or better, switch call sites to the
   generated `components["schemas"]["ActivityLog"]` type directly — this
   unblocks actually rendering who made each change, which today is fetched
   but invisible.
5. **Adopt `LoadingState`/`EmptyState`/`ErrorState`** in `ActivityPage.tsx`
   and `ActivityTimeline.tsx`, replacing the hand-rolled loading/empty
   markup and adding the currently-absent error state.
6. **Add test coverage** — `useActivityLogs.test.tsx` and
   `ActivityPage.test.tsx`, matching the pattern of every reference module.
   Currently zero.
7. **Verify `OverviewPage.tsx` still compiles/behaves identically** after
   the hook migration — it's a real, working consumer (Focus Area 3) and
   must not regress. Given it only reads `action`, `entity_type`, `id`,
   `created_at`, all of which remain unchanged in shape, this should be
   low-risk, but it's the one cross-module dependency to explicitly retest.
8. Everything else (removing the dead `sort` UI-affordance risk, the
   `entity_type` naming quirks, junction-action folding) is informational —
   already correctly anticipated by not building a sort control, and doesn't
   block a build ticket.

---

## Open design questions

1. **How should `old_value`/`new_value` be rendered, if at all?** They are
   full JSON row snapshots, not a pre-computed diff (Focus Area 1). Three
   real options, no clear winner from the data alone:
   - Omit entirely from the main timeline (current behavior, de facto) and
     treat this as future scope.
   - Client-side field-by-field diff (compare keys present in both objects,
     show changed ones) — doable today with no backend change, but the
     objects are raw DB rows (snake_case columns, foreign-key UUIDs, no
     human-readable labels for e.g. `assigned_to` beyond the raw id) so a
     naive diff would be technically correct but not very readable without
     per-entity-type formatting knowledge the Activity module doesn't have.
   - Raw JSON dump behind a "show details" expander — cheap, always
     correct, not pretty.
   This is a real product decision, not a technical blocker either way.

2. **Should a "view history for this record" link be added to other
   modules' detail pages** (Client, Project, Environment, Server, Resource,
   Person, Schedule detail views), now that Focus Area 2 confirms
   `?entity_id=X` already returns exactly that with no backend change
   needed? If yes: is that link's implementation **this ticket's** scope
   (an Activity-module change: accepting a URL/query param on
   `ActivityPage` to preset the filter) or a **future cross-module
   enhancement** (each detail page adding its own "View history" button)?
   The Activity-side half (accept an incoming `entity_id` filter) is small
   and arguably belongs here since it's this module's own filter surface;
   the other-module-side half (adding the link/button) touches five-plus
   already-frozen reference modules and is a separate, larger decision.

3. **Should the `"user"` entity type be exposed in filter UI at all**,
   given it has no corresponding sidebar module and mostly represents
   auth-adjacent system events (password changes, user enable/disable tied
   to a Person's lifecycle) rather than a browsable entity? Leaving it in
   the filter list is technically correct (it's a real, occurring value);
   omitting it would make the filter list map 1:1 with visible sidebar
   modules but hide real events from being filterable.

4. **Given RBAC visibility is uniform across roles** (Focus Area 4: a
   `member` sees identical activity data to an `admin`, including on
   entities/actions they couldn't perform themselves) — is that the
   intended product behavior for this audit trail, or worth flagging
   upstream as a backend question for a future ticket? This audit takes no
   position; it's explicitly out of scope to propose a backend change here,
   but the finding itself (not previously verified for this module) seemed
   worth surfacing as a question rather than silently building a frontend
   that assumes it.

---

## Suggested sub-part breakdown

**Single build ticket.** Every prior module needed a multi-part breakdown
because each combined new CRUD forms, RBAC-gated action wiring, optimistic
locking/conflict-resolution UI, and cascade-aware detail views — real,
independently-sized pieces of work. None of that exists here. The entire
punch list above is: migrate one hook to the generated client, wire one
shared pagination hook, adopt three shared state components, and add tests
for one page and one hook — all mechanical, all following patterns already
proven correct in the reference modules, with a single (low-risk, already
identified) cross-module regression check against `OverviewPage.tsx`. Time-
boxing this as multiple sequential parts would add process overhead the
work doesn't need. If the diff-rendering question (Open Design Question 1)
resolves toward something non-trivial (e.g. per-entity-type formatted diff
views), that specific piece could reasonably be split out as a follow-up
ticket — but the base list/filter/paginate rebuild is one ticket.

---

## Done
- Read `activityLogs.routes.ts`, `.controller.ts`, `.service.ts`,
  `.validator.ts`, `activityLogger.ts` (backend) in full.
- Read the `activity_logs` schema, indexes, and append-only trigger
  directly from `001_init.sql` and `002_activity_action_restore.sql`.
- Grepped and read every `logActivity()` call site across 9 backend files
  (38 call sites) to verify `changed_by` population consistency and
  `entity_type` usage, including junction-table actions.
- Read `activityLogs.test.ts` in full (16 test cases) to cross-check
  claims against actual, passing, executable behavior rather than
  intent alone.
- Read `backend/app.ts` and `middleware/auth.ts` to verify the RBAC gate
  directly, not from the matrix.
- Read the full frontend Activity surface: `ActivityPage.tsx`,
  `ActivityTimeline.tsx`, `useActivityLogs.ts`, plus `OverviewPage.tsx`,
  `useSchedules.ts` (reference pattern), `usePagination.ts`,
  `frontend/src/types/index.ts`, and the relevant slices of
  `backend/openapi.yaml` / `frontend/src/api/generated/schema.d.ts`.
- Grepped the full frontend tree for every consumer of `useActivityLogs`/
  `/activity-logs` and for any other hook referencing an activity query
  key, to confirm the cross-module consumer inventory is complete.
- Wrote this report to `activity-module-audit.md` (repo root, matching the
  location and naming convention of `people-module-audit.md` and
  `resources-module-audit.md`).

## Files
- `activity-module-audit.md` — new file, this report. No other files
  touched.

## Verified facts
- `activity_logs` schema (`id, entity_type, entity_id, action, changed_by,
  old_value, new_value, created_at`) — `backend/src/db/migrations/001_init.sql:196-207`.
- `changed_by` FK targets `people(id) ON DELETE RESTRICT`, never `users.id`
  — `001_init.sql:201`.
- `changed_by` populated identically via `requireChangedBy(req)` at both the
  controller layer (Clients) and service layer (all other modules) —
  `backend/src/utils/requestContext.ts:4-12`; controller call at
  `backend/src/controllers/clients.controller.ts:57`; service-layer calls
  e.g. `backend/src/services/people.service.ts:137,161,213,253`.
- `old_value`/`new_value` are full before/after row snapshots, not a
  computed diff — `backend/src/middleware/activityLogger.ts:5-28`; cross-
  checked field-by-field at runtime by `backend/src/__tests__/activityLogs.test.ts:357-385`.
- `entity_type_enum` has exactly 10 values, matches `EntityType` in
  `backend/src/types/index.ts:1-11` — `001_init.sql:4-7`.
- Junction actions (`ProjectPeople`, `PersonClients`) log under the parent
  entity's `entity_type`/`entity_id`, not a distinct type —
  `backend/src/services/projectPeople.service.ts:83,118`;
  `backend/src/services/people.service.ts:334,361`.
- `Resource` vs `ResourceVersion` log as distinct entity types — verified
  by `backend/src/__tests__/activityLogs.test.ts:434-474`.
- Live filters: `page, per_page, order, entity_type, entity_id, action,
  changed_by, from, to` — `backend/src/controllers/activityLogs.controller.ts:4-27`.
- `sort` is parsed nowhere in the controller and the service always orders
  by `created_at` — `activityLogs.controller.ts:4-27` (no `sort` read);
  `backend/src/services/activityLogs.service.ts:83`.
- `listActivityLogsQuerySchema` (the validator) is never imported/used
  anywhere in the backend outside its own file — confirmed by project-wide
  grep for `listActivityLogsQuerySchema` and for any `validate(...)`-style
  middleware on this router; `backend/src/routes/activityLogs.routes.ts`
  attaches no validation middleware at all.
- `entity_id` filter alone returns a full, correctly-ordered, paginated
  single-record history — `backend/src/__tests__/activityLogs.test.ts:147-165,246-322`.
- Append-only trigger: two unconditional `BEFORE` triggers (`UPDATE`,
  `DELETE`), whole-table, no `WHEN` clause; `INSERT` unaffected —
  `001_init.sql:209-222`; runtime-confirmed by
  `activityLogs.test.ts:325-354`.
- No role gate beyond `auth` (JWT-only) on `GET /api/activity-logs` — no
  role-based filtering of results — `backend/src/routes/activityLogs.routes.ts`
  (full file, no `requireRole`); `backend/src/app.ts:52`
  (`app.use("/api/activity-logs", auth, activityLogsRoutes)`);
  `backend/src/middleware/auth.ts:12-38` (JWT validation only, no role
  check); `backend/src/services/activityLogs.service.ts` (never reads
  `req.user`, only receives already-parsed filter params).
- `per_page` is clamped 1–100 server-side, cannot be uncapped by a client —
  `activityLogs.controller.ts:6-9`.
- Indexes: `(entity_type, entity_id)` and `(created_at)` only, no composite
  `(entity_id, created_at)`, no index on `changed_by` — `001_init.sql:206-207`.
- `frontend/src/features/activity/` contains a working, non-empty
  `ActivityPage.tsx` + `ActivityTimeline.tsx`, and `useActivityLogs.ts` uses
  raw `axios` (`frontend/src/lib/api.ts`), not the generated `apiClient` —
  contrasted directly against `frontend/src/hooks/useSchedules.ts:1-3,39-57`
  which does use `apiClient`/`unwrapApiResult`.
- `useActivityLogs.ts` only exposes `entityType, entityId, from, to` as
  filters and discards the `pagination` field from the response —
  `frontend/src/hooks/useActivityLogs.ts:7-29`.
- Hand-rolled `ActivityLog` type in `frontend/src/types/index.ts:190-199`
  omits `changed_by_person`, present and `required` in both the OpenAPI
  schema (`backend/openapi.yaml:1045-1063`) and the generated schema
  (`frontend/src/api/generated/schema.d.ts:1008-1020`), and always returned
  by the service (`activityLogs.service.ts:79-92`, inner `JOIN` on `people`).
- No `useActivityLogs.test.ts`/`.test.tsx` or `ActivityPage.test.tsx` exists
  — confirmed by directory listing of `frontend/src/hooks/` and
  `frontend/src/features/activity/`, contrasted against
  `useSchedules.test.tsx`/`SchedulePage.test.tsx` which do exist.
- `OverviewPage.tsx` is a real, working consumer of `useActivityLogs()`
  (no filters), rendering a 10-item "Recent activity" card —
  `frontend/src/features/overview/OverviewPage.tsx:19,33,35,97-122`.
- No other frontend module's hooks invalidate or reference an
  `activityLogs`-prefixed query key — confirmed by project-wide grep for
  `activityLogs` and `activity-logs` across `frontend/src`, returning only
  the 4 files listed in Focus Area 3.
- `git status --porcelain` returned empty at the end of this audit — no
  files were modified besides the creation of this report.

## Decisions made / deviations from prompt
- Interpreted "written to by every OTHER module's mutations" loosely enough
  to include `auth.controller.ts`'s password-change event and the
  `people.service.ts` user-disable/restore side-effects, since both call
  `logActivity` with `entity_type: "user"` and materially affect what a
  frontend filter UI needs to account for — these aren't one of the 6
  audited sidebar modules, but they're real, live call sites and omitting
  them would have understated the `entity_type` enum's real usage.
- Did not attempt to quantify actual row counts or run `EXPLAIN` on the
  index-coverage question in Focus Area 5 (no live DB access assumed
  available/appropriate for a static audit); reported the finding
  qualitatively based on the migration file alone, as the ticket's
  Focus Area 5 asked for "any performance-relevant details visible in the
  migration" specifically.

## Known issues / deferred
- None beyond what's already captured as punch-list items and open design
  questions above — this is an audit-only ticket, so every finding is
  deliberately left unfixed by design, not because of a follow-up decision
  I made.

## Verification
- `git status --porcelain` — empty except for this new report file. No
  backend or frontend source file was modified, refactored, or fixed during
  this audit, consistent with the audit-only scope.

## Needs Claude's attention
- None. The framing check (Section 0) and the RBAC read-visibility finding
  (Focus Area 4) are the two places where this audit surfaced something the
  ticket flagged as "verify, don't assume" — both were checked directly
  against source and are reported with citations above; no unresolved
  uncertainty remains on either.
