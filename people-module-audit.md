# People Module Audit (People ↔ Users)

Audit-only. No code changes made. All claims below are sourced from direct reads of:
`backend/src/routes/people.routes.ts`, `backend/src/routes/projectPeople.routes.ts`,
`backend/src/routes/clients.routes.ts`, `backend/src/routes/auth.routes.ts`,
`backend/src/services/people.service.ts`, `backend/src/services/projectPeople.service.ts`,
`backend/src/services/auth.service.ts`, `backend/src/controllers/people.controller.ts`,
`backend/src/controllers/auth.controller.ts`, `backend/src/validators/people.validator.ts`,
`backend/src/db/migrations/001_init.sql` (and `002`–`006`, checked for later touches to `users`/
`people` — there are none), `backend/src/db/seed.ts`, `backend/src/middleware/rbac.ts`,
`backend/src/__tests__/people.test.ts`, `backend/src/__tests__/projectPeople.test.ts`,
`frontend/src/api/generated/schema.d.ts`, `frontend/src/types/index.ts`,
`frontend/src/hooks/usePeople.ts`, `frontend/src/hooks/useProjectPeople.ts`,
`frontend/src/hooks/useClients.ts`, `frontend/src/hooks/useHasRole.ts`,
`frontend/src/features/auth/useAuth.ts`, `frontend/src/components/auth/RequireRole.tsx`,
`frontend/src/routes/AppRoutes.tsx`, and everything under `frontend/src/features/people/` and
`frontend/src/features/settings/`.

No RBAC claim below is sourced from any RBAC matrix document — every role gate is quoted directly
from the route files themselves.

**Headline finding, stated up front because it changes the shape of this whole audit**: there is
**no `users.routes.ts`, `users.controller.ts`, `users.service.ts`, or `users.validator.ts` anywhere
in the backend**, and **no `roles.routes.ts`/`roles.controller.ts`/`roles.service.ts` either**. The
`Users` entity, as an independently manageable resource (create account, list accounts, assign
roles, disable/restore a specific account on its own), **does not exist as an API surface at all**.
The only backend code that touches the `users` table is: `auth.service.ts` (login/me/
change-password, all self-service), and `people.service.ts`'s cascade logic (disables/re-enables a
linked user row as a side effect of soft-deleting/restoring the *Person*). Every `users`/`user_roles`
row in the system today is created exactly once, by `backend/src/db/seed.ts`, via raw SQL — there is
no code path, frontend or backend, that can create a second user account. This is confirmed, not
inferred from absence: `find backend/src -iname "*user*"` returns only test files and `seed.ts`, and
`app.ts` mounts no `/api/users` route (grepped the full mount list, see Focus Area 4).

---

## 1. Focus Area 1 — people ↔ users relationship and cascade behavior

**Schema, verified from `001_init.sql:47-59`**:

```
users:
  id UUID PK
  people_id UUID REFERENCES people(id) ON DELETE SET NULL   -- nullable, exactly as briefed
  username CITEXT NOT NULL
  email CITEXT NOT NULL
  password_hash TEXT NOT NULL
  created_at, updated_at, deleted_at

CREATE UNIQUE INDEX uq_users_username_active ON users (username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_email_active   ON users (email)    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_people_id      ON users (people_id) WHERE deleted_at IS NULL
                                                                   AND people_id IS NOT NULL;
```

Confirmed: `people_id` is nullable, and the unique index on it is **partial** (only enforced among
non-deleted users with a non-null `people_id`), so at most one *active* user can be linked to a
given person at a time, but a soft-deleted user linked to that person doesn't block a fresh link.
Test `[8]` in `people.test.ts` (*"the DB rejects a second user linked to the same people_id (unique
index confirmed)"*) confirms this is a real, enforced DB constraint, not just a convention.

**One subtlety worth flagging that the briefing's phrasing doesn't surface**: `ON DELETE SET NULL`
is the FK behavior for a **hard** delete of the `people` row. The application never hard-deletes a
person (soft-delete only, see below) — but if anyone ever ran a raw `DELETE FROM people` against
this schema, the linked user would survive with `people_id` set to `NULL`, not be deleted or
disabled. This is a real, if dormant, difference from `people_clients`/`project_people`, whose FKs
are `ON DELETE CASCADE` — see Focus Area 2 for why that distinction matters for the "does soft-delete
touch people_clients" question.

**Cascade direction — verified from `people.service.ts`, one-directional Person→User, not
symmetric**:

