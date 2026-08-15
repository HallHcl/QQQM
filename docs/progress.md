# QQM — Progress Tracker

Last updated: after Part 29 documentation batch update, final (post-29-CLOSEOUT) — 2026-08-15.

See `decisions.md` for the reasoning behind blocked/skipped items, and
`development-guide.md` for the rules every ticket follows.

---

## Current status

```
Current:  UI/UX Polish — Phase 2 (module-by-module) COMPLETE (29a-29g)
Next:     Release/readiness checkpoint and deferred-item review — not yet scoped
```

---

## Backend (frozen, complete)

| Item | Status |
|---|---|
| 17 backend parts (Part 8 migration infra → Part 17 Activity module) | ✅ |
| 156/156 backend tests passing | ✅ |
| Part 18 — OpenAPI spec + generated TypeScript client | ✅ |

---

## Frontend Foundation

| Part | Scope | Status |
|---|---|---|
| 19 | Typed apiClient wiring, auth guard, global error handling (401/403/404/409), React Query config, `usePagination` hook, Loading/Empty/Error state components, error boundary | ✅ |
| 19.1 | Vitest + React Testing Library + jsdom test layer (unit tests for Part 19 foundation only) | ✅ |
| 19.2 | RBAC foundation — `useHasRole` hook, `RequireRole` component (UX-only, not a security boundary) | ✅ |

---

## Frontend Modules

### Clients — ✅ COMPLETE (4 parts)
| Part | Scope |
|---|---|
| 20a | Audit |
| 20b | List view + pagination |
| 20c | Create/edit form + optimistic locking + first real 409 conflict UI (`ConflictState.tsx`, built reusable) |
| 20d | Soft-delete + restore + RBAC gating |

### Projects — ✅ COMPLETE (5 parts)
| Part | Scope |
|---|---|
| 21a | Audit |
| 21b | List + create/edit + optimistic locking (combined — patterns already proven) |
| 21c | Delete/restore + RBAC + first reusable `ConfirmDialog` |
| 21d | Project detail view (first Detail View pattern) + `project_people` roster management |
| 21e | RBAC fix — gated Create/Edit to admin-only after discovering the matrix was wrong (also fixed the same gap in Clients) |

### Environments — ✅ COMPLETE (5 parts + 1 sub-part)
| Part | Scope |
|---|---|
| 22a | Audit |
| 22a.5 | Extracted shared `ProjectPicker` (was duplicated independently in 3-4 places) |
| 22b | Data layer migration + `useRestoreEnvironment` |
| 22c | List + CRUD + detail view (RBAC stricter than Clients/Projects: admin-only for ALL write actions) |
| 22d | `vpn_resource_id` picker + orphaned-reference warning UI (no backend fix possible — frontend-only mitigation) |

### Servers — ✅ COMPLETE (4 parts)
| Part | Scope |
|---|---|
| 23a | Audit |
| 23b | Data layer migration (`useServers.ts` + `useCredentialReferences.ts`) |
| 23c | List/CRUD/detail view + full Access Documentation field UI (`service_type`, `access_method`, `access_host`, `access_port`, `access_path`, `monitoring_url`) + `EnvironmentPicker` (built new) |
| 23d | Credential reference management UI (hard-delete-only, no restore, no optimistic lock — genuinely different entity shape) |

### Resources — ✅ COMPLETE (4 parts)
| Part | Scope |
|---|---|
| 24a | Audit — found the type enum has 7 values not 5, found `VersionHistoryPanel.tsx` already existed and worked |
| 24b | Data layer migration (`useResources.ts` + `useResourceVersions.ts`, incl. cross-feature `VpnResourcePicker.tsx` consumer) |
| 24c | List + pagination + metadata edit/delete/restore + RBAC gating (metadata PATCH is admin-only, unlike most other create/update splits) |
| 24d | Version-creation UX: pre-fill from current version, pre-submit duplicate-content warning, "Revert to this version" button — all decided via explicit design conversation (8 open questions resolved before build) |

