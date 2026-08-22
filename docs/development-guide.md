# QQM — Development Guide (Rules for the Coding Agent)

This document is a checklist of rules distilled from this project's actual
practice, through Part 29g (module-by-module polish complete) plus URL-State Persistence — Frontend
Functional Complete (8/8 modules) plus UI/UX Polish Phases 1 and 2. It is written FOR the
coding agent (VSCode Agent / whichever assistant implements tickets), not as
project history — for the "why," see `decisions.md`. For system structure, see
`architecture.md`. For the API contract, see `api-spec.md`. For what's done and
what's next, see `progress.md`.

If any instruction in a specific ticket conflicts with this guide, the ticket's
explicit instruction wins for that ticket — but flag the conflict in your report
rather than silently resolving it.

---

## 1. The backend is frozen. Never modify it. No exceptions.

Not for "small" fixes. Not for bugs you find while auditing. Not to add a filter
param, an enum value, or an endpoint that doesn't exist. If a frontend need
genuinely requires new backend capability, **do not build a workaround that invents
a contract the backend doesn't support** — report it as a gap and stop. See
`decisions.md` #1 and #7 for the canonical example (Users CRUD).

If the frontend currently sends a param the backend silently ignores, remove it from
the frontend rather than trying to make the backend honor it.

## 2. Verify everything from source. Never trust a summary — including this one, including a prior audit, including the RBAC matrix document.

- RBAC claims: read the actual `backend/src/routes/*.routes.ts` file. Quote the
  exact middleware call (`requireRole("admin")` vs `requireAnyRole([...])`) with a
  `file:line` citation.
- Enum values: read the actual Zod validator AND the generated
  `frontend/src/api/generated/schema.d.ts`, not the original design-doc prose.
