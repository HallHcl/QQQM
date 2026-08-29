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
- **Activity's `sort` param is never validated at runtime at all — the entire list
  validator is dead code.** `listActivityLogsQuerySchema`
  (`activityLogs.validator.ts:18-29`, including its `sort` field at line 21) is
  never imported anywhere else in the backend (confirmed by project-wide grep —
  zero references outside its own declaration file), and `activityLogs.routes.ts`
  attaches no validation middleware at all. The controller hand-parses the query
  itself and never reads `req.query.sort`
  (`activityLogs.controller.ts:4-27`), and the service always orders by
  `al.created_at` regardless of what's passed (`activityLogs.service.ts:83`).
  Relevant for the Activity module audit (Part 27a) — don't build sort-column UI
  for this endpoint expecting it to have an effect.
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

**Status:** ✅ CLOSED 2026-08-15 — see resolution at the end of this entry.

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

**Update, 2026-08-14 — known gap carried forward, unchanged through Part 28:** this gap was
explicitly out of scope for all six Part 28 sub-tickets (28a-28f) per each ticket's own stated
constraints, and no Part 28 diff touches `usePagination.ts` (confirmed). Still remains a future,
separate, dedicated ticket, not addressed incidentally by any Shared Foundations Polish work.

**Resolution, 2026-08-15 — URL-State Persistence ticket:**

