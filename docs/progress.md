# QQM — Progress Tracker

Last updated: after Direction C Phase 2 (Component Primitives) closeout — 2026-08-29.

See `decisions.md` for the reasoning behind blocked/skipped items, and
`development-guide.md` for the rules every ticket follows.

---

## Current status

```
Current:  Direction C — Component Primitives (Phase 2) ✅ CLOSED
          2026-08-30 (final). Pilots 1/3/4/5/6 all complete.
          Blocker bar closed by decision #38 — do not reopen
          without explicit architect sign-off.
Next:     Phase 4 — semantic status remap. NOT started; one blocking
          open question first (see "Next up — Phase 4" below).
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

## UI/UX Polish — Design System & Interaction Refresh — ✅ COMPLETE (2026-08-15 → 2026-08-20)

A further round of UI/UX polish, built on top of Phase 1/Phase 2 above. Originally scoped
as a full module-by-module pass; independently verified complete. Backend untouched
throughout. Summary of what was done:

- **Shared design-token foundation** — a governed typography scale (`tailwind.config.js`
  `theme.extend.fontSize`, documented in `design-tokens.md`); a shared `<PageHeader>`
  component migrated across all 11 pages; a `max-w-7xl` content constraint added to
  `AppLayout`; an optional-field indicator convention (`<OptionalLabel>` — `(optional)`
  suffix on optional fields, no marker on required fields) with correct ARIA semantics.
- **6 accessibility/defect fixes** — dialog close-button hit target expanded to meet WCAG
  2.2 AA; `text-xs` timestamp contrast raised to WCAG AA in activity/version panels;
  brand focus-visible outline added to sidebar nav links; long dialog titles now wrap
  instead of overflowing past the close button; flex/grid items now shrink so wrap/break
  actually engages at 375px; `RoleFilterTabs`' wrapped row no longer overlaps the People
  filter bar.
- **Playwright tooling + 375px sweep** — new visual-regression tooling under
  `frontend/tests/visual-sweep/`, plus a dedicated 375px-viewport sweep spec
  (`375px-sweep.spec.ts`) covering narrow-viewport rendering across modules.
- **Status label semantic fix** — renamed the "Status" filter label to "Record status"
  sitewide to clarify it's the soft-delete filter, not an entity-state field.
- **Server list column redesign** — `ServersPage` columns redesigned around access
  documentation fields; VPN badge recolored to neutral (was incorrectly using the warning
  amber token).
- **Row/action pattern** — new shared `RowActions` overflow (kebab) menu component,
  adopted across Clients/Projects/Environments/Servers/People/Schedule; Schedule's action
  menu additionally fixed to gate actions correctly by terminal status. See `decisions.md`
  for the standing convention.
- **Sitewide color-token opacity fix** — color tokens reformatted as RGB channel triples
  in `tailwind.config.js`/`globals.css` so Tailwind opacity modifiers (e.g. `bg-primary/10`)
  work correctly; previously silently broken.
- **Table density reduction** — cell padding tightened and the brand-accent header
  underline dropped for a denser, more admin-tool-appropriate table look.
- **Search/filter/sort toolbar consolidation** — Search moved into the shared `FilterBar`
  for Clients/Projects/Environments/Servers; Resources' sort/order/status and Schedule's
  filter row both merged into the same shared `FilterBar` pattern.
- **Server + Environment modal-to-inline-edit migration** — `ServerDetailPage` and
  `EnvironmentDetailPage` edit flows moved from modal dialogs to inline on-page editing;
  Playwright smoke coverage added for both the inline-edit and create flows.

**Explicitly deferred:** Resources detail-page migration to the modal-to-inline-edit
pattern was **not** done — no detail page exists yet for Resources (Resources currently
uses in-place list/version-editor UI, not a dedicated detail page), so this migration is
a larger effort than Server/Environment's and is left for a separate future ticket.

Additional smaller fixes landed in this same window, not itemized above: `Select`
controlled-state warning suppressed, stale single-record queries no longer cause
spurious 404s, `ScheduleFormDialog`'s toast errors standardized on `apiErrorMessage()`,
and `LoadingState` spinner size standardized to match sibling states.

---

## Light Theme Migration — ✅ COMPLETE (2026-08-21)

Full switch of the app's background/surface tokens to a light palette (Direction B /
"Deep Enterprise"), replacing the prior Razer-inspired dark theme — a color-token swap,
not a structural redesign; spacing, radius, and the typography scale established in the
UI/UX Polish phases above were untouched. See `decisions.md` #29-#33 for full detail
rather than duplicating it here.

- **Phase 1 — token audit** (commit `3ace282`): audited every existing token for live
  consumers before touching any value; 2 unused proprietary tokens (`subtle`, `brand-dim`)
  removed as dead weight ahead of the swap.
- **Phase 2a — palette direction selection**: Direction B locked as the target palette
  (design decision, no code) — full light-mode background, not a dark/light toggle; a
  dual-accent system (blue for actions/links, teal reserved for status/success).
- **Phase 2b — token implementation + Servers pilot** (commit `174416a`): Direction B
  token values applied globally in `globals.css`/`tailwind.config.js`; piloted and
  independently verified on the Servers module before any other module was touched.
- **Phase 2b close-out** (commit `d0e06b5`): resolved the two items Phase 2b's own
  verification had flagged as pending — `--surface-hover`'s placeholder value replaced
  with a real, contrast-checked one; `#46505A` recorded as a documented candidate value
  with no live consumer, not wired to any token; `development-guide.md`'s stale
  dark-theme guidance corrected to Direction B.