- Cascade/delete behavior: read the actual service function
  (`backend/src/services/*.service.ts`). Do not assume symmetry with how a *different*
  entity's cascade worked — several modules in this project have had opposite
  cascade behavior from their neighbors (see `decisions.md` #6).
- Even a finding from a *previous module's* audit report should be independently
  re-verified if it's load-bearing for the current ticket, not just cited secondhand
  (e.g. Part 23a re-verified Servers' RBAC from source rather than trusting Part
  22a's in-passing mention of it).

This project has repeatedly found the RBAC matrix and the original design briefing
to be wrong or imprecise. Treat both as a starting hypothesis to verify, never as
ground truth.

## 3. Every write mutation needs correct, per-module-verified handling of:

- **RBAC gating** via `<RequireRole roles={[...]}>` — verified from that module's
  own route file, not copied from a different module's gating (RBAC strictness
  varies a lot between modules — see `decisions.md` #2 for concrete divergences).
- **Optimistic locking** via `updated_at` + `useConflictResolution` +
  `ConflictState.tsx` — but ONLY if the entity's actual update schema requires
  `updated_at`. Some entities genuinely have no optimistic lock (e.g.
  `CredentialReference`, `resource_versions`) — verify from the validator before
  wiring this in; don't assume every PATCH needs it.
- **Soft-delete/restore** via `ConfirmDialog` (built Part 21c) where the entity
  supports it — with confirmation copy that accurately reflects that specific
  entity's real cascade/data-loss behavior (verified per rule #2), not generic or
  copy-pasted text.
- **Pagination** via the shared `usePagination` hook — verify which query params the
  backend's list endpoint actually supports before wiring UI for them (several
  modules' list endpoints support a narrower param set than assumed — e.g. Schedule's
  list has no `search`/`type`/`assigned_to` filter at all).

## 4. Reuse existing foundation pieces. Don't reinvent them.

Check for an existing component/hook before building a new one:
`ConfirmDialog`, `ConflictState` + `useConflictResolution`, `LoadingState` /
`EmptyState` / `ErrorState`, `RequireAuth`, `RequireRole` + `useHasRole`,
`usePagination`, `parseScheduledDate`, `ProjectPicker`, `EnvironmentPicker`, `ServerPicker`, the Detail
View pattern (established by Projects, Part 21d).

If a ticket's own audit reveals the same small piece of logic duplicated across
multiple files (a hardcoded enum list, a picker re-implemented inline), dedupe it
into one shared source as part of that ticket rather than leaving the duplication to
spread further.

## 5. Match the existing visual theme exactly. Do not redesign.

Direction B / "Deep Enterprise" light theme (single, non-togglable — see
`decisions.md` #29/#30/#31): `#FFFFFF` background, `#F4F6F8` surface, `#ECF0F3`
surface-hover, `#D8DEE4` border, `#12181F` primary text, `#667085` secondary/muted
text (`muted-foreground`), `#1D4ED8` brand/accent blue (hover `#1846C4`, active
`#153BA8`, tint `#E9EFFC`), `#0E7490` status teal (hover `#0C6277`, active `#0A5265`,
tint `#E6F2F4`), `#B91C1C` danger red (hover `#9F1717`, active `#851212`, tint
`#F9E7E7`), `#92400E` warning amber (hover `#7A350C`, active `#652C0A`, tint
`#F7ECE1`), sharp corners, Inter font, no shadows, existing shadcn/ui primitives and
Tailwind semantic tokens. Always use the CSS variables/Tailwind classes (e.g.
`bg-surface`, `text-muted-foreground`, `bg-danger/10`) — never hardcode a hex value
in a component. Match the layout/interaction pattern of the most similar
already-completed module rather than inventing new UI structure.

**Note on phase**: this rule was originally written during the Frontend Functional
Complete phase (Parts 19-27), when polish was explicitly out of scope (see
`decisions.md` #3 and #9), and at the time described the project's now-retired dark
theme. UI/UX Polish Phases 1 and 2 (Parts 28a-28f and 29a-29g) and the Light Theme
Migration (Phases 1-2b, `decisions.md` #29/#30/#31) have since completed — see
`progress.md` — replacing the dark theme with the Direction B light theme described
above and making other deliberate, scoped visual/UX changes. If a future ticket
explicitly continues the polish or theme-rollout track, follow that ticket's own
instructions on what latitude you have rather than this rule's original
functional-wiring-only framing; if your ticket is ordinary functional/bugfix work
outside those tracks, this rule's original intent (don't redesign or reintroduce the
old dark theme incidentally) still applies.

## 6. Verify every downstream consumer before changing a hook's shape or signature.

Before finalizing a migrated hook's params/return shape, find every current call
site (grep the whole frontend, not just the feature's own directory — several hooks
have surprising cross-module/cross-feature consumers, e.g. `VpnResourcePicker.tsx`
consuming Resources' `useResources`, or `ScheduleFormDialog.tsx` consuming People's
`usePeople`). Confirm each one still compiles and behaves identically after your
change. If keeping a consumer's exact behavior requires an awkward hook signature
(e.g. keeping a positional arg instead of a cleaner params object), prefer
preserving the existing consumer's behavior over a "cleaner" signature — this project
has consistently prioritized zero-behavior-change migrations over API elegance.

## 7. Client-side RBAC is UX only — say so, and never treat it as security.

`RequireRole`/`useHasRole` control what's *shown*. The backend's own role
enforcement (already complete) is the real security boundary. Never write code or a
comment implying otherwise.

## 8. Stay inside the ticket's stated scope, even when you notice something else that needs fixing.

If you notice an unrelated bug, gap, or opportunity while working a ticket, do NOT
fix it inline. Note it in the "Needs Claude's attention" or "Known issues / deferred"
section of your report instead, so it can be scoped as its own ticket. Every ticket
in this project explicitly lists what's out of scope — respect that boundary even
when the fix looks small. (Exception: a genuinely tiny, load-bearing correction
needed to keep the ticket's own required change compiling — e.g. a type fix a
migration forces on a downstream consumer — is fine; state it explicitly as a
"minimal compile fix," not a silent scope expansion.)

## 9. Every ticket ends with a structured report. Do not use free-form prose.

```markdown
## Done
- (checklist, one line per item)

## Files
- path — what changed, why (1 line each)

## Verified facts
- claim — source citation (file:line or test name)
(Do not compress this section. Every factual/RBAC/schema claim needs its citation
preserved in full — this is what lets your findings be trusted without
re-verification.)

## Decisions made / deviations from prompt
- what you decided beyond the literal spec, and why

## Known issues / deferred
- what was intentionally left undone, and why
- (or "None")

## Verification
- test count, build status, git status confirmation (which files actually changed,
  confirming nothing outside scope was touched)

## Needs Claude's attention
- anything you're unsure about or want specifically reviewed
- (or "None")
```

Every section is mandatory. Write "None" explicitly rather than omitting a section.

## 10. Audit tickets never write code. Build tickets never skip the audit.

Audit-only tickets are read-only research: no file modifications, no refactoring, no
"obvious quick fixes" applied inline. Their output (a written report, ideally with a
prioritized punch list and, where the work involves a genuinely novel/ambiguous
interaction, an explicit "Open Design Questions" section) becomes the direct input
for a design-decision conversation before any build ticket is scoped.

For genuinely novel UI work with no precedent elsewhere in the app (e.g. Resources'
version-history UX, People's account-visibility question, Schedule's status-transition
interaction), do not design the interaction yourself inside the audit — surface the
open questions and wait for an explicit decision.

## 11. Dialog composition and screenshot verification have standing rules.

Prefer in-place content swaps over nesting a `Dialog` or `ConfirmDialog` inside an already-open
dialog. If nested dialogs are genuinely unavoidable, stop and scope a dedicated shared-component
ticket before adding an inline workaround. For dialog and overlay verification, use viewport-only or
scroll-to-element screenshots; `fullPage: true` is not authoritative for fixed-position overlays on
pages taller than the viewport.

## 12. Tests are a safety net sized to the risk, not a coverage target.

Match the depth of testing already established for similar prior work (list states,
RBAC gating per action, payload correctness, 409 handling where applicable, cascade/
confirmation-copy assertions where relevant). Don't chase a coverage percentage —
this project has deliberately kept the test layer "targeted," not exhaustive
snapshot/integration testing (established explicitly in Part 19.1).

## 13. When in doubt about a judgment call, make the call, state your reasoning explicitly, and flag it for review — don't silently pick one or block on asking.

This project moves fastest when the agent makes a reasonable, well-reasoned decision
and clearly flags it (in "Decisions made" and, if it's a genuine toss-up, "Needs
Claude's attention") rather than either (a) silently picking one with no
explanation, or (b) stopping work to ask before proceeding. Cite precedent from
other modules where one exists; state your own reasoning clearly where none does.

## 14. CI runs on every push and PR to `main`. A red pipeline invalidates a "done" report.

`.github/workflows/ci.yml` runs two jobs automatically on every push and pull
request targeting `main`:

- **frontend** (Node 24) — `npm ci`, then `npm run lint` (oxlint), `npm run build`
  (`tsc -b && vite build`, so this is the typecheck too — there is no separate
  typecheck script), then `npm test` (Vitest).
- **backend** (Node 20) — `npm ci` against a `postgres:16-alpine` service
  container, then `npm run migrate`, `npm run seed`, `npm run build`, `npm test`
  (Jest). The seed step is mandatory, not decorative: the suite authenticates as
  the seeded `admin` user and looks up the `admin`/`member` role rows, so it
  fails fast on a migrated-but-unseeded database.

The two jobs deliberately run different Node versions. Both Dockerfiles use
`node:20-alpine`, and the backend stays on 20 to match its runtime. The frontend
**cannot** run its tests there: Vitest's jsdom environment pulls in
`undici@8.10.0`, which requires Node >=22.19.0 and crashes every test worker on
Node 20 with `webidl.util.markAsUncloneable is not a function`. `npm ci` does not
flag it, because engine constraints on transitive dependencies are advisory. If
you bump the frontend job's Node version, keep it at 22.19+ or the whole suite
dies before the first test.

Playwright (`npm run test:visual-sweep`) is deliberately **not** in CI — it needs a
dev server, backend, and database running simultaneously. It stays a local,
on-demand check, which is why patterns it covers should also have a cheap Vitest
guard where a regression would be silent (see rule 12 and
`frontend/src/test/hoverActions.ts`).

The practical rule: CI failing means the same thing as a failing local test run.
Do not report a ticket as done while the pipeline is red on the work you pushed,
and do not treat "it passed locally" as sufficient when CI disagrees — CI installs
from the lockfiles with `npm ci` on a clean machine and a clean database, so it
catches drift a warm local checkout hides. If CI fails for a reason you believe is
unrelated to your change, say so explicitly in "Needs Claude's attention" rather
than quietly moving on.
