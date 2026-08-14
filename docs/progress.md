# QQM — Progress Tracker

Last updated: after URL-State Persistence ticket (closes `decisions.md` #13) — 2026-08-15.

See `decisions.md` for the reasoning behind blocked/skipped items, and
`development-guide.md` for the rules every ticket follows.

---

## Current status

```
Current:  UI/UX Polish — Phase 1 (Shared Foundations) COMPLETE (28a-28f)
Next:     UI/UX Polish — Phase 2 (module-by-module) — not yet scoped
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
| UI/UX Polish — Phase 2 (module-by-module) | ⬜ Not started — not yet scoped |

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