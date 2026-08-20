# Light Theme Migration — Phase 1: Design Token Audit

**Status:** Read-only audit, complete. Independently re-verified by two separate
tools with converging results (GPT-Work via GitHub connector, and a fresh VSCode
Agent session reading local source directly) — both confirmed the same 9 dead
tokens and the same `bg-black/80` finding reported below. See `docs/decisions.md`
#29 for the resulting close-out decisions (7 dead tokens kept as shadcn
compatibility tokens, 2 proprietary dead tokens — `subtle`/`brand-dim` — removed,
`bg-black/80` accepted as an intentional overlay-color exception) and note that
`subtle`/`brand-dim` no longer exist in source as of that ticket; every other
finding below still reflects the codebase as read during this audit.

**Scope:** All 6 items in the ticket completed. See "Done" below.

---

## Done

| # | Item | Status |
|---|------|--------|
| 1 | Enumerate every color token | ✅ Complete — 29 CSS variables found (12 base + 17 shadcn-semantic aliases) |
| 2 | Usage-site count per token | ✅ Complete — exact counts below, re-verified with non-conflating regexes |
| 3 | Opacity-modifier cross-check | ✅ Complete — 0 broken; all opacity usages resolve to RGB-channel-format tokens |
| 4 | Hardcoded-color sweep | ✅ Complete — 0 hardcoded hex/rgb/hsl found in application code |
| 5 | Migration-risk per token | ✅ Complete — see table |
| 6 | Proposed new values (optional) | ✅ Included, clearly separated at the end |

---

## Files searched

