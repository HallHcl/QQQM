# Visual sweeps

Manual Playwright tooling for verifying layout claims in a real browser instead
of from computed CSS/source. Not wired into CI — run these locally when a visual
claim needs checking.

There is no committed baseline and nothing here pixel-diffs. Correctness is
asserted from the live DOM (bounding rects, computed styles, contrast ratios,
zero-overflow checks); screenshots are exported as human-reviewable evidence.

## Prerequisites

1. Postgres running (`docker compose up -d db` from repo root).
2. Backend running against it (`npm run dev` in `backend/`, port 4000).
3. Seed data present (`npm run seed` in `backend/`, if the db is fresh) —
   the sweeps log in as `admin` / `admin123`.
4. Frontend dev server running (`npm run dev` in `frontend/`, port 5173).
   The Docker production build must NOT be used here — it strips dev
   warnings that matter for verification.

## Run

```
npm run test:visual-sweep                                  # everything
npx playwright test tests/visual-sweep/phase-8-3-*.spec.ts # just the 8.3 gate
```

Screenshots land in `frontend/playwright-screenshots/` (gitignored —
regenerate rather than diff against committed images).

## What lives here

Most files are per-ticket sweeps, written to verify one change and safe to
delete once that ticket is closed out (`375px-sweep`, `row-actions-sweep`,
`typography-cleanup`, the three `*-ux-phase-a` files, `inline-edit-sweep`,
`overview-metrics`, `1280px-servers-sweep`, `create-flow-smoke`).

`phase-8-3-*` is different: it is the **release gate for the Phase 5–7
redesign**, covering five scope groups at a 1280 × 900 desktop viewport —
dashboard, global shell and ⌘K palette, the three form sheets, the six list
tables and their badges, and the record detail pages in view and edit mode.
`phase-8-3-helpers.ts` holds the shared assertion vocabulary those five specs
use; prefer extending it over re-deriving the same checks.

Two specs in that set are marked `test.fail()`. They pin real, open defects
found by the sweep (see `docs/phase-8-3-visual-walkthrough.md`), so the run
stays green while the defect stands and goes red the moment it is fixed — at
which point the annotation should be dropped and the assertion promoted.

## Known local-fixture drift

`overview-metrics.spec.ts` asserts literal seed counts, and
`create-flow-smoke.spec.ts` creates a real throwaway server and environment on
every run — so the former drifts out of date as the latter runs.
`375px-sweep.spec.ts` looks for a long-named person that is soft-deleted in the
current seed. Both are fixture problems, not layout regressions.
