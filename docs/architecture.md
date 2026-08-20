# QQM — System Architecture

Verified directly from source (directory listings, actual imports, actual route/service/migration
files) on 2026-08-15. Every non-trivial claim below cites the file (and line, where practical) it
was verified against. Where this document's findings differ from `decisions.md` / `progress.md`,
see **Discrepancies found** at the end — nothing here has been silently corrected.

Related documents: `decisions.md` (why), `progress.md` (what's done), `development-guide.md` (rules
for the coding agent), `api-spec.md` (per-endpoint contract detail — this document points to it
rather than duplicating it).

---

## 1. System overview

QQM is an internal client/project/infrastructure management tool: it tracks clients, the projects
run for them, the environments and servers that make up each project's infrastructure, reference
material (runbooks/SOPs/architecture docs), the people involved and their roles, a maintenance
schedule (PM/MA tasks), and a full audit trail of who changed what. It is used by two kinds of
users — `admin` and `member` — to keep infrastructure and operational knowledge centrally
recorded instead of scattered across tickets and tribal knowledge.

**Three-tier structure**, verified from the repo root and both `package.json` files:

- **Frontend** — React 19 + TypeScript, Vite build, TanStack React Query for server state,
  React Router for routing, Tailwind + shadcn/ui (Radix primitives) for UI. Confirmed:
  `frontend/package.json:15-37` (`react": "^19.2.8"`, `@tanstack/react-query`, `react-router-dom`,
  `tailwindcss`, `@radix-ui/*`).
- **Backend** — Node.js + Express 5 + TypeScript, `pg` for direct SQL (no ORM), Zod for request
  validation, JWT (`jsonwebtoken`) + `bcrypt` for auth. Confirmed: `backend/package.json:19-31`
  (`express": "^5.2.1"`, `pg`, `zod`, `jsonwebtoken`, `bcrypt`).
- **Database** — PostgreSQL 16 (`docker-compose.yml:3` — `image: postgres:16-alpine`), accessed
  exclusively through hand-written parameterized SQL in `backend/src/services/*.service.ts`; no
  query builder or ORM is used anywhere in the backend.

The repo root (`QQM/`) contains `backend/`, `frontend/`, `docs/`, and a top-level
`docker-compose.yml` that wires all three tiers together for local development (see §6).

---

## 2. Backend structure

### 2.1 Directory layout

Verified via `backend/src/**/*.ts` listing:

```
backend/src/
├── app.ts                  # Express app: middleware wiring, route mounting, error handler
├── index.ts                # process entrypoint (app.listen)
├── routes/                 # 11 route files, one per resource (see api-spec.md for full list)
├── controllers/             # one per route file — parses request, calls service, shapes response
├── services/                # one per resource — all SQL lives here
├── validators/               # Zod schemas, one per resource
├── middleware/
│   ├── auth.ts               # JWT verification (`auth` middleware)
│   ├── rbac.ts                # requireRole / requireAnyRole
│   ├── activityLogger.ts       # logActivity() — the only writer of activity_logs rows
│   └── errorHandler.ts         # ApiError class + global Express error handler
├── db/
│   ├── pool.ts                # pg Pool
│   ├── withTransaction.ts       # BEGIN/COMMIT/ROLLBACK wrapper used by every mutation
│   ├── migrate.ts               # migration runner
│   ├── seed.ts                 # one-time seed (creates the only users/roles that exist)
│   └── migrations/              # 001_init.sql .. 006_schedules_parent_check.sql
├── utils/requestContext.ts       # paramId(), requireChangedBy()
├── openapi/                    # registry.ts / schemas.ts / generate.ts — generates openapi.yaml
└── types/index.ts               # shared TS interfaces + Express Request augmentation
```

### 2.2 Request flow — traced end-to-end (Clients PATCH)

`PATCH /api/clients/:id`, traced through every layer it touches:

1. **Mount / auth middleware** — `app.use("/api/clients", auth, clientsRoutes)`
   (`backend/src/app.ts:43`). `auth` (`backend/src/middleware/auth.ts:12-38`) requires a
   `Bearer <JWT>` header, verifies it with `jsonwebtoken`, and attaches
   `req.user = { id, peopleId, roles }`.
