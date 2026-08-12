# QQM — Progress Tracker

Last updated: after Part 26f (Schedule module complete).

See `decisions.md` for the reasoning behind blocked/skipped items, and
`development-guide.md` for the rules every ticket follows.

---

## Current status

```
Current:  Schedule module COMPLETE (26a-26f)
Next:     Part 27a — Activity Audit
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

### Activity — ⬜ NOT STARTED
| Part | Scope |
|---|---|
| 27a | Audit — next up |

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
| 7 of 8 modules functionally complete | ✅ (Clients, Projects, Environments, Servers, Resources, People, Schedule) |
| **Frontend Functional Complete** (all 8 modules) | ⬜ — blocked on Activity module only |
| `docs/` central documentation (`decisions.md`, `progress.md`, `development-guide.md`, `architecture.md`, `api-spec.md`) | ✅ complete — all 5 files exist; `architecture.md`/`api-spec.md` generated + verified from source by the coding agent, then independently spot-checked by a separate Verifier AI pass (see `decisions.md` #12) |
| UI/UX Visual Polish phase | ⬜ Not started — begins after Frontend Functional Complete |

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