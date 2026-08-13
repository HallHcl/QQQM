# QQM — Project Decisions

This document records decisions with long-term consequences for the QQM frontend
refactoring project. It exists to prevent re-litigating settled questions in future
sessions (human or AI). If a decision here conflicts with something in the code,
**the code is not automatically right** — flag the discrepancy and confirm with the
project owner before changing either.

Related documents:
- `architecture.md` — system structure, verified from source
- `api-spec.md` — human-readable API contract summary, verified from source
- `progress.md` — part-by-part completion tracker
- `development-guide.md` — rules the coding agent must follow on every ticket

---

## 1. Backend is frozen — non-negotiable

The backend (17 parts, 156/156 tests passing, OpenAPI spec + generated TypeScript
client) is **complete and frozen**. It is not "incomplete" or "missing features" —
it is fully implemented and tested against its intended scope.

**No ticket may modify backend code**, no matter how small the change seems, no
matter how clearly it would "complete" a feature, and no matter how mechanical the
fix looks. This includes:
- Adding new routes, controllers, services, or validators.
- Adding new columns, tables, or migrations.
- Adding filter parameters, enum values, or endpoints that don't currently exist.
- "Small" fixes to bugs discovered in backend code during frontend audits.

If a frontend need genuinely requires new backend capability, the correct response
is: **do not build it**. Document it as `BLOCKED / FUTURE` (see decision #7 for the
canonical example) and defer it to a separate, explicitly-scoped backend phase with
its own audit → design → implement → test cycle. Opening ad hoc backend exceptions
turns "frontend refactor" into "full-stack feature development" and breaks the
invariant the whole project depends on.

**Corollary**: if the frontend hook currently sends a param/field the backend
doesn't support (a "dormant" or "dead" filter), the fix is to **remove it from the
frontend**, not to add backend support for it. The frontend must never imply a
contract that doesn't exist server-side. (Concrete example: `usePeople.ts`'s
`clientId` filter was removed in Part 25b rather than wired up backend-side.)

---

## 2. Frontend refactor is module-by-module, following one fixed workflow

**Audit (read-only) → Design decision conversation → Build → Test → Verify → Next module.**

Never combine audit and build in the same ticket. Never skip the audit. The audit's
job is to establish ground truth from actual source code — never from the RBAC
matrix document, never from the original project briefing's prose descriptions, and
never (after the first couple of modules) from a *previous module's* audit findings
without independent re-verification.

This discipline exists because the RBAC matrix and the original design-doc summaries
have been **wrong or imprecise for nearly every module audited**:
- Clients: Update has no role restriction (not admin+member as assumed).
- Projects: Create/Update are admin-only (not admin+member as the matrix claimed).
- Environments: ALL write actions are admin-only — no status/type field exists at
  all despite being described in the original design doc.
- Resources: the type enum has 7 values, not the 5 named in the briefing.
- Servers: RBAC on `credential_references` is on its own separate route file, not
  inherited from Servers, despite the numbers happening to line up.
- People: there is no `users.routes.ts`/`roles.routes.ts` at all — Users management
  doesn't exist as an API surface, contradicting the briefing's implication that it
  did.

**Every RBAC claim, every enum value, every cascade behavior must be verified by
directly reading the relevant backend route/service/validator file**, with
`file:line` citations, before it's used to scope a build ticket.

---

## 3. Existing UI/theme is frozen; this is data-layer + functional wiring, not a redesign

The Razer-inspired dark theme (near-black `#0A0A0A` background, `#44D62C` green
accent, sharp corners, Inter font, no shadows, existing shadcn/ui primitives) is
**not to be changed** during this phase. Every build ticket is instructed to match
existing patterns (list layout, dialog chrome, button placement) from
already-completed modules rather than invent new visual language.

This phase's goal is: **every module correctly wired to the frozen backend contract**
— correct error handling, correct RBAC gating, correct optimistic locking, correct
cascade behavior, correct pagination. It is explicitly **not** a visual polish phase.
See decision #9 for when visual polish happens.

---

## 4. Foundation pieces are built once, shared everywhere

Rather than let each module invent its own version of a recurring need, foundation
pieces are built as small, dedicated tickets the first time a real need appears, then
reused as-is by every subsequent module:

