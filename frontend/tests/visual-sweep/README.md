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

The sweep found two real defects, which 8.3a then fixed; the specs that pinned
them are now ordinary passing assertions and stand as regression guards (the
`Port` label overflow at the two Access-documentation panels, and Clients'
missing `tabular-nums`). See `docs/phase-8-3-visual-walkthrough.md`.

If you ever need to record a defect you are deliberately not fixing, that
pattern is worth reusing: mark the spec `test.fail()` *inside the test body*
(a bare file-scope `test.fail()` annotates every test in the file), so the run
stays green while the defect stands and goes red the moment it is fixed — at
which point drop the annotation and promote the assertion.

## Local-fixture drift (fixed)

Two fixture problems, not layout regressions, used to make these specs flaky
depending on local run history:

- `overview-metrics.spec.ts` asserted literal seed counts, and
  `create-flow-smoke.spec.ts` creates a real throwaway server and environment
  on every run, so the former drifted out of date as the latter ran. Fixed by
  fetching the same live totals OverviewPage.tsx's tiles read (`per_page: 1`,
  `pagination.total`) in a `beforeAll` and asserting against those instead of
  literals — `npm run seed` only inserts 1 client and 1 person
  (`backend/src/db/seed.ts`), so these counts were never tied to a
  reproducible fixture in the first place.
- `375px-sweep.spec.ts`'s long-name PersonDetailDialog test creates its fixture
  with a fixed name and no cleanup; repeated local runs against the same
  shared dev DB accumulated same-named duplicates until the row locator hit a
  strict-mode multi-match failure — soft-deletion was never the mechanism.
  Fixed by suffixing the name with `Date.now()` per run (mirroring
  `create-flow-smoke.spec.ts`) and deriving the row locator from the created
  person's own `name` in the POST response.