2. **Route** — `router.patch("/:id", update)` (`backend/src/routes/clients.routes.ts:18`). Notably
   **no `requireRole`/`requireAnyRole` gate** — Clients' update is reachable by any authenticated
   user regardless of role (confirmed; matches `decisions.md` #2's claim).
3. **Controller** — `update()` in `backend/src/controllers/clients.controller.ts:68-94`:
   - Validates the body against `updateClientSchema` (400 `VALIDATION_ERROR` on failure).
   - Resolves the acting person via `requireChangedBy(req)`
     (`backend/src/utils/requestContext.ts:4-12`, reads `req.user.peopleId`, 403 if the
     authenticated user has no linked Person record).
   - Fetches the existing row (404 if missing) — this pre-fetch is what supplies `old_value` for
     the activity log.
   - Opens `withTransaction` (`backend/src/db/withTransaction.ts:4-19` — `BEGIN` → run callback →
     `COMMIT`/`ROLLBACK` on error).
4. **Validator** — `updateClientSchema` (`backend/src/validators/clients.validator.ts:9-14`)
   requires `updated_at` (the optimistic-lock stamp) alongside the optional fields.
5. **Service** — `updateClient()` (`backend/src/services/clients.service.ts:112-136`) runs a single
   `UPDATE ... WHERE id = $1 AND deleted_at IS NULL AND date_trunc('milliseconds', updated_at) =
   date_trunc('milliseconds', $2::timestamptz)`. Zero rows returned means either the row doesn't
   exist/is deleted, or the optimistic lock was stale — the controller can't distinguish these from
   the service's return value alone.
6. **Back in the controller**: if `updateClient` returned nothing, throws
   `ApiError(409, "...refresh and try again", "CONFLICT")`
   (`backend/src/controllers/clients.controller.ts:82-88`). Otherwise it calls
   `logActivity("client", updated.id, "update", changedBy, existing, updated, tx)`
   (`clients.controller.ts:89`) — **the transaction's last statement** — then returns `updated`,
   which lets `withTransaction` commit.
7. **DB** — the row lands via a parameterized query on the `clients` table
   (`backend/src/db/migrations/001_init.sql:14-23`); the activity row lands in `activity_logs` in
   the same transaction.
8. **Response** — `res.json(result)` — the updated `Client` row, 200.

### 2.3 Activity logging — which layer writes the row, verified per-module

`logActivity()` (`backend/src/middleware/activityLogger.ts:5-28`) is the single INSERT-only
function that ever writes to `activity_logs`. **Which layer calls it varies by module** — this is
a real, verified structural inconsistency, not a simplification:

- **Clients is the outlier**: the *controller* opens `withTransaction` and calls `logActivity`
  itself (`backend/src/controllers/clients.controller.ts:59-63, 80-91, 103-108, 130-137`). The
  service functions (`clients.service.ts`) take a `PoolClient` as a parameter but never call
  `logActivity` themselves.
- **Every other verified module calls `logActivity` from inside the *service*, within its own
  internally-opened `withTransaction`**:
  - Environments — `backend/src/services/environments.service.ts:133, 211, 264, 274, 307`.
  - Servers — `backend/src/services/servers.service.ts:180, 253, 291, 324`.
  - Projects — `backend/src/services/projects.service.ts:136, 191, 226, 254`.
  - Resources — `backend/src/services/resources.service.ts:282-290, 341, 415-423, 522, 543`.
  - People — `backend/src/services/people.service.ts:147, 201, 227, 240, 269, 282`.
  - Schedules — `backend/src/services/schedules.service.ts:214, 281, 300, 321`.
  - CredentialReferences — `backend/src/services/credentialReferences.service.ts:70-78, 113-121,
    140-148`.
  - ProjectPeople — `backend/src/services/projectPeople.service.ts:83, 118`.

In both layouts, the invariant holds: **`logActivity` is always the last write inside the
transaction before it returns and commits** — i.e. "same transaction, last statement before
commit" is true everywhere it was checked, but *which layer* opens that transaction and issues the
call is not uniform. A future ticket touching activity logging should check the specific module's
service file rather than assuming the Clients (controller-driven) or the majority (service-driven)
pattern.

### 2.4 The append-only DB trigger

Verified from `backend/src/db/migrations/001_init.sql:209-222`:

```sql
CREATE OR REPLACE FUNCTION prevent_activity_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_logs_block_update BEFORE UPDATE ON activity_logs ...
CREATE TRIGGER trg_activity_logs_block_delete BEFORE DELETE ON activity_logs ...
```

Two `BEFORE` triggers unconditionally raise on any `UPDATE` or `DELETE` against `activity_logs`,
at the database level — this holds regardless of which application layer or role issues the SQL,
so it can't be bypassed by a bug in the Node layer. `backend/src/services/activityLogs.service.ts`
independently confirms there are **no write functions in that service at all**
(`activityLogs.service.ts:4-6`, explicit comment) — reads only.

### 2.5 Soft-delete + optimistic locking as reusable patterns

**Optimistic locking** (verified from validators — every entity that has one requires
`updated_at: z.string().min(1)` on its update schema, and every matching service does
`date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $N::timestamptz)`):

- Clients — `backend/src/validators/clients.validator.ts:13`,
  `backend/src/services/clients.service.ts:112-136`.
- Environments — `backend/src/validators/environments.validator.ts:17`,
  `backend/src/services/environments.service.ts:154-224` (comment at 148-153 explains the
  millisecond-truncation rationale — JS `Date` round-trips at millisecond precision, the column
  stores microseconds).
- Servers, Projects, People, Resources (metadata only), Schedules — same pattern, own files
  (`servers.service.ts:197-263`, `projects.service.ts:157-205`, `people.service.ts:158-204`,
  `resources.service.ts:302-344`, `schedules.service.ts:227-284`).
- **Genuine exceptions** (no `updated_at` field, no lock): `CredentialReference` — see
  `backend/src/validators/credentialReferences.validator.ts:13-18` (no `updated_at` in
  `updateCredentialReferenceSchema`) — and `ResourceVersion`, which has no update endpoint at all
  (append-only; see `api-spec.md`).

**Soft-delete** (`deleted_at TIMESTAMPTZ`, `UPDATE ... SET deleted_at = now() WHERE deleted_at IS
NULL`, list endpoints filter/branch on it via a `deleted`/`deletedMode` query param):

- Clients — `backend/src/services/clients.service.ts:138-149` (`softDeleteClient`).
- Environments — `backend/src/services/environments.service.ts:234-277` (`softDeleteEnvironment`) —
  also cascades: soft-deletes each child Server and hard-deletes its `credential_references`, all
  in one transaction (lines 246-265).
- Servers — `backend/src/services/servers.service.ts:270-294` (`softDeleteServer`) — same
  hard-delete-credential_references trade-off when deleted standalone.
- **Genuine exception**: `CredentialReference` has no `deleted_at` column at all
  (`backend/src/db/migrations/001_init.sql:131-139`) — `deleteCredentialReference`
  (`credentialReferences.service.ts:127-151`) issues a real `DELETE`.

---

## 3. Frontend structure

### 3.1 Directory layout

Verified via `frontend/src/**/*.ts*` listing:

```
frontend/src/
├── main.tsx / App.tsx / routes/AppRoutes.tsx     # route table (see §5)
├── api/
│   ├── generated/{schema.d.ts, client.ts}          # typed client (see §3.2)
│   ├── client.ts                                    # unwrapApiResult() wrapper
│   ├── errors.ts                                    # ApiError + parseApiError()
│   └── errorHandler.ts                               # global 401/403 side effects
├── lib/
│   ├── api.ts             # hand-written axios instance, used only by auth endpoints
│   ├── authToken.ts        # localStorage-backed JWT storage
│   └── queryClient.ts       # React Query client config
├── hooks/                  # one per module: useClients, useProjects, useEnvironments,
│                            # useServers, useCredentialReferences, useResources,
│                            # useResourceVersions, usePeople, useProjectPeople, useSchedules,
│                            # useActivityLogs — plus useHasRole, useConflictResolution,
│                            # usePagination (all foundation, not per-module)
├── components/
│   ├── auth/{RequireAuth,RequireRole}.tsx
│   ├── state/{LoadingState,EmptyState,ErrorState,ConflictState}.tsx
│   ├── {ConfirmDialog,ProjectPicker,EnvironmentPicker,ServerPicker}.tsx
│   ├── layout/{AppLayout,Sidebar,Topbar,NotificationBell}.tsx
│   └── ui/                 # shadcn/ui primitives (button, dialog, select, table, ...)
└── features/                # one dir per module: auth, clients, projects, environments,
                              # servers, infrastructure, resources, people, schedule, activity,
                              # overview, settings — each with its own Page + components/
```

### 3.2 Generated API client vs. `openapi.yaml`

`backend/openapi.yaml` is generated from the actual backend implementation (its own header says
so: "Generated from the actual implemented routes, controllers, and zod validators
(backend/src/openapi) — not from any prior design document", `backend/openapi.yaml:5-7`) via
`npm run generate:openapi` (`backend/package.json:13`, runs `backend/src/openapi/generate.ts`).

The frontend consumes it via a **scripted regeneration step**: `frontend/package.json:13` —
`"generate:api": "openapi-typescript ../backend/openapi.yaml -o src/api/generated/schema.d.ts"`.
This overwrites `frontend/src/api/generated/schema.d.ts` only. The hand-written wiring file
`frontend/src/api/generated/client.ts` is explicitly **not** touched by that script (its own
comment confirms: "unlike schema.d.ts, this file is NOT overwritten by `npm run generate:api`",
`client.ts:1-4`) — it does the one-time `createClient<paths>()` setup and attaches the bearer token
via an `onRequest` hook (`client.ts:15-25`).

### 3.3 Data-fetching pattern — traced end-to-end (`useClients`)

`apiClient` (openapi-fetch, typed against `schema.d.ts`) → `unwrapApiResult` → React Query hook →
component, traced via `frontend/src/hooks/useClients.ts`:

1. **`apiClient.GET("/api/clients", { params: { query: {...} } })`** — the typed generated client
   (`frontend/src/hooks/useClients.ts:18-32`), attaches `Authorization: Bearer <token>` via the
   `onRequest` hook registered in `api/generated/client.ts:17-25`.
2. **`unwrapApiResult(result)`** (`frontend/src/api/client.ts:21-31`) — inspects the
   openapi-fetch `{ data, error, response }` shape: on `error`, calls `parseApiError` then
   `handleGlobalApiError` (which redirects on 401 / toasts on 403 —
   `frontend/src/api/errorHandler.ts:23-36`) and throws; on success, returns `result.data`.
3. **React Query** wraps this in `useQuery({ queryKey: [KEY, params], queryFn })`
   (`useClients.ts:15-35`) — caching, loading/error state, refetch all come from React Query, not
   hand-rolled state.
4. **Component** (`frontend/src/features/clients/ClientsPage.tsx`) destructures
   `{ data, isLoading, isError, error, refetch }` from `useClients(pagination.params)` and renders
   `LoadingState` / `ErrorState` / `EmptyState` / the table accordingly.

Mutations (`useCreateClient`, `useUpdateClient`, `useDeleteClient`, `useRestoreClient`,
`useClients.ts:57-114`) follow the same `apiClient.<METHOD> → unwrapApiResult` shape via
`useMutation`, invalidating the `["clients"]` query key on success.

**Two separate HTTP clients exist and are not interchangeable**: the hand-written axios instance
(`frontend/src/lib/api.ts`) is used *only* by `useAuth()` for `/auth/login`, `/auth/me`,
`/auth/logout` (`frontend/src/features/auth/useAuth.ts:2,52,68,79`); every other module uses the
generated `apiClient`. Both read the same token from `lib/authToken.ts`.

### 3.4 Foundation pieces — verified file locations

| Piece | File |
|---|---|
| `RequireAuth` | `frontend/src/components/auth/RequireAuth.tsx` |
| `RequireRole` | `frontend/src/components/auth/RequireRole.tsx` |
| `useHasRole` | `frontend/src/hooks/useHasRole.ts` |
| `ConflictState` | `frontend/src/components/state/ConflictState.tsx` |
| `useConflictResolution` | `frontend/src/hooks/useConflictResolution.ts` |
| `ConfirmDialog` | `frontend/src/components/ConfirmDialog.tsx` |
| `LoadingState` / `EmptyState` / `ErrorState` | `frontend/src/components/state/{LoadingState,EmptyState,ErrorState}.tsx` |
| `usePagination` | `frontend/src/hooks/usePagination.ts` |
| `ProjectPicker` | `frontend/src/components/ProjectPicker.tsx` |
| `EnvironmentPicker` | `frontend/src/components/EnvironmentPicker.tsx` |
| `ServerPicker` | `frontend/src/components/ServerPicker.tsx` |

All eleven exist at the paths `decisions.md` #4 and `development-guide.md` §4 describe them by
name at (no path drift found). `usePagination` is actively consumed by eight list pages
(`ClientsPage`, `ProjectsPage`, `EnvironmentsPage`, `ServersPage`, `ResourcesPage`, `PeoplePage`,
`SchedulePage`, `ActivityPage` — verified by grep) — note its own header comment ("Not wired into
any page yet", `usePagination.ts:27-31`) is stale relative to current usage; flagged here since
it's a source-code claim, not a `decisions.md`/`progress.md` one, so it isn't in the Discrepancies
section. **Still stale as of Part 28** — no Part 28 sub-ticket touched `usePagination.ts` itself
(confirmed: not in the Part 28 diff), so this comment remains inaccurate; unrelated to decision #13's
separate URL-state gap.

### 3.4.1 Part 28 shared foundation pieces (added 2026-08-14, Parts 28a/28d/28e/28f)

Six shared pieces were added during UI/UX Polish Phase 1 (Shared Foundations), following the
same "build once, reuse everywhere" pattern as §3.4's foundation table:

| Piece | File | Built in |
|---|---|---|
| `MobileNav` | `frontend/src/components/layout/MobileNav.tsx` | Part 28a |
| `Sheet` (shadcn/ui primitive) | `frontend/src/components/ui/sheet.tsx` | Part 28a |
| `NAV_ITEMS` (shared nav list) | `frontend/src/components/layout/nav-items.ts` | Part 28a |
| `FilterBar` | `frontend/src/components/FilterBar.tsx` | Part 28e |
| `PaginationControls` | `frontend/src/components/PaginationControls.tsx` | Part 28f |
| `apiErrorMessage()` | `frontend/src/api/errors.ts:58-60` | Part 28d |

**`MobileNav`/`Sheet` — responsive navigation** (`frontend/src/components/layout/MobileNav.tsx:1-66`):
`Sidebar.tsx` is desktop-only (`hidden ... md:flex`, `frontend/src/components/layout/Sidebar.tsx:7`);
below the `md` breakpoint, `Topbar.tsx:32` renders `<MobileNav />` instead, which opens a left-side
`Sheet` (`MobileNav.tsx:20-38`, built on `@radix-ui/react-dialog` via the new
`frontend/src/components/ui/sheet.tsx` primitive — the same Radix-primitive pattern as every other
shadcn/ui component in `components/ui/`, per §1's "Radix primitives" claim). Both `Sidebar.tsx:3` and
`MobileNav.tsx:14` import the same `NAV_ITEMS` array from the new
`frontend/src/components/layout/nav-items.ts:21-32` — previously `Sidebar.tsx` hardcoded this list
inline; it's now the single source of both nav surfaces, matching decision #4's dedup pattern.

**`FilterBar` — shared filter-row layout** (`frontend/src/components/FilterBar.tsx:10-15`): a thin
`forwardRef` wrapper applying one consistent `flex flex-wrap items-center gap-2` container, not a new
control type — callers compose their own `Select`/`Input`/picker children, the same
composition style as `Card`/`CardContent` (component's own doc-comment,
`FilterBar.tsx:4-9`). Adopted by three call sites: `ActivityFilterBar.tsx:58` (Activity),
`ResourceFilterBar.tsx:31` (Resources), and the new `PeopleFilterBar.tsx:57` (People — see below).
Clients, Projects, Environments, and Servers' filter rows were **not** migrated to `FilterBar` in
Part 28 — they still render their own inline `<div className="flex flex-wrap items-center gap-2">`
wrapper (e.g. unchanged in `ClientsPage.tsx`), so `FilterBar` adoption is partial, not universal, as
of Part 28f. A future polish ticket could finish this consolidation; not claimed as done here.

**`PaginationControls` — shared pagination footer** (`frontend/src/components/PaginationControls.tsx:28-68`):
Previous/Next buttons + "Page X of Y" + a per-page `Select` (default options `[10, 20, 50, 100]`,
`PaginationControls.tsx:10,19`), consuming `usePagination`'s return shape directly as props. Adopted
by all eight `usePagination`-consuming list pages named in §3.4 above (verified by grep,
`frontend/src/features/{clients,projects,environments,servers,resources,people,schedule,activity}/*Page.tsx`
each now import `PaginationControls` from `@/components/PaginationControls`) — each previously
hand-rolled its own copy of this same Previous/Next/per-page block inline (e.g.
`PeoplePage.tsx` before Part 28 had ~40 lines of inline `Select`/`Button` markup for this, per the
Part 28 diff; now a single `<PaginationControls .../>` call).

**`apiErrorMessage()` — centralized error-to-toast-description helper**
(`frontend/src/api/errors.ts:57-60`): `err instanceof ApiError ? err.message : "Something went wrong.
Please try again."` — a one-line normalizer so every mutation's `onError` toast gets the same
fallback wording instead of each call site (or, before Part 28, `PeoplePage.tsx` alone) redefining an
identical local function. Verified by grep: imported in 18 feature files plus its own declaration
file, covering every form dialog (`ClientFormDialog.tsx`, `ProjectFormDialog.tsx`,
`EnvironmentFormDialog.tsx`, `ServerFormDialog.tsx`, `PersonFormDialog.tsx`, `ScheduleFormDialog.tsx`,
`ResourceEditor.tsx`, `ResourceMetadataDialog.tsx`, `CredentialReferenceFormDialog.tsx`) and every
list/detail page with delete/restore or roster-style mutations (`ClientsPage.tsx`, `ProjectsPage.tsx`,
`EnvironmentsPage.tsx`, `ServersPage.tsx`, `ResourcesPage.tsx`, `PeoplePage.tsx`, `SchedulePage.tsx`,
`ProjectRoster.tsx`, `CredentialRefList.tsx`, `PersonDetailDialog.tsx`). See `decisions.md` for the
"every mutation gets onSuccess + onError" contract this helper supports.

### 3.4.2 Label/control association fixes to the shared pickers (Part 28b)

`ProjectPicker`, `EnvironmentPicker`, and `ServerPicker` (§3.4's foundation table) each gained two
new optional passthrough props — `id?: string` and `"aria-label"?: string` — forwarded straight onto
the underlying `SelectTrigger`:

- `ProjectPicker.tsx:26-27,39-40,50`
- `EnvironmentPicker.tsx:18-19,30-31,37`
- `ServerPicker.tsx:29-30,40-41,56`

Before Part 28, none of the three pickers' `SelectTrigger` accepted an `id` or `aria-label`, so a
`<Label htmlFor="...">` pointing at one (or a bare `aria-label` where no visible `<Label>` exists, as
in filter bars) had no element to actually associate with — a real, fixed accessibility defect, not
a cosmetic one. This is the specific, narrow fix `decisions.md`'s dated 2026-08-14 correction entry
refers to as the one genuine Tier-1 finding from the original Polish Discovery Audit's contrast/label
group (that same entry's *contrast* findings did not reproduce on re-verification — see
`decisions.md`). The same
`id`/`aria-label` pattern was then applied at each call site across every form dialog and filter bar
that renders one of these three pickers or its own inline `<Select>` (e.g.
`ServerFormDialog.tsx:399-409,459-464,480-485`, `ResourceEditor.tsx:281-297`) — this call-site-level
work is not itself a change to a documented shared component, so it is not separately cited
file-by-file here; grep `aria-label=` / `htmlFor=` across `frontend/src/features/**` to see the full
set.

### 3.5 Activity module — frontend wiring (added 2026-08-13, Part 27b)

Activity is the last of the 8 modules to be migrated off the original scaffold; it now follows the
same patterns as every other module rather than being a documented exception:

- **Generated `apiClient`, not legacy axios**: `useActivityLogs.ts:1-2,30-45` calls
  `apiClient.GET("/api/activity-logs", { params: { query: {...} } })` and unwraps the result via
  `unwrapApiResult`, the same shape as `useClients.ts` (§3.3) — it no longer uses the hand-written
  `frontend/src/lib/api.ts` axios instance.
- **Full 9-filter set exposed**, matching every live backend query param (`api-spec.md`'s Activity
  section): `page, per_page, order, entity_type, entity_id, action, changed_by, from, to`
  (`useActivityLogs.ts:13-24`, `ActivityLogFilters` interface). `sort` is deliberately never sent —
  the hook's own header comment (`useActivityLogs.ts:8-12`) documents that it's dead at the
  controller layer.
- **`usePagination` wired, but only its `page`/`perPage`/`order` pieces**: `ActivityPage.tsx:31`
  calls `usePagination({ initialOrder: "desc" })` and ignores `deleted`/`search`/`sort` — Activity
  has no soft-delete concept (append-only table) and its list endpoint has no `search` param
  (matches `api-spec.md`'s cross-cutting pagination notes). Page-size and next/prev controls render
  at `ActivityPage.tsx:136-148`.
- **`ActivityFilterBar.tsx`** (`frontend/src/features/activity/components/ActivityFilterBar.tsx`,
  new component) renders the entity-type/action selects and entity-ID/changed-by/from/to inputs,
  replacing the old page's single hardcoded entity-type-only `<Select>`.
- **`changed_by_person` is now rendered**: `ActivityTimeline.tsx:44` displays `` `by
  ${log.changed_by_person.name}` ``. This was fetched but never shown before Part 27b — the
  hand-rolled `ActivityLog` type (`frontend/src/types/index.ts:190-202`) now includes
  `changed_by_person: { id: string; name: string }`, matching the generated schema and the API's
  actual response shape.
- **`old_value`/`new_value` remain unrendered** — a deliberate scope decision, not an oversight; see
  `decisions.md` for the dated entry recording this and Activity's other explicitly deferred items.

---

### 3.6 Schedule date-only parsing utility (Part 29d)

Schedule dates are database `DATE` values, but the API returns them as UTC-midnight ISO timestamps.
The shared `parseScheduledDate()` helper in `frontend/src/hooks/useSchedules.ts:7-28` strips the
time portion and parses the `yyyy-MM-dd` value as a local calendar date. This prevents viewers west of
UTC from seeing the previous day when the value is formatted or matched by the calendar.

The helper is a module-level shared pattern, not a one-off component fix: it is consumed by
`SchedulePage.tsx:277`, `ScheduleCalendar.tsx:2,19-20`, `ScheduleList.tsx:14,63`,
`ScheduleFormDialog.tsx:30,285`, and, as of the 29-CLOSEOUT fix,
`NotificationBell.tsx:15,36,67` (`frontend/src/components/layout/NotificationBell.tsx`) — the bell's
due/overdue schedule computation was found to still be using the bare `new Date(scheduled_date)`
constructor after 29d introduced the helper for the Schedule module itself, producing the same
timezone-off-by-a-day bug for viewers west of UTC; switching it to `parseScheduledDate()` made it the
helper's 5th consumer. The backend schema and API contract were not changed.

## 4. Module relationships

### 4.1 Entity-relationship summary (from migrations, not from data-model prose)

Verified from `backend/src/db/migrations/001_init.sql`, `005_environments_vpn_fk.sql`:

| Table | FK | References | ON DELETE |
|---|---|---|---|
| `users` | `people_id` | `people.id` | SET NULL |
| `user_roles` | `user_id` | `users.id` | CASCADE |
| `user_roles` | `role_id` | `roles.id` | RESTRICT |
| `people_clients` | `people_id` | `people.id` | CASCADE |
| `people_clients` | `client_id` | `clients.id` | CASCADE |
| `projects` | `client_id` | `clients.id` | RESTRICT |
| `project_people` | `project_id` | `projects.id` | CASCADE |
| `project_people` | `people_id` | `people.id` | CASCADE |
| `environments` | `project_id` | `projects.id` | CASCADE |
| `environments` | `vpn_resource_id` | `resources.id` | SET NULL *(added migration 005)* |
| `servers` | `environment_id` | `environments.id` | CASCADE |
| `credential_references` | `server_id` | `servers.id` | CASCADE |
| `resources` | `project_id` | `projects.id` | CASCADE *(nullable)* |
| `resources` | `current_version_id` | `resource_versions.id` | SET NULL |
| `resource_versions` | `resource_id` | `resources.id` | CASCADE |
| `resource_versions` | `author_id` | `people.id` | RESTRICT |
| `schedules` | `project_id` | `projects.id` | CASCADE *(nullable)* |
| `schedules` | `server_id` | `servers.id` | CASCADE *(nullable)* |
| `schedules` | `assigned_to` | `people.id` | RESTRICT |
| `activity_logs` | `changed_by` | `people.id` | RESTRICT |

`schedules` has a CHECK constraint requiring `project_id IS NOT NULL OR server_id IS NOT NULL`
(`backend/src/db/migrations/006_schedules_parent_check.sql:1-2`) — a schedule must have at least
one parent. No table anywhere in the schema has an FK into `schedules.id`, confirming
`decisions.md` #6's "Schedule is a leaf entity" claim.

**Important nuance not stated in `decisions.md`**: every entity above that has `deleted_at` uses
*application-level* soft-delete (an `UPDATE`), so these `ON DELETE CASCADE`/`SET NULL` FK actions
are **never actually triggered** by the app's normal delete flows — a soft-delete never issues a
real `DELETE` on the parent row. Where `decisions.md` #6 describes environments "cascading to
soft-delete servers and hard-delete credential_references," that cascade is emulated entirely in
application code (`environments.service.ts:246-265`, an explicit loop + explicit
`DELETE FROM credential_references`), not by the `servers.environment_id ON DELETE CASCADE` FK.
The FK still matters as a schema-integrity backstop (e.g. it would fire if a row were ever hard-deleted
via direct SQL/seed cleanup), but it is not the mechanism behind the verified cascade behavior in
`decisions.md` #6. This is a clarification, not a contradiction — decisions.md's *behavioral*
description is accurate; it just doesn't distinguish DB-level vs. application-level cascade
mechanics, which matters if a future ticket goes looking for the cascade in the migrations instead
of the service files.

### 4.2 Cross-module frontend consumers (grepped from current call sites, not copied from progress.md)

- `VpnResourcePicker.tsx` (Environments feature) consumes Resources' `useResources` —
  `frontend/src/features/environments/components/VpnResourcePicker.tsx:7,28`.
- `ScheduleFormDialog.tsx` (Schedule feature) consumes People's `usePeople` —
  `frontend/src/features/schedule/components/ScheduleFormDialog.tsx:28,53`. It also consumes
  `ProjectPicker` and `ServerPicker` (lines 23-24).
- `ServerPicker.tsx` (shared component, not module-owned) consumes both Environments' and Servers'
  hooks (`useEnvironments`, `useServers`) to compose a project-scoped server list client-side,
  since no backend endpoint filters servers by project directly —
  `frontend/src/components/ServerPicker.tsx:8-9,39-48` (comment at 14-24 explains why).
- `ProjectPicker.tsx` and `EnvironmentPicker.tsx` are each consumed by multiple other modules'
  forms (Environments, Servers, Resources, Schedule) — grep of `RequireRole roles=` usage sites and
  `import.*Picker` across `frontend/src/features/**` confirms ProjectPicker/EnvironmentPicker
  imports in `environments/components/EnvironmentFormDialog.tsx`,
  `servers/components/ServerFormDialog.tsx`, `schedule/components/ScheduleFormDialog.tsx`, and
  `resources/ResourcesPage.tsx`.

All three cross-module consumer claims `decisions.md`/`progress.md` make are current and accurate
as of this verification.

---

## 5. Auth / RBAC

### 5.1 Authentication, end-to-end

- **Login**: `POST /api/auth/login` (`backend/src/controllers/auth.controller.ts:15-51`) verifies
  username/password (`bcrypt.compare`), loads role names, signs a JWT
  (`jwt.sign({ id, peopleId, roles }, secret, { expiresIn: "8h" })`, line 35-39) and returns
  `{ token, user }`.
- **Storage**: the frontend stores the raw JWT string in `localStorage` under key `qqm_token`
  (`frontend/src/lib/authToken.ts:1-16`) — a plain module-level variable mirrors it in memory for
  synchronous reads. No refresh-token mechanism exists; the token simply expires after 8h server-side.
- **Attachment**: both HTTP clients read the same token and attach it as `Authorization: Bearer
  <token>` — the axios instance via a request interceptor (`frontend/src/lib/api.ts:10-16`), the
  generated client via an `onRequest` hook (`frontend/src/api/generated/client.ts:17-25`).
- **Server-side verification**: the `auth` middleware (`backend/src/middleware/auth.ts:12-38`)
  requires the header, verifies the JWT with `jsonwebtoken` against `process.env.JWT_SECRET`, and
  attaches `req.user = { id, peopleId, roles }` from the token's own payload — roles are **not**
  re-queried from the DB per request; they're whatever was baked into the token at login time (so a
  role change doesn't take effect until the user's next login/token refresh — worth knowing, not
  documented anywhere else).
- **Hydration on load**: `useAuth()`'s `hydrate()` (`frontend/src/features/auth/useAuth.ts:41-58`)
  calls `GET /auth/me` with the stored token on first mount to restore session state; on failure it
  clears the token and treats the user as unauthenticated.
- **Route guard**: `RequireAuth` (`frontend/src/components/auth/RequireAuth.tsx`) wraps the entire
  authenticated route tree in `frontend/src/routes/AppRoutes.tsx:25-43` — there is no per-route
  RBAC guard; gating below the route level is element-level only (see 5.2).

### 5.2 RBAC enforcement — both sides, and the UX-only boundary

- **Backend** (the real enforcement point): `requireRole(roleName)` and
  `requireAnyRole(roleNames)` (`backend/src/middleware/rbac.ts:4-30`) check `req.user.roles`
  (populated by `auth`) and throw 401 (`!req.user`) or 403 (role not present) via `ApiError`.
  Applied per-route as middleware — see `api-spec.md` for the full per-endpoint table.
- **Frontend** (UX only): `RequireRole` (`frontend/src/components/auth/RequireRole.tsx:22-28`)
  wraps `useHasRole` (`frontend/src/hooks/useHasRole.ts:18-24`), which checks the roles array from
  `useAuth()` against the required role(s) and returns a boolean — nothing more. Both files'
  doc-comments state explicitly that this is UX-only and not a security boundary, consistent with
  `decisions.md` #5: *"RBAC in the frontend is UX only, never the security boundary."* Verified by
  example: `ClientsPage.tsx`'s Edit button has **no** `RequireRole` wrapper
  (`frontend/src/features/clients/ClientsPage.tsx:197-199`), correctly mirroring the backend's
  unrestricted Clients PATCH (§2.2) — the frontend gate is per-module-verified, not copy-pasted
  from a stricter module.

**RBAC strictness genuinely varies by module and by action** — Environments gates every write
action admin-only, Resources splits admin-only metadata PATCH from admin+member version creation,
Servers splits admin+member create/update from admin-only delete/restore, and so on. This document
deliberately does not restate that matrix — see **`api-spec.md`**, which derives it fresh
per-module directly from each `*.routes.ts` file with citations.

### 5.3 Two-role model

`frontend/src/hooks/useHasRole.ts:4` types `Role` as exactly `"admin" | "member"`. No
`users.routes.ts` or `roles.routes.ts` exists anywhere under `backend/src/routes/` (confirmed via
directory listing) — every `users`/`user_roles` row is created once by `backend/src/db/seed.ts`.
This matches `decisions.md` #7/#8 exactly; no discrepancy found.

---

## 6. Deployment structure

Verified from `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`,
`frontend/nginx.conf`. **Only local-dev configuration exists in this repo** — there is no separate
production compose file, Kubernetes manifest, or environment-specific override found anywhere
under the repo root; if a production deployment exists, it is not represented in this repository.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   frontend   │      │   backend   │      │      db      │
│  (nginx:80,  │─────▶│ (node:4000) │─────▶│ (postgres:16, │
│  host :5173) │ REST │  host :4000 │  SQL │  host :5433)  │
└─────────────┘      └─────────────┘      └─────────────┘
```

- **`db`** — `postgres:16-alpine`, host port `5433` → container `5432`
  (`docker-compose.yml:2-17`), credentials from root `.env` (`POSTGRES_USER`/`PASSWORD`/`DB`).
- **`backend`** — built from `backend/Dockerfile` (two-stage: `npm ci && npm run build`, then a
  slim runtime stage running `node dist/index.js`, `backend/Dockerfile:1-16`), host port `4000` →
  container `4000`, `depends_on: db` with a healthcheck condition
  (`docker-compose.yml:24-30`), env from the root `.env` file.
- **`frontend`** — built from `frontend/Dockerfile` (two-stage: Vite build, then served by
  `nginx:alpine`, `frontend/Dockerfile:1-13`), host port `5173` → container `80`. `nginx.conf`
  (`frontend/nginx.conf:1-10`) is a plain SPA fallback (`try_files $uri $uri/ /index.html`) — it
  does **not** proxy `/api` to the backend container. The frontend instead talks to the backend
  directly via `VITE_API_BASE_URL` (`frontend/.env.example:1` —
  `http://localhost:4000/api`), which is a Vite **build-time** env var baked into the static bundle,
  not resolved at container-runtime.
- Swagger UI (`/api/docs`) is mounted only when `NODE_ENV !== "production"`
  (`backend/src/app.ts:33-40`) — the production Docker build sets `ENV NODE_ENV=production`
  (`backend/Dockerfile:10`), so it's disabled in the containerized build.
- API base path is `/api/...` throughout — **no `/v1` (or any version) prefix exists anywhere**;
  confirmed by every `app.use("/api/...", ...)` call in `backend/src/app.ts:42-52` and by
  `backend/openapi.yaml`'s single `servers: - url: /` entry (line 11-13, same-origin, no prefix
  beyond what each path already encodes).

---

## 7. Key principles (see `decisions.md` for full reasoning)

- **Backend is frozen** — no ticket may modify `backend/` code. See `decisions.md` #1.
- **RBAC must be verified per-module from source, never assumed** — the matrix has been wrong or
  imprecise for nearly every module previously audited. See `decisions.md` #2 and `api-spec.md`.
- **UI/theme is frozen during this phase** — functional wiring only, no visual redesign. See
  `decisions.md` #3.
  <!-- TODO: stale once Light Theme Migration begins (progress.md) — decision #3 describes
  the pre-polish, dark-theme-frozen phase; two rounds of UI/UX polish have since landed
  (decisions.md #9, #24-28), and a Light Theme Migration is now starting. Update this
  section, and re-check the rest of this file for other dark-theme-only assumptions,
  once that migration actually starts building — not before. -->

---

## Discrepancies found

Verification against `decisions.md` and `progress.md` turned up **no factual errors** in either
document's RBAC claims, cascade-behavior claims, or enum-value claims — every specific claim
checked (decision #2's five bullet points, decision #6's seven cascade bullet points, decision
#7's "no Users API" claim, decision #8's two-role claim) matched source exactly. Two things are
worth flagging even though they are not contradictions:

1. **Activity-logging layer is not uniform** (§2.3): Clients logs activity from the *controller*;
   every other verified module logs it from the *service*. Neither `decisions.md` nor
   `progress.md` makes a claim about this either way, so it isn't a correction of either document —
   but it's the kind of inconsistency a future ticket could trip over if it assumes one pattern
   applies everywhere.
2. **DB-level FK cascade vs. application-level soft-delete cascade** (§4.1): `decisions.md` #6's
   cascade descriptions are behaviorally accurate but describe *application-level* soft-delete
   cascades; the schema's `ON DELETE CASCADE` FKs are a separate, effectively-dormant mechanism
   (soft-delete never issues a real `DELETE` on a parent row, so those FKs don't fire in normal
   operation). Not a contradiction, but worth knowing if a future ticket goes looking for the
   cascade mechanism in the migrations rather than the service files.