- **Sitewide rollout audit** (commits `c95ce80`, `adc0de3`): all 7 remaining modules
  (Clients, Projects, Environments/Servers/Infrastructure, People, Activity, Resources,
  Schedule) individually audited for hardcoded colors, correct semantic token mapping,
  and badge/status-element data accuracy. Found and fixed one genuine defect — Activity's
  `ACTION_VARIANT`/`ACTION_DOT` color mismatch — and formally closed the `status` (teal)
  token as intentionally reserved/unwired, with no genuine consumer found across the
  entire audit.
- **Final independent verification**: a fresh session (GitHub-connector-only access)
  independently re-checked 9 claims from this phase's work against the actual repo state
  — all 9 confirmed, zero discrepancies.

---

## Direction C — Component Primitives (Phase 2) — ✅ CLOSED (2026-08-30, final)

Migration of the shared UI primitives onto the Direction C tokens: jade
`--primary` as the system action color, violet `--accent` scoped to selection and
navigation state only (**decision #36**).

**✅ Status: CLOSED — final.** Pilots 1, 3, 4, 5 (Card + Toolbar) and
6 (Dialog/Sheet) are all complete. No qualifying gap remains open.

> **This is the third and final time this phase name is used for a status
> change.** Phase 2 closed once, reopened for `Card`, closed again, reopened
> for `Dialog`/`Sheet`, and now closes for good. **Do not reopen without
> explicit architect sign-off** — decision **#38** closes the
> "same-class-of-gap" bar that drove both reopenings and names the five
> known-deferred items that are explicitly ruled out as grounds.

**Why Phase 2 closes now instead of reopening a third time — the important
part.** `Popover`, `DropdownMenu` and `Select` content still carry the old
`rounded-md` (6px) + `shadow-none` recipe, and are **now visibly desynced from
`Dialog`**, which moved to 14px + `elev-3` in Pilot 6. On the surface that
looks like exactly the kind of gap that reopened Phase 2 twice. **It is not**,
and the distinction is the reason this closure holds:

- `Card` was an **undiscovered miss** — a component a Phase 2 pilot was scoped
  to cover, which no commit ever touched. Nobody knew until the closeout audit.
- `Dialog`/`Sheet`'s radius and shadow were the same shape of miss: Pilot 4
  covered only overlay and focus ring, and the remainder went unrecorded.
- `Popover`/`DropdownMenu`/`Select` are **an explicit, informed scope
  decision**. Scope option (a) — Dialog + Sheet only — was chosen deliberately
  when the Pilot 6 ticket was written, *knowing the desync would result*. It is
  recorded in decision #39(a) and was flagged in the Pilot 6 report.

A known, deliberate, documented deferral is not the same thing as a silent
miss. Per decision **#38**, only the latter ever qualified as a Phase 2
blocker, and both instances of it are now closed.

**`Popover`/`DropdownMenu`/`Select` — tracked future ticket.** Not Phase 2,
not urgent, no deadline. ⚠️ If it is ever picked up as **scope option (b)**
(migrate all overlay surfaces together), **`decisions.md` #35 must be amended
first**: it assigns `modal` radius to "Dialog, Sheet, Popover" and gives
`DropdownMenu` and `Select` **no radius target at all**, so there is nothing
for those two to migrate *to* until that decision is extended.

**Pilot 4 migrated only half of Dialog/Sheet.** It moved the overlay to the
`--overlay` token and unified the focus ring to jade — both ✅ done and not
undone here — but left **radius and shadow** on their pre-Direction-C values:

- `dialog.tsx:39` — `shadow-none` (target: `elev-3`) and `sm:rounded-md`, which
  is **breakpoint-scoped only**: below the `sm` breakpoint the dialog has no
  radius class at all (target: `modal`, 14px).
- `sheet.tsx:32` — `shadow-none` (target: `elev-3`). Sheet carries **no radius
  class at all**; as an edge-anchored panel that may well be correct, but it is
  a fact to decide on, not an omission to assume.

This was recorded as a 🟡 OPEN tracker item after the Card pilot audit rather
than as a blocker. **Hello then decided it counts as a Phase 2 blocker — the
same class of gap as Card**: a component that a Phase 2 pilot was supposed to
bring onto the Direction C scales, but which still sat on pre-Direction-C
values. **This was a scope split, not a reversal of Pilot 4** — the overlay and
focus-ring work stayed ✅ DONE throughout.

**✅ That gap is now closed.** Pilot 5 shipped 2026-08-30 (**decision #39**):
`Dialog` → `rounded-modal` at all breakpoints + `shadow-elev-3`; `Sheet` →
`shadow-elev-3` with its square radius deliberately preserved.

**🟡 Phase 2 is deliberately NOT marked closed here.** Pilot 5 closed the stated
blocker, but the overall phase status is left for the architect to set after
reviewing the Pilot 5 report — there is a scope question outstanding
(`Popover`/`DropdownMenu`/`Select` are now visibly desynced from `Dialog`, by
explicit scope decision), and a referenced **decision #38 that does not exist**
to cross-reference first. See `decisions.md` #39.

**Merged to `main` as merge commit `290c173`** via **PR #1**, from
`phase-2/input-underline-pilot` — 8 commits, 15 files, +964/-43.
**CI: ✅ passed, 2 checks** — `Frontend (lint / build / test)` 80s and
`Backend (build / test)` 49s (run `33263619488`, event `pull_request`, every step
green). The PR existed *only* to obtain that verification: `ci.yml` fires solely
on push to `main` and PRs targeting `main`, so the branch's 8 commits had never
been CI-tested before this.

| Pilot | Scope | Commits | Evidence |
|---|---|---|---|
| 1 | `Input` / `Textarea` / `SelectTrigger` — box border → underline treatment; zero layout shift (box-shadow, not border-bottom); disabled state at 40% opacity | `d091476`, doc `c55fac6` | `phase2-input-underline-pilot.md` |
| 2 | ⚠️ **No pilot was ever numbered 2** — see note below. The work occupying this slot: 3 new `Badge` variants + mapping of the remaining Phase 1.1 status tokens | `56b91f8` | *(no pilot doc)* |
| 3 | `Button` → jade primary, `focus-visible` ring unified to jade. Surfaced and recorded **decision #36** (primary/accent role definition) | `fdf8484`, `c0ecf2e`, `21f2d73` | `decisions.md` #36 |
| 4 | `Dialog` / `Sheet` **overlay + focus ring** — ✅ **DONE.** Overlay → `--overlay` token, focus ring unified to jade. `Popover` and `DropdownMenu` audited and closed as no-change *(scope limited to overlay/focus ring — radius and shadow were never in this pilot; see row 6)* | `0345c3d` | `phase2-overlay-pilot.md` |
| 5 | `Card` + `Toolbar` — ✅ **DONE.** Both migrated to `rounded-panel` (10px); `Card` additionally to `shadow-elev-1`. `--card`/`--card-foreground` alias deliberately kept, not collapsed to `--surface` | `9ca8c82` | `decisions.md` #37 |
| 6 | `Dialog` / `Sheet` **radius + shadow** — ✅ **DONE.** `Dialog` → `rounded-modal` (14px, **all** breakpoints — was `sm:`-scoped, so 0px below 640px) + `shadow-elev-3`; `Sheet` → `shadow-elev-3`, radius intentionally left square (edge-anchored drawer). Consciously overrides Pilot 4 §9 | *(this commit)* | `decisions.md` #39 |
| — | **Pre-merge dead-token cleanup**: deleted `--input`, `--ring` and the four `--status-*` teal tokens (all zero-consumer); `dropdown-menu.tsx` bare `border` → `border-border` | `daf5208` | `phase2-token-cleanup.md` |

**Pilot numbering (canonical).** Table row numbers *are* the pilot numbers:
Pilot 1 = Input/Textarea/SelectTrigger, Pilot 3 = Button, Pilot 4 = Dialog/Sheet
overlay + focus ring, **Pilot 5 = Card + Toolbar** (decision #37), **Pilot 6 =
Dialog/Sheet radius + shadow** (decision #39). Row 2 is not a pilot — see below.
The Pilot 6 ticket originally labelled itself "Pilot 5", which collided with
Card + Toolbar; decision #39's heading was corrected to Pilot 6 to match this
table. Both documents now agree.

**⚠️ Pilot-numbering gap (recorded as-found, not reconciled).** The repo documents
Pilots 1, 3 and 4; the string "Pilot 2" appears nowhere in `docs/` or any commit
message. `card.tsx` was **never modified** by any commit in this phase. If Pilot 2
was intended to cover Card/Badge, only the Badge half landed (`56b91f8`, +3
variants) and it was committed as Phase 1.1 status-token work rather than as a
Phase 2 pilot. **The Card half was never done at all** until the Card pilot
shipped on 2026-08-30 (decision #37), which is what returned Phase 2 to closed.

**⚠️ PR #1 was not opened as a draft.** It was intended to be (its title still
reads "DRAFT … not ready to merge") but was created ready-for-review and merged
into `main` 10 seconds after CI reported green, without the further review its
body requested. CI coverage was nonetheless obtained, which was the objective.

**⚠️ Preceding Direction C work is not recorded in this file.** The Direction C
*Foundation* phase (`decisions.md` #34 elevation model, #35 radius scale;
commits `e9c1953`, `71f634c`, `6f59971`) and the `DetailPageShell` / Overview
metric-tile work (`64957ac`, `76b9479`, `f1530e8`, `9030b63`, `ccb8fd8`,
`64a935f`) landed on `main` between 2026-08-22 and 2026-08-27 and have no section
here. Flagged, not back-filled — see "Needs attention" in the close-out report.

---

## Next up — Phase 4 (semantic status remap)

**Not started.** Phase 4 is the next phase to plan.

**🔴 Blocking open question, must be resolved before Phase 4 begins:** the `info`
status token (`#6C4BF4`) is identical to `--accent` violet. Under decision #36
violet is now formally scoped to selection/navigation only, so this shared value
is a **conflict, not a coincidence** — it was previously logged as an unconfirmed
dual-use question. `info` very likely needs its own distinct color **before** any
status is remapped onto it. See `decisions.md` #36 and its tracker table.

---

## Blocked / Deferred (not part of the linear module sequence)

| Item | Status | See |
|---|---|---|
| Users CRUD (backend + frontend) | 🚫 BLOCKED / FUTURE | `decisions.md` #7 |
| `PersonDetailDialog` account-visibility (Part 25c) | ⏭️ Skipped | `decisions.md` #7 |
| Third role tier | ⏭️ Not scheduled | `decisions.md` #8 |
| `Sidebar.tsx:21` `focus-visible:outline-brand` still resolves to violet — a violation of decision #36's jade-focus-ring rule | 🟡 OPEN — explicitly deferred; not blocking, no ticket opened yet (was out of Pilot 3 scope) | `decisions.md` #36 |
| `info` status token (`#6C4BF4`) is identical to `--accent` violet | 🟡 OPEN — must be resolved before Phase 4 remaps any status | `decisions.md` #36 |
| `Card` + `Toolbar` → `panel` radius, `Card` → `elev-1` | ✅ DONE 2026-08-30 — closed the gap that reopened Phase 2 | `decisions.md` #37 |
| "Table container" named by `decisions.md` #35 but no such component exists | 🟡 OPEN — deferred out of the Card pilot; creating one is a design change | `decisions.md` #37 |
| 10 hand-rolled `rounded-md border border-border` panel-like sites | 🟡 OPEN — deferred; needs a per-site sweep (5 avatar squares are `control`/`pill`, not `panel`) | `decisions.md` #37 |
| `Dialog`/`Sheet` radius + shadow | ✅ DONE 2026-08-30 — `Dialog` → `rounded-modal` (all breakpoints) + `elev-3`; `Sheet` → `elev-3`, radius intentionally square. Closed the blocker that reopened Phase 2 | `decisions.md` #39 |
| Elevation model — `shadow-none` retired, `elev-0` sole zero-elevation token | ✅ DONE 2026-08-30 — **elevation model now fully closed**: every component `decisions.md` #34 named carries an explicit `elev-*` token, and **zero components remain on the old ad-hoc `shadow-none`** (0 occurrences codebase-wide). Final 4 sites migrated: Topbar, calendar, tabs, toast. Standalone ticket (Pilot 8), not under any Phase | `decisions.md` #41 |
| `Popover`/`DropdownMenu`/`Select` content shadow | ✅ DONE 2026-08-30 — **completed as a standalone ticket (Pilot 7), not under any Phase.** All three → `shadow-elev-2`, executing `decisions.md` #34's existing assignment; radius unchanged at `rounded-md` (6px). Resolves the `Dialog` desync. **Phase 2 was not reopened and stays ✅ CLOSED** | `decisions.md` #40 |
| Phase 2 blocker bar — closed at Card and Dialog/Sheet | ✅ CLOSED 2026-08-30 — five known-deferred items explicitly ruled out; no third reopening on "same-class-of-gap" grounds | `decisions.md` #38 |

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
| UI/UX Polish — Design System & Interaction Refresh | ✅ 2026-08-20 |
| Light Theme Migration | ✅ 2026-08-21 |
| Direction C — Component Primitives (Phase 2) | ✅ 2026-08-30 (final) — Pilots 1/3/4/5/6; Card + Toolbar (#37) and Dialog/Sheet (#39) shipped; blocker bar closed by #38 |

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