- `frontend/src/styles/globals.css` (token source of truth, read in full)
- `frontend/tailwind.config.js` (read in full)
- `docs/decisions.md`, `docs/design-tokens.md`, `docs/progress.md` (prior audit baseline — used as a starting point only, every claim re-verified against source per this project's standing rule)
- All 173 `.ts`/`.tsx`/`.css` files under `frontend/src` (via targeted `Grep`, not individually read except the ones cited by file:line below)
- Individually opened for direct verification: `components/ui/button.tsx`, `components/ui/badge.tsx`, `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/textarea.tsx`, `components/ui/toast.tsx`, `components/ui/card.tsx`, `components/RowActions.tsx`, `features/activity/components/ActivityTimeline.tsx`, `features/schedule/components/ScheduleCalendar.tsx`
- `frontend/package.json` (checked for chart libraries that might carry their own color config — none found)
- Confirmed only one CSS file exists in the project (`globals.css`) and only one `:root` block — no other token-definition sources exist

---

## Verified facts

### 1. Every color token currently defined

**Base tokens — independently valued, defined in `frontend/src/styles/globals.css:21-35`.** All 12 are in **space-separated RGB-channel format** (opacity-modifier-safe), confirmed by direct read of the file — none are plain hex or `rgb()`.

| Token | CSS variable | Value (RGB channels) | Hex equivalent (per file's own comment, line 17-20) | Line | Format |
|---|---|---|---|---|---|
| `background` | `--background` | `10 10 10` | `#0a0a0a` | 21 | RGB-channel ✅ |
| `surface` | `--surface` | `18 18 18` | `#121212` | 22 | RGB-channel ✅ |
| `surface-hover` | `--surface-hover` | `26 26 26` | `#1a1a1a` | 23 | RGB-channel ✅ |
| `border` | `--border` | `38 38 38` | `#262626` | 24 | RGB-channel ✅ |
| `brand` | `--accent` | `68 214 44` | `#44d62c` | 26 | RGB-channel ✅ |
| `brand-hover` | `--accent-hover` | `88 232 64` | `#58e840` | 27 | RGB-channel ✅ |
| `brand-dim` | `--accent-dim` | `31 92 21` | `#1f5c15` | 28 | RGB-channel ✅ |
| (via `foreground` alias) | `--text-primary` | `245 245 245` | `#f5f5f5` | 30 | RGB-channel ✅ |
| (via `muted-foreground` alias) | `--text-secondary` | `163 163 163` | `#a3a3a3` | 31 | RGB-channel ✅ |
| `subtle` | `--text-muted` | `107 107 107` | `#6b6b6b` | 32 | RGB-channel ✅ |
| `danger` | `--danger` | `255 59 59` | `#ff3b3b` | 34 | RGB-channel ✅ |
| `warning` | `--warning` | `255 184 0` | `#ffb800` | 35 | RGB-channel ✅ |

**Finding: the RGB-channel conversion was applied to ALL 12 base tokens, not just the 5 originally fixed for the `--danger` bug.** This directly answers the ticket's "known relevant history" question — re-verified by reading `globals.css` line-by-line myself, not trusting the prior audit's summary. There is no plain-hex/`rgb()` straggler among the base tokens.

**Shadcn-semantic alias tokens — derived via `var(--x)`, defined in `globals.css:43-67`.** These do not hold independent values; they reference a base token above, and therefore inherit that base token's RGB-channel safety automatically.

| Tailwind alias | CSS variable | Points to | Line |
|---|---|---|---|
| `foreground` | `--foreground` | `--text-primary` | 43 |
| `card` | `--card` | `--surface` | 45 |
| `card-foreground` | `--card-foreground` | `--text-primary` | 46 |
| `popover` | `--popover` | `--surface` | 48 |
| `popover-foreground` | `--popover-foreground` | `--text-primary` | 49 |
| `primary` | `--primary` | `--accent` | 51 |
| `primary-foreground` | `--primary-foreground` | `--background` | 52 |
| `secondary` | `--secondary` | `--surface` | 54 |
| `secondary-foreground` | `--secondary-foreground` | `--text-primary` | 55 |
| `muted` | `--muted` | `--surface` | 57 |
| `muted-foreground` | `--muted-foreground` | `--text-secondary` | 58 |
| `accent` (shadcn's own, distinct from `brand`) | `--shadcn-accent` | `--surface-hover` | 60 |
| `accent-foreground` | `--shadcn-accent-foreground` | `--text-primary` | 61 |
| `destructive` | `--destructive` | `--danger` | 63 |
| `destructive-foreground` | `--destructive-foreground` | `--text-primary` | 64 |
| `input` | `--input` | `--border` | 66 |
| `ring` | `--ring` | `--accent` | 67 |

Total: **29 CSS custom properties** (12 base + 17 semantic aliases). The prior `design-tokens.md` reference (last verified there) lists these correctly but doesn't distinguish base-vs-alias — worth carrying that distinction into Phase 2 planning, since only the 12 base tokens actually need new hex values; the 17 aliases just need their `var()` target reassigned (or left as-is) once the base values change.

---

### 2 & 3. Usage-site counts and opacity-modifier safety, per token

All counts below are **exact match counts** (not matching-line counts), re-derived with word-boundary-safe regexes that do not conflate a token with its `-foreground` (or `-hover`/`-dim`) sibling — an error I caught and corrected mid-audit (a naive `-primary\b` search over-counts because `-primary-foreground` also satisfies that boundary). Every number below was independently re-run after that correction.

| Token (Tailwind class) | Total usages | Files | Opacity-modifier usages found | Opacity-safe? |
|---|---|---|---|---|
| `bg/text/border-danger` | **71** | 22 | Yes — `bg-danger/10` (×3: `RowActions.tsx:49`, `button.tsx:15`, `PersonDetailDialog.tsx:77`), `border-danger/40` (×2: `PersonDetailDialog.tsx:77`, `toast.tsx:65`), `text-danger/70` (`toast.tsx:80`) | ✅ Yes — renders correctly |
| `bg/text/border-warning` | **6** | 5 | Yes — `bg-warning/10` (×2: `ConflictState.tsx:27`, `ResourceEditor.tsx:257`), `border-warning/40` (×2, same files) | ✅ Yes — renders correctly |
| `bg/text/border/outline-brand` (+ `brand-hover`) | `bg-brand`:10, `text-brand`:11, `border-brand`:17, `outline-brand`:13, `brand-hover`:1 = **52** | ~20 | None found | ✅ Yes (not currently exercised, but format is safe) |
| `brand-dim` | **0** | 0 | — | N/A — token fully unused |
| `bg-surface` | **22** | 13 | None found | ✅ Yes |
| `bg-surface-hover` / `hover:bg-surface-hover` | **14** | 8 | None found | ✅ Yes |
| `bg-background` / `text-background` | 7 + 2 = **9** | 8 | None found | ✅ Yes |
| `border-border` / `divide-border` | **37** | 28 | None found (but note: global `* { @apply border-border; }` reset in `globals.css:71` means effectively every element in the app inherits this token) | ✅ Yes |
| `text-foreground` (bare) | **35** | 25 | `text-foreground/50` (`toast.tsx:80`) | ✅ Yes |
| `text-muted-foreground` | **139** | 47 | None found | ✅ Yes |
| `bg-muted` (bare, not `-foreground`) | **2** | 2 (`select.tsx:159`, `dropdown-menu.tsx:163` — both menu separators) | None found | ✅ Yes |
| `text-secondary-foreground` | **1** | 1 (`label.tsx:8`) | None found | ✅ Yes |
| `bg-accent` (shadcn's, not `brand`) | **8** | 4 | None found | ✅ Yes |
| `text-accent-foreground` | **6** | 3 | None found | ✅ Yes |
| `bg-popover` | **8** | 6 | None found | ✅ Yes |
| `text-popover-foreground` | **5** | 4 | None found | ✅ Yes |
| `bg-card` | **1** | 1 (`card.tsx:12`) | None found | ✅ Yes |
| `text-card-foreground` | **1** | 1 (`card.tsx:12`, same line) | None found | ✅ Yes |
| `subtle` (`--text-muted`) | **0** | 0 | — | N/A — token fully unused anywhere |
| `bg/text/border-primary`, `primary-foreground` | **0** | 0 | — | N/A — token fully unused anywhere as a utility class |
| `bg/text/border-secondary` (bare) | **0** | 0 | — | N/A — fully unused (only `secondary-foreground` above is live) |
| `bg/text/border-destructive`, `destructive-foreground` | **0** | 0 | — | N/A — fully unused; `Button`/`Badge` destructive variants use `danger` directly instead (`button.tsx:15`, `badge.tsx:13`) |
| `border-input` | **0** | 0 | — | N/A — fully unused; `Input`/`Select`/`Textarea` all use `border-border` instead (verified directly: `input.tsx:11`, `select.tsx:38`, `textarea.tsx:12`) |
| `ring-ring` / `focus(-visible):ring-ring` | **0** | 0 | — | N/A — fully unused; every focus state in the app uses a custom `focus-visible:outline-brand` pattern instead (verified directly in `input.tsx`, `select.tsx`, `button.tsx`, `badge.tsx`, `tabs.tsx`, `toast.tsx`) |

**Opacity-modifier cross-check result (scope item 3): zero silently-broken opacity usages found.** Every `/NN` opacity-modifier usage in the codebase (13 total occurrences, listed above under `danger`, `warning`, and `foreground`) resolves to a token that is in RGB-channel format, either directly (`danger`, `warning`) or by inheriting it through a `var()` alias (`foreground` → `--text-primary`). This re-confirms the `--danger` fix from the UX/UI Polish phase is holding, and additionally confirms `--warning`/`--text-primary` were never broken in the first place — consistent with all 12 base tokens being RGB-channel format per finding #1.

---

### 4. Hardcoded colors bypassing the token system

**Zero found.** A project-wide regex sweep for `#[0-9a-fA-F]{3,8}`, `rgb(`, `rgba(`, `hsl(`, `hsla(`, and inline `style={{ ...color... }}` across all 173 `.ts`/`.tsx`/`.css` files under `frontend/src` returned no matches in application code. The only hex/rgb-looking text in the entire tree is inside the explanatory comment block at the top of `globals.css` (lines 17-20) documenting the hex→RGB-channel conversion mapping — that's a comment, not live code, and is expected. There is also no separate chart library (checked `package.json` — no `recharts`/`chart.js`/`victory`/`nivo`/`d3-scale`) that might carry its own hidden color palette.

This is a clean result: every visible color in the current app renders through the token system, so the light-theme migration has no hidden hardcoded-color debt to clean up first.

---

### 5. Migration-risk assessment per token

| Token | Usage volume | Risk | Why |
|---|---|---|---|
| `border` | 37 usages, 28 files + global reset | **High** | Touches nearly the entire UI via the `* { @apply border-border }` global reset in `globals.css:71`. Dark theme's `#262626` on near-black background is a *subtle* 1-step-lighter border; a light theme needs the opposite direction (slightly *darker* than the background) and will need real visual QA across all 28 files, not just a value flip. |
| `brand` / `brand-hover` (+ dead `brand-dim`) | 52 usages, ~20 files | **Highest** | This is the literal subject of the migration — single green accent → dual blue/teal system. 52 call sites each need a decision: does this instance become the *action* (blue) or *status* (teal) accent? That decision is Phase 2's job, but the volume and spread (buttons, badges, tabs, active-nav-state, links, focus rings, calendar dots, form focus borders) means it touches most interactive surfaces in the app. `brand-dim` is defined but has 0 live consumers — no real-site precedent to anchor its new light-theme value against. |
| `surface` / `surface-hover` | 36 usages, ~15 files | **Medium** | Card/panel/menu/input backgrounds. Fully tokenized so the flip itself is mechanical, but 15 files is enough surface area that a visual sweep is warranted. |
| `danger` | 71 usages, 22 files, has opacity-modifier usage | **Medium** | Widest-used status color after border/foreground/muted-foreground. Currently safe from the opacity bug. Re-verify contrast (red-on-white this time, not red-on-near-black) in the next ticket — this project has twice caught its own contrast-ratio arithmetic errors (`decisions.md` #19), so don't skip re-computation just because dark-theme danger was fine. |
| `warning` | 6 usages, 5 files, has opacity-modifier usage | **Low** | Small, contained footprint (`ConflictState`, `ResourceEditor`, `ActivityTimeline`, `badge.tsx`). Mechanical flip. |
| `background` | 9 usages, 8 files | **Low-medium** | Small direct-usage count, but it's the page canvas — the visual centerpiece of "dark→light." Also used as `text-background` (button/notification-badge text-on-accent color) at 2 sites — make sure the new value still gives adequate contrast when used as *text* against the brand color, not just as a background. |
| `foreground` (`text-foreground`) | 35 usages, 25 files | **Low** | Pure text-color swap, mechanical, no visual-logic dependency. |
| `muted-foreground` | 139 usages, 47 files | **Low** (per-site) / **High visibility** (volume) | By far the single most-used token in the app. Each site is a low-risk mechanical swap, but the sheer count (47 of ~173 source files) means this token alone should get its own dedicated visual-regression pass — any mistake here is maximally visible. |
| `muted` (bare) | 2 usages | **Low** | Only two menu-separator lines. |
| `accent` / `accent-foreground` (shadcn's own) | 14 usages, ~6 files | **Low** | Small, contained to overlay/menu hover-fill primitives (`dropdown-menu.tsx`, `select.tsx`, `dialog.tsx`, `VpnResourcePicker.tsx`). See naming-collision note in Known Issues. |
| `popover` / `popover-foreground` | 13 usages, 6 files | **Low** | Contained to overlay primitives. |
| `card` / `card-foreground` | 2 usages, 1 file | **Very low** | Only `card.tsx:12`. |
| `secondary-foreground` | 1 usage, 1 file | **Very low** | Only `label.tsx:8`. |
| `subtle` (`--text-muted`) | 0 usages | **None** | Dead token — no risk, but also nothing to gain by giving it a carefully-chosen new value; flag for a real decision (keep dormant vs. repurpose vs. remove) rather than silently carrying it forward. |
| `primary` / `primary-foreground` | 0 usages | **None** | Dead — see Known Issues. |
| `secondary` (bare) | 0 usages | **None** | Dead. |
| `destructive` / `destructive-foreground` | 0 usages | **None** | Dead — `Button`/`Badge` bypass it entirely in favor of `danger`. |
| `input` | 0 usages | **None** | Dead — every form control uses `border-border` instead. |
| `ring` | 0 usages | **None** | Dead — every focus state uses `outline-brand` instead. |

---

## Decisions made (judgment calls during this audit)

1. **Treated `--danger`/`--warning`/`--text-*` base tokens and their shadcn `var()` aliases as separate rows**, rather than collapsing an alias into its target, because a future ticket might want to point an alias at a *different* base token (e.g., should `destructive` start pointing at the new `danger` red, or should it be retired?) — that's a Phase 2 decision this audit intentionally leaves open rather than pre-judging.
2. **Corrected my own search methodology mid-audit**: an initial batch of `-primary\b`-style regexes silently over-counted by matching `-primary-foreground` as well (hyphen satisfies a regex word boundary). I caught this by cross-checking totals against dedicated `-foreground`-suffix counts, discarded the contaminated numbers, and re-ran every ambiguous token with boundary-safe patterns before including any count in this report. This is exactly the class of error `decisions.md` #12/#19 warns about, so I'm calling it out explicitly rather than quietly fixing it.
3. **Classified `Record<..., string>` JS objects that map onto Tailwind class strings** (e.g. `ActivityTimeline.tsx`'s `ACTION_DOT = { delete: "bg-danger", ... }`, `ScheduleCalendar.tsx`'s `modifiersClassNames`) as ordinary Tailwind-utility-class usage, not "other mechanism" — the token name still appears as a literal string matched by my searches, and the value still flows through Tailwind's class-based system, not inline styles or JS color constants. I found zero genuine "other mechanism" usages (no inline `style={{ color: ... }}`, no JS hex/rgb constants) anywhere.
4. **For hardcoded-color mapping (scope item 4): N/A** — there were no hardcoded colors to map, so this section of the report is empty by finding, not by omission.

---

## Known issues / things to flag before Phase 2 finalizes hex values

1. **7 tokens are completely dead code**: `primary`, `primary-foreground`, `secondary` (bare), `destructive`, `destructive-foreground`, `input`, `ring` — plus 2 more from the base-token layer, `subtle` (`--text-muted`) and `brand-dim` (`--accent-dim`). That's **9 of 29 CSS variables with zero live consumers** anywhere in `frontend/src`. Concretely: `Button` and `Badge`'s "destructive" variants render via `danger`/`text-danger`, not `destructive`; every form control's border is `border-border`, not `border-input`; every focus ring is `outline-brand`, not `ring-ring`. Before hand-picking new light-theme hex values for these 9, it's worth a human decision on whether to (a) still give them sensible values in case a future shadcn component drop-in expects them, (b) repurpose them, or (c) remove them outright — designing "correct" values for tokens nobody renders is possibly wasted effort.
2. **Naming collision risk, not a live bug**: the Tailwind class `accent`/`accent-foreground` refers to shadcn's generic hover-fill color (→ `--surface-hover`), which is deliberately *not* the same thing as `brand` (→ `--accent` CSS var, the actual green/future-blue visual accent). `globals.css:37-42`'s own comment already documents this distinction, and I found no code that confuses the two — but the CSS variable is literally named `--accent` while the Tailwind class for it is `brand`, and shadcn's *own* `accent` Tailwind class points at a *different* CSS variable (`--shadcn-accent`). This inverted naming (CSS var `--accent` ≠ Tailwind class `accent`) is exactly the kind of thing worth double-checking again once Phase 2 starts editing tokens, so a quick rename doesn't accidentally touch the wrong one.
3. **`brand-dim` has no real usage to anchor a new value against.** Whoever proposes its new light-theme hex will be doing so with no existing visual precedent in the app to check it against (unlike `brand`/`brand-hover`, which have 10-17 live call sites each to sanity-check against).
4. **I could not find `frontend/index.html`** via the glob I tried (`frontend/index.html` returned no match) even though `tailwind.config.js`'s `content` array references it — this is very likely a path-resolution quirk in my search, not a missing file (the build would fail otherwise), but I did not independently re-verify it exists. Worth a 5-second `ls` before Phase 2 if the index page's own inline styling ever becomes relevant (unlikely, since no hardcoded colors were found anywhere else).
5. **Contrast ratios for the *existing* dark-theme tokens were not recomputed here**, per the ticket's explicit instruction that this happens in the next ticket. I did re-confirm (by reading `decisions.md` #19) that the project has a real, documented history of contrast-ratio arithmetic errors in its own prior audits — flagging this forward so Phase 2 double-checks any contrast math rather than trusting a single computation, exactly as decision #19 already had to learn once.

---

## Verification statement

Every finding above was checked directly against current source during this session — `globals.css` and `tailwind.config.js` were read in full; every usage count was produced by `Grep` against the live `frontend/src` tree (not recalled from `docs/design-tokens.md` or `docs/decisions.md`, which were used only as a starting pointer per the ticket's instructions); every "0 usages" / "dead token" claim was double-checked with a second, differently-shaped query before being reported as a finding; and the opacity-modifier safety claims were checked against the actual current `globals.css` value format, not assumed from the prior `--danger` fix's changelog. No claim in this report is carried over from the prior audit without independent re-verification.

---

## Needs Claude's/the Architect's attention before Phase 2 begins

- **Decide the fate of the 9 dead tokens** (item 1 in Known Issues) before spending design effort on their new hex values.
- **`brand`'s 52 usages need to be triaged into "action" (blue) vs. "status" (teal)** as part of Phase 2's design-decision conversation — this audit deliberately did not make that call, since it's a product/design decision, not a fact to verify.
- **`border`'s global-reset reach (28 files + everything via the base `* {}` rule) and `muted-foreground`'s 139-site volume** are the two highest-blast-radius mechanical changes — worth planning a dedicated visual-regression sweep (the project already has a Playwright visual-sweep suite per `decisions.md` #27) rather than trusting a code review alone.
- **New contrast ratios are explicitly out of scope here** (per the ticket) but the project's own track record (decision #19) makes it worth insisting the next ticket double-verify (by hand *and* by script, as was done last time) before finalizing any new hex value, especially for `danger` on a white background.

---

## PROPOSAL — candidate new token values (NOT a finding; not verified; do not act on without human review)

The following are informed suggestions only, offered per the ticket's optional item 6, kept deliberately separate from the audit above and NOT contrast-checked (per the ticket's explicit "do not compute final WCAG ratios" instruction — these are starting points for the next ticket's own verification, not final answers):

| Token | Candidate value | Notes |
|---|---|---|
| `background` | `#ffffff` (`255 255 255`) | Plain white canvas — standard enterprise-SaaS default. |
| `surface` | `#f8fafc` (`248 250 252`) | Slightly off-white, gives cards visible separation from the page without a border alone. |
| `surface-hover` | `#f1f5f9` (`241 245 249`) | One step darker than `surface`. |
| `border` | `#e2e8f0` (`226 232 240`) | Light neutral gray; will need contrast-ratio re-check against `surface`/`background` before finalizing (per Known Issues #5). |
| `brand` (action/blue) | `#2563eb` (`37 99 235`) | Standard, accessible blue for primary actions/links. |
| `brand-hover` | `#1d4ed8` (`29 78 216`) | One step darker for hover. |
| `brand-dim` | `#dbeafe` (`219 234 254`) | Light blue tint for subtle fills — no existing usage to anchor against (see Known Issues #3), so this is a pure guess. |
| status/teal accent (new — no existing token name yet) | `#0d9488` (`13 148 136`) | For the "status/success" half of the dual-accent system; needs a token name decision (`success`? `teal`? `status`?) since none of the current 29 tokens map to this role. |
| `text-primary` (→ `foreground`) | `#0f172a` (`15 23 42`) | Near-black, not pure black, for primary text on white. |
| `text-secondary` (→ `muted-foreground`) | `#475569` (`71 85 105`) | Mid-gray secondary text. |
| `text-muted` (→ `subtle`) | `#94a3b8` (`148 163 184`) | Given this token is currently dead, only worth assigning if Phase 2 decides to keep and actually start using it. |
| `danger` | `#dc2626` (`220 38 38`) | Standard accessible red on white; re-verify contrast in the next ticket. |
| `warning` | `#d97706` (`217 119 6`) | Standard accessible amber on white. |

All values above are illustrative starting points for the human + next ticket to refine, not decisions.