`usePagination.ts` now calls `useSearchParams()` (react-router-dom) directly instead of
`useState`, deriving page/per_page/sort/order/search/deleted from the URL query string on every
render (falling back to the hook's `initial*` options for missing or malformed values) and
writing every change back to the URL via a `{ replace: true }` navigation.

**Mechanism decision — extend `usePagination` itself, not a parallel `useUrlFilters` hook.** The
hook now also exposes two generic escape-hatch methods, `getParam(key)`/`setParams(patch, {
resetPage })`, so pages with their own additional filters (Resources' type/project, People's
role, Schedule's status/calendar-day, Activity's 6 filters) route those URL reads/writes through
the *same* `useSearchParams()` instance instead of calling `useSearchParams()` a second time
themselves. This matters because react-router's `setSearchParams` closes over the params
snapshot from the render it was obtained in — two independent `useSearchParams()` instances (or
even two separate calls to the same instance) issued within one event handler race, and the
second call silently clobbers the first's write. Concretely, this is why Activity's filter
handlers were rewritten from two calls (`setEntityType(value); pagination.setPage(1);`) into one
combined `pagination.setParams({ entity_type: value }, { resetPage: true })` — every
page-affecting write for a given interaction is now issued as a single call.

**Scope decision — pagination fields AND per-module filters, confirmed correct in practice.**
Clients/Projects/Environments/Servers needed **zero** page-level code changes: every filter they
have (search/sort/order/deleted) is already one of `usePagination`'s own fields, so the hook
rewrite alone covers all 4 — confirmed by running their 63 pre-existing tests unmodified, all
still passing. The remaining 4 modules (Resources, People, Schedule, Activity) each had
additional local `useState` filter fields migrated to be derived from the URL via
`getParam`/`setParams` instead, removing the local `useState` entirely (URL is now the single
source of truth — no separate local/URL sync to keep consistent).

**Navigation decision — `replace: true` for every write, uniformly, including Prev/Next page
clicks.** The alternative (push for page navigation, replace for filters) was considered and
rejected: it requires a special case for every interaction type (is a per-page-reset triggered by
a filter change a "push" or a "replace"? what about typing into a live search box, which fires on
every keystroke?) with no clear line. A uniform `replace: true` rule means: typing in a search box
doesn't spam 20 history entries per word typed, and the browser Back button from any list page
returns to wherever the user was before they landed on that list — normal, unsurprising behavior
that doesn't require the user to step back through pagination one page at a time. Documented here
per the ticket's "use your judgment and document the choice" instruction.

**Malformed/out-of-range URL handling:** `page`/`per_page` are parsed and clamped (non-integer,
non-positive, or non-numeric falls back to the hook's default); `deleted`/`order` are validated
against their known enum and fall back to the hook's `initial*` option if the URL value isn't one
of them; each page's own enum-typed filters (Activity's `entity_type`/`action`, Schedule's `date`)
apply the same validate-or-fall-back-to-unset pattern at the page level. An out-of-range page
number (e.g. `page=9999`) is accepted as-is (not clamped against `total_pages`, which isn't known
until the API responds) — the existing Prev/Next disabled-state and empty-list-state logic already
handle this gracefully, so no additional special-casing was needed.

**Known, pre-existing, intentionally-unchanged inconsistency:** Activity's own filter changes
already reset the page to 1 (built that way in Part 27b); Resources' type/project filters and
People's role filter never did, and Schedule's status filter never did either — this was true
before this ticket and remains true after it, preserved exactly per the ticket's "preserve every
existing behavior" instruction rather than retroactively "fixed" as a drive-by change. If this
inconsistency is ever worth resolving, it should be its own scoped ticket, not bundled into a
state/URL-mechanism change.

Verified: full test suite run twice, 494/494 passed both times (up from 475 pre-ticket; the +19
is entirely new URL-sync/malformed-value test coverage in existing suites, no new test files),
`tsc --noEmit` clean, zero backend files touched.

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

## 17. Server table-vs-card dual pattern is intentional (2026-08-14, decided during Part 28 scoping)

**Status:** Decided, not touched by any Part 28 sub-ticket — a scoping-time decision, recorded here
so a future polish ticket doesn't "fix" it as an inconsistency.

`ServersPage.tsx` (Servers module, the **manage** surface) renders Servers as a `<Table>`
(`frontend/src/features/servers/ServersPage.tsx:203-214` — `TableHeader`/`TableRow`/`TableCell`),
while `InfrastructurePage.tsx` (Infrastructure module, the **browse** surface) renders the same
underlying `Server` entity as a card grid (`frontend/src/features/infrastructure/InfrastructurePage.tsx` —
`grid gap-4 sm:grid-cols-2 lg:grid-cols-3` of `ServerCard`). These are two different pages showing the
same entity in two different visual forms.

**This is a deliberate dual-pattern, not an inconsistency to unify.** The two pages serve different
tasks: `ServersPage` is where an admin/member manages Servers directly (edit, delete, restore,
credential references) — a table suits dense, sortable, action-per-row management. `InfrastructurePage`
is a client → project → environment drill-down browse view for orienting within a project's
infrastructure — a card grid suits at-a-glance browsing more than a dense table would. Collapsing them
into one shared pattern would optimize one task at the expense of the other.

**Do not build a shared `ServerTable`/`ServerCard` unification component** expecting to remove this
difference — it was evaluated during Part 28 scoping and kept intentionally.

## 18. Post-mutation feedback contract: every mutation gets both onSuccess and onError toasts (2026-08-14, implemented in Part 28d)

**Status:** Standing contract for all future mutation code in this app, starting Part 28d.

Before Part 28d, several mutations had an `onSuccess` toast but no `onError` toast — a failed
mutation silently produced no user-facing feedback beyond whatever fallback error state the
surrounding component happened to have (e.g. `ProjectRoster.tsx`'s add/remove-person actions,
`PersonDetailDialog.tsx`'s add/remove-client actions, `CredentialRefList.tsx`'s delete action — all
verified pre-Part-28 `onSuccess`-only via the Part 28 diff). Part 28d added `apiErrorMessage()`
(`frontend/src/api/errors.ts:57-60`) specifically to make adding the missing `onError` toast a
one-line change at each site, then applied it everywhere a mutation lacked one.

**The contract, going forward:** every `useMutation` call site that surfaces a result to the user
must supply both an `onSuccess` toast (or equivalent success feedback) and an `onError` toast using
`apiErrorMessage(err)` for the description, and no "the surrounding form's inline error state already
covers it" carve-out, since inline state and a toast serve different purposes (inline state explains
*what* to fix; a toast confirms *that* the action failed, which matters even when the inline state is
easy to miss, e.g. a delete button in a list row far from any form). **The one deliberate exception:**
stale-write `409` optimistic-lock conflicts are routed to the dedicated `ConflictState` UI instead of
an error toast, since that UI already communicates the conflict more specifically than a generic toast
would (`ClientFormDialog.tsx:142`, `ProjectFormDialog.tsx:148`, `PersonFormDialog.tsx:138`); the
`onSuccess` toast side of the contract still applies as normal.

**How to apply:** any new mutation added in a future ticket (module polish or otherwise) must include
both handlers from the start — do not defer the `onError` toast as a "nice to have," per the gap this
decision was written to close.

## 19. Correction — Polish Discovery Audit contrast findings were a computation error (2026-08-14, found and re-verified during Part 28b)

**Status:** Correction to a prior audit's findings, not a code change — **no design tokens were
modified**.

The original Polish Discovery & Shared Foundations Audit (pre-28a) reported four Tier 1 findings.
During Part 28b, two of them were independently re-verified twice (by hand and by script) and **do
not reproduce**:

- Audit finding #3 (`muted-foreground` on `surface`, originally reported ≈3.77:1, failing WCAG AA)
  — re-measured at **7.43:1**, comfortably passing WCAG AA (≥4.5:1 for normal text).
- Audit finding #4 (`danger` on `surface`, originally reported ≈2.7:1, failing WCAG AA) —
  re-measured at **5.30:1**, comfortably passing WCAG AA.

Both original figures were a **computation error in the audit itself**, not a real contrast defect in
the theme — no token in `tailwind.config`/the CSS variable set was ever out of compliance. Because no
real defect existed, **no token changes were made** in Part 28 for these two findings.

**The audit's Tier 1 finding #7 (Select label association) was the only real, verified defect from
that group of four** — this is the one fixed in Part 28b (see `architecture.md` §3.4.2: `id`/
`aria-label` passthrough added to `ProjectPicker`/`EnvironmentPicker`/`ServerPicker` and wired at
every call site).

**Practical takeaway, consistent with `decisions.md` #12's Verifier AI lesson:** audit findings, like
every other claim in this project, get re-verified against source (or, here, against a script)
before anyone acts on them — this is a case where that discipline caught a genuine error in the audit
itself, saving a token change that would have "fixed" a contrast ratio that was never actually broken.

---

## 20. Prefer in-place content swaps over nested dialogs (2026-08-15, Part 29b; fixed 29-CLOSEOUT)

**Status:** Fixed and standing convention.

`PersonDetailDialog.tsx` was the first place in the project to render a `ConfirmDialog` from inside an
already-open `Dialog`. The nested overlay produced a real visual bleed-through at mobile width, not a
screenshot artifact — found in Part 29b. **Fixed in 29-CLOSEOUT**: the remove-client confirmation is
now an in-place content-swap within the same `DialogContent` (a single `Dialog`/`DialogContent`, with
the confirm-step markup conditionally rendered in place of the normal detail content via the
`removingClient` state, `frontend/src/features/people/components/PersonDetailDialog.tsx:69-183`) —
matching the Resources precedent, rather than mounting a second nested `Dialog`/`ConfirmDialog`. The
pattern was also watched across the remaining Part 29 modules (Resources, Schedule,
Environments/Servers/Infrastructure, Projects, and Activity); no recurrence was found anywhere else.

Confirmed via a `role="dialog"` count assertion of exactly 1 during the confirm step
(`frontend/src/features/people/components/PersonDetailDialog.test.tsx:144-148`), which is permanent
automated regression coverage; the fix was additionally verified manually at both 1280px and 375px
viewport widths per the screenshot-verification convention (decision #22).

**Standing convention:** prefer swapping content inside the existing dialog over opening a nested
`Dialog`/`ConfirmDialog`. If nesting is genuinely unavoidable in future work, open a dedicated
shared-component ticket first; do not add an inline one-off fix.

## 21. `relationship_type` on Person-to-Client links is a future feature (2026-08-15, Part 29b)

**Status:** BLOCKED / FUTURE; not a bug in the current in-scope UI.

The generated API and `useAddPersonClient` support an optional `relationship_type` field
(`frontend/src/hooks/usePeople.ts:171-187`), and the remove-association copy preserves and describes
an existing relationship note (`PersonDetailDialog.tsx:171-175`). The current add-client UI does not
collect a relationship type, so it sends `relationship_type: undefined` by design
(`PersonDetailDialog.test.tsx:97-104`).

Whether this field is needed is a product decision. Do not expand the current People polish or add an
ad hoc input; treat it in the same category as Users CRUD and schedule it only as a future feature.

## 22. Dialog screenshot verification uses the viewport as the authority (2026-08-15, Part 29)

**Status:** Standing verification convention.

Playwright `fullPage: true` screenshots can create false bleed-through impressions for `position: fixed`
dialogs on pages taller than the viewport. This was discovered in the Resources verification and
confirmed by re-capture during Schedule verification. For dialog and overlay checks, use a viewport-only
screenshot or scroll the target element into view; do not treat a full-page capture as authoritative for
overlay layering.

## 23. Toast-error-display pattern in form dialogs: typed-vs-unknown split is intentional (2026-08-15, confirmed 29-CLOSEOUT)

**Status:** Confirmed intentional design — not a bug, not a gap to standardize away.

`ClientFormDialog.tsx`, `ProjectFormDialog.tsx`, `PersonFormDialog.tsx`, and `ResourceMetadataDialog.tsx`
each call `applyServerError(err: unknown)` and branch on `err instanceof ApiError`:

- **Unrecognized/non-`ApiError` case** — falls back to `apiErrorMessage(err)` for the toast description
  (`ClientFormDialog.tsx:130-134`, `ProjectFormDialog.tsx:145-149`, `PersonFormDialog.tsx:132-136`,
  `ResourceMetadataDialog.tsx:84-88`).
- **Typed `ApiError` case** (after the dedicated 409/conflict branch has already been handled) —
  displays the raw `err.message` directly, not `apiErrorMessage(err)`
  (`ClientFormDialog.tsx:161-162`, `ProjectFormDialog.tsx:176-177`, `PersonFormDialog.tsx:158-159`,
  `ResourceMetadataDialog.tsx:105-106`), so the user sees the real, specific API message — e.g. a 409
  duplicate-name detail or another server-supplied validation string — rather than a generic one.

`ScheduleFormDialog.tsx` does not import or use `apiErrorMessage` at all (confirmed: only `ApiError` is
imported, `ScheduleFormDialog.tsx:26`); it uses a fully manual inline fallback at both of its call sites
— `description: err instanceof ApiError ? err.message : "Something went wrong. Please try again."`
(`ScheduleFormDialog.tsx:173`, `ScheduleFormDialog.tsx:217`) — which is functionally equivalent to what
`apiErrorMessage` does, just written out inline instead of calling the shared helper.

**This is confirmed intentional, not a bug.** The toast contract established in decision #18 is "every
mutation gets paired success/error feedback with an appropriately normalized message" — it does not
require every branch to literally call `apiErrorMessage`. Displaying a typed `ApiError`'s own
`err.message` raw is the *more* correct behavior for a recognized API error (it's already a
server-authored, user-appropriate string), not a shortcut that skipped normalization.

**How to apply:** do not "fix" `ScheduleFormDialog.tsx` to call `apiErrorMessage` for consistency, and
do not flag the typed-vs-unknown split as inconsistent in a future audit — both are deliberate. If a
future ticket adds a new form dialog's error handling, either approach (call `apiErrorMessage()`
directly, or an equivalent inline `instanceof ApiError` ternary) satisfies decision #18's contract.

---

## 24. `DialogTitle` overflow: `break-words`, not `truncate` (2026-08-15, fixed in the Design System & Interaction Refresh phase)

**Status:** Fixed and standing convention.

Long unbroken names could overflow `DialogTitle` at narrow viewports — first observed in
`PersonDetailDialog.tsx` during 29-CLOSEOUT's nested-dialog-fix regression testing: a
person/entity name of roughly 40+ characters with no spaces (nothing for the browser to
wrap on) could overflow the dialog's width at 375px, because `DialogTitle`
(`frontend/src/components/ui/dialog.tsx`) applied no wrap/truncate handling at all.

**Fixed** (`fix: wrap long dialog titles instead of overflowing past close button`): the
title now wraps via `break-words`, **not** `truncate`. This was a deliberate choice, not
the more obvious option — `truncate` would hide part of the real value (a name, an
identifier) from an admin who needs to see the whole thing to do their job. Per the
project's "admin tool, don't hide data" principle, wrapping the title onto a second line
is preferred over silently clipping it with an ellipsis, even though wrapping is visually
messier.

**Standing convention:** any new or modified `DialogTitle` (or similarly unbounded-length
title/label text) should wrap with `break-words`, not truncate, unless a specific ticket
decides otherwise for a specific, justified reason.

## 25. Optional-field indicator convention: `(optional)` suffix, not asterisks on required fields (2026-08-15/16, Design System & Interaction Refresh phase)

**Status:** Decided and implemented; standing convention.

Required fields carry **no visual marker** (the majority case, kept clean). Optional
fields get a `<OptionalLabel>` component (`frontend/src/components/ui/optional-label.tsx`)
appending `(optional)` in muted text after the label — the inverse of the more common
asterisk-on-required convention. Required controls also carry `aria-required="true"` on
the control itself (not the label). Full technical detail lives in `design-tokens.md`'s
"Optional-Field Indicator Pattern" section — this entry exists so the *why* isn't lost:
asterisks on every required field (the majority case) added visual noise across nearly
every form in the app; marking the minority (optional fields) instead reads cleaner
without losing the information.

**How to apply:** new form fields follow this convention — no asterisk, `<OptionalLabel>`
only when the field is genuinely optional. Conditionally-required fields (e.g. Resources'
Content/ExternalURL, Schedule's Project/Server) are the documented exception — their
requiredness is dynamic/composite and is communicated via existing error/hint text
instead.

## 26. Row-action pattern: overflow kebab menu, row click reserved for navigation (2026-08-16, Design System & Interaction Refresh phase)

**Status:** Decided and implemented; standing convention.

A new shared `RowActions` component (`frontend/src/components/ui/row-actions.tsx`, built
in `feat(ui): add shared RowActions overflow menu component`) consolidates each list
row's actions (edit, delete, restore, etc.) into a single overflow kebab menu, replacing
ad hoc inline action buttons per row. Adopted across
Clients/Projects/Environments/Servers/People/Schedule, with Playwright coverage in
`frontend/tests/visual-sweep/` (`test(visual-sweep): add RowActions coverage for
Clients/Projects/Environments/Servers/People/Schedule`).

**Row-click behavior is decided per module, based on whether a natural navigation target
exists:**
- **Row click = primary action**, where a detail page or edit surface exists to navigate
  to: Clients (opens Edit), Projects/Environments/Servers (navigates to the detail page).
- **No row click**, where none exists: Schedule — a bare list entity with no detail page,
  so its row click is intentionally left inert; all actions live in the `RowActions` menu
  only.
- People keeps its existing row-click behavior unchanged (opens `PersonDetailDialog`),
  with actions additionally consolidated into the same `RowActions` menu.

Schedule's `RowActions` menu was also fixed in this same window to correctly gate actions
by terminal status (`feat(schedule): consolidate row actions into a menu; fix
terminal-status gating`) — a schedule item in a terminal state (e.g. completed/cancelled)
must not offer actions that assume it's still active.

**How to apply:** any new list page follows this pattern — build/reuse `RowActions` for
per-row actions, and decide row-click behavior by the same rule (navigate if a detail
surface exists, otherwise leave the row inert and rely on the menu).

## 27. Known flaky-test list and open test-coverage gaps (2026-08-16/20, Design System & Interaction Refresh phase)

**Status:** Tracked, standing reference — not all items require action.

**Known flaky tests, mitigated via a scoped `vi.setConfig({ testTimeout: 15000 })`** (CPU
contention under full-suite/parallel runs, not a real defect in the test or the code
under test):
- `frontend/src/features/servers/components/ServerFormDialog.test.tsx`
- `frontend/src/features/resources/components/ResourceEditor.test.tsx`
- `frontend/src/features/schedule/components/ScheduleFormDialog.test.tsx`
- `frontend/src/features/people/components/PersonDetailDialog.test.tsx`

If a future full-suite run times out on one of these again despite the scoped timeout,
treat it as the same known CPU-contention pattern first, not a new regression — but see
decision #12's lesson: re-verify, don't just assume, if it recurs under different
conditions (e.g. CI, not local).

**Two known backlog items in the Playwright visual-sweep suite (test-isolation/coverage
gaps, not product bugs):**
- `frontend/tests/visual-sweep/375px-sweep.spec.ts`'s long-name `PersonDetailDialog`
  fixture creates a Person via the API using a fixed constant name (`LONG_NAME`) on every
  run, with no uniqueness suffix — repeated runs accumulate duplicate rows in the target
  database rather than each run cleaning up after itself. This is a test-isolation defect
  in the fixture, not a bug in the code the test exercises. Needs a uniqueness
  suffix/cleanup step next time this spec is touched.
- `frontend/tests/visual-sweep/create-flow-smoke.spec.ts` only covers the Server create
  flow (confirming it's unaffected by the modal-to-inline-edit migration). It does **not**
  cover Environment's equivalent create flow, even though Environment received the same
  modal-to-inline-edit migration in this phase. Should be extended to cover Environment
  create in a future ticket.

## 28. Docker images do not auto-rebuild on `git push` (2026-08-20, workflow reminder from the Design System & Interaction Refresh phase)

**Status:** Standing reminder — caused real confusion this session.

Pulling new commits into a checkout that's served via `docker-compose` does **not** cause
the running containers to pick up the change. The frontend/backend Docker images are
built once from a snapshot of the source (`frontend/Dockerfile`, `backend/Dockerfile` —
see `architecture.md` §6) — pulling new commits updates the files on disk, not the
already-built image layers.

**How to apply:** after pulling new commits, run `docker compose build --no-cache`
(followed by `docker compose up`) before expecting the Docker-served app to reflect
those changes. Skipping the rebuild is a common source of "I pulled the fix but it's
still broken" confusion — check this first before re-debugging a change that already
landed in source.

## 29. Light Theme Migration, Phase 1 close-out — dead-token disposition and overlay-color exception (2026-08-20)

**Status:** Decided and implemented.

Phase 1 (design token audit, `docs/audit-light-theme-tokens.md`) was independently
re-verified by two separate tools with converging results — GPT-Work via a direct
GitHub connector, and a fresh VSCode Agent session reading local source directly (no
shared context with the coding agent that ran the original audit). Both confirmed the
same 9 dead CSS tokens and the same `bg-black/80` finding. Three decisions follow from
that converged result:

1. **7 of the 9 dead tokens are KEPT, unchanged, as shadcn/ui compatibility tokens:**
   `primary`, `primary-foreground`, `secondary`, `destructive`,
   `destructive-foreground`, `input`, `ring`. **Why:** these map onto shadcn's standard
   semantic surface API. They have zero consumers today, but keeping them costs
   nothing and avoids rework if a shadcn component that expects them is dropped in
   later. Their current values (including any that would be wrong for a light theme)
   are intentionally left as-is — they'll be addressed in a future ticket only if/when
   a real consumer appears.
2. **2 of the 9 dead tokens are REMOVED:** `subtle` (`--text-muted`) and `brand-dim`
   (`--accent-dim`). **Why:** unlike the 7 above, these are proprietary to this
   project (not part of shadcn's API surface), have zero consumers, and carry no
   compatibility benefit — there's nothing to gain by keeping them dormant. Removed
   from `frontend/src/styles/globals.css` (the `--text-muted`/`--accent-dim` variable
   definitions and their two stale hex-mapping comment entries) and
   `frontend/tailwind.config.js` (the `subtle` color and `brand.dim` sub-key). A live
   grep across `frontend/src` for both `subtle` and `brand-dim` as Tailwind utility
   classes confirmed zero usages immediately before deletion.
3. **`bg-black/80` on the modal (`dialog.tsx:22`) and sheet (`sheet.tsx:23`) overlays
   is an ACCEPTED, INTENTIONAL exception** to the "all colors go through tokens"
   policy — no `--overlay` token will be created. **Why:** a modal/sheet scrim is a
   functional dimming layer, not a palette color, and should stay `black/80`
   regardless of light or dark theme.

**How to apply:** do not flag `subtle`/`brand-dim` as missing if referenced by an old
doc — they no longer exist. Do not "fix" the 7 kept dead tokens' values as part of
unrelated work; they're deliberately dormant. Do not propose a `--overlay` token for
`dialog.tsx`/`sheet.tsx` in a future polish pass — this was already decided against.

## 30. Light Theme Migration, Phase 2b — Direction B token values applied; Servers pilot; naming/mapping judgment calls (2026-08-20)

**Status:** Implemented; two items below need human confirmation before Phase 2's
sitewide rollout.

Applied the Phase 2a-selected Direction B palette to `frontend/src/styles/globals.css`
and `frontend/tailwind.config.js`, preserving every existing CSS-variable and
Tailwind-class name (no renames) per the ticket's explicit instruction — only values
changed, plus four new `-tint` tokens and `status`/`-active` roles that didn't exist
before. `danger` and `warning` were converted from flat `DEFAULT`-only Tailwind color
strings to `{DEFAULT, hover, active, tint}` objects (mirroring `brand`'s existing
`DEFAULT`/`hover` shape) purely to hold the new hover/active/tint values the ticket
supplied for them — additive, not a rename; `bg-danger`/`text-warning`/etc. still
resolve identically via `DEFAULT`. The new teal role (no existing token in this
project) was named `status` (CSS var `--status`, Tailwind class `status`), matching
the ticket's own label for it.

**Judgment call — `--text-secondary`'s value, and one ticket-supplied hex left
unused.** The ticket listed three text values: `text-primary: #12181F`,
`text-secondary: #46505A`, `text-muted: #667085` (the last flagged as "highest
usage-count token, 139-140 sites app-wide"). But only two base text CSS vars exist in
this codebase (`--text-primary`, `--text-secondary` — `--text-muted` was deleted in
Phase 1 for having zero consumers, see decision #29), and the 139-140-site usage-count
fact unambiguously identifies `--text-secondary`'s *current* real consumer
(`--muted-foreground` → the `text-muted-foreground` Tailwind class, confirmed 139-140
sites in the Phase 1 audit and `design-tokens.md:48`'s own description of
`muted-foreground` as "Secondary / de-emphasised text"). So `--text-secondary` was set
to `#667085` (the value the ticket *labeled* "text-muted"), not `#46505A` (the value
the ticket labeled "text-secondary"). **The `#46505A` value was not applied anywhere**
— there is no live third text-tier consumer to give it to, and inventing one (a new
CSS var, or repointing `secondary-foreground` away from `--text-primary`) would be
both a structural change out of this ticket's color-value-only scope and a fresh dead
token, the opposite of decision #29's cleanup. **Needs a human decision**: is `#46505A`
meant for a genuine third text tier (which would need its own follow-up ticket to wire
a real consumer), or was it a labeling mismatch against this project's actual variable
names that can simply be dropped?

**Gap — `--surface-hover` had no ticket-supplied value.** The Direction B list covers
`surface` but not `surface-hover`, which currently backs `hover:bg-surface-hover` (8
sites) and shadcn's own generic hover-fill alias (`--shadcn-accent` →
`--shadcn-accent-foreground`, used by dropdown/select/menu hover states). Leaving it at
its old dark-theme value (`26 26 26`, near-black) would have put a near-black hover
box into an otherwise white UI — exactly the "broken contrast-dependent UI" the ticket
said to watch for. **Placeholder applied**: reused the ticket's own `--border` value
(`#D8DEE4` / `216 222 228`) rather than inventing an unvetted new hex — visually
verified via Playwright screenshot (no obvious defect), but this value has **not** been
through the Phase 2a WCAG-contrast process the other 20 values have. Needs a real,
contrast-checked value before Phase 2's sitewide rollout, not just before this pilot.

**Correction — the ticket's assumed Servers status-badge mapping does not exist in
source.** The ticket asked me to verify "connection status badges (`status`/`danger`/
`warning` for online/offline/pending)" and a "VPN badge (`accent`/`accent-tint`)"
against live source before assuming the mapping was right. It wasn't: the `Server`
type (`frontend/src/types/index.ts:118-135`) has no status/connection field at all, and
neither `ServersPage.tsx`, `ServerDetailPage.tsx`, nor `ServerCard.tsx` render any
online/offline/pending badge — there is no such concept anywhere in the Servers module
today. The "VPN badge" is actually a plain `muted-foreground`-colored `ShieldCheck`
icon (`ServersPage.tsx:258-264`), not a colored `Badge`, and it indicates
`environment.vpn_resource_id` (a property of the *Environment*, not the Server). The
real `Badge` variants Servers uses are `secondary` (Deleted, tech-stack tags) and
`outline` (access-method tag) — both grayscale/neutral, not accent/status/danger. The
one already-correct piece: `RowActions`' Delete menu item already uses
`text-danger`/`focus:bg-danger/10` (`components/RowActions.tsx:49`), confirmed
rendering correctly in the new red (`#B91C1C`) via screenshot — no code change was
needed there, it was already right. No colored status-badge component exists to build
or wire in the Servers module; nothing was added, consistent with this ticket's
color-value-only scope (no component/structure changes). A colored connection-status
badge appears to be a `warning`-variant `Badge` used by **Schedule** (`PENDING`), not
Servers — worth noting for whoever scopes a future ticket that actually wants
online/offline-style status badges, since that's a new feature, not something this
pilot could "reveal" by a token-only change.

**How to apply:** the two "Needs human confirmation" items above (`#46505A`'s
disposition, `--surface-hover`'s real value) should be resolved before Phase 2 rolls
the token change out sitewide — a pilot-only scope tolerates a placeholder; a full
rollout shouldn't ship one un-contrast-checked token alongside 20 verified ones.

---

## 31. Light Theme Migration, Phase 2b close-out — `--surface-hover` resolved, `#46505A` recorded as a non-wired candidate value (2026-08-21)

**`--surface-hover` placeholder replaced with a real Direction B value.** Decision
#30 flagged that `--surface-hover` had no ticket-supplied value and was temporarily
set equal to `--border` (`#D8DEE4` / `216 222 228`), which was too large a visual
jump from `--surface` (`#F4F6F8`) for a hover state and had not been through the
Phase 2a WCAG-contrast process. It is now set to `#ECF0F3` (`236 240 243`) —
`frontend/src/styles/globals.css`'s `--surface-hover` var, consumed by
`hover:bg-surface-hover` (8 sites) and shadcn's `--shadcn-accent` alias. No other
Direction B token value was touched.

**`#46505A` — recorded as a candidate value, not wired to any token.** Decision #30
noted the original Phase 2a ticket listed `#46505A` as a candidate `text-secondary`
role distinct from `muted-foreground`, but that it has zero live consumers: this
codebase has only two real text tiers today, `text-primary` (`#12181F`) and
`muted-foreground` / `--text-secondary` CSS var (`#667085`). Decision: do **not**
create or wire a token for `#46505A` now. It is recorded here only as a candidate
value, to be revisited if a genuine third text tier is ever needed. No new CSS
variable, Tailwind token, or component reference was created for it.

**`docs/development-guide.md` corrected from the old dark theme to the current
locked Direction B light theme.** The guide still instructed contributors to use
the old dark theme (background `#0A0A0A`, accent `#44D62C`), which is normative
guidance a new contributor would actually follow — left uncorrected, it risked
dark-theme styling being reintroduced in new components during the upcoming
sitewide rollout. Updated to reference the current background (`#FFFFFF`), surface/
border/surface-hover, brand (`#1D4ED8`), status (`#0E7490`), danger (`#B91C1C`),
warning (`#92400E`), and their tint/hover/active variants per the Direction B table
in decision #30.

**How to apply:** both items decision #30 flagged as blocking ("Needs human
confirmation") are now resolved — Phase 2 sitewide rollout to the remaining 7
modules is unblocked on this front.

---

## 32. `status` (teal, `#0E7490`) Direction B token has zero live consumers app-wide — OPEN, undecided (2026-08-21, surfaced during the Resources+Schedule sitewide-rollout audit)

**Fact, as of commit `d0e06b5`.** The `status` token (teal, `#0E7490`) has zero live
consumers anywhere in the frontend — not just in Resources/Schedule, the two modules
the audit ticket covered, but across the entire `frontend/src` tree. Confirmed via
grep for `text-status`, `bg-status`, `border-status`, and `variant="status"` — zero
hits for all four.

**This is an OPEN item — not yet decided.** Three options are on the table, to be
resolved once the module-by-module rollout audit (Resources+Schedule now done;
People+Activity and Clients/Projects/Environments still pending) has covered the
whole app:
(a) wire `status` to a genuine state that fits teal's "success/informational"
semantic, once one is identified during that ongoing audit;
(b) keep it reserved/unused intentionally — some token sets deliberately carry a
color that isn't needed yet;
(c) reconsider or retire the token's role in a dedicated follow-up, if no genuine
consumer ever turns up.

**Explicit guardrail: do NOT create a consumer for this token solely to make it
"used."** Any future wiring must be justified by a genuine semantic fit found during
audit — the same discipline already applied to `#46505A` in decision #31 (a
candidate value is not itself a reason to invent a consumer for it).

**Cross-reference.** This was surfaced by the Resources+Schedule audit ticket, which
separately flagged that Schedule's `done` status currently renders as `brand` (blue)
via the `default` badge variant, not `status` (teal) — noted there as a *candidate*
for this token, but explicitly **not decided** in that ticket, and not decided here
either. Whether `done` should move to `status` teal is deferred pending the
People+Activity and Clients/Projects/Environments audit results, in case a stronger
or more obviously-teal candidate turns up elsewhere in the app first.

**How to apply:** do not wire, rename, or repoint `status` in any module-specific
ticket without an explicit decision recorded here first. Flag any genuine candidate
found during the remaining audit passes back to this decision rather than wiring it
inline.

---

## 33. Decision #32 closed — `status` stays reserved/unwired; Activity's badge/dot mismatch resolved; sitewide rollout audit complete (2026-08-21)

**Decision #32 is now closed.** `status` (teal, `#0E7490`) remains reserved and
unwired, by deliberate choice — not a defect, not an oversight, and not something
still pending. All three remaining audit groups (Resources+Schedule,
Clients/Projects/Environments-Servers-Infrastructure, People+Activity) surfaced
candidates for it (Schedule's `done`, Clients'-and-similar "active" states,
Activity's `update`/`restore`) but none was a genuine semantic fit — every case was
better served by `brand` ("the current/normal one") or plain neutral gray. Forcing
`status` onto any of them to give the token a consumer would have been reverse-
engineering meaning from an unused token rather than finding a real one, exactly the
guardrail decision #32 set out to prevent. `status` stays defined in
`globals.css`/`tailwind.config.js` as reserved design capacity for a genuine
success/informational state, if one is ever found — option (b) from decision #32's
three choices.

**Activity's `ACTION_VARIANT`/`ACTION_DOT` mismatch (found by the People+Activity
audit) is resolved.** `frontend/src/features/activity/components/ActivityTimeline.tsx`
kept two independent color-lookup tables for the same `ActivityLog["action"]` field
that disagreed with each other (`update`'s badge was neutral while its dot was
`warning` amber; `restore`'s badge was neutral like `update`'s while its dot was
`brand` like `create`'s). Agreed final mapping, now applied to both tables
consistently:
- `create` → brand (blue) — badge `default`, dot `bg-brand`
- `restore` → brand (blue), same as `create` — a lifecycle event bringing an entity
  back into active use, conceptually closer to creation than to a routine update —
  badge `default`, dot `bg-brand`
- `update` → neutral/muted gray — badge `secondary`, dot `bg-muted-foreground`
  (previously `bg-warning`, the only value that actually changed)
- `delete` → danger (red), unchanged — badge `destructive`, dot `bg-danger`

`status` teal was explicitly **not** used for `update` — a generic lifecycle event
doesn't carry a "success/informational" semantic just because the token was
otherwise idle.

**This also closes out the sitewide rollout audit phase.** All 7 remaining modules —
Clients, Projects, Environments/Servers/Infrastructure, People, Activity, Resources,
Schedule — have now been audited (token consumers, semantic mapping, badge/status
reality checks, screenshot verification, console warnings) across three audit
tickets. Across all seven, this Activity badge/dot mismatch was the **only** fix
required — every other module came back clean.

**How to apply:** treat `status` as settled reserved capacity, not an open question,
until a genuinely new candidate surfaces (at which point it gets its own decision,
not a silent wiring). The sitewide rollout audit phase is complete; only a final
independent verification pass remains before the Light Theme Migration itself can
close — see the tracker below.

---

## 34. [Direction C — Foundation] Elevation Model: Flat Baseline + Staged Shadow Scale

**Context:** Phase 1.2 audit (VSCode Agent) confirmed `shadow-none` is
applied at all 11 sites that would normally carry a shadow (card, dialog,
dropdown-menu, popover, select, sheet, toast, calendar, tabs, Topbar) —
a deliberate override of shadcn/ui's own defaults, not drift.

**Decision:** Keep the flat baseline as the live behavior for now.
Introduce a formal 4-level elevation scale as a staged Foundation token
in Phase 1.2 — defined in tailwind.config.js only, not yet applied to
any component. Per-component adoption happens in a later phase,
pilot-first, exactly like Direction C's color tokens.

| Token | Value | Intended for |
|---|---|---|
| `elev-0` | `none` | current baseline (unchanged) |
| `elev-1` | `0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)` | Card, Table |
| `elev-2` | `0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.06)` | Dropdown, Popover, Select |
| `elev-3` | `0 20px 24px -4px rgba(16,24,40,.10), 0 8px 8px -4px rgba(16,24,40,.04)` | Dialog, Sheet |

**Known overlap:** `elev-0` (`none`) is identical in value to the
pre-existing `shadow-none` utility (11 live usages). Whether the future
per-component migration retires `shadow-none` in favor of `elev-0`, or
keeps both, is not yet decided — revisit at migration time.

> **↪ ANSWERED 2026-08-30 by decision #41.** `shadow-none` is retired.
> `elev-0` is now the sole way to express zero elevation, and `shadow-none`
> has zero occurrences in the codebase.

## 35. [Direction C — Foundation] Border Radius Scale

**Context:** Phase 1.2 audit confirmed no `--radius` token or
`borderRadius` config existed; the codebase used Tailwind's built-in
scale directly (`rounded-md` ×31, `rounded-sm` ×22, `rounded-full` ×4,
`rounded-none` ×3).

**Decision:** Introduce a semantic radius scale as staged Foundation
tokens, named by component role (not size) to avoid colliding with
Tailwind's built-in `sm`/`md`/`lg` keys, which differ in value and
already have 53 live usages.

| Token | Value | Intended for |
|---|---|---|
| `control` | `6px` | Button, Input, Select, Badge, Checkbox |
| `panel` | `10px` | Card, Table container, Toolbar |
| `modal` | `14px` | Dialog, Sheet |
| `pill` | `9999px` | Avatar, Pill Chip, Status Dot |
| *(none — Tailwind `rounded-md`, 6px)* | `6px` | **Floating Layer:** Popover, DropdownMenu, Select content |

**Note:** Existing `rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-full`
usages are untouched by this ticket; migration to the new semantic
scale happens per-component in a later phase.

**Known overlap:** `pill` (`9999px`) is identical in value to the
pre-existing `rounded-full` utility (4 live usages). Same open question
as above — resolve at migration time.

> **↪ Amended 2026-08-30 by decision #40.** Two changes, both radius-only:
> **(1)** `Popover` was removed from the `modal` row, which originally read
> "modal | 14px | Dialog, Sheet, Popover". It was grouped with
> Dialog/Sheet when this decision was written; #40 regroups it with
> DropdownMenu and Select as a transient **Floating Layer**, which keeps
> Tailwind's `rounded-md` (6px). **(2)** A Floating Layer row was added,
> closing the radius gap this decision previously left for `DropdownMenu`
> and `Select` (they had no radius target at all). The value is simply
> "unchanged, 6px" and required no design debate. `Dialog` and `Sheet` keep
> `modal` (14px) — see #39. **This decision remains radius-only; elevation
> targets live in #34.** See decision #40 for the full reasoning.

## 36. [Direction C — Component Primitives] Primary/Accent Role Definition

**Decision:** Jade (`--primary`) is the system's primary action color —
used for default buttons, focus rings, and any "do this" affordance.
Violet (`--accent`) is reserved for selection and navigation state only
(e.g. the Sidebar active item, which reaches it via the `brand` Tailwind
alias) — never a general-purpose action color.

**Trigger:** Phase 2 Pilot 3 (Button) found the default button variant
had been rendering violet since Direction B and was never migrated to
jade during Phase 1.1's color cutover — a drift, not a decision. Fixed
by switching Button's default variant to jade and unifying its focus
ring to jade, resolving a color divergence between Button and the
Pilot 1 Input/Textarea/Select underline treatment.

> **↪ RESOLVED 2026-08-30 by decision #44.** `info` now has its own blue
> family (`#1968C0`); it is no longer identical to `--accent`. The paragraph
> below records the state at the time #36 was written.

**Consequence for Phase 4:** The `info` status token (`#6C4BF4`) is
identical to `--accent` — previously flagged as an open, unconfirmed
dual-use question. Under this decision it's no longer just a coincidence
to double-check: violet's role is now formally scoped to selection/nav,
which has nothing to do with "info" status semantics. `info` should very
likely get its own distinct color before Phase 4 remaps any status to it.

## 37. [Direction C — Component Primitives] Card + Toolbar migrated to `panel` radius; Card to `elev-1` (Phase 2 Card pilot, 2026-08-30)

**Decision:** `Card` and `Toolbar` migrate together to the `panel` radius
(`10px`). `Card` additionally adopts the `elev-1` shadow. This applies the
standing Foundation decisions #34 (elevation) and #35 (radius) — both of which
defined these scales as staged tokens "not yet applied to any component", with
per-component adoption to happen pilot-first in a later phase. This is that
pilot. No new design value was invented.

| Component | Before | After |
|---|---|---|
| `card.tsx:12` | `rounded-md` (6px) + `shadow-none` | `rounded-panel` (10px) + `shadow-elev-1` |
| `Toolbar.tsx:20` | `rounded-md` (6px) | `rounded-panel` (10px) |

**Why together:** the two shared a near-identical base recipe (`rounded-md
border border-border`, plus the same resolved background reached through
different aliases — `bg-card` → `--card` → `--surface` for Card, `bg-surface`
directly for Toolbar). Decision #35 groups "Card, Table container, Toolbar"
under `panel`. Migrating one alone would visibly desynchronise two components
the scale explicitly groups — the same reasoning that made SelectTrigger travel
with Input in Pilot 1.

**Toolbar does not get `elev-1`.** It carries no shadow utility at all today —
not even `shadow-none` — so nothing in its existing recipe implied one, and
#34 assigns `elev-1` to "Card, Table", not Toolbar. Only the radius was
unified. Toolbar therefore renders `box-shadow: none` after this change,
verified in-browser.

**`--card` / `--card-foreground` are explicitly KEPT, not collapsed.** Card
reaches `--surface`/`--text-primary` through these shadcn aliases, and Card is
`--card`'s only consumer. The alias could have been collapsed to `bg-surface`
the way `--input` and `--ring` were deleted in the Phase 2 pre-merge cleanup
(`daf5208`, see `phase2-token-cleanup.md`). **It was deliberately not**, by
explicit decision at pilot time. `--input`/`--ring` were removed because they
had *zero* consumers; `--card` has a live one, so the two cases are not
analogous. Do not "tidy" this away in a future sweep without a new decision.

**Two deferrals recorded, both explicitly out of scope for this ticket:**

- **"Table container" has no implementation.** #35 assigns `panel` radius to a
  Table container, but `table.tsx`'s root wrapper is
  `relative w-full overflow-auto` — no border, no radius, no background. Table
  styles borders per-section instead. Giving `panel` radius to a container that
  does not exist would mean *creating* one, which is a design change, not a
  token migration. Left for a future ticket.
- **10 hand-rolled panel-like sites are untouched.** `ScheduleCalendar`,
  `VersionHistoryPanel`, `ErrorState`, `EmptyState`, `ResourceList`,
  `ServerDetailPage:122`, `CredentialRefList`, and two `<fieldset>`s
  (`ServerEditCard`, `ServerFormDialog`) all inline `rounded-md border
  border-border`. They do not follow `Card` automatically. Separately, five
  32px avatar squares share the same utility string but are semantically
  `control`/`pill`, **not** `panel` — a blind find-and-replace would be wrong.
  A future sweep must decide per-site.

**Known consequence, accepted:** `Card` and `Toolbar` are now visibly rounder
(10px vs 6px) than every other `rounded-md` surface in the app, including the
10 sites above and `Dialog`/`Sheet` (still `sm:rounded-md` + `shadow-none`,
their own unmigrated `modal`/`elev-3` gap). This divergence is the expected
intermediate state of a pilot-first migration, not drift.

> **↪ Superseded in part by decision #39 (2026-08-30).** The `Dialog`/`Sheet`
> half of that sentence is no longer true: Pilot 6 migrated `Dialog` to
> `rounded-modal` (14px) + `elev-3`, and `Sheet` to `elev-3`. The paragraph is
> left as written because it accurately records the state at the time #37 was
> taken. The 10 hand-rolled sites remain on `rounded-md` and are still
> correctly described.

**Test-file consequence:** `Toolbar.test.tsx` asserted `toHaveClass(...,
"rounded-md", ...)` and was updated to `"rounded-panel"`. The test's purpose —
"applies the base layout classes" — is unchanged; only the expected radius
token moved.

## 38. [Direction C — Component Primitives] Phase 2 blocker bar, final scope (retroactive, recorded 2026-08-30)

> **Retroactive entry.** This decision was taken verbally during the Phase 2
> closeout sequence but was never committed to this document at the time. It is
> recorded here after the fact, in its correct sequential position. Decision #39
> was written and shipped (`7d3a184`) before this entry existed, which is why
> #39 originally carried a "no #38 exists" callout — now resolved.

**Context:** Phase 2 was reopened twice on the same reasoning — that a component
a Phase 2 pilot was supposed to bring onto the Direction C scales, but which
still sat on pre-Direction-C values, constitutes a Phase 2 blocker. That bar
reopened the phase for `Card` (2026-08-29) and again for `Dialog`/`Sheet`
(2026-08-30). Applied without limit, the same reasoning could reopen Phase 2
indefinitely, since several known items technically fit the shape.

**Decision: the "same class of gap" bar is closed at exactly those two items.**
`Card` and `Dialog`/`Sheet` were the only two qualifying gaps. Both are now
migrated (#37, #39). The bar is spent.

**The following were explicitly evaluated and ruled OUT.** They do **not**
qualify as Phase 2 blockers, and **must not** be used to reopen Phase 2 again
without a fresh, explicit decision recorded in this document:

| Ruled-out item | Where tracked |
|---|---|
| `Sidebar.tsx:21` violet `focus-visible:outline-brand` | decision #36 |
| 10 hand-rolled `rounded-md border border-border` panel-like sites | decision #37 |
| 5 avatar-square (32px) sites — semantically `control`/`pill`, not `panel` | decision #37 |
| `elev-0` vs `shadow-none` — the twice-deferred overlap question | decisions #34, #37 |
| "Table container" — #35 names it, but no such component exists in the code | decisions #35, #37 |

**Stated explicitly: Phase 2 will not reopen a third time on
"same-class-of-gap" reasoning for any of the five items above.** They remain
tracked as ordinary deferred work with no deadline, not as blockers. Reopening
the phase for any of them requires a new decision that says so in as many words.

**What distinguishes a qualifying gap from a ruled-out one:** `Card` and
`Dialog`/`Sheet` were **undiscovered misses** — work a pilot was scoped to cover
and silently did not. The five items above are **known, recorded, deliberate
deferrals**, each already carrying its own tracker entry and rationale. The
distinction is discovery, not similarity of symptom. See decision #39 and
`progress.md`'s Phase 2 closing note for how this same test was applied to
`Popover`/`DropdownMenu`/`Select`.

## 39. [Direction C — Component Primitives] Dialog/Sheet radius + shadow migration (Phase 2 Pilot 6, 2026-08-30)

> **↪ Numbering resolved.** This entry was written and shipped (`7d3a184`)
> while **decision #38 did not yet exist**, and originally carried a callout
> flagging that gap. **#38 has since been recorded** (retroactively, in its
> correct position above) as "Phase 2 blocker bar, final scope". The sequence
> 37 → 38 → 39 is now continuous and this entry keeps its number.
>
> **Pilot numbering:** the originating ticket labelled this work "Pilot 5".
> That conflicted with `progress.md`, whose pilot table already lists
> Card + Toolbar (#37) as row 5 and Dialog/Sheet as row 6. **Canonical
> numbering is now: Card + Toolbar = Pilot 5, Dialog/Sheet = Pilot 6.** This
> heading was corrected from "Pilot 5" to "Pilot 6" accordingly.

**Decision:** `Dialog` and `Sheet` migrate to the `elev-3` shadow; `Dialog`
additionally to the `modal` radius, applied at **all** breakpoints.

| Component | Before | After |
|---|---|---|
| `dialog.tsx:39` | `sm:rounded-md` (6px ≥640px, **0px below**) + `shadow-none` | `rounded-modal` (14px, all widths) + `shadow-elev-3` |
| `sheet.tsx:32` | *(no radius class)* + `shadow-none` | *(no radius class — unchanged)* + `shadow-elev-3` |

`modal` = `14px`; `elev-3` = `0 20px 24px -4px rgba(16,24,40,.10), 0 8px 8px -4px
rgba(16,24,40,.04)` — both read from `tailwind.config.js`, applying standing
decisions #34/#35. No new value was invented.

**(a) Scope is Dialog + Sheet ONLY.** `popover.tsx`, `dropdown-menu.tsx` and
`select.tsx` were **not** touched, by explicit architect decision (scope option
a), not oversight. This is a known, accepted consequence: those three carry a
recipe character-identical to Dialog's former one
(`rounded-md border border-border bg-popover text-popover-foreground shadow-none`
at `popover.tsx:20`, `dropdown-menu.tsx:48`, `dropdown-menu.tsx:66`,
`select.tsx:94`). **Dialog has now visibly desynchronised from four surfaces it
previously matched exactly** — 14px + elev-3 against their 6px + no shadow.
Deferred to a future ticket. Note #35 assigns `modal` radius to "Dialog, Sheet,
Popover" but gives Dropdown and Select **no radius target at all**, so that
future ticket needs #35 extended before it can proceed.

**(b) This consciously OVERRIDES Pilot 4's shadow recommendation.**
`phase2-overlay-pilot.md` §9 measured the Dialog surface against the live
blurred overlay and concluded the flat surface "reads as **visually complete,
not under-separated**", that the 48% navy tint plus 4px blur "does the depth
work that an elevation shadow would otherwise do", and explicitly: "**No
elevation change is recommended from this pilot.**" §8 further justified keeping
`shadow-none` as "consistent with Card/Button precedent."

That reasoning is now obsolete: **decision #37 moved `Card` to `elev-1`**,
breaking the flat-baseline precedent Pilot 4's argument depended on. The
override is deliberate and recorded here rather than applied silently. Pilot 4's
measurement was not wrong when taken — the surrounding system changed under it.

**(c) Sheet's radius is intentionally UNCHANGED, not missed.** `Sheet` carries
no radius class at all and now renders `border-radius: 0px` (verified in
browser). It is an edge-anchored, full-height drawer — the shadcn/Linear/Stripe
convention is square corners flush to the viewport edge. #35 lists Sheet under
`modal`, but applying that literally would round a panel that has no free
corners on its anchored edge. **Do not "fix" this in a future sweep without a
new decision.**

> **Premise correction (recorded 2026-08-30).** The ticket that commissioned
> this pilot stated Sheet was used "primarily `side="right"`". That is wrong,
> and the correct facts are recorded here so the premise is not repeated:
> **`Sheet` has exactly one call site app-wide — `MobileNav.tsx:31`, with
> `side="left"`** — and `sheet.tsx`'s own `defaultVariants` is also
> `side: "left"`. No `side="right"` usage exists anywhere in the codebase.
> The `left` variant renders `inset-y-0 left-0 h-full w-60 border-r`, i.e.
> full-height and flush to the left edge, **so the edge-anchored /
> square-radius conclusion above is unaffected** — only the stated premise was
> inaccurate. Note also that `SheetTrigger` is `md:hidden`, so Sheet is only
> reachable below 768px.

**(d) ⚠️ ARCHITECT: DOUBLE-CHECK THIS ONE — Dialog's radius now applies at all
breakpoints.** Previously `sm:rounded-md` was breakpoint-scoped, so **below
640px the dialog rendered with fully square corners** (verified: 0px measured at
375px before this change; 14px after). Removing the `sm:` prefix is an
**architect assumption carried by the ticket**, not a value derived from #34/#35
— neither decision says anything about breakpoint scoping. If the square-corner
mobile treatment was deliberate (a full-bleed-ish mobile dialog is a common
pattern), this change reverses it. It was not possible to tell from the code
whether the `sm:` scoping was intentional or inherited unchanged from shadcn's
default template.

**Verified:** 593/593 tests pass (61 files, matching the #37 baseline), lint
clean, build clean. Browser-verified at two viewports — Dialog 6px→14px at
1280px, **0px→14px at 375px**, shadow none→elev-3 at both; Sheet radius 0px
unchanged, shadow none→elev-3.

**No test changes were required** — unlike #37's `Toolbar.test.tsx`, no test in
the suite asserts `rounded-md`, `sm:rounded-md`, or `shadow-none` on these
components. There are no dedicated `dialog.test.tsx`/`sheet.test.tsx` files.

**Incidental fact recorded:** `sm:rounded-md` is no longer emitted in the
production CSS at all — `Dialog` was its only consumer app-wide.

**CLOSING NOTE (2026-08-30) — point (d) is RESOLVED: the all-breakpoints
radius STAYS AS SHIPPED.** Point (d) above flagged the removal of the `sm:`
prefix for architect double-checking, since it changed the sub-640px dialog
from square corners to 14px. **That has been reviewed and confirmed: keep it.**
`Dialog` renders `rounded-modal` at every viewport width, and this is now
settled, not open.

Differentiating the mobile radius — whether a small-viewport dialog should use
a different corner treatment from a desktop one — is **explicitly deferred to a
future "mobile polish" pass after Phase 7**. It is **not** a Phase 2 item,
**not** a blocker, and **not** urgent. Recorded here so it is not re-litigated
as an open Phase 2 question; per decision #38 it is a deliberate deferral, not
a qualifying gap.

## 40. [Direction C — Component Primitives] Floating Layer shadow migration (Popover/DropdownMenu/Select, Pilot 7, 2026-08-30)

**Decision:** `Popover`, `DropdownMenu` (both content surfaces) and `Select`
content migrate from `shadow-none` to **`shadow-elev-2`**. Radius is
**unchanged** — all three stay on Tailwind's `rounded-md` (6px).

| File | Line | Before | After |
|---|---|---|---|
| `popover.tsx` | 20 | `shadow-none` | `shadow-elev-2` |
| `dropdown-menu.tsx` | 48 (`DropdownMenuContent`) | `shadow-none` | `shadow-elev-2` |
| `dropdown-menu.tsx` | 66 (`DropdownMenuSubContent`) | `shadow-none` | `shadow-elev-2` |
| `select.tsx` | 94 (`SelectContent`) | `shadow-none` | `shadow-elev-2` |

**(a) This executes #34's existing assignment — no new elevation authorization
was needed.** Decision #34's elevation table has assigned `elev-2` to
"Dropdown, Popover, Select" since it was written; those three were named
explicitly. This ticket is the per-component adoption #34 anticipated
("per-component adoption happens in a later phase, pilot-first"), not a new
elevation decision. `elev-2` =
`0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.06)`.

**(b) Radius unchanged; this is a shadow-only ticket.** No `rounded-*` class was
touched in any of the three files. Verified before and after: the radius
inventory across all three files is byte-identical, and all three surfaces
still render `border-radius: 6px` in-browser at both 1280px and 375px.

**(c) Popover's radius grouping is formally changed — superseding one line of
#35.** Decision #35's radius table originally read:

```
| Token   | Value  | Intended for           |
| `modal` | `14px` | Dialog, Sheet, Popover |
```

`Popover` was grouped with `Dialog`/`Sheet` there. That grouping does not match
how the component behaves: `Popover` is a **transient floating menu** that shares
a character-identical recipe with `DropdownMenu` and `Select` content
(`rounded-md border border-border bg-popover text-popover-foreground`), whereas
`Dialog` is a blocking centre modal and `Sheet` an edge-anchored drawer — both
now on `modal` (14px) + `elev-3` per #39. **This decision moves `Popover` into
the Floating Layer radius group at `rounded-md` (6px), alongside `DropdownMenu`
and `Select`, superseding that specific line of #35.** #35 has been amended
accordingly, with a pointer back here. Nothing else in #35 changes, and #35
remains radius-only.

**The Floating Layer group, defined:**

| Group | Members | Radius | Shadow |
|---|---|---|---|
| **Floating Layer** (transient menus) | `Popover`, `DropdownMenu`, `Select` content | `rounded-md` (6px, unchanged) | `elev-2` |
| Modal | `Dialog`, `Sheet` | `modal` (14px) | `elev-3` |

**`Dialog` is explicitly NOT part of the Floating Layer group.** It is a
different elevation class — a blocking modal, not a transient menu — and keeps
`rounded-modal` + `elev-3`. Do not apply Floating Layer tokens to it.

**(d) This closes the item tracked at Phase 2's closure, and is NOT a Phase 2
reopening.** `progress.md` and decision #38 recorded
`Popover`/`DropdownMenu`/`Select` as a tracked future ticket — deliberately
excluded from Pilot 6 by scope option (a), an informed decision rather than an
undiscovered miss, which is precisely why it did **not** qualify as a Phase 2
blocker under #38's bar. **Phase 2 remains ✅ CLOSED.** This is independent,
unbound work carried out as a standalone ticket under no phase. It does not
reopen, reclassify, or otherwise disturb Phase 2's closure.

**Ticket-premise corrections recorded during Task 0.** The commissioning ticket
stated that #35 needed a shadow target added for these three components and that
`DropdownMenu`/`Select` "have no shadow target at all today". Both were wrong:
#34 had already assigned them `elev-2`, and #35 is radius-only and contains zero
mentions of shadow or elevation. Work stopped and reported before any file was
touched; the ticket was then corrected, and #35's amendment above is confined to
radius. Recorded so the corrected understanding is not lost.

**Consequence — the desync is resolved.** Before this ticket, `Dialog` (14px +
`elev-3`) was visibly desynchronised from three surfaces that had matched its
recipe character-for-character. The two groups are now deliberately and
legibly distinct: transient menus sit lower (6px, `elev-2`), the blocking modal
sits higher (14px, `elev-3`). That is the intended end state, not drift.

**Verified:** 593/593 tests pass (61 files, matching the #37/#39 baseline), lint
clean, build clean. Browser-verified at 1280px and 375px on one instance of each
component: shadow `none` → `elev-2`, radius `6px` → `6px` (unchanged) in all six
measurements. No test asserts these classes, so no test file changed.

**`shadow-none` census:** 4 live usages remain after this ticket — `Topbar`,
`calendar`, `tabs`, `toast` — down from 11 when #34 was written. #34's deferred
`elev-0`-vs-`shadow-none` question is still unanswered and is now the only
elevation item left open.

> **↪ Superseded 2026-08-30 by decision #41.** Those 4 remaining usages were
> migrated to `shadow-elev-0` and `shadow-none` was retired: the census is now
> **zero**, and the elev-0-vs-shadow-none question is answered, not open. The
> paragraph is left as written because it recorded the state at the time #40
> was taken.

## 41. [Direction C — Component Primitives] Retire `shadow-none`; `elev-0` is the sole zero-elevation token (Pilot 8, 2026-08-30)

**Decision:** the four remaining `shadow-none` usages migrate to
**`shadow-elev-0`**. `shadow-none` is retired from the codebase. Going forward
**any need to express zero elevation uses `shadow-elev-0`** — `shadow-none`
should not reappear.

| File | Line | Element | Note |
|---|---|---|---|
| `Topbar.tsx` | 31 | `<header>` | bare class |
| `calendar.tsx` | 71 | `dropdown_root` | bare class — see dead-path note below |
| `tabs.tsx` | 32 | `TabsTrigger` | **state-scoped**: `data-[state=active]:shadow-none` → `data-[state=active]:shadow-elev-0` |
| `toast.tsx` | 28 | toast root | bare class |

**This closes a question deferred three times.** #34 introduced the elevation
scale and flagged the overlap: "`elev-0` (`none`) is identical in value to the
pre-existing `shadow-none` utility… Whether the future per-component migration
retires `shadow-none` in favor of `elev-0`, or keeps both, is not yet decided —
revisit at migration time." It was left open again at #37 (Card → `elev-1`) and
at #39 (Dialog/Sheet → `elev-3`). **Answer: retire `shadow-none`.** One concept,
one token. #34 has been annotated with a pointer here.

**This is a pure rename, not a visual change.** `elev-0` and `shadow-none`
resolve to the identical value (`none`), confirmed via `resolveConfig`:
`boxShadow['elev-0'] === boxShadow.none` is `true`. The emitted CSS rule for
`.shadow-elev-0` is byte-identical to what `.shadow-none` produced
(`--tw-shadow: 0 0 #0000; …`). Browser-measured computed `box-shadow` is
unchanged on every reachable site, before and after.

**The elevation model is now fully applied.** Every component #34 named now
carries an explicit `elev-*` token, and **`shadow-none` has zero occurrences
codebase-wide**:

| Level | Components |
|---|---|
| `elev-0` | Topbar, calendar (`dropdown_root`), tabs (active), toast |
| `elev-1` | Card *(Table container still does not exist — see #37)* |
| `elev-2` | Popover, DropdownMenu (×2), Select content — #40 |
| `elev-3` | Dialog, Sheet — #39 |

**Two facts recorded during this migration:**

- **`calendar.tsx:71` is a dead path under current usage.** That class sits on
  react-day-picker's `dropdown_root`, which only renders when
  `captionLayout="dropdown"`. `calendar.tsx:16` defaults `captionLayout` to
  `"label"`, and the app's only `Calendar` consumer (`ScheduleCalendar`) does not
  override it. **The class is therefore never rendered today** and could not be
  browser-verified — nothing puts it in the DOM. It was migrated anyway for
  consistency, so the codebase-wide `shadow-none` count reaches zero and the
  class is already correct if a dropdown caption is ever enabled.
- **`tabs.tsx:32` is the only state-scoped instance.** It is a
  `data-[state=active]:` variant rather than a bare class; the variant prefix is
  preserved and the utility compiles normally.

**`shadow-none` still exists as a Tailwind built-in** — this decision retires it
from *our* code, it does not and cannot remove it from Tailwind. It is simply no
longer emitted in the production CSS, having no consumer. A future
`npx shadcn add` will generate components using `shadow-*` defaults; those need
converting to the `elev-*` scale on arrival, the same caveat
`phase2-token-cleanup.md` records for `border-input` / `ring-ring`.

**Verified:** 593/593 tests pass (61 files, matching baseline), lint clean, build
clean, **zero `shadow-none` occurrences codebase-wide**. Browser-verified on
3 of 4 sites (the 4th is the unrenderable calendar path): computed `box-shadow`
identical before and after. No test asserts these classes, so no test changed.

## 42. [Direction C — Component Primitives] Card/Button/Badge typography cleanup — `heading-card` title, sentence-case buttons, Soft Badge (standalone, 2026-08-30)

**Decision:** three residual style/typography gaps left over from earlier
component work are closed together. **This is not a Phase 2 reopening.**
Phase 2 stays ✅ **CLOSED** per decision #38, which spent the blocker bar and
ruled that Phase 2 will not reopen a third time on same-class-of-gap
reasoning. This ticket is **standalone follow-up work under no phase** — the
same category as the Popover/DropdownMenu/Select ticket recorded at #40.

The three gaps and their provenance:

| Component | Gap | Left over from |
|---|---|---|
| `CardTitle` | `text-2xl` (24px) — never migrated to the governed type scale | **#37** (Card pilot migrated radius + shadow only) |
| `Button` `default` | `uppercase tracking-wide text-xs` | **Pilot 3** (jade brand-color migration only) |
| `Badge` | outline shape, `uppercase` | **never assigned a decision number** — Phase 1.1 gave Badge status *colors*, but its *shape* was never migrated |

### 42a. `CardTitle` → `text-heading-card`

`"text-2xl font-semibold leading-none tracking-tight"` → `"text-heading-card"`.
All four classes go: the token bundles size, line-height and weight
(`1rem / 1.5rem / 600`, confirmed via `resolveConfig`), and `leading-none`
would have overridden the token's line-height. Browser-verified
`24px/24px/600/-0.6px` → `16px/24px/600/normal`.

**Corrected two mistaken claims in the ticket** while doing this:

- The ticket described `text-heading-card` as carrying `tracking -0.01em`.
  **It does not** — `tailwind.config.js` defines no `letterSpacing` for it.
  The token was used exactly as defined; no letter-spacing was invented. The
  net effect is that CardTitle's tracking goes from `-0.6px` to `normal`.
- The ticket described `text-body` as `14px/22px/400`. The config says
  `0.875rem / 1.25rem` with **no** `fontWeight` — i.e. 14px/20px. See 42b.

> **↪ Root-caused 2026-08-30 by decision #43.** `cn()` now registers our custom
> fontSize keys via `extendTailwindMerge`, so the hazard described below no
> longer exists (the three removals remain correct — those overrides were
> obsolete regardless). #43 also found the **worse half this decision missed**:
> an ordinary text *color* was silently deleting the size token, which had
> already been breaking `calendar.tsx` in production. This decision's claim
> that the hazard was purely latent was **wrong** — see #43a-i.

**Three call sites lost an obsolete override.** `EnvironmentDetailPage.tsx:105`,
`ServerCard.tsx:40` and `ServerDetailPage.tsx:190` each passed
`className="text-base"` purely to shrink CardTitle back down from 24px. Those
are now redundant *and actively harmful*: `cn()` is `twMerge`, and
**`tailwind-merge` does not recognise our custom fontSize keys** as font-size
classes (verified directly — `twMerge("text-heading-card", "text-base")`
returns *both* classes rather than deduping). Left in place, `text-base` would
not have replaced `text-heading-card`; both rules would have emitted and the
cascade would have decided, silently dropping the token's bundled
`font-weight: 600`. The overrides were removed.

### 42b. `Button` — `default` variant only; base left alone

**The ticket's premise was wrong and is corrected here.** `uppercase
tracking-wide text-xs` was **not** on the shared base class — it lived on the
`default` **variant** alone. Every other variant (`destructive`, `outline`,
`secondary`, `ghost`, `link`) already inherited the base's
`text-sm font-medium` and was already sentence case at 14px. Browser-verified
on the "before" pass: `default` at `12px/uppercase/ls 0.3px`, all five others
at `14px/none/normal`. So the fix is a three-class deletion from `default`;
there was never a cross-variant split to repair.

**Base deliberately kept as `text-sm font-medium`, not changed to
`text-body`.** The two are byte-identical (`0.875rem / 1.25rem`) — the config's
own comment on `body` says so: *"Body copy — existing Tailwind text-sm default,
kept as-is."* Swapping in `text-body` would have bought zero visual change
while introducing the same `twMerge` blindness described in 42a: `text-sm`
correctly dedupes against a call-site override, `text-body` would not.
`NotificationBell.tsx` has a live Button passing `text-[10px]`, which today
correctly beats `text-sm` — under `text-body` it would collide instead. The
spec target ("sentence case 14px / font-medium") is already met exactly by the
existing base.

### 42c. `Badge` — Soft Badge on the five status families only

Base loses `uppercase tracking-wide` **and** `bg-transparent` (the tint now
supplies the background). It keeps `text-xs font-medium` = 12px / 500, which
is already the Master Plan target — no token change was needed.

Shape converted to tint background + subtle border + high-contrast text using
each family's existing Phase 1 `-tint` / `-border` / `-text` sub-tokens:

| Variant | After |
|---|---|
| `destructive` | `bg-danger-tint border-danger-border text-danger-text` |
| `warning` | `bg-warning-tint border-warning-border text-warning-text` |
| `success` | `bg-success-tint border-success-border text-success-text` |
| `info` | `bg-info-tint border-info-border text-info-text` |
| `neutral` | `bg-neutral-tint border-neutral-border text-neutral-text` |

**Three variants were deliberately NOT converted** — `default`, `secondary`,
`outline`. They keep their outline treatment and `bg-transparent`, and receive
only the base-level uppercase removal. Reasons, per variant:

- **`default`** maps to `brand` (`--accent`). `brand` has a `tint` mapping in
  `tailwind.config.js` but **no `border` or `text` mapping**. The underlying
  CSS variables `--accent-border` and `--accent-text` *do* exist in
  `globals.css:57-58` — only the Tailwind mapping is missing. Adding it is a
  `tailwind.config.js` change beyond this ticket's three-file scope.
- **`secondary`** and **`outline`** have **no status token set at all**. They
  are not status families; `secondary` is the "Deleted" tag and `outline` is
  the type-label badge. Assigning them to `neutral` would be a semantic
  remap — a design decision, not a token migration.

Converting any of the three would have meant inventing values, which this
ticket explicitly forbids.

**The consequence is a visible split, and it is not cosmetic.** On
`/schedule`, `pending` (warning) and `cancelled` (destructive) now render as
soft tinted badges while `done` (default) and `in progress` (secondary) stay
outline — four status badges in one column, two treatments. This is
**captured in `typography-cleanup-after/3-schedule-badges.png`** and needs an
Architect decision; see the tracker row and the Badge entry below.

**Verified:** 593/593 tests pass (61 files, matching the #37/#39/#40/#41
baseline), lint clean (2 pre-existing `only-export-components` warnings on the
`cva` exports, unchanged by this ticket), build clean. **No test asserts any
of the replaced classes** — a codebase-wide grep for `text-2xl`, `uppercase`,
`tracking-wide` and `text-xs` across every `*.test.ts`/`*.test.tsx` returned
exactly one unrelated hit (`initials.test.ts:19`, a string-casing assertion),
so no test needed changing. Browser-verified before/after at 1280px via
`tests/visual-sweep/typography-cleanup.spec.ts`, computed styles read straight
off the DOM; every rendered badge colour matches its `globals.css` value
exactly.

## 43. [Tooling / Foundation] `tailwind-merge` custom font-size registration + `brand.border`/`brand.text` mapping; `tailwind.config.js` declared source of truth (standalone, 2026-08-30)

**Decision:** two systemic gaps found during #42 are closed at the root.
`cn()` now uses `extendTailwindMerge` with our governed type scale registered,
and `brand.border` / `brand.text` are mapped in `tailwind.config.js`.
**Neither change is applied to any component in this ticket** — this is
tooling and token plumbing only. Nothing renders differently.

### 43a. The class-stacking hazard — and the worse half nobody had noticed

`tailwind-merge` only knows Tailwind's **built-in** scales. Our
`theme.extend.fontSize` keys are not t-shirt sizes (`heading-card`, `body`,
`label`, …), so tailwind-merge cannot infer them and **falls back to
classifying them as text *colors***. That produced two distinct silent
failures, in opposite directions:

| Call | Before #43 | After #43 |
|---|---|---|
| `cn("text-heading-card", "text-base")` | `text-heading-card text-base` — **both** emitted | `text-base` |
| `cn("text-heading-card", "text-[10px]")` | `text-heading-card text-[10px]` — **both** emitted | `text-[10px]` |
| `cn("text-heading-card", "text-muted-foreground")` | **`text-muted-foreground`** — size token **destroyed** | `text-heading-card text-muted-foreground` |

**#42 recorded only the first row. The third is the more damaging one** and was
found while building this fix: because the tokens were being treated as
colors, an ordinary *text-color* class on the same element would **dedupe the
size token out of existence**, silently taking its bundled `line-height` and
`font-weight` with it. A component would lose its type scale entirely just by
being given a color.

### 43a-i. ⚠️ This fix is NOT inert — it repaired a live rendering defect

**#42 assumed this was a purely latent hazard. That was wrong**, and the error
is corrected here. A full audit — every string literal in `src/` containing a
custom fontSize token, run through both the old and new merger — found **13
literals whose merge outcome changes**. Of those, **11 are false positives**:
`MetricCard.tsx` (×5) and the six list-avatar squares (`ClientsPage`,
`EnvironmentsPage`, `PeopleTable`, `ProjectsPage`, `ScheduleList`,
`ServersPage`) all set `className` **directly on a plain DOM element**, so
`cn()` never runs on them and both classes have always applied.

**The remaining 2 are real, and both were live defects:**

| Site | Before #43 | After #43 |
|---|---|---|
| `calendar.tsx:88` (`weekday`) | `text-muted-foreground` **silently deleted** | retained |
| `calendar.tsx:97` (`week_number`) | `text-muted-foreground` **silently deleted** | retained |

Both go through `cn()`, and in both the color class is written *before*
`text-caption`. The old merger classified `text-caption` as a color, so it
**deduped the real color away as a "superseded" earlier class**.

Browser-verified on `/schedule`, reading the live DOM:

```
BEFORE  class="flex-1 select-none rounded-md text-caption font-normal rdp-weekday"
        color: rgb(16, 24, 40)     ← #101828, full-strength foreground
AFTER   class="text-muted-foreground flex-1 select-none rounded-md text-caption font-normal rdp-weekday"
        color: rgb(71, 84, 103)    ← #475467, --muted-foreground, as authored
```

**The calendar's weekday headers (Su Mo Tu …) and week numbers have been
rendering at full foreground instead of muted** — since `text-caption` was
introduced to `calendar.tsx`. Nobody had noticed. This is the only visible
change in the ticket, and it is a **repair**, not a regression: the component
always asked for `text-muted-foreground` and finally gets it.

Independently corroborated by screenshot: with the page's own content held
constant, `/schedule` is the **only** one of the four swept pages whose PNG
changes; login, Overview and People are byte-identical.

`src/lib/utils.ts` now registers all **seven** custom keys in tailwind-merge's
`font-size` class group: `heading-page`, `heading-section`, `heading-card`,
`body`, `body-sm`, `label`, `caption`.

> **The ticket's expected key list was wrong in two places.** It named
> `table-head` and `mono` as fontSize keys. **Neither exists** in
> `theme.extend.fontSize` — there is no `table-head` token anywhere in the
> config, and `mono` is a **`fontFamily`** entry, not a font size. The list
> above is the complete set, taken from the config as instructed.

**Guarded by a permanent test, not a throwaway.** `src/lib/utils.test.ts` (6
tests) pins both merge directions *and* cross-checks the registration list
against `theme.extend.fontSize` via `resolveConfig`, so a newly-added type
token that nobody registers fails CI instead of silently reintroducing the
bug. Confirmed to be a real guard: reverting `utils.ts` to the plain `twMerge`
fails 4 of its 6 tests.

### 43b. `brand.border` / `brand.text` mapped — deliberately unused

> **The ticket named these CSS variables `--brand-border` / `--brand-text`.
> Those do not exist.** There are **no `--brand-*` variables in
> `globals.css` at all.** The correct names are **`--accent-border`** and
> **`--accent-text`** (`globals.css:57-58`) — Tailwind's `brand.*` namespace
> has always aliased the `--accent*` variables, which is the pre-existing
> pattern #36 describes. No new CSS variable was created.

```js
brand: {
  DEFAULT: "rgb(var(--accent) / <alpha-value>)",
  hover:   "rgb(var(--accent-hover) / <alpha-value>)",
  active:  "rgb(var(--accent-active) / <alpha-value>)",
  tint:    "rgb(var(--accent-tint) / <alpha-value>)",
  border:  "rgb(var(--accent-border) / <alpha-value>)",   // added by #43
  text:    "rgb(var(--accent-text) / <alpha-value>)",     // added by #43
},
```

This is the missing mapping that blocked `badge.tsx`'s `default` variant from
becoming a Soft Badge at **#42c**. **It is NOT applied here.** No badge
variant's classes changed; `ScheduleList.tsx`, `ClientsPage.tsx`,
`OverviewPage.tsx` and every other status call site are untouched. The
semantic remap (`done`→success, `in_progress`→info, `pending`→warning,
`cancelled`→neutral) is **Phase 4** work, tracked separately.

**#42c's open item is therefore narrowed, not closed.** `default` is now
*mechanically* convertible; `secondary` and `outline` still are not — they have
no status token set and are not status families, so assigning them remains a
semantic decision for Phase 4.

### 43c. `tailwind.config.js` is the source of truth for token values

Per Architect decision, resolving the discrepancy #42 surfaced. **The shipped
config wins.** The actual values, read via `resolveConfig`:

| Token | Actual (authoritative) | Master Plan claimed |
|---|---|---|
| `text-heading-card` | **16px / 24px / 600 / tracking `normal`** | 16px/24px/600, tracking `-0.01em` |
| `text-body` | **14px / 20px / 400** (no `fontWeight` key) | 14px/22px/400 |

The external **Master Plan document is not in this repo** and is to be treated
as **historical / aspirational, not authoritative**, wherever it conflicts with
shipped config. It carries no `letterSpacing` for `heading-card` and no 22px
line-height for `body`; those values were never implemented. Anyone porting a
Master Plan value must check it against `tailwind.config.js` first.

**Verified:** 599/599 tests pass (62 files) — **the baseline moves from 593 to
599**, +6 / +1 file, all from the new `utils.test.ts` guard; no pre-existing
test changed. Lint clean, build clean.

**Visual check (4 pages, 1280px, `cmp` on the PNGs against the post-#42
commit):** login, Overview and People **byte-identical**; `/schedule` changes,
and the change is exactly the calendar repair documented in 43a-i. Isolating
that took some care — the first A/B comparison also flagged Overview, but
re-shooting both states within the same minute showed that difference was the
activity feed's relative timestamps ticking over between runs, not the code.
The per-state renders are otherwise deterministic (verified by shooting the
same state twice and getting identical bytes).

## 44. [Direction C — Foundation] `info` migrated to a blue family (Candidate B, hue 255°) — the `info` ≡ `--accent` Phase 4 blocker is closed (standalone, 2026-08-30)

**Decision:** `info` gets its own blue. The four `--info-*` variables in
`globals.css` are replaced with the architect-approved **Candidate B** values.
**Four lines changed, nothing else** — no component, no Tailwind config, no
other token.

| token | was (violet, ≡ `--accent`) | now (blue) |
|---|---|---|
| `--info` | `108 75 244` `#6C4BF4` | **`25 104 192`** `#1968C0` |
| `--info-tint` | `241 237 254` `#F1EDFE` | **`240 247 255`** `#F0F7FF` |
| `--info-border` | `185 167 249` `#B9A7F9` | **`154 193 243`** `#9AC1F3` |
| `--info-text` | `74 44 192` `#4A2CC0` | **`12 79 151`** `#0C4F97` |

### 44a. The collision this closes

`info` was **byte-identical to `--accent`** across all four sub-tokens.
Decision #36 scoped violet exclusively to selection and navigation state, so
the shared value was a **conflict, not a coincidence** — Phase 4's planned
`in_progress`→`info` remap would have painted a status badge in the reserved
navigation colour. That blocker, open since #36 and re-confirmed by the
2026-08-30 audit, **is now closed.**

### 44b. ⚠️ `success` ≡ `primary` ≡ `focus-ring` remains OPEN — deliberately

The same audit found a **second, previously unrecorded** four-token collision:
`--success` is byte-identical to `--primary`, and both equal `--focus-ring`
(all `#0E7C5A`). **This ticket does not touch it, by explicit architect
decision.** It is an *accepted* collision, **not a blocker**.

Consequence to carry into Phase 4: under the planned remap, `done`→`success`
still renders in the primary action colour. Two of the four remapped statuses
sat on a reserved role colour; **this decision fixes one of them.**

### 44c. How the value was derived

Not picked by eye. Method, in brief (full working was produced in the
2026-08-30 proposal ticket and is not reproduced here):

1. **Structure taken from what already ships.** OKLCH lightness/chroma were
   measured for every role across the three chromatic non-collided families
   (`success`/`warning`/`danger`) and the **median** used as a template —
   base `L .5212 / C .1562`, tint `.9725 / .0137`, border `.8014 / .0826`,
   text `.4322 / .1337`. Candidate B's chroma lands within `0.0001` of that
   median, i.e. it is exactly as saturated as `warning`.
2. **Hue swept 225°–275°.** Every hue in that range clears the contrast bar,
   so contrast was *not* the discriminator — hue placement was. 255° is the
   balance point: far enough from `--accent` violet (**284.4°**) to read as a
   different colour, far enough from cyan to still read as blue, and not
   drifting into indigo the way 260°+ does.
3. **Contrast: AAA on every axis**, matching the de-facto bar every shipped
   family clears (not merely the WCAG AA ≥4.5:1 minimum written at #19):

   | | text-on-tint | text-on-white | base-on-white |
   |---|---|---|---|
   | shipped range | 7.03–9.49 | 7.52–10.46 | 5.19–7.69 |
   | **info (new)** | **7.54:1** | **8.14:1** | **5.55:1** |

   Border-on-tint `1.72:1`, inside the shipped 1.34–1.84 decorative range.
4. **Colour-blind separability was checked** — the 2026-08-30 audit noted this
   had *never* been done anywhere in this project. Viénot–Brettel–Mollon (1999)
   dichromat simulation, difference as ΔE in OKLab, against all five existing
   hues. Calibrated against the palette's own floor rather than an invented
   threshold: the worst pair **already shipping** is `warning` vs `danger` at
   **ΔE 0.033**. Candidate B's worst case is **0.036**, above that floor.

**Verification discipline:** the computation script self-tested by reproducing
all 15 published contrast figures from the prior audit exactly before being
trusted to propose anything — see #19, which records this project having twice
shipped wrong hand-computed contrast numbers.

### 44d. ⚠️ Tritanopia caveat — a Phase 4 design question, NOT resolved here

**Under tritanopia, blue collapses toward teal** (`#1968C0` → `#007D8A`),
landing near jade `success` at **ΔE 0.036**. This is above the shipped floor
and no worse than the `warning`/`danger` pair already in production, **but it
is inherent to tritanopia collapsing the blue–yellow axis — no blue avoids
it.** Choosing a different blue would not have helped.

**Recommendation carried forward to Phase 4, not decided here:** if schedule
status must be distinguishable without relying on colour, the remap should
pair each status with a **non-colour affordance** — an icon or a text label —
rather than colour alone. That is a design decision for Phase 4's own ticket.

### 44e. No config or component change was required

Confirmed before editing, not assumed: `tailwind.config.js` already maps all
four `info` sub-tokens (`DEFAULT`/`tint`/`border`/`text`), and `badge.tsx:31`
already reads `bg-info-tint border-info-border text-info-text` (wired at #42c).
Changing the CSS variables was therefore sufficient — **the token indirection
worked as designed.**

**Verified:** 599/599 tests (62 files, matching the #43 baseline), lint clean,
build clean. Playwright confirmed the rendered badge's computed
`background-color` / `border-color` / `color` are **exactly**
`rgb(240,247,255)` / `rgb(154,193,243)` / `rgb(12,79,151)`, and asserted
`--accent`, `--accent-tint`, `--accent-border`, `--accent-text`,
`--focus-ring`, `--primary` and `--success` are **all unchanged**. `info` no
longer equals `accent`.

## Open / deferred items tracker (quick reference)

| Item | Status | Notes |
|---|---|---|
| Users CRUD (backend + frontend) | 🚫 BLOCKED / FUTURE | See decision #7 |
| `PersonDetailDialog` account-visibility UI (Part 25c) | ⏭️ Skipped | Depends on Users decision being unblocked |
| Third role tier ("viewer") | ⏭️ Not scheduled | See decision #8 |
| UI/UX visual polish phase — Phase 1 (Shared Foundations) | ✅ Complete 2026-08-14 | Parts 28a-28f — see `progress.md` |
| UI/UX visual polish phase — Phase 2 (module-by-module) | ✅ Complete 2026-08-15 | Parts 29a-29g — see `progress.md` |
| `architecture.md` / `api-spec.md` | ✅ Generated and verified by coding agent | Every `decisions.md`/`progress.md` claim checked against source — no errors found; see decision #11 for newly-discovered inconsistencies |
| `usePagination` URL-state persistence | ✅ Complete 2026-08-15 | Cross-cutting, all 8 modules — see decision #13 |
| Activity diff viewer (`old_value`/`new_value` rendering) | ⏭️ Deferred | See decision #14 |
| Cross-module "view history" links into Activity | ⏭️ Deferred | See decision #15 |
| `PersonPicker` / `EntityPicker` components | ⏭️ Deferred | See decision #16 |
| Nested dialog composition (`PersonDetailDialog`) | ✅ Fixed 29-CLOSEOUT | See decision #20 |
| Person-client `relationship_type` input | ⏭️ BLOCKED / FUTURE | See decision #21 |
| Toast-error-display typed-vs-unknown split | ✅ Confirmed intentional | See decision #23 |
| `DialogTitle` overflow on long unbroken names | ✅ Fixed 2026-08-15 (`break-words`) | See decision #24 |
| Optional-field indicator convention | ✅ Decided and implemented | See decision #25; `design-tokens.md` |
| Row-action pattern (`RowActions` + row-click rules) | ✅ Decided and implemented | See decision #26 |
| Known flaky tests / test-coverage backlog | 🟡 Tracked, not all actioned | See decision #27 |
| Docker no-auto-rebuild-on-pull reminder | ℹ️ Standing workflow reminder | See decision #28 |
| Resources detail-page modal-to-inline-edit migration | ⏭️ Deferred | No detail page exists yet for Resources — see `progress.md` |
| Light Theme Migration | ✅ COMPLETE 2026-08-21 | Direction B tokens applied globally, piloted/verified on Servers; all 7 remaining modules audited (only fix needed: Activity badge/dot mismatch); close-out items resolved; final independent verification confirmed, zero discrepancies — see decisions #29/#30/#31/#32/#33, `progress.md` |
| `status` (teal) token — zero live consumers app-wide | ✅ Closed 2026-08-21 — intentionally reserved, unwired | No genuine semantic fit found across the full sitewide rollout audit; stays reserved design capacity, not a defect — see decision #33 |
| `info` status token (`#6C4BF4`) is identical to `--accent` violet | ✅ CLOSED 2026-08-30 by #44 | `info` migrated to its own blue family (Candidate B, OKLCH hue 255°): `#1968C0` / `#F0F7FF` / `#9AC1F3` / `#0C4F97`. AAA on every axis, colour-blind ΔE checked against all 5 existing hues. Four CSS variables changed; no component or config edit was needed. **Phase 4 blocker cleared** — see decisions #36 and #44 |
| `Sidebar.tsx:21` `focus-visible:outline-brand` | 🟡 OPEN | Leftover violet focus ring under decision #36's jade-focus rule, not yet migrated (out of Pilot 3 scope) |
| `Card` + `Toolbar` → `panel` radius, `Card` → `elev-1` | ✅ Done 2026-08-30 | Phase 2 Card pilot; applies #34/#35. `--card`/`--card-foreground` deliberately kept, not collapsed to `--surface` — see decision #37 |
| "Table container" named by #35 but no such component exists | 🟡 OPEN | `table.tsx` root is `relative w-full overflow-auto` — no border/radius/bg. Creating one is a design change, not a token migration; deferred — see decision #37 |
| 10 hand-rolled `rounded-md border border-border` panel-like sites | 🟡 OPEN | Do not follow `Card` automatically; 5 further 32px avatar squares share the string but are `control`/`pill`, not `panel`. Needs a per-site sweep — see decision #37 |
| `Dialog`/`Sheet` radius + shadow | ✅ Done 2026-08-30 | **Pilot 6**: Dialog → `rounded-modal` (14px, all breakpoints) + `elev-3`; Sheet → `elev-3`, radius intentionally left square. Consciously overrides Pilot 4 §9's no-elevation finding. Mobile radius differentiation deferred to a post-Phase-7 mobile polish pass — see decision #39 |
| `Popover`/`DropdownMenu`/`Select` content shadow | ✅ Done 2026-08-30 | **Pilot 7**, standalone ticket under no phase: all three → `shadow-elev-2`, executing #34's existing assignment. Radius unchanged at `rounded-md` (6px). `Popover` regrouped out of #35's `modal` row into the new Floating Layer group; #35's Dropdown/Select radius gap closed at the same time. Phase 2 stays ✅ CLOSED — see decision #40 |
| `elev-0` vs `shadow-none` — the thrice-deferred overlap question | ✅ Closed 2026-08-30 | **Answered: `shadow-none` retired.** 4 remaining sites (Topbar, calendar, tabs, toast) → `shadow-elev-0`; zero `shadow-none` occurrences remain codebase-wide. Elevation model now fully applied across every component #34 named — see decision #41 |
| Phase 2 blocker bar — closed at Card and Dialog/Sheet | ✅ Closed 2026-08-30 | Five known-deferred items explicitly ruled out; Phase 2 will not reopen a third time on "same-class-of-gap" reasoning for any of them — see decision #38 |
| `Card`/`Button`/`Badge` typography + Badge shape | ✅ Done 2026-08-30 | Standalone ticket under no phase, same category as #40. `CardTitle` → `text-heading-card`; `Button` `default` loses `uppercase tracking-wide text-xs` (it was variant-scoped, **not** base — ticket premise corrected); `Badge` → Soft Badge on the 5 status families. Phase 2 stays ✅ CLOSED — see decision #42 |
| `Badge` `default`/`secondary`/`outline` still outline-style | 🟡 OPEN | Not convertible without inventing values: `brand` has no `-border`/`-text` Tailwind mapping (the CSS vars exist), and `secondary`/`outline` have no status token set. Produces a visible two-treatment split in the `/schedule` status column. Needs an Architect decision. **Narrowed 2026-08-30 by #43:** `brand.border`/`brand.text` are now mapped, so `default` is mechanically convertible; `secondary`/`outline` still are not (no status token set). The conversion itself is Phase 4 — see decisions #42c and #43b |
| `tailwind-merge` does not recognise our custom `fontSize` keys | ✅ CLOSED 2026-08-30 by #43 | Was: custom scale keys are not deduped against Tailwind's built-in sizes, so a call-site override silently stacks instead of replacing. Worked around per-site at #42; **root-caused and fixed systemically at #43**, which also found the worse half — a plain text-color was deleting the size token outright — see decisions #42a and #43a |
| `tailwind-merge` custom `fontSize` registration | ✅ Closed 2026-08-30 by #43 — supersedes the OPEN row above | `cn()` now uses `extendTailwindMerge` with all 7 custom type keys in the `font-size` group. Fixed **both** directions, including the worse one #42 missed: a plain text-color was silently deleting the size token. **Not inert** — repaired a live defect in `calendar.tsx` (weekday headers/week numbers were rendering at full foreground, not muted). Guarded by `src/lib/utils.test.ts`, which cross-checks the registration list against the config — see decision #43 |
| `brand.border` / `brand.text` Tailwind mapping | ✅ Done 2026-08-30 — mapping only, deliberately unused | Maps to the pre-existing `--accent-border` / `--accent-text` (**there are no `--brand-*` CSS vars**). Unblocks `badge.tsx` `default` for Phase 4; **applied to no component** — see decision #43b |
| Master Plan doc vs `tailwind.config.js` token-value conflict | ✅ Resolved 2026-08-30 — **config is the source of truth** | Actual values: `text-heading-card` = 16px/24px/600/tracking `normal`; `text-body` = 14px/20px/400. The external Master Plan is historical/aspirational where it conflicts — see decision #43c |
| `success` ≡ `primary` ≡ `focus-ring` (all `#0E7C5A`) | 🟡 OPEN — **accepted, not a blocker** | Second complete four-token collision, found during the 2026-08-30 audit and previously unrecorded. Explicitly left open by architect decision when `info` was fixed at #44. Consequence: under Phase 4's remap, `done`→`success` still renders in the primary action colour — see decision #44b |
| Status colour is the only status signal (tritanopia) | 🟡 OPEN — Phase 4 design question | Under tritanopia blue collapses toward teal (ΔE 0.036 vs jade) — above the shipped floor and unavoidable for any blue. If status must be distinguishable without colour, Phase 4 should pair each status with an icon or text label. Not decided at #44 — see decision #44d |
