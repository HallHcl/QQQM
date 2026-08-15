# 375px visual sweep

Manual Playwright tooling for spot-checking layout at a 375px viewport.
Not wired into CI — run it locally when you need to verify a
narrow-viewport layout claim in a real browser instead of from computed
CSS/source.

## Prerequisites

1. Postgres running (`docker compose up -d db` from repo root).
2. Backend running against it (`npm run dev` in `backend/`, port 4000).
3. Seed data present (`npm run seed` in `backend/`, if the db is fresh) —
   the sweep logs in as `admin` / `admin123`.
4. Frontend dev server running (`npm run dev` in `frontend/`, port 5173).
   The Docker production build must NOT be used here — it strips dev
   warnings that matter for verification.

## Run

```
npm run test:visual-sweep
```

Screenshots land in `frontend/playwright-screenshots/` (gitignored —
regenerate rather than diff against committed images).