- `softDeletePerson()` (`backend/src/services/people.service.ts`): inside one `withTransaction`, it
  (1) sets `people.deleted_at = now()`, logs a `people`/`delete` activity row, then (2) `SELECT *
  FROM users WHERE people_id = $1 AND deleted_at IS NULL` and, if found, `UPDATE users SET
  deleted_at = now(), updated_at = now()` on that single row, logging a **`user`/`update`** activity
  row (not `delete` — the entity-level action recorded for the user side is `update`, confirmed by
  test `[10]`'s assertion `expect(userLog.rows[0].action).toBe("update")`). The function's own doc
  comment states the intent precisely: *"disables it ... this blocks login ... without destroying the
  account."* Disabling means: the user row's `deleted_at` becomes non-null, which is exactly the
  filter `findUserByUsername()` in `auth.service.ts` uses (`WHERE username = $1 AND deleted_at IS
  NULL`), so a disabled user's login attempt is rejected the same way any nonexistent username would
  be — confirmed end-to-end by test `[10]`: login succeeds pre-delete, `DELETE /api/people/:id`
  returns 200, the user row's `deleted_at` is non-null afterward, and a subsequent login attempt with
  the same credentials returns `401 UNAUTHORIZED`.
- `restorePerson()`: symmetric on the way back — restores the person, then `SELECT * FROM users
  WHERE people_id = $1 AND deleted_at IS NOT NULL` and clears `deleted_at` on that row if found,
  again logging `user`/`update`. Test `[11]` (embedded in the same test block as `[10]`) confirms
  login succeeds again after restore.
- **The service's own comment states the accepted trade-off explicitly**: *"Simplifying assumption:
  this treats disable/restore as 1:1 — a user independently soft-deleted for unrelated reasons before
  the person was soft-deleted would also get restored here."* In other words, `restorePerson()`
  cannot distinguish "this user was disabled *because of* the person's soft-delete" from "this user
  happened to already be disabled for some unrelated reason" — restoring the person will always
  re-enable whatever user is currently linked-and-disabled. There is no flag/column recording *why*
  a user was disabled.
- **Person → User is the only cascade direction that exists.** There is no reverse cascade at all.

**Soft-deleting/disabling a User directly, independent of the Person — verified, not blocked, but
also not reachable via any application code path.** There is no `DELETE`/soft-delete **route** for
`users` (no `users.routes.ts` exists, see the headline finding above), so this can only happen via
direct SQL today (as `people.test.ts` does in its own test setup/teardown, e.g. test `[9]`). Verified
from that test: **hard-deleting a user row directly (`DELETE FROM users WHERE id = $1`) leaves the
linked Person completely untouched** — `GET /api/people/:id` afterward returns `200` with
`account: null`. This confirms the cascade truly is one-directional (Person→User only): nothing in
`people.service.ts` or anywhere else reacts to a user being removed/disabled. If a `users.routes.ts`
were built with its own independent soft-delete endpoint, disabling a user that way would currently
have **zero effect on the linked Person** — no code path propagates User state back to People.

**Does creating/editing a Person ever touch `users`? No — verified from the validators, not just the
service.** `createPersonSchema`/`updatePersonSchema` in `people.validator.ts` define exactly `name,
email, phone, type, notes` (+`updated_at` on update) — no `username`, `password`, or any
user-account field exists on either schema, and `createPerson()`/`updatePerson()` in the service only
ever `INSERT`/`UPDATE` the `people` table. There is no "create login for this person" inline flow
anywhere in the create/update path. The only place `people.service.ts` writes to `users` at all is
inside `softDeletePerson()`/`restorePerson()`, and only to toggle `deleted_at` on an already-existing
linked row.

**RBAC for Users management — cannot be verified from a `users.routes.ts` because none exists.**
Since there is no independent Users CRUD surface, there is no independent RBAC table to produce for
create/update/delete/restore/list/get of a `User` as its own resource. What *does* exist, verified
directly:

| Action | Route | File | Role gate (verbatim) |
|---|---|---|---|
| Login | `POST /api/auth/login` | `auth.routes.ts` | none (pre-auth, by definition) |
| Get own profile | `GET /api/auth/me` | `auth.routes.ts` | `auth` middleware only (any authenticated user, self only) |
| Logout | `POST /api/auth/logout` | `auth.routes.ts` | `auth` middleware only |
| Change own password | `POST /api/auth/change-password` | `auth.routes.ts` | `auth` middleware only (self only — `changePassword()` in the controller always operates on `req.user`, there is no `:id` param, so this can never be used to change *another* user's password) |
| Disable a user (cascade only) | *(no route — internal side-effect of `DELETE /api/people/:id`)* | `people.service.ts` | `requireRole("admin")` on the Person-delete route that triggers it |
| Restore a user (cascade only) | *(no route — internal side-effect of `POST /api/people/:id/restore`)* | `people.service.ts` | `requireRole("admin")` on the Person-restore route that triggers it |
| List/get a specific user's account info | `GET /api/people/:id` (partial: `id`, `username`, `active` only, embedded as `account`) | `people.routes.ts` | none — any authenticated user (see Focus Area 4 table) |
| Create a user account | *none exists* | — | — |
| List all users | *none exists* | — | — |
| Assign/change a user's roles | *none exists* | — | — |

So: **GET is not independently role-gated for Users because there is no independent GET-all/GET-one
for Users at all** — the only way to see anything about a user's account today is the partial
`account: {id, username, active}` object nested inside a Person's detail response, which itself has
no role gate (Focus Area 4). This means the "is GET restricted, unlike other entities" question is
moot as posed — there is no Users GET endpoint to restrict. The closest analog (viewing account
status via the Person detail) is **open to any authenticated user**, consistent with every other
entity audited so far, not an exception.

---

## 2. Focus Area 2 — people ↔ clients relationship

**`PersonDetailDialog.tsx` — one correction to the briefing's framing: it is People-owned, not
Client-owned.** Located at `frontend/src/features/people/components/PersonDetailDialog.tsx` (137
lines), rendered from `frontend/src/features/people/PeoplePage.tsx` when a row in `PeopleTable` is
clicked — it is a read-detail-plus-relationship-editor dialog reached from the People list, not from
anywhere in the Clients feature.

**Data layer — modern `apiClient`... no, actually still legacy axios, verified.** `usePersonClients`,
`useAddPersonClient`, `useRemovePersonClient` (the actual current names — confirmed, matches the
briefing) all live in `frontend/src/hooks/usePeople.ts`, which imports `api` from `@/lib/api` (plain
axios) throughout, not `apiClient` + generated schema types. This puts People/PersonDetailDialog's
data layer in the same legacy-axios bucket as `useResources.ts`/`useResourceVersions.ts` from the
prior audit — it has not been migrated.

**Full call-site inventory for the People-relationship hooks** (grepped across `frontend/src`):
- `usePersonClients`, `useAddPersonClient`, `useRemovePersonClient` — used **only** in
  `frontend/src/features/people/components/PersonDetailDialog.tsx`. No other consumer anywhere.
- `usePeople` (the list hook) — used in `frontend/src/features/people/PeoplePage.tsx` (with
  `type`/`search` filters) and, as a genuine cross-module consumer, in
  `frontend/src/features/schedule/components/ScheduleFormDialog.tsx:36` (`usePeople()`, unfiltered —
  presumably to populate an assignee picker). **Any change to `usePeople`'s shape must account for
  this Schedule consumer**, the same caution the Resources audit applied to `VpnResourcePicker.tsx`.
- `useCreatePerson`, `useUpdatePerson`, `useDeletePerson` — all three are exported from
  `usePeople.ts` and have **zero call sites** anywhere in the frontend. Dead code today. There is
  also **no `useRestorePerson` hook at all** — not dead, simply never written, despite `POST
  /api/people/:id/restore` existing and working on the backend.
- A minor API-shape mismatch worth flagging: `usePeople()`'s `PeopleFilters` accepts a `clientId`
  field and sends it as `client_id` in the query string (`usePeople.ts:14-25`), but **the backend
  does not support this filter at all** — `parseListQuery()` in `people.controller.ts` only reads
  `page/per_page/sort/order/search/type/deleted`, and the generated `listPeople` operation in
  `schema.d.ts` (`operations["listPeople"].parameters.query`) has no `client_id` field either. Today
  this is harmless because no call site actually passes `clientId` — but it's a silent no-op filter
  waiting to confuse whoever eventually wires it up expecting it to scope results.

**`useClientPeople` — confirmed Clients-owned, confirmed already modern.** Lives in
`frontend/src/hooks/useClients.ts:124-135`, calls `apiClient.GET("/api/clients/{id}/people", ...)`
(the generated-schema `apiClient` pattern, not axios), and is consumed by
`frontend/src/features/projects/components/ProjectRoster.tsx:23,51` to scope the roster-assignment
picker to "people already linked to this project's client." This hook needs no migration — it's
already on the reference pattern and is not part of the People module's own debt.

**Soft-delete of a Person and `people_clients` — verified preserved, confirmed independently, not
symmetric with the User cascade.** Reading `softDeletePerson()`/`restorePerson()` in full: neither
function issues any query against `people_clients` — the only tables touched are `people` and
`users`. The service's own comment (*"project_people and activity_logs rows referencing this person
are left untouched (historical record)"*) doesn't explicitly name `people_clients`, but the code
itself settles it: there is no `UPDATE`/`DELETE` on `people_clients` anywhere in the soft-delete or
restore transaction. **Confirmed both halves independently, as instructed, and they are not
symmetric**: the User row gets an active state change (disabled/re-enabled) as a real, deliberate
side effect; `people_clients` rows get no side effect at all, deliberately preserved. One structural
caveat: `people_clients.people_id` is `ON DELETE CASCADE` (`001_init.sql:73`) — again, only relevant
if a person were ever hard-deleted, which no application code path does; soft-delete is the only
delete path that exists.

---

## 3. Focus Area 3 — people ↔ projects relationship (project_people roster)

**Confirmed Project-owned, no changes needed.** `useProjectPeople`, `useAssignPersonToProject`,
`useRemovePersonFromProject` all live in `frontend/src/hooks/useProjectPeople.ts` (65 lines), already
on the modern `apiClient` + `unwrapApiResult` pattern, calling `GET/POST /api/projects/{id}/people`
and `DELETE /api/projects/{id}/people/{peopleId}`. The file's own comments are precise about two real
constraints: (1) the roster **deliberately includes soft-deleted people** ("the backend keeps them
for history"), confirmed by `projectPeople.test.ts` test `[18]` (*"a soft-deleted assigned person
still appears, with deleted_at visible (history preserved)"*); (2) `role_in_project` has **no PATCH
endpoint** — verified from `schema.d.ts`, `patch` is `never` on
`/api/projects/{id}/people/{peopleId}` — so changing a role requires remove-then-reassign.

**`GET /people/:id/projects` — verified NOT to exist.** Grepped `people.routes.ts` in full (reproduced
in Focus Area 4) — it has exactly `GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST
/:id/restore`, `GET /:id/clients`, `POST /:id/clients`, `DELETE /:id/clients/:clientId`. No
`/:id/projects` route. Also checked `projectPeople.routes.ts` (mounted at `/api/projects`, not
`/api/people`, in `app.ts:45`) — it only exposes `GET/POST /:id/people` and `DELETE
/:id/people/:peopleId`, i.e. only the forward direction (given a project, list its people). **There
is no reverse lookup anywhere in the backend that answers "given a person, which projects are they
on."** This is a real, confirmed gap, not an assumption — a build ticket wanting "show this person's
project assignments" on a Person detail view would need a new backend endpoint; nothing today can
answer that question without querying `project_people` directly.

**`GET /people/:id/clients` vs `GET /clients/:id/people` — both exist, confirmed, distinct
directions.** `people.routes.ts:20` has `GET /:id/clients` (forward: given a person, list their
clients — used by `usePersonClients`/`PersonDetailDialog`). `clients.routes.ts:16` has `GET
/:id/people` (reverse: given a client, list its people — used by `useClientPeople`/`ProjectRoster`).
Both are real, both are wired to real frontend consumers, no gap here (unlike the Projects reverse
lookup above, which genuinely does not exist in either direction from the People side).

---

## 4. Focus Area 4 — RBAC, verified directly from route files

**`people.routes.ts` — reproduced verbatim**:

```ts
router.get("/", list);                                                          // no gate
router.post("/", requireAnyRole(["admin", "member"]), create);
router.get("/:id", getOne);                                                     // no gate
router.patch("/:id", requireAnyRole(["admin", "member"]), update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

router.get("/:id/clients", listClients);                                        // no gate
router.post("/:id/clients", requireAnyRole(["admin", "member"]), addClient);
router.delete("/:id/clients/:clientId", requireAnyRole(["admin", "member"]), removeClient);
```

| Action | Route | Role gate (verbatim) |
|---|---|---|
| List people | `GET /api/people` | none — any authenticated user |
| Get person detail (incl. `clients[]` + `account`) | `GET /api/people/:id` | none — any authenticated user |
| **Create person** | `POST /api/people` | `requireAnyRole(["admin","member"])` |
| **Update person** | `PATCH /api/people/:id` | `requireAnyRole(["admin","member"])` — **not admin-only**, unlike Resources' metadata PATCH |
| Soft-delete person (cascades to disable linked user) | `DELETE /api/people/:id` | `requireRole("admin")` |
| Restore person (cascades to re-enable linked user) | `POST /api/people/:id/restore` | `requireRole("admin")` |
| List a person's linked clients | `GET /api/people/:id/clients` | none — any authenticated user |
| Link a client to a person | `POST /api/people/:id/clients` | `requireAnyRole(["admin","member"])` |
| Unlink a client from a person | `DELETE /api/people/:id/clients/:clientId` | `requireAnyRole(["admin","member"])` |

Worth flagging explicitly since it's a real asymmetry versus the Resources module: **Person metadata
PATCH is `admin`-**or**-`member`**, not admin-only. Resources' equivalent metadata PATCH was
admin-only. So a `member` *can* self-service-correct a typo'd Person record; the same is not true for
Resources.

**`users.routes.ts`/`roles.routes.ts` — do not exist, so there is no role table to produce for them.**
See Focus Area 1 for the closest verifiable analog (the `auth.routes.ts` table).

**`project_people` (roster) endpoints from `projectPeople.routes.ts` (mounted under `/api/projects`,
confirmed, not under People at all)**:

```ts
router.get("/:id/people", list);                                                 // no gate
router.post("/:id/people", requireAnyRole(["admin", "member"]), add);
router.delete("/:id/people/:peopleId", requireAnyRole(["admin", "member"]), remove);
```

None of this lives under `people.routes.ts` — People's routes expose **zero** endpoints for the
Project relationship in either direction (confirmed in Focus Area 3). The only junction relationship
People's own routes expose is `people_clients` (table above).

**`clients.routes.ts`'s reverse-lookup endpoint** (for completeness, since `useClientPeople` depends
on it): `router.get("/:id/people", listPeople);` — no role gate, any authenticated user.

**Two-role system, confirmed from the frontend, relevant context for reading the tables above**:
`frontend/src/hooks/useHasRole.ts` types `Role` as exactly `"admin" | "member"` and its own comment
says *"Matches the 2-role model currently implemented server-side."* `backend/src/db/seed.ts` only
ever inserts `admin` and `member` into the `roles` table. There is no third role (e.g. a read-only
"viewer") actually assignable to any user today, even though the `roles` table itself is
schema-general enough to hold one — and there is no endpoint to create one via the API either way
(see Focus Area 1's headline finding: no roles CRUD exists).

---

## 5. Focus Area 5 — existing frontend UI inventory (People-specific)

`frontend/src/features/people/` contains:
- `PeoplePage.tsx` (48 lines)
- `components/PeopleTable.tsx` (50 lines)
- `components/PersonDetailDialog.tsx` (137 lines)
- `components/RoleFilterTabs.tsx` (30 lines)

### `PeoplePage.tsx` — reusable list shell, but far thinner than Resources/Clients/etc.
Renders a search input + `RoleFilterTabs` (type filter, hardcoded 5-value `PeopleType` list matching
the DB enum exactly) + `PeopleTable` + `PersonDetailDialog`. Calls `usePeople({ type, search })`
directly — **no `usePagination`**, same gap as Resources' `ResourcesPage.tsx`. **There is no "New
person" button, no create dialog, no edit affordance, no delete/restore UI, and no `deleted`-state
toggle anywhere in this feature** — despite `useCreatePerson`/`useUpdatePerson`/`useDeletePerson`
existing (unused) in `usePeople.ts` and `POST /:id/restore` existing on the backend (with no frontend
hook for it at all, see Focus Area 2). This is a stricter gap than Resources had: Resources at least
had a working create/new-version dialog; **People today is a pure read-only list plus a
client-relationship editor — there is no way to create, edit, delete, or restore a Person from the
UI at all.** Rating: **needs-migration** (list shell reusable once `usePagination`/`apiClient` land)
but **net-new** for every mutation surface (create/edit/delete/restore forms).

### `PeopleTable.tsx` — reusable, minimal
Plain table: name, type badge, email, phone; row click selects. No pagination controls, no sort
controls, no `deleted` visual indicator (consistent with there being no deleted-view toggle at all).
Rating: **reusable** as a base, needs pagination wiring.

### `RoleFilterTabs.tsx` — reusable
Hardcodes the same 5 `PeopleType` values as the DB enum and the Zod validator (`internal_engineer,
vendor, client_contact, project_owner, approver`) — confirmed via `people.validator.ts`'s
`PEOPLE_TYPES` const, no discrepancy. Rating: **reusable**, though the values are hardcoded
independently rather than imported from one shared source (same minor duplication pattern the
Resources audit flagged for `RESOURCE_TYPES`).

### `PersonDetailDialog.tsx` — real, but scope-limited; does not surface the linked User at all
This is the piece the briefing described as living under Clients — it does not; it's People's own
component, launched from `PeoplePage.tsx`. It:
- Shows read-only person fields (type badge, email, phone, notes) — **no edit affordance for any
  field**, this dialog is view + relationship-management only, not an edit form.
- Manages `people_clients` links: lists current linked clients with a remove button, and an
  add-client `Select` + button sourced from `useClients()` minus already-linked ones.
- **Does not fetch or display `account` at all.** The `person` prop it receives is a bare `Person`
  (from the list's `Paginated<Person>` shape, no `account`/`clients` fields) — it never calls
  `usePerson(id)` to get the richer `PersonDetail` shape (`account: {id, username, active} | null`)
  that `GET /api/people/:id` actually returns. So **today there is zero UI anywhere that shows
  whether a Person has a linked User account, or whether that account is active/disabled** — this is
  a real, confirmed gap, not a hypothetical: the backend computes and returns exactly this
  information (verified in Focus Area 1 and in `PersonDetail`'s schema at
  `frontend/src/api/generated/schema.d.ts:936-949`), and no frontend code path ever requests or
  renders it.

Rating: **needs-migration** (off legacy axios) + **net-new** (the account-visibility gap, and any
edit-in-place affordance, would be new work — nothing to "extend," this dialog was never built with
User-linkage in mind).

### `ManageUsersPage.tsx` — real route, explicit self-documented stub
`frontend/src/features/settings/ManageUsersPage.tsx` (54 lines), routed at
`/settings/manage-users` in `frontend/src/routes/AppRoutes.tsx:41`. It is **not a dead shell in the
sense of being forgotten** — it explicitly renders its own limitation as UI copy: *"User
administration (inviting users, editing roles) requires backend endpoints that are not yet
implemented — this page currently reflects only the authenticated session."* All it actually shows is
the current session's own `username`/`email`/`roles` via `useAuth()`. There is no list of other users,
no invite flow, no role-editing UI — and per Focus Area 1, none of that could be built today without
first building the entire backend Users API from scratch. Rating: **net-new**, and unusually so —
this isn't "wire up existing endpoints," it's "there are no endpoints to wire up yet."

### `usePeople.ts` — confirmed legacy axios, full call-site inventory already given in Focus Area 2
Hand-rolled types (`PeopleFilters`, `PersonLinkedClient`) rather than `apiClient` +
`components["schemas"][...]`. Same debt category as `useResources.ts`/`useResourceVersions.ts` from
the prior audit.

### No `useUsers.ts` exists at all
Grepped the full `frontend/src` tree — no file named `useUsers.ts` or similar, and no hook anywhere
calls a `/api/users*` path (there is nothing to call). The only "users" surface on the frontend is
`useAuth.ts` (self only) and the read-only `account` field nested inside `PersonDetail` (currently
unused, per above).

**Is there a Person detail *view* distinct from `PersonDetailDialog`?** No — confirmed via
`AppRoutes.tsx`: there is no `/people/:id` route at all, only `/people` (list). Unlike
Projects/Environments/Servers, which each have a dedicated detail *page*, People's only "detail" UI
is the dialog opened from the list row, and that dialog (as shown above) doesn't even surface
everything the detail endpoint returns.

---

## 6. Focus Area 6 — optimistic locking / 409 reality

**Person update — yes, standard pattern, verified.** `updatePersonSchema` requires `updated_at:
z.string().min(1)`, and `updatePerson()` in the service does the identical
millisecond-truncated compare-and-swap every other module uses:
```sql
WHERE id = $1
  AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
  AND deleted_at IS NULL
```
A stale `updated_at` produces 0 matched rows → `409 CONFLICT "Person was modified by someone else;
refresh and try again"`. Confirmed by a dedicated test: *"returns 409 CONFLICT when updated_at is
stale"*. So a future Person-edit UI needs the same `useConflictResolution`/`ConflictState.tsx`
treatment as every other module — no surprises here. (Note: **no frontend edit form exists to need
this yet** — `useUpdatePerson` is defined but has zero call sites, per Focus Area 2/5.)

**User update — does not fit this pattern at all, and this is a structural, not incidental,
difference.** There is no generic "update a user" endpoint. What exists instead:
- `POST /api/auth/change-password` — self-service only (operates on `req.user`, no `:id` param, no
  `updated_at`), a completely different shape from the standard entity-edit pattern: it takes
  `current_password`/`new_password`, verifies the current password via `bcrypt.compare`, and writes a
  new hash. No optimistic lock is possible or needed here because there's no "which version of the
  record am I editing" concept — it's a credential-rotation action, not a field-level metadata edit.
- The only other writes to `users` are the cascade side-effects inside `softDeletePerson()`/
  `restorePerson()`, which touch only `deleted_at`/`updated_at` and are triggered by the *Person's*
  `id` and the *Person's* own `updated_at` optimistic lock — the User row itself carries no
  lock-relevant input from the client at all in this path.
- There is no endpoint anywhere to change a user's `username`, `email`, or role assignments. If one
  were built, whether it should carry `updated_at` (standard entity-edit pattern) or look more like
  `change-password` (self-contained action, no optimistic lock) is an open question — call this out
  explicitly as a distinct design concern, not something the existing pattern already answers.

---

## 7. Standard sections

### API shape mismatches
- **People**: one real (if currently inert) mismatch — `usePeople.ts`'s `PeopleFilters.clientId` →
  `client_id` query param is sent by the frontend hook's type signature but is not defined in
  `operations["listPeople"]`'s query params in `schema.d.ts`, and is silently ignored by
  `parseListQuery()` in `people.controller.ts` (Focus Area 2). No live call site exercises it today,
  so it's dormant, not actively broken.
- **People**: `frontend/src/types/index.ts` defines a legacy `Person` interface by hand (matches the
  generated `Person` schema field-for-field, verified) rather than importing
  `components["schemas"]["Person"]` — no discrepancy found, but it's a second, independently
  maintained source of truth that could drift.
- **Users**: `frontend/src/types/index.ts:76-85` defines a `User` interface that includes
  **`password_hash: string`** as a client-side field. This is a real, if currently harmless, hazard —
  no API response the frontend ever receives (`/auth/login`, `/auth/me`, `PersonDetail.account`) ever
  includes `password_hash`; this interface appears to be a raw copy of the DB row shape rather than
  any actual response shape. Confirmed **zero import/usage of this `User` type anywhere in
  `frontend/src`** (grepped) — genuinely dead code, but the kind worth deleting before anyone
  mistakes it for a real API contract and tries to display/log `password_hash`. `UserRole` and
  `PeopleClient` interfaces in the same file are similarly defined but have zero import/usage
  anywhere.
- **Users**: the real `AuthUser` type actually used by the app (`frontend/src/features/auth/
  useAuth.ts:4-10`, `{id, username, email, peopleId, roles}`) has no relation to the dead `User`
  type above and is correctly scoped to what `/auth/login`/`/auth/me` actually return.

### Missing frozen-spec behavior
- Pagination: backend fully supports it on `GET /people` (`page`/`per_page` up to 100, `sort`,
  `order`); frontend `usePeople()` calls it with only `type`/`search`, never `page`/`per_page` — same
  gap pattern as Resources, confirmed independently here.
- Soft-delete/restore for `people`: backend fully implements it (`deleted_at`, `deleted` query param
  with `false`/`true`/`all` modes, restore endpoint, plus the User-cascade); **zero frontend UI**
  exists for delete, restore, or viewing deleted people — no `useDeletePerson`/`useRestorePerson` call
  sites, no `deleted`-filter toggle in `RoleFilterTabs.tsx` or anywhere else in the People feature.
- Soft-delete/restore for `users` as an **independent** surface: does not exist and cannot exist
  today without new backend work — confirmed there is no `users.routes.ts` at all (Focus Area 1). All
  "soft-delete a user" today is purely cascade-driven from the Person side; a user can never be
  independently soft-deleted or restored through any API call, only through the Person's endpoints or
  direct SQL.
- Minor, People-specific: `listPeopleQuerySchema` (Zod) is defined in `people.validator.ts:28-36` but
  **never imported/used anywhere** — `people.controller.ts`'s `parseListQuery()` does its own manual
  `parseInt`/`Set`-membership parsing instead of running the request through this schema. Not a
  functional bug (the manual parsing has sane defaults/clamping), but it means the Zod schema is dead
  code and the two could silently drift (e.g. if a future engineer edits the schema, believing it's
  the actual validation, without realizing it's unused).

### State management
- `usePeople.ts` is the only People-module hook file, and it is entirely on legacy axios (`@/lib/
  api`), consistent with `useResources.ts`'s status from the prior audit — this module has not been
  touched by the `apiClient` migration at all.
- React Query cache key is a flat `"people"` string const (`KEY = "people"`) used for both the list
  and all sub-resource keys (`[KEY, id]`, `[KEY, personId, "clients"]`) — reasonable, and mutation
  `onSuccess` handlers invalidate correctly (e.g. `useAddPersonClient`/`useRemovePersonClient`
  invalidate exactly `[KEY, variables.personId, "clients"]`, not the whole `people` list, since
  linking a client doesn't change the Person's own list-visible fields).
- `useProjectPeople.ts`/`useClientPeople` (the two relationship hooks People's own UI doesn't own) are
  both already on the modern `apiClient` pattern — no debt there, confirmed in Focus Areas 2 and 3.

### Foundation gaps (same checklist categories as the Resources audit)
- No `RequireRole` gating anywhere in `frontend/src/features/people/` — grepped, zero matches. Since
  there's also no create/edit/delete/restore UI at all yet, there's currently nothing *to* gate, but
  this will need to be added alongside whichever ticket builds those forms (create/edit ⇒
  `admin`+`member` per the route table; delete/restore ⇒ `admin`-only).
- No `ConfirmDialog` usage — no delete/restore UI exists to need one yet.
- No `usePagination` integration on `PeoplePage.tsx`.
- No `ConflictState`/`useConflictResolution` integration — no edit UI exists yet to need it, despite
  the backend's optimistic-lock contract being fully ready and tested (Focus Area 6).
- Legacy axios data layer (`usePeople.ts`), not `apiClient` — same debt bucket as Resources.
- Duplicated `PeopleType` literal list (`RoleFilterTabs.tsx` hardcodes the same 5 values as
  `people.validator.ts`'s `PEOPLE_TYPES` and `types/index.ts`'s `PeopleType`) rather than one shared
  source — minor, same pattern flagged for `RESOURCE_TYPES` previously.
- **People-specific, larger-than-usual foundation gap**: unlike every other reference module, People
  has **no create/edit/delete/restore UI at all** today — it is the thinnest frontend surface of any
  module audited so far, despite the backend being fully built (create/update/delete/restore all
  exist, tested, RBAC-gated) and despite `useCreatePerson`/`useUpdatePerson`/`useDeletePerson` already
  existing as dead code in `usePeople.ts`, ready to be wired up.
- **Users-specific foundation gap, categorically different from anything the Resources audit
  encountered**: there is no backend foundation to build a frontend on top of at all. Every other gap
  in this audit is "frontend hasn't caught up to a ready backend." For Users, the backend itself does
  not have the surface (`users.routes.ts`, controller, service, validator, roles management) that a
  "Manage Users" page would need to call. This is not a frontend-only ticket.

---

## Prioritized punch list

### A. Mechanical reuse — follows established patterns already proven in Clients/Projects/Environments/Servers/Resources
1. Migrate `usePeople.ts` off legacy axios onto `apiClient` + `components["schemas"][...]` generated
   types — audit the `ScheduleFormDialog.tsx` cross-module call site as part of this, not after.
   Drop the dead `clientId`/`client_id` filter field from `PeopleFilters` while doing this, or wire it
   up on both ends if it's actually wanted.
2. Wire `usePagination` into `PeoplePage.tsx`/`PeopleTable.tsx` (backend already supports
   `page`/`per_page`/`sort`/`order` — pure frontend work, identical shape to Resources' gap).
3. Build a create-person dialog using the already-defined-but-unused `useCreatePerson` hook. Gate
   with `RequireRole(["admin","member"])` per the route table (Focus Area 4).
4. Build an edit-person form using the already-defined-but-unused `useUpdatePerson` hook, with the
   standard `useConflictResolution` + `ConflictState.tsx` pattern (Focus Area 6 confirms the backend
   contract is a plain, already-tested `updated_at` optimistic lock — no surprises). Gate
   `admin`+`member` (not admin-only — note the asymmetry with Resources' metadata PATCH).
5. Build soft-delete + restore UI: wire up the already-defined-but-unused `useDeletePerson`, and
   **write a new `useRestorePerson` hook** (doesn't exist yet, unlike delete) calling `POST
   /api/people/:id/restore`. Use the established `ConfirmDialog` pattern, gate `admin`-only, plus a
   `deleted` filter/toggle in `RoleFilterTabs.tsx` or a new filter control, mirroring other modules'
   deleted-item views.
6. Delete the dead `User`/`UserRole`/`PeopleClient` interfaces from `frontend/src/types/index.ts`
   (zero usages found anywhere) — low-risk cleanup, but the `password_hash` field on `User` is worth
   removing sooner rather than later so it's never mistaken for a live contract.
7. Dedupe the hardcoded `PeopleType` list between `RoleFilterTabs.tsx`, `people.validator.ts`, and
   `types/index.ts` into one shared constant (same category as Resources' `RESOURCE_TYPES` finding).
8. Either wire `listPeopleQuerySchema` into `people.controller.ts`'s list handler (replacing the
   manual `parseListQuery()` parsing) or delete the unused schema — currently dead and could drift.

### B. Genuinely novel — no reference-module precedent, and larger in scope than a typical "wire up the frontend" ticket
9. **Surface the linked User account on the Person detail view.** `PersonDetailDialog.tsx` never
   fetches or shows `PersonDetail.account` (`{id, username, active} | null`) even though the backend
   already computes and returns it on `GET /api/people/:id`. At minimum this means switching the
   dialog to call `usePerson(id)` (fetching the full `PersonDetail` shape) instead of relying on the
   bare `Person` passed in from the list. What to *show* about the linked account, and what actions
   (if any) to offer, is the single most novel piece of scope in this whole module — see Open Design
   Questions below.
10. **There is no backend Users API to build a "Manage Users" admin surface against.** Building real
    admin user-management (list all users, create a user account — linked to an existing Person or
    standalone, assign/change roles, independently disable/restore a user) requires **new backend
    work first**: `users.routes.ts`, `users.controller.ts`, `users.service.ts`, `users.validator.ts`,
    and very likely `roles.routes.ts`/`roles.controller.ts`/`roles.service.ts` too (no roles-CRUD
    exists either). This is not comparable in size to any other "novel" item in the prior Resources
    audit — it's closer to standing up an entirely new module from scratch, RBAC design included.
11. Decide the shape of a "change another user's password" / "reset password" admin flow, since the
    only password-change path today (`POST /api/auth/change-password`) is self-service-only by
    construction (operates on `req.user`, no target-user parameter) — an admin reset flow would need
    a new endpoint with its own (currently undecided) authorization and shape.
12. Decide whether the disable/restore-user-independent-of-Person path (Focus Area 1: currently only
    reachable via direct SQL, confirmed to have zero effect on the linked Person if it were ever
    exercised through a hypothetical new endpoint) should ever be exposed as its own admin action, or
    whether User lifecycle should remain permanently and exclusively cascade-driven from Person.

---

## Open Design Questions — Requires User Decision Before Build

These are unresolved by the audit and need a human decision before any People/Users ticket can be
scoped with confidence:

1. Should a Person's detail view (today, `PersonDetailDialog.tsx`) offer to **create/link a User
   account inline** (e.g. a "Create login" button when `account === null`), or is account creation
   always a separate, dedicated admin action/page? This determines whether item 10's future "create
   user" endpoint needs a `people_id` pass-through from the Person UI or is entirely standalone.
2. If a Person already has a linked, active account, what should the detail view actually show and
   let an admin do — just the read-only `{username, active}` that's already fetched today, or also:
   disable this account (independent of soft-deleting the Person), reset its password, view/edit its
   roles? Each of these implies a different, currently-nonexistent backend endpoint.
3. Should `role_in_project`-style role assignment for *system* roles (the `admin`/`member` on
   `user_roles`) ever be a multi-select (a user holding more than one role) in the eventual UI, or is
   it expected to stay single-role in practice even though the schema (`user_roles` is a many-to-many
   junction table) already supports multiple roles per user today?
4. Is a third role tier (e.g. read-only "viewer") ever planned? Nothing in the schema blocks adding
   one (`roles` is a normal table), but `useHasRole.ts`'s `Role` type and every `requireAnyRole(["admin",
   "member"])` call across the whole backend would need auditing/updating if a third role were
   introduced — worth deciding now since it changes how narrowly "admin or member" gates should be
   read going forward.
5. For the disable-a-user-independent-of-Person question (punch list item 12): is there a real
   business need for a user to be disabled while its linked Person stays fully active (e.g. a
   contractor's system access revoked while they're still a valid contact/roster member), or should
   User lifecycle remain permanently 1:1 with Person lifecycle as it is today?
6. Should `GET /api/people/:id/projects` (the confirmed-missing reverse lookup, Focus Area 3) be
   built at all? Nothing today needs it (no UI currently attempts to show "this person's projects"),
   but if a future Person detail view is meant to be a real hub page (rather than the current
   lightweight dialog), this becomes a real backend gap to close.
7. Should `PeoplePage.tsx` grow a real `/people/:id` detail **route** (matching the pattern
   Projects/Environments/Servers already use), replacing or supplementing the current
   dialog-from-list-row pattern? This affects whether the account-visibility work (punch list item 9)
   and any future project-roster-on-person view (open question 6) belong on a dedicated page or stay
   inside an expanded dialog.
8. Given Person update is `admin`-**or**-`member` (not admin-only, unlike Resources' metadata PATCH)
   — is that intentional and should stay that way, or was Resources' admin-only metadata gate meant
   to be the shared pattern going forward? Worth confirming since it's an asymmetry between two
   modules built at different times, and whoever scopes the edit-Person ticket needs to know which
   role set to gate the button with.

---

## Suggested sub-part breakdown

- **People-a — People list + create/edit/delete/restore CRUD + RBAC gating**: migrate `usePeople.ts`
  off legacy axios, wire `usePagination`, wire up the already-defined `useCreatePerson`/
  `useUpdatePerson`/`useDeletePerson` hooks into real UI, write the missing `useRestorePerson` hook,
  add `ConfirmDialog`/`ConflictState`/`RequireRole` per the established pattern, dedupe the
  `PeopleType` constant, clean up the dead `User`/`UserRole`/`PeopleClient` types and the unused
  `listPeopleQuerySchema`. This is the direct People-side analog of the Resources module's 24a/24b
  and can be scoped with the same confidence — nothing here depends on unresolved design questions.
- **People-b — Person↔User visibility on the detail view**: switch `PersonDetailDialog.tsx` (or its
  replacement, if Open Design Question 7 favors a dedicated route) to fetch and display the full
  `PersonDetail.account` shape. Scope depends entirely on answers to Open Design Questions 1 and 2 —
  showing read-only status is a small ticket; adding inline account actions (disable/reset
  password/create login) is not, and shades into People-c/Users-a below.
- **Users-a — Backend Users API foundation (net-new, not a migration)**: build `users.routes.ts` +
  controller + service + validator (list, get, create, update, soft-delete/restore as independent
  endpoints) and `roles.routes.ts` + controller + service (list roles, assign/unassign a role to a
  user) from scratch, following the same RBAC-gated, optimistic-locked, activity-logged conventions
  every other module already uses. This is a backend-first ticket — no frontend work should start
  before this lands, since `ManageUsersPage.tsx` today has nothing real to call. Scope depends on
  Open Design Questions 1, 2, 3, 4, 5.
- **Users-b — Manage Users frontend**: once Users-a exists, build the actual admin page (`useUsers.ts`
  hook on the modern `apiClient` pattern from day one, list/create/edit/role-assignment/disable UI in
  `ManageUsersPage.tsx`, replacing its current self-documented stub). This is the first People/Users
  sub-part that would actually look like a normal "reuse the established pattern" ticket, but only
  once Users-a supplies something to reuse the pattern against.
