# Phase 2 Pilot 1 — Input / Textarea / SelectTrigger Underline Treatment

Implementation record for the first Component Primitives pilot. Every number
below is a `getComputedStyle` / `getBoundingClientRect` reading taken from
Chromium against the running app (docker `db` + `backend`, Vite dev server) —
not a design intention, and not inferred from the CSS. Contrast ratios are
computed per WCAG 2.x relative-luminance, from the exact rendered values.

Scope was three files. `label.tsx` and `optional-label.tsx` were deliberately
**not** touched; section 6 is the evidence that they did not need to be.

Ref: Phase 1.1 locked decision (`--input-underline` token), Phase 2 audit.

---

## 0. Framing check — why these three components migrated together

Not a bundling convenience. Before this pilot, `input.tsx:11`, `textarea.tsx:12`
and `select.tsx:38` carried a **byte-identical** border/focus recipe:

```
border border-border … focus-visible:border-brand
focus-visible:outline focus-visible:outline-1 focus-visible:outline-brand
```

(`select.tsx` used the `focus:` prefix rather than `focus-visible:` — the only
divergence, addressed in section 5.)

The Phase 2 audit found these three interleaved in the same form rows across the
app — e.g. `ServerEditCard.tsx:336-344` puts a `Label`+`Input` pair beside an
`OptionalLabel`+`Input` pair, and `:369` / `:388` add `SelectTrigger`s at the
same `h-10 rounded-sm px-3 py-2` metrics. Migrating any one of them alone would
have rendered two competing visual languages for form controls inside a single
dialog. The trio is coupled by adjacency, so it migrates atomically.

**Remaining Phase 2 primitives (Card, Badge, Button, Dialog, Sheet, Popover,
Dropdown) are explicitly out of scope** and sequenced as separate pilots.

---

## 1. What changed

Three class strings and four Tailwind theme keys. No component logic, no
markup, no props, no `globals.css` change.

| File | Line | Change |
|---|---|---|
| `frontend/src/components/ui/input.tsx` | 11 | class string only |
| `frontend/src/components/ui/textarea.tsx` | 12 | class string only |
| `frontend/src/components/ui/select.tsx` | 38 | `SelectTrigger` class string only |
| `frontend/tailwind.config.js` | 42-50, 92-95 | 3 `boxShadow` keys, 1 color key |

### Tailwind additions — the complete set

```js
// tailwind.config.js:48-50
'underline':          'inset 0 -1px 0 0 rgb(var(--input-underline))',
'underline-focus':    'inset 0 -2px 0 0 rgb(var(--focus-ring))',
'underline-disabled': 'inset 0 -1px 0 0 rgb(var(--input-underline) / 0.4)',

// tailwind.config.js:93-95
disabled: {
  foreground: "rgb(var(--text-disabled) / <alpha-value>)",
},
```

`--input-underline` (`globals.css:33`) and `--text-disabled` both already
existed; neither had a Tailwind mapping. `--focus-ring` (`globals.css:88`)
existed with **zero consumers** — this pilot is its first.

### Note on `colors.disabled.foreground` — a deliberate scope overrun

The ticket's out-of-scope clause pre-authorised Tailwind mappings for
`--input-underline` and `--focus-ring` only. Spec item 5 separately required
disabled text to use `--text-disabled`, which had no mapping. Satisfying item 5
required this fourth key. Flagged rather than silently taken; reverting to the
previous `disabled:opacity-50` is a one-line change if the tighter scope is
preferred.

---

## 2. Geometry proof — zero layout shift

**This was the pilot's hard constraint** and the reason the treatment is *not*
implemented as a `border-bottom`.

### Why box-shadow, not border-bottom

A `border-bottom-width` swap from 1px to 2px moves the content box by 1px on
every focus, in every control, on every keystroke-driven focus change. The two
candidate mitigations both *compensate* for the shift rather than remove it:

- **transparent 2px border + `background-clip`** — reserves the space, but the
  reserve has to be exactly right, and any future padding change silently
  reintroduces the shift.
- **inset `box-shadow`** — `box-shadow` is not a layout property at all. The
  border box cannot move, because nothing about the shadow participates in
  layout. The failure mode is removed rather than balanced.

The second was chosen. The rationale is duplicated as a comment at
`tailwind.config.js:43-47` so it survives without this document.

### Measured rects — idle vs focused

`getBoundingClientRect()`, rounded to 3dp. Any real shift would appear orders
of magnitude above this precision.