| Foundation piece | Built in | Reused by |
|---|---|---|
| Typed API client, global error handling, React Query config | Part 19 | every module |
| Vitest + RTL test layer | Part 19.1 | every module |
| `useHasRole` / `RequireRole` (RBAC) | Part 19.2 | every module from Clients onward |
| `ConflictState.tsx` (409 UI) | Part 20c (Clients) | every module with optimistic locking |
| `ConfirmDialog` (generic confirmation) | Part 21c (Projects) | every module's delete/restore flows |
| `ProjectPicker` | Part 22a.5 (extracted from 3 duplicated implementations) | Environments, Schedule, etc. |
| `EnvironmentPicker` | Part 23c (Servers) | Schedule |
| `ServerPicker` | Part 26e (Schedule) | — |
| Detail View pattern | Part 21d (Projects) | Environments, Servers |

When a module's audit reveals duplicated logic across files (e.g. `RESOURCE_TYPES`
hardcoded in two places, or a picker re-implemented independently three times), the
build ticket dedupes it into one shared source rather than leaving the duplication
to grow. This has paid off directly — e.g. building `RequireRole` once in 19.2 meant
every subsequent module's RBAC gating was near-mechanical instead of novel work.

---

## 5. RBAC in the frontend is UX only, never the security boundary

`useHasRole`/`RequireRole` control what's *shown* in the UI (don't show a Delete
button to someone who'll just get a 403) for a better experience. They do **not**
replace backend enforcement, which is the actual security boundary and is already
complete. No code or comment should imply client-side role checks are a security
control.

---

## 6. Cascade behavior and confirmation-dialog copy must be verified per module, never assumed from another module's precedent

Every module's delete/restore behavior has been independently verified from the
actual service code, and the findings have **not** been consistent across modules —
which is exactly why each one had to be checked rather than inferred:

- Projects soft-delete: does **not** cascade to Environments/Servers/Schedules at
  all (surprising, given the data model's prose language implied stronger coupling).
- Environments soft-delete: **does** cascade to Servers (hard-deletes their
  `credential_references`, soft-deletes the servers) — the opposite finding from
  Projects, in the very next module.
- Environment restore: does **not** cascade-restore Servers — a genuine, permanent
  data-loss asymmetry (credential references were hard-deleted, not soft-deleted).
- Servers soft-delete (standalone, not via Environment cascade): also hard-deletes
  its own `credential_references` independently.
- Resources soft-delete: does **not** touch `resource_versions` at all (soft-delete
  is an `UPDATE`, so the `ON DELETE CASCADE` FK never fires).
- People soft-delete: cascades to **disable** (not delete) a linked User account;
  does **not** touch `people_clients`. Restoring the Person re-enables the User.
- Schedule soft-delete: no cascade — Schedule is a leaf entity (confirmed: no table
  in the entire schema has a foreign key into `schedules.id`).

**Confirmation-dialog copy must reflect the real, verified behavior for that specific
module** — copy warning about data loss that doesn't actually happen (or, worse,
failing to warn about data loss that does happen) is worse than no dialog at all.
Similarly, whether **restore** needs its own `ConfirmDialog` is decided per-module
based on real data-loss risk found during that module's own investigation (e.g.
Environments' restore got a confirmation because of the Servers-don't-come-back
asymmetry; Clients/Projects/People/Schedule's restores did not, because there was no
equivalent risk).

---

## 7. Users CRUD (and Roles CRUD) is BLOCKED / FUTURE

**Status:** BLOCKED / FUTURE — not started, not scheduled within this phase.

**Why:** Part 25a's audit of the People module found there is **no
`users.routes.ts`, `users.controller.ts`, `users.service.ts`, `users.validator.ts`,
or `roles.routes.ts`/etc. anywhere in the backend.** Every `users`/`user_roles` row
in the system is created exactly once by `backend/src/db/seed.ts` via raw SQL — there
is no API path to create a second user account, list all users, or assign/change
roles. `ManageUsersPage.tsx` is a real, working, **self-documented stub**: it
explicitly renders copy stating this limitation and shows only the current session's
own `username`/`email`/`roles` via `useAuth()`.

Building real "Manage Users" admin functionality (list accounts, create an account,
assign/change roles, independently disable/restore a user separate from its linked
Person) would require **building an entire new backend module from scratch** — this
violates decision #1 (backend is frozen) and is explicitly out of scope for this
refactoring phase.