### People — ✅ COMPLETE for in-scope work (2 parts; 1 skipped)
| Part | Scope |
|---|---|
| 25a | Audit — **headline finding: no Users API exists at all** (see `decisions.md` #7) |
| 25b | Data layer migration + list/CRUD/delete/restore + RBAC gating; removed dead `clientId` filter; deleted dead `User`/`UserRole`/`PeopleClient` types |
| 25c | ⏭️ **Skipped** — PersonDetailDialog account-visibility work, deferred pending the Users decision (see `decisions.md` #7) |

### Clients bug fix (post-Schedule, pre-Activity) — ✅ COMPLETE
| Ticket | Scope |
|---|---|
| Deleted-filter fix | Found by an independent Verifier AI pass (not by a numbered audit ticket): `ClientsPage.tsx` offered a non-functional "All" deleted-filter option and `useClients.ts` sent `deleted="all"` to a backend that silently treats it as active-only. Removed the option from the UI; narrowed `useClients.ts`'s type + added a runtime guard so `"all"` can never be sent for Clients specifically. See `decisions.md` #11/#12. |

### Schedule — ✅ COMPLETE (6 parts)
| Part | Scope |
|---|---|
| 26a | Audit — verified the state machine precisely, found 2 live bugs (edit form silently discarded field changes; calendar overdue-logic didn't check `in_progress`) |
| 26b | Data layer migration; confirmed `is_overdue` is server-computed and exposed, not recomputed client-side |
| 26c | Foundation parity — pagination, `ConfirmDialog` on delete, RBAC gating, `ConflictState`/`useConflictResolution` wiring |
| 26d | Correctness fixes — edit dialog now only allows editing `notes` (every other field read-only); calendar reads server `is_overdue` directly; added "Cancelled after starting" derived indicator |
| 26e | Built `ServerPicker` (composed client-side from Environments+Servers, since no backend project-level server filter exists); wired into create form for Project-only / Server-only / both linkage |
| 26f | Status-transition action buttons (Start/Complete/Cancel) replacing the old unconstrained status dropdown; legal-only by construction, no client-side state-machine duplication needed |

### Activity — ✅ COMPLETE (2 parts)
| Part | Scope |
|---|---|
| 27a | Audit — confirmed genuinely simple (no CRUD, no RBAC-gated write, no cascade behavior of its own); found: `useActivityLogs.ts` still on legacy axios (not migrated), `usePagination` not wired into `ActivityPage.tsx`, hand-rolled `ActivityLog` type missing `changed_by_person`, zero test coverage. Full findings in `activity-module-audit.md` (repo root). |
| 27b | Build — migrated `useActivityLogs.ts` to the generated `apiClient` pattern; exposed the full 9-filter set (`page, per_page, order, entity_type, entity_id, action, changed_by, from, to`) via new `ActivityFilterBar.tsx`; wired `usePagination` (page/perPage/order only — no `deleted`/`search`, neither applies to this append-only, non-searchable table); adopted `LoadingState`/`EmptyState`/`ErrorState`; `changed_by_person` now rendered in `ActivityTimeline.tsx`; added `useActivityLogs.test.tsx` + `ActivityPage.test.tsx` (previously zero coverage). |

---

## UI/UX Polish — Phase 1: Shared Foundations — ✅ COMPLETE (6 parts, 28a-28f)

Following the Polish Discovery & Shared Foundations Audit (pre-28a), this phase built and
adopted the shared components every later module-by-module polish pass will reuse, per
decision #4's "build once, reuse everywhere" pattern. **Backend untouched** (confirmed —
zero files under `backend/` changed by any Part 28 sub-ticket).

| Part | Scope |
|---|---|
| 28a | Responsive mobile navigation — built `MobileNav.tsx` (a slide-in `Sheet`, new shadcn/ui primitive `ui/sheet.tsx`) and extracted the nav item list into shared `layout/nav-items.ts`, consumed by both `Sidebar.tsx` (desktop, `md:flex`) and the new mobile trigger in `Topbar.tsx`. `AppLayout.tsx`'s main content area also gained a responsive padding/overflow fix (`min-w-0`, `p-4 sm:p-6`). |
| 28b | Form-field label/control association pass — added `id`/`aria-label` passthrough props to the three shared pickers (`ProjectPicker`, `EnvironmentPicker`, `ServerPicker`) and wired `<Label htmlFor>`/`<SelectTrigger id>` (or `aria-label` where no visible `<Label>` exists) across every form dialog and filter bar in the app, fixing screen-reader/click-target label association that was previously missing on nearly every `<Select>`. |
| 28c | `InfrastructurePage`/`EnvironmentTabs` state consistency — brought the one remaining page still using ad hoc "Loading servers…"/"No servers…" text (a leftover from before `LoadingState`/`EmptyState`/`ErrorState` existed) into the same shared-state-component pattern every other module already used; added `InfrastructurePage.test.tsx` (previously zero coverage for this page). |
| 28d | Post-mutation feedback contract — added `apiErrorMessage()` to `api/errors.ts` and used it to give every mutation across the app both an `onSuccess` and an `onError` toast (previously several mutations, e.g. `ProjectRoster`'s add/remove-person and `PersonDetailDialog`'s add/remove-client, only had `onSuccess`). This is now the standing contract for all future mutations — see `decisions.md`. |
| 28e | Shared `FilterBar.tsx` layout wrapper — a single consistent wrap/gap container for filter-row controls, adopted by Activity, Resources, and a new `PeopleFilterBar.tsx` (which also consolidated People's previously page-level search input and role tabs into one component). |
| 28f | Shared `PaginationControls.tsx` — Previous/Next + "Page X of Y" + per-page `Select`, replacing the same hand-rolled block that was independently duplicated across all 8 `usePagination`-consuming list pages (Clients, Projects, Environments, Servers, Resources, People, Schedule, Activity). |

**UI/UX Polish — Phase 1 (Shared Foundations) Complete.**

---

## URL-State Persistence (closes `decisions.md` #13) — ✅ COMPLETE (2026-08-15)

Closed the cross-cutting gap tracked since Part 27b: `usePagination.ts` now syncs
page/per_page/sort/order/search/deleted bidirectionally with the URL query string via
`react-router-dom`'s `useSearchParams`, and each of the 3 modules with additional local
filter state (Resources' type/project, People's role, Schedule's status/calendar-day,
Activity's 6 filters) was migrated to URL-derived state through the same hook instance's
new `getParam`/`setParams` escape hatch, rather than a separate `useSearchParams()` call
per page (see `usePagination.ts`'s doc comment for why: independent calls in the same
event handler race and clobber each other). Clients/Projects/Environments/Servers needed
**zero** page-level changes — every filter they have is already one of `usePagination`'s
own fields, so the hook rewrite alone covers them (confirmed: their 63 existing tests
pass unmodified). Backend untouched. All 8 pages' existing behavior — page-1-reset on
search/per_page change, no reset on sort/order change, and each module's pre-existing
(inconsistent) reset-on-filter-change behavior — was preserved exactly, not "fixed."
See `decisions.md` #13 for the full writeup including the `replace`-always navigation
decision and the known pre-existing filter-reset inconsistency across modules that was
intentionally left as-is.

---

## UI/UX Polish — Phase 2: Module-by-module — ✅ COMPLETE (7 parts, 29a-29g)

Part 29 applied the module-specific polish pass after Shared Foundations and URL-State Persistence.
The backend remained frozen throughout.

| Part | Scope |
|---|---|
| 29a | Clients — added the missing destructive-delete confirmation and verified the existing non-cascade behavior for Projects. |
| 29b | People — added client-association loading feedback, destructive unlink confirmation, and the corresponding cascade-accurate copy; nested-dialog bleed-through and the optional `relationship_type` field were recorded as decisions/deferred work. |
| 29c | Resources — clean verification; no functional defects found. The existing in-place version-history/editor flow was retained, and the full-page screenshot artifact was recorded as a verification-methodology issue. |
| 29d | Schedule — fixed the production-affecting timezone bug by centralizing DATE-only parsing in `parseScheduledDate`; corrected calendar tests to assert local calendar days and re-verified state-machine behavior. |
| 29e | Environments/Servers/Infrastructure — fixed the `VpnResourcePicker` label association; no other defects found. The empty Project picker was confirmed to be a test-data artifact, not a product bug. |
| 29f | Projects — fixed the production-affecting display gap for Projects whose parent Client is soft-deleted by merging active and deleted client lookups, while preserving the Clients boolean-only filter constraint. |
| 29g | Activity — added accessible labels for the UUID filter inputs and preserved the documented append-only, dead-`sort`, and controller-vs-service logging quirks; no backend or functional contract changes. |
| 29-CLOSEOUT | Closeout pass fixing three issues found after 29a-29g: (1) `NotificationBell.tsx` was still computing due/overdue schedules with the bare `new Date(schedule.scheduled_date)` constructor instead of the timezone-safe `parseScheduledDate()` helper 29d introduced for the Schedule module itself, so the bell's own due-count could be off by a day for viewers west of UTC — fixed by switching it to `parseScheduledDate()`, making it the helper's 5th consumer (see `architecture.md` §3.6). (2) `PersonDetailDialog.tsx`'s nested-`ConfirmDialog`-inside-`Dialog` bleed-through (found in 29b, left unfixed at the time) was fixed via an in-place content-swap within the same `DialogContent`, matching the Resources precedent — see decision #20. (3) `npm run build` was failing with `TS2591` (`process` not found) in the new `useSchedules.test.ts`, because `tsconfig.app.json`'s `types` array only listed `vite/client`; fixed by adding `"node"` to that array. |

The three genuine production-affecting/build-affecting defects found across this phase were Schedule
timezone parsing (29d), Projects' soft-deleted-client display (29f), and the NotificationBell timezone
bug (29-CLOSEOUT); the nested-dialog bleed-through (29b, fixed 29-CLOSEOUT) and the TS2591 build failure
(29-CLOSEOUT) were also real, fixed defects. The remaining Part 29 changes were polish, accessibility,
verification, or documentation decisions rather than backend/API work.

**Current verification note (post-29-CLOSEOUT):** the frontend test inventory is 507 tests across 57
files, confirmed by running the full suite: 507/507 passed. `npm run build`'s `TS2591` failure described
above has been fixed (root cause: `tsconfig.app.json`'s `types` array didn't include `"node"`, so
`process`/other Node globals weren't available to any file under `src`, including tests) — there is no
live build failure as of this update.

A previously-documented flake (`ServerFormDialog.test.tsx`) was cited across several of Part 29's own
tickets, but did not reproduce in 3 consecutive full-suite runs during 29-CLOSEOUT (507/507 every time).
A separate report claimed `ResourceEditor.test.tsx` flakes; that also did not reproduce. **Current
status: no flake has been reproduced in the most recent verification for either file.** Neither claim
should be treated as "fixed" — no root cause was ever identified for either one — and whether either
file is genuinely intermittent under different conditions (CI load, parallelism) remains unconfirmed.

**UI/UX Polish — Phase 2 (Module-by-module) Complete, including the 29-CLOSEOUT fixes above.**

---

## Blocked / Deferred (not part of the linear module sequence)

| Item | Status | See |
|---|---|---|
| Users CRUD (backend + frontend) | 🚫 BLOCKED / FUTURE | `decisions.md` #7 |
| `PersonDetailDialog` account-visibility (Part 25c) | ⏭️ Skipped | `decisions.md` #7 |
| Third role tier | ⏭️ Not scheduled | `decisions.md` #8 |

---

## Milestones

| Milestone | Status |
|---|---|
| Backend complete + frozen | ✅ |
| OpenAPI + generated client | ✅ |
| Frontend Foundation (19, 19.1, 19.2) | ✅ |
| 8 of 8 modules functionally complete | ✅ (Clients, Projects, Environments, Servers, Resources, People, Schedule, Activity) |
| **Frontend Functional Complete — 8/8 modules** | ✅ 2026-08-13 |
| `docs/` central documentation (`decisions.md`, `progress.md`, `development-guide.md`, `architecture.md`, `api-spec.md`) | ✅ complete — all 5 files exist; `architecture.md`/`api-spec.md` generated + verified from source by the coding agent, then independently spot-checked by a separate Verifier AI pass (see `decisions.md` #12) |
| UI/UX Polish — Phase 1 (Shared Foundations) | ✅ 2026-08-14 (Parts 28a-28f) |
| `usePagination` URL-state persistence (`decisions.md` #13) | ✅ 2026-08-15 |
| UI/UX Polish — Phase 2 (module-by-module) | ✅ 2026-08-15 (Parts 29a-29g + 29-CLOSEOUT) |

---

## Test count trend (for a sense of scale, not a strict metric)

| Checkpoint | Test count |
|---|---|
| After Part 19.1 (foundation tests only) | 31 |
| After Part 19.2 | 42 |
| After Clients complete (20d) | 65 |
| After Projects complete (21e) | 113 |
| After Environments complete (22d) | 176 |
| After Servers complete (23d) | 243 |
| After Resources complete (24d) | 320 |
| After People complete (25b) | 343 |
| After Schedule complete (26f) | 410 |
| After Activity complete (27b) | 424 (49 test files) |
| After Shared Foundations Polish complete (28f) | 475 (55 test files) — **milestone: +51 tests / +6 test files across Part 28**, driven by 6 new test files (`FilterBar.test.tsx`, `PaginationControls.test.tsx`, `MobileNav.test.tsx`, `InfrastructurePage.test.tsx`, `PeopleFilterBar.test.tsx`, `PersonDetailDialog.test.tsx`) plus expanded coverage in existing suites for the new label-association and toast-contract behavior. Verified by running the full suite: 474 passed, 1 failed — the failure is a `ServerFormDialog.test.tsx` timeout that occurs intermittently under full-suite/parallel execution; running that file in isolation passes 9/9, confirming it's a known flake, not a regression. |
| After URL-State Persistence complete | 494 (55 test files) — **+19 tests, 0 new test files**, all added to existing suites (`usePagination.test.ts` 9→19, `ActivityPage.test.tsx` 10→12, `ResourcesPage.test.tsx` 18→20, `PeoplePage.test.tsx` 15→17, `SchedulePage.test.tsx` 13→16). Verified by running the full suite twice: 494/494 passed both times, no flakes observed. |
| After Part 29 complete (29g) | 504 (56 test files) — **+10 tests / +1 test file**, including the new `useSchedules.test.ts` coverage for timezone-safe date parsing and expanded module-polish regression tests. |
| After 29-CLOSEOUT | 507 (57 test files) — **+3 tests / +1 test file**, the new file being `NotificationBell.test.tsx` (regression coverage for the timezone bug fix), plus the new `role="dialog"` count-of-1 regression assertion added to `PersonDetailDialog.test.tsx` for the nested-dialog fix. Verified by running the full suite: 507/507 passed. |