| Control | Context | Idle | Focused |
|---|---|---|---|
| `Input` (ServersPage search) | canvas `#F7F8FA` | `x277 y149 w256 h40` | `x277 y149 w256 h40` |
| `Input#hostname` (ServerFormDialog) | dialog `#FFFFFF` | `y323 h40` | `y323 h40` |
| `Textarea#notes` (ServerFormDialog) | dialog `#FFFFFF` | `x409 y505 w462 h80` | `x409 y505 w462 h80` |
| `SelectTrigger#environment` | dialog `#FFFFFF` | `x409 y243 w462 h40` | `x409 y243 w462 h40` |
| `Input` (VpnResourcePicker popover) | popover `#FFFFFF` | — (focused at mount) | `x298 y385 w302 h40` |

Identical in every pair. `h-10` (40px) and `min-h-[80px]` hold across the state
change because Tailwind preflight sets `box-sizing: border-box`.

### Computed box-shadow, verbatim

```
idle      rgb(102, 112, 133) 0px -1px 0px 0px inset
focus     rgb(14, 124, 90)   0px -2px 0px 0px inset
disabled  rgba(102, 112, 133, 0.4) 0px -1px 0px 0px inset
```

`borderWidths` reads `0px|0px|0px|0px` on all three components in all states —
confirming no residual box border survives anywhere.

---

## 3. Borderless on three sides — rationale

The spec left this as an implementation call: keep a subtle idle border on
top/left/right, or go fully borderless. **Fully borderless was chosen.**

**The deciding measurement:** the old box border was `--border` `#E4E7EC`, which
is **1.24:1 against `--surface` `#FFFFFF`**. `globals.css:31` already annotates
this token as *"hairline, decorative only"*.

Per the Phase 2 audit, **35 of 60 `<Input>` usages and 8 of 10 `<Textarea>`
usages render on a white dialog surface.** On that surface the side borders were
already carrying essentially no signal at 1.24:1. Retaining them would have:

1. added markup and a token dependency for a boundary the eye cannot resolve;
2. produced a broken-rectangle silhouette — three near-invisible sides plus one
   deliberately prominent bottom edge — which reads as a rendering defect rather
   than a design;
3. left an inconsistency between the dialog case (invisible sides) and the
   canvas case (faintly visible sides) for the same component.

The field still reads as a field in both contexts: on list pages via
`bg-surface` `#FFFFFF` against `--canvas` `#F7F8FA`, and in dialogs via the
underline alone. `rounded-sm` was left in place — at a 2px radius it is
imperceptible either way, and removing it would have been an unrequested change.

**Known consequence, accepted:** in a dialog, an idle field is white-on-white
with a single 1px bottom rule. This is the intended Direction C reading, but it
is the most exposed case and is the one to re-examine first if the treatment is
ever reported as too subtle.

---

## 4. Disabled state — the 40% calculation

Spec required disabled text on `--text-disabled` and a *"visibly subdued"*
underline, with the exact opacity left as an implementation choice to be
justified by computed result.

**Chosen: `--input-underline` at 40% opacity** (`tailwind.config.js:50`).

### Contrast, computed from rendered values

| Element | Colour | vs `--surface` `#FFFFFF` | vs `--canvas` `#F7F8FA` |
|---|---|---|---|
| Idle underline | `#667085` | **4.97:1** | 4.68:1 |
| Focus underline | `#0E7C5A` | **5.19:1** | 4.88:1 |
| Disabled underline @40% | `#C2C6CE` / `#BDC2CB` | **1.71:1** | 1.68:1 |
| Disabled text | `#98A2B3` | 2.58:1 | — |
| *(old box border, for reference)* | `#E4E7EC` | *1.24:1* | — |

### Why 40% and not 50%

50% computes to `#B3B8C2` / **2.00:1** — a smaller step down from the 4.97:1
idle underline. 40% gives a **~2.9× drop in contrast ratio**, an unambiguous
"this field is inert" signal, while still landing **above the 1.24:1 hairline it
replaces** — so disabled fields gained boundary visibility rather than losing it.

This matters because 8 of the 11 `disabled readOnly` usages sit in one dialog
(`ScheduleFormDialog`), directly adjacent to editable fields, displaying real
data the user needs to read. The distinction has to survive a glance.

**WCAG position:** 1.4.11 (Non-text Contrast, 3:1) explicitly exempts inactive
components — *"…components that are not available for user interaction have no
contrast requirement."* The 1.71:1 underline and 2.58:1 text are compliant by
exemption, not by oversight.

### Removed: `disabled:opacity-50`

Left in place it would have multiplied both deliberately-chosen values a second
time (the underline landing near the old invisible hairline). Replaced with
explicit `disabled:text-disabled-foreground` +
`disabled:shadow-underline-disabled`. `disabled:cursor-not-allowed` retained.

**Semantics unchanged.** All 11 `disabled readOnly` usages remain native
`<input>` elements — none were converted to plain text.

---

## 5. `focus-visible` mouse-click asymmetry — a CSS-spec limitation, not a bug

**This is the one place where the locked spec's stated goal is unreachable, and
the behaviour should be understood before the next pilot inherits the pattern.**

The spec directed `SelectTrigger` to move from `focus:` to `focus-visible:` so
that all three controls *"behave identically (keyboard/a11y-triggered focus ring
only, not on every mouse click)."* The change was made. The stated outcome does
not follow, and cannot.

### Measured behaviour

| Control | Element | Keyboard focus | Mouse click |
|---|---|---|---|
| `Input` | `<input>` | `:focus-visible` ✅ → jade 2px | `:focus-visible` ✅ → **jade 2px** |
| `Textarea` | `<textarea>` | `:focus-visible` ✅ → jade 2px | `:focus-visible` ✅ → **jade 2px** |
| `SelectTrigger` | `<button>` (Radix) | `:focus-visible` ✅ → jade 2px | **not** matched → stays grey 1px |

### Why

Per CSS Selectors Level 4 and the UA heuristics all major engines implement,
`:focus-visible` **always** matches a focused text-entry field regardless of
input modality — because the field accepts keyboard input the moment it is
focused, so a visible focus indicator is correct there. A `<button>` only
matches on keyboard-initiated focus.

This is not introduced by the pilot: `Input`/`Textarea` already used
`focus-visible:` beforehand and already behaved this way. The pilot changed only
`SelectTrigger`, and that change **is** a net improvement — the trigger no longer
raises an indicator on every mouse click, which is what the spec wanted.

### Status

**Documented limitation, no action.** The three controls are uniform under
keyboard navigation — the case the focus indicator exists to serve. They diverge
on mouse click, and closing that gap would require either regressing text fields
to a worse accessibility behaviour or reverting the trigger to `focus:`. Neither
is worth it. Future pilots touching focus treatment should expect the same
split between text-entry elements and button-like elements.

### Read-only suppression

Spec item 6 required read-only (not disabled) fields to keep the idle underline
and suppress the focus treatment. Implemented as the stacked variant
`read-only:focus-visible:shadow-underline`, which compiles to:

```css
.read-only\:focus-visible\:shadow-underline:focus-visible:read-only { … }
```

Specificity `(0,3,0)` beats `focus-visible:` at `(0,2,0)`, so it wins regardless
of source order — necessary, because Tailwind emits `read-only` *before*
`focus-visible` in its default variant order.

**Deliberately not applied to `SelectTrigger`:** a `<button>` always matches
`:read-only`, so the variant would have suppressed the trigger's focus state
entirely. Verified: a readOnly-but-not-disabled input keeps
`rgb(102, 112, 133)` 1px while focused.

---

## 6. Jade-vs-grey low luminance difference

`--focus-ring` `#0E7C5A` and `--input-underline` `#667085` differ by **1.04:1**
— they are very nearly the same perceived lightness.

**Consequence:** on a greyscale display, or for a user with a colour vision
deficiency, the idle→focus transition reads almost purely as a **thickness**
change, 1px → 2px. The colour swap contributes far less signal than the
green-vs-grey pairing suggests.

**Compliance is nonetheless met**, via the newly-painted second pixel row rather
than the colour change:

| Comparison | Ratio | Meets 3:1? |
|---|---|---|
| Focus vs idle underline colour | 1.04:1 | ✗ |
| Newly-painted 2nd pixel row (white → jade) | **5.19:1** | ✓ |
| Focus underline vs adjacent surface | **5.19:1** | ✓ |

WCAG 2.4.11/2.4.13 are satisfied by the second and third rows.

**Recorded as a known characteristic, not a defect.** The colour choice is a
locked Direction C decision — violet `--accent` is reserved for
selection/navigation, jade `--focus-ring` for form-field focus — and this pilot
does not relitigate it. But anyone widening the underline treatment to further
primitives should know that **thickness, not hue, is carrying the focus signal**,
and should not reduce the 2px focus weight on the assumption that the colour
change compensates.

---

## 7. Label / OptionalLabel regression check

Task 5 required confirming `label.tsx` and `optional-label.tsx` need **zero**
changes, and that a `Label` + `OptionalLabel` pair still aligns after the input
beneath it changes shape.

Verified empirically rather than by inspection: the geometry of all 8 label
boxes, 8 field boxes and the form container in `ServerEditCard` was captured on
the pilot, then the pilot was stashed, the same capture re-run against the
untouched baseline, and the two diffed.

> **Result: no geometry differences across 17 measured boxes.**
> Form height `953px` before and after.

| Measurement | Before | After |
|---|---|---|
| `label[for=hostname]` bottom | 326.00 | 326.00 |
| `#hostname` top | 332.00 | 332.00 |
| `label[for=ip_address]` bottom (OptionalLabel) | 328.00 | 328.00 |
| `#ip_address` top | 332.00 | 332.00 |
| Both field heights | 40 / 40 | 40 / 40 |

Both fields in the pair share top `332.00` and identical heights — the pair is
aligned.

### Pre-existing asymmetry, explicitly not this pilot's to fix

The label→field gap differs between the two components: **6px** under `Label`,
**4px** under `OptionalLabel`. Cause: `Label` renders as `display: inline` (its
`cva` at `label.tsx:7` sets no display), whereas `OptionalLabel` adds `flex`
(`optional-label.tsx:9`), making it block-level with a different box height.

**Present identically in the baseline capture**, so it predates this work and is
unrelated to the underline treatment. Recorded here so the next reader does not
misattribute it. It belongs to the deferred Label pilot.

---

## 8. Standard sections

### Verification performed

| Check | Result |
|---|---|
| `npm run build` | pass |
| `npm test` (vitest) | **61 files, 593 tests, all pass** |
| `npm run lint` (oxlint) | 2 pre-existing warnings (`button.tsx:57`, `badge.tsx:34`), unchanged |
| Browser verification (Chromium, live stack) | 5/5 targeted specs pass |
| Surfaces covered | canvas `--canvas`, dialog `--surface`, popover `--surface` |
| `VpnResourcePicker.tsx:61-65` autoFocus-on-mount | jade 2px at mount, before any interaction |

### Tests asserting removed classes

**None exist.** No test in the repo asserted `outline-brand` or `border-brand`
on these components, so nothing failed as a consequence of removing them. The
three Playwright sweeps that reference `border-border` target the **toolbar
wrapper div** and **row-action buttons**, neither of which this pilot touched.

### Pre-existing failures in `npm run test:visual-sweep` — not caused by this pilot

Confirmed by re-running the same specs with the pilot stashed:

- `inline-edit-sweep.spec.ts` ×2 (375px, 1280px) — **Playwright strict-mode
  violation**: `getByRole('button', { name: /^edit$/i })` matches two elements,
  the page's Edit button *and* the Edit button inside a credential-reference
  list item. Fails whenever the first server has ≥1 credential reference (the
  seeded *"Legacy Monitoring (Prod)"* does). Spec defect, unrelated to styling.
- `overview-metrics.spec.ts` — was failing on a stale server count created by
  `create-flow-smoke.spec.ts` earlier in the same run. That record was
  subsequently cleaned up and this spec now passes. Note the suite remains
  **order-dependent**: `create-flow-smoke` mutates data that later specs assert
  against, so it is not currently a reliable regression gate.

### Reproducing the browser verification

The harness is intentionally **not** committed — vitest globs `*.spec.ts` and
reports failed suites if Playwright specs live anywhere under `frontend/`.

```bash
docker compose up -d db backend      # frontend container stays down; 5173 is Vite's
cd frontend && npm run dev
npx playwright test --config=<harness>/pw.config.ts
docker compose down
```

---

## 9. Open items carried forward

1. **`colors.disabled.foreground`** exceeds the ticket's stated Tailwind scope
   (section 1). Retain or revert to `disabled:opacity-50` — decision pending.
2. **`--input-underline` has no colour-key mapping**, only the three `boxShadow`
   keys. `border-input-underline` / `text-input-underline` do not exist. Add
   only if a later phase needs them.
3. **Dead shadcn aliases remain.** `--input` (`globals.css:152`) and `--ring`
   (`:153`) are Tailwind-mapped but have **zero** usages — `border-input` and
   `ring-*` appear nowhere in `frontend/src`. Inert surface area that could
   mislead a future migration into assuming a ring system exists.
4. **`* { @apply border-border }`** (`globals.css:157`) still sets a default
   border colour globally. Harmless here (width is 0), but it interacts with any
   future per-component border change.
5. **Label / OptionalLabel pilot** still deferred, and now carries the known
   6px-vs-4px gap asymmetry documented in section 7.