**This is correctly framed as "a feature that was never implemented," not as "the
backend is incomplete."** The backend is complete relative to what was built and
tested. Users-as-an-independently-manageable-resource was simply never part of that
scope.

**What exists and is sufficient for now:**
- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`,
  `POST /auth/change-password` (self-service only) — all working, all frontend-wired.
- An admin can create a new user account via direct SQL/seed if genuinely needed.
- Soft-deleting/restoring a Person correctly cascades to disable/re-enable its linked
  User (verified, Part 25a) — this is the only "user lifecycle" operation the app
  needs today, and it already works end-to-end.
- `PersonDetailDialog.tsx` was decided to show the linked User's account status
  **read-only only** ({username, active}), with no inline actions — but this
  specific piece of work (Part 25c) was also deferred/skipped since it's not useful
  without the broader Users decision being unblocked first.

**When this is eventually tackled**, it should be opened as its own project phase
with its own audit → API design → implement → test → wire-frontend cycle — not
squeezed into an existing module's ticket.

---

## 8. Two-role system (`admin` | `member`) — no third role today

`frontend/src/hooks/useHasRole.ts` types `Role` as exactly `"admin" | "member"`,
matching what's actually implemented server-side (`backend/src/db/seed.ts` only ever
inserts these two roles). There is no third role (e.g. a read-only "viewer") today,
even though the `roles` table itself is schema-general enough to hold one — and per
decision #7, there's no API to create one anyway.

If a third role is ever introduced, every `requireAnyRole([...])`/`requireRole(...)`
call across the backend and every `RequireRole roles={[...]}` call across the
frontend would need auditing — this is a real, deferred, and currently unscheduled
piece of future work, not an oversight in the current implementation.

---

## 9. UI/UX visual polish happens only after Frontend Functional Complete

The current phase's goal is 100% of modules correctly wired to the frozen backend —
functional correctness, not visual refinement (see decision #3). Once **all**
modules (Clients, Projects, Environments, Servers, Resources, People, Schedule,
Activity) are functionally complete, a **separate, later phase** will address visual
polish: spacing, micro-interactions, animation, responsive breakpoints,
empty-state illustration, etc.

**Why wait:**
1. Doing polish module-by-module during functional wiring would create visual
   inconsistency between early-finished and later-finished modules, requiring
   rework.
2. Every module shares components (`ConfirmDialog`, `ConflictState`,
   `LoadingState`/`EmptyState`/`ErrorState`, list/table layout patterns) — polishing
   those shared components *once*, after everything is functionally stable, improves
   every module simultaneously rather than requiring N separate passes.
3. The current phase's agent role/prompting style ("Senior Frontend Engineer with UX
   sensibility," explicitly barred from changing design tokens) is deliberately
   different from what a polish phase needs ("Senior UX/UI Designer + Frontend
   Engineer," free to touch spacing/animation/visual language within the existing
   Razer-inspired theme).

---

## 10. Reporting format for build/audit tickets (adopted starting Part 26c)

Every ticket sent to the coding agent should end with a mandatory structured report
(see `development-guide.md` for the exact template) rather than free-form prose.
This was adopted mid-project (after Part 26b) because:
- It forces the agent to address every category (files changed, verified facts,
  deviations, known gaps, test/build status) explicitly, rather than relying on the
  agent's judgment about what's worth mentioning — reducing the risk of a real
  finding (like an RBAC discrepancy) getting buried in prose.
- It's faster to scan/verify against than equivalent-content prose.
- The "Verified facts" section specifically must **never** be compressed — full
  `file:line` / test-name citations are what make it possible to trust a finding
  without re-verifying it independently.

Parts 19 through 26b used free-form prose reporting; this is retroactively
acceptable since those reports were already thorough, but all tickets from Part 26c
onward use the structured format.

---

## 11. Known API inconsistencies (discovered during architecture.md/api-spec.md verification, Part "docs", and the subsequent independent Verifier AI pass)

These are real, verified, backend-frozen inconsistencies — not bugs to fix (backend
is frozen, decision #1), but facts worth knowing before they cause confusion in a
future ticket. One item below (Clients' deleted-filter frontend bug) *was* fixed,
since it was a frontend contract violation, not a backend limitation — see its entry
for the distinction.

- **Activity-logging call site varies by module.** Every module logs activity from
  the *service* layer except **Clients**, which logs from the *controller* layer
  (`clients.controller.ts:61,89,106,135`). This doesn't break the "same transaction,
  last statement before commit" guarantee for Clients specifically (verify this
  holds if a future ticket touches Clients' activity logging), but do not assume
  the service-layer pattern applies uniformly if you're reading Clients' code as a
  reference for how activity logging works elsewhere — read the actual module you
  care about.
- **Clients' `deleted` list filter is boolean-only** (`clients.controller.ts:35`,
  `clients.service.ts:32-33`) — no `"all"` mode. Every other soft-deletable module
  supports the standard three-state `"false"|"true"|"all"` filter (confirmed
  honored server-side, e.g. `people.service.ts:51-54` adds no `deleted_at`
  condition at all when mode is `"all"`, returning both). This is a genuine
  backend-level asymmetry, not fixable without a backend change (out of scope per
  decision #1).
  - ✅ **FIXED, frontend side — bug-fix ticket, post-Schedule.** An independent
    Verifier AI review (see decision #10 for the Verifier AI's role) found that
    `ClientsPage.tsx` was still *offering* an "All" option and `useClients.ts` was
    still *sending* `deleted="all"` to the backend — which the backend silently
    treats as active-only, so the "All" filter was a live, reproducible no-op bug,
    not just a theoretical asymmetry. This violated `development-guide.md` rule #1
    (never let the frontend imply a contract the backend doesn't support) — the
    same class of bug already caught and fixed for People's `clientId` filter in
    Part 25b, but missed for Clients itself since it shipped earlier (Part
    20b/20d), before the pattern was being checked for consistently. Fixed:
    removed the "All" option from `ClientsPage.tsx`; narrowed `useClients.ts`'s
    accepted `deleted` type to exclude `"all"` at compile time AND added a runtime
    guard so it can never leak through even via a type-bypassing cast. The shared
    `usePagination.ts`'s `DeletedFilter` type (`"false"|"true"|"all"`) was
    deliberately left untouched, since every other module legitimately needs all
    three states — the fix narrows only at the `useClients.ts` boundary.
  - **Still open, backend-frozen, cannot be fixed:** `backend/openapi.yaml`'s
    `listClients` operation still documents `deleted?: "false"|"true"|"all"`,
    which is inaccurate for Clients specifically (the generated
    `frontend/src/api/generated/schema.d.ts` inherits this same inaccuracy). This
    is a pre-existing documentation error in the frozen backend surface — out of
    scope to fix (decision #1), noted here so a future reader isn't confused by
    the generated type technically allowing a value the controller doesn't honor.
- **Activity's `sort` param is validated but never actually used** —
  `activityLogs.validator.ts:21` accepts a `sort` param, but the service always
  orders by `created_at` regardless of what's passed. Relevant for the Activity
  module audit (Part 27a) — don't build sort-column UI for this endpoint expecting
  it to have an effect.
- **`usePagination.ts`'s own header comment is stale** — it still says "not wired
  into any page yet" (a leftover from Part 19), but it's actually consumed by 7 list
  pages as of Schedule's completion. Harmless (doesn't affect behavior), but worth a
  one-line comment fix next time that file is touched for an unrelated reason.
- **DB-level `ON DELETE CASCADE` foreign keys are largely dormant across the
  schema.** Every actual delete path in the application is a soft-delete
  (`UPDATE ... SET deleted_at`), so the real cascade behavior for any given entity
  is whatever its service function explicitly codes — the DB-level CASCADE
  constraints only matter for the direct-SQL/seed-script edge cases mentioned
  elsewhere (e.g. `decisions.md` #7's discussion of hard-deleting a User directly).
  Do not read a table's DB-level FK constraint as a description of the app's actual
  cascade behavior — verify the service function instead, per decision #2/#6.
- **Auth roles are baked into the JWT at login/`me` time, not re-checked live per
  request.** `auth.service.ts` only fetches a user's roles at login/`me` time; the
  auth middleware trusts the roles already present in the JWT payload for every
  subsequent request in that session. This has no practical effect today (no way to
  change a user's roles via any API, per decision #7), but matters the moment Roles
  CRUD is ever built: a role change would not take effect for an already-logged-in
  user until their next login/token refresh. Worth remembering when decision #7's
  future Users/Roles phase is eventually scoped.

---

## 12. Independent verification pass (Verifier AI, post-Schedule) — result: mostly reliable, minor corrections applied

After Schedule module completion and the initial `docs/` generation, an independent
Verifier AI (ChatGPT Work, connected directly to the QQM repository — see note
below on tooling) was asked to spot-check `architecture.md`/`api-spec.md`'s
citations against actual source, rather than trusting the coding agent's own claim
that everything was verified. This is a deliberate, separate review step — the
"architect AI" (no repo access) and the "coding agent" (writes the code being
reviewed) are both too close to the work to be a fully independent check.

**Tooling note:** the Verifier AI must have direct, live repository access (not
just uploaded `.md` files) to do this job — a plain browser chat session that only
sees attached documents cannot independently open cited source files, and will
just re-confirm internal document consistency rather than actually verifying
citations. As of this writing, that requires ChatGPT's **Work** surface with the
QQM project connected (a plain ChatGPT browser chat does not have this), or an
equivalent tool with real filesystem/repo access (Claude Code, the same VSCode
Agent used for implementation, etc.).

**Result:** the Verifier independently re-opened 12+ cited files across
`architecture.md`/`api-spec.md` and found every RBAC/cascade/optimistic-lock
citation checked out exactly as claimed. It found no fabricated citations. What it
did find:
- The Clients `deleted="all"` frontend bug (above — fixed).
- `progress.md` was stale about `architecture.md`/`api-spec.md`'s own completion
  status at the time of the check (has since been corrected).
- Minor stale wording inside `architecture.md`/`api-spec.md` themselves (phrases
  like "not documented elsewhere" that became inaccurate once decision #11 was
  written) — left as-is per the project's "don't auto-update `architecture.md`/
  `api-spec.md` on every change, only when genuinely stale" policy; to be cleaned
  up the next time either file is touched for a real reason, not as its own ticket.

**Practical takeaway:** this pass is worth repeating periodically (not necessarily
after every module) — it found one real, live, user-facing bug that had shipped
undetected since Part 20b/20d, despite this project's heavy emphasis on
verify-from-source discipline. A second pair of independent eyes with real repo
access caught something the first two collaborators (architect + implementer) both
missed.

---

## 13. Known gap: `usePagination` has no URL-state persistence (2026-08-13, found during Activity build, Part 27b)

**Status:** Known gap, deferred — cross-cutting, affects all 8 modules identically.

`frontend/src/hooks/usePagination.ts` holds `page`/`per_page`/`sort`/`order`/`search`/`deleted` in
plain React `useState`, with no read from or write to the URL. Confirmed by a project-wide grep for
`useSearchParams`/`URLSearchParams` across `frontend/src` during the Activity build ticket: **zero
matches in any module.** Refreshing a list page, or sharing/bookmarking a filtered/paginated URL,
silently resets every list back to its defaults everywhere in the app — this was true before
Activity and remains true after it; Activity did not introduce it and does not fix it.

This surfaced during Activity's build (Part 27b) specifically because Activity was the first module
where the full param set (9 filters + pagination) made the lack of shareable/refresh-safe URLs
obvious, but the gap is in the shared hook, not anything Activity-specific.

**Decision: defer to a dedicated future Polish/Foundation ticket, not a per-module patch.** Fixing
it properly means changing `usePagination.ts` once (e.g. syncing its state to `useSearchParams`)
and then re-verifying all 8 downstream consumers (`ClientsPage`, `ProjectsPage`,
`EnvironmentsPage`, `ServersPage`, `ResourcesPage`, `PeoplePage`, `SchedulePage`, `ActivityPage`)
plus their test suites together — patching module-by-module would both duplicate the work 8 times
and risk inconsistent URL-param shapes between modules.

## 14. Deferred: Activity diff viewer — `old_value`/`new_value` not rendered (2026-08-13, Part 27a/27b)

**Status:** Deferred, intentionally out of scope for the initial Activity build.

`old_value`/`new_value` are full before/after JSON row snapshots (not a computed diff — see
`architecture.md` §2.3/§2.4 and the schema itself), and the Activity build ticket confirmed the
frontend has everything it needs to compute a field-level diff, but the API does not ship one.
Three options were identified during the audit (Part 27a), with no clear winner:
- Omit entirely from the timeline (current behavior).
- Client-side field-by-field diff — doable with no backend change, but the objects are raw DB rows
  (snake_case columns, bare foreign-key UUIDs, no per-entity-type label formatting), so a naive diff
  would be technically correct but not very readable.
- Raw JSON dump behind a "show details" expander — cheap, always correct, not pretty.

**Decision:** ship the lowest-scope option (omit) for the initial build; `ActivityTimeline.tsx`
renders `action`, `entity_type`, `changed_by_person`, `created_at`, and `entity_id` only. Revisit
in a future ticket if a real need for change-detail visibility emerges.

## 15. Deferred: cross-module "view history" links into Activity (2026-08-13, Part 27a)

**Status:** Deferred, explicitly scoped out of the Activity build ticket.

Activity's `entity_id` filter (live, tested — `backend/src/__tests__/activityLogs.test.ts:147-165,
246-322`) already supports "show me all activity for this one record" with **no backend work
needed** — `GET /api/activity-logs?entity_id={id}` alone returns the complete, correctly-ordered
history for any entity. What's missing is purely frontend: a "View history" link/button on other
modules' detail pages (Clients, Projects, Environments, Servers, Resources, People, Schedule) that
navigates to `ActivityPage` with `entity_id` preset.

**Decision:** not built as part of Activity's own ticket (Part 27b) — `ActivityPage.tsx` does not
currently accept an incoming `entity_id` query param either. This was explicitly scoped out during
the audit's Open Design Questions (Part 27a) as touching five-plus already-frozen reference modules,
which is a larger, separate decision than Activity's own filter surface. Whoever picks this up next
should note both halves are needed: (1) Activity accepting a preset filter from the URL, and (2)
each detail page adding its own link — currently neither exists.

## 16. Deferred: no `PersonPicker`/`EntityPicker` component exists yet (2026-08-13, Part 27a/27b)

**Status:** Deferred — new component design work, not migration, correctly out of scope for the
Activity build.

Activity's `changed_by` (a `people.id`) and `entity_id` filters (`ActivityFilterBar.tsx:91-103`)
currently take raw UUID text input with no picker/autocomplete UI. Confirmed by grep: no
`PersonPicker` or `EntityPicker` component exists anywhere in `frontend/src` today — only
`ProjectPicker`, `EnvironmentPicker`, and `ServerPicker` (decision #4), all single-entity-type
pickers for a specific known type, not a general "any entity, any type" picker `entity_id` would
need.

**Decision:** not built — this is new component design work (a `PersonPicker` for `changed_by` is
straightforward and mirrors existing pickers; an `EntityPicker` spanning all 10 `entity_type`
values is a genuinely novel design problem, not a mechanical extension of the existing picker
pattern). This remains open regardless of whether Users CRUD (decision #7, BLOCKED/FUTURE) is ever
built — the two are unrelated: `changed_by` filters by `people.id`, never `users.id` (verified,
`001_init.sql:201`).

---

## Open / deferred items tracker (quick reference)

| Item | Status | Notes |
|---|---|---|
| Users CRUD (backend + frontend) | 🚫 BLOCKED / FUTURE | See decision #7 |
| `PersonDetailDialog` account-visibility UI (Part 25c) | ⏭️ Skipped | Depends on Users decision being unblocked |
| Third role tier ("viewer") | ⏭️ Not scheduled | See decision #8 |
| UI/UX visual polish phase | ⏭️ Not started | Starts after Frontend Functional Complete (all 8 modules) |
| `architecture.md` / `api-spec.md` | ✅ Generated and verified by coding agent | Every `decisions.md`/`progress.md` claim checked against source — no errors found; see decision #11 for newly-discovered inconsistencies |
| `usePagination` URL-state persistence | ⏭️ Not scheduled | Cross-cutting, all 8 modules — see decision #13 |
| Activity diff viewer (`old_value`/`new_value` rendering) | ⏭️ Deferred | See decision #14 |
| Cross-module "view history" links into Activity | ⏭️ Deferred | See decision #15 |
| `PersonPicker` / `EntityPicker` components | ⏭️ Deferred | See decision #16 |