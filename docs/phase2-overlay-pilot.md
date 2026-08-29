# Phase 2 Pilot 4 — Dialog / Sheet Overlay + Focus-Ring Migration

Implementation record for the final Component Primitives pilot. Every number
below is a `getComputedStyle` / `getBoundingClientRect` reading taken from
Chromium against the running app (docker `db` + `backend`, Vite dev server) —
not a design intention, and not inferred from the CSS.

Ref: Phase 1.1 locked `--overlay` token (`globals.css:92`), decision #36
(primary/accent role definition), Phase 2 Pilot 4 Task 1 audit.

---

## 0. Framing check — why this pilot is two components, not four

The pilot was ticketed as a four-component group (Dialog, Sheet, Popover,
Dropdown) on the premise that they share the Radix portal pattern. The Task 1
audit found the grouping does not survive contact with the code. The work
splits along two axes, and on **both** axes Popover and Dropdown are empty:

| Axis | Dialog | Sheet | Popover | Dropdown |
|---|---|---|---|---|
| Hardcoded overlay to replace | ✅ `bg-black/80` | ✅ `bg-black/80` | — no overlay exists | — no overlay exists |
| Violet focus ring to migrate | ✅ close button | ✅ close button | — no interactive sub-elements | — uses neutral fill-focus |

`@radix-ui/react-popover` and `@radix-ui/react-dropdown-menu` ship no `Overlay`
sub-component, so there is nothing to point `--overlay` at. `DropdownMenuItem`
(`dropdown-menu.tsx:84`) uses `focus:bg-accent focus:text-accent-foreground`,
which resolves through `--shadcn-accent` → `--surface-hover` `#F9FAFB` — a
neutral fill, not violet drift, and a legitimate menu-focus convention.

**Popover and Dropdown were verified and closed as no-change.** Neither file
was opened for edit. See section 6 for the evidence.

---

## 1. What changed

Two class strings, one close-button class string addition, and two Tailwind
theme edits. No component logic, no markup, no props, no `globals.css` change.

| File | Line | Change |
|---|---|---|
| `frontend/src/components/ui/dialog.tsx` | 22 | overlay class string |
| `frontend/src/components/ui/dialog.tsx` | 45 | close-button focus ring |
| `frontend/src/components/ui/sheet.tsx` | 23 | overlay class string |
| `frontend/src/components/ui/sheet.tsx` | 66 | close-button focus ring + `data-[state=open]:bg-accent` |
| `frontend/tailwind.config.js` | ~110 | stale `brand` comment corrected (comment only) |
| `frontend/tailwind.config.js` | ~174 | new `backgroundColor.overlay` key |

### The overlay diff (identical in both files)

```
- fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in …
+ fixed inset-0 z-50 bg-overlay backdrop-blur-sm duration-200 data-[state=open]:animate-in …
```

`bg-black/80` was the only `bg-black` / `bg-white` / `rgba(` occurrence in all
of `frontend/src`; both instances are now gone. Verified against the built
bundle: `grep -c "bg-black" dist/assets/index-*.css` → `0`.

### The focus-ring diff (identical in both files)

```
- focus:outline-none focus:outline focus:outline-1 focus:outline-brand
+ focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
```

This adopts Button's post-Pilot-3 recipe verbatim (`button.tsx:8`), so the
migration closes all three divergences at once — trigger (`focus:` →
`focus-visible:`), mechanism (1px outline → 2px ring + offset), and colour
(violet `brand` → jade `primary`).

---

## 2. The `--overlay` Tailwind exception

`--overlay` is `rgba(16, 24, 40, 0.48)` — a composite value with its alpha
baked in, not a space-separated channel triplet. `globals.css:90-91` says so
explicitly. Every other colour in the theme is wrapped as
`rgb(var(--x) / <alpha-value>)`; this one cannot be, because Tailwind
substitutes `<alpha-value>` into a slot that only exists in the channel form.

It is therefore declared under `backgroundColor`, not `colors`, so it cannot be
mistaken for a channel-triplet token and cannot be reached by `text-`/`border-`
utilities that would silently produce nothing:

```js
backgroundColor: {
  overlay: "var(--overlay)",
},
```

**Consequence to know:** `bg-overlay` works; an opacity modifier on it
(`bg-overlay/50`) silently no-ops. This is the only entry in the theme with
that shape.

`backdrop-blur-sm` was used rather than the arbitrary `backdrop-blur-[4px]`.
Tailwind's built-in `sm` step is exactly 4px — confirmed in the built bundle:

```css
.backdrop-blur-sm{--tw-backdrop-blur:blur(4px); …}
```

so the Phase 1.1 blur spec is met without reintroducing bracket syntax into
components that the Task 1 audit confirmed were 100% free of it.

---

## 3. Measured result — rendered values

Read from Chromium with the components open.

| Property | Dialog overlay | Sheet overlay | Expected |
|---|---|---|---|
| `background-color` | `rgba(16, 24, 40, 0.48)` | `rgba(16, 24, 40, 0.48)` | `--overlay` exactly ✅ |
| `backdrop-filter` | `blur(4px)` | `blur(4px)` | Phase 1.1 spec ✅ |
| `z-index` | `50` | `50` | unchanged ✅ |

### Focus ring, both close buttons

```
box-shadow: rgb(255,255,255) 0 0 0 2px,   ← ring-offset-2, offset colour #fff
            rgb(14,124,90)   0 0 0 4px    ← ring-2, --primary jade #0E7C5A
```

`rgb(14,124,90)` is `--primary` (`globals.css:43`), confirming the ring reaches
jade and not violet. The offset colour `#fff` matches both surfaces
(`--popover` → `--surface` → `#FFFFFF` for Dialog, `--surface` for Sheet), so
the offset gap reads as a clean break rather than a visible white halo.

### `focus-visible` semantics — verified with a real pointer

| Interaction | `:focus` | `:focus-visible` | `box-shadow` |
|---|---|---|---|
| Real `mouse.down()` on close | `true` | **`false`** | `none` |
| Keyboard `Tab` to close | `true` | **`true`** | jade ring (above) |

The mouse row was measured with a genuine Playwright pointer press held open
(Radix closes on mouseup), not a programmatic `.focus()` — programmatic focus
inherits the prior keyboard modality in Chromium and reports a false positive.
This is the behavioural half of the migration: the old `focus:` prefix painted
a ring on mouse click, the new `focus-visible:` does not.

---

## 4. `ring-offset-2` collision check

The critical check for this ticket: `ring-2` + `ring-offset-2` extends 4px
beyond the element box on every side, and the close button sits `right-4 top-4`
inside the content surface.

| | Dialog close | Sheet close |
|---|---|---|
| Element box | 32 × 32 (has `rounded-sm p-2`) | 16 × 16 (no padding) |
| Gap to content right edge | 17px | 17px |
| Gap to content top edge | 17px | 16px |
| Ring extent beyond box | 4px | 4px |
| **Clearance remaining** | **13px** | **13px right / 12px top** |

**No collision on either component.** The ring lands entirely inside the
content surface with ≥12px to spare in every direction. Confirmed visually at
1280×800 (Dialog) and 375×812 (Sheet); the ring is fully enclosed by the white
surface with clear margin, and does not touch the border, the radius corner, or
`DialogHeader`'s `pr-8` text reserve.

Note the two close buttons are **not** the same size — Sheet's lacks Dialog's
`rounded-sm p-2`, so its ring hugs the 16px icon much more tightly. Both are
legible; the divergence is pre-existing and out of scope here (section 8).

---

## 5. Motion — the blur does not pop

`backdrop-blur-sm` is a static `blur(4px)` from the first frame; it is the
element's `opacity` that animates, which modulates the backdrop effect with it.
Sampled per animation frame on open:

| t (ms) | 110 | 130 | 181 | 226 | 272 | 311+ |
|---|---|---|---|---|---|---|
| `opacity` | 0.000 | 0.113 | 0.741 | 0.925 | 1.000 | 1.000 |
| `backdrop-filter` | `blur(4px)` | `blur(4px)` | `blur(4px)` | `blur(4px)` | `blur(4px)` | `blur(4px)` |

Monotonic ramp over ~160ms across 5 sampled frames. **Reads as an ease-in, not
a pop** — no adjustment made.

### `duration-200` on the overlay is inert — and so is the content's

The ticket asked for `duration-200` on the overlay "to match the content
layer's existing `duration-200`". Measured, both layers report:

```
animation-duration: 0.15s      transition-duration: 0.2s
```

`.duration-200` is emitted twice — `transition-duration:.2s` (core Tailwind)
and `animation-duration:.2s` (the `tailwindcss-animate` plugin). But the fade
is applied through the `data-[state=open]:animate-in` variant, whose selector
`.data-\[state\=open\]\:animate-in[data-state=open]` is class + attribute
(specificity 0,2,0) and hardcodes `animation-duration:.15s`. It outranks the
plain `.duration-200` class (0,1,0), so the animation runs at **150ms** and
`duration-200` only sets `transition-duration`, which neither layer uses.

This was already true of `DialogContent`'s pre-existing `duration-200` — the
content has been animating at 150ms, not 200ms, since before this pilot. The
class was added to the overlay as ticketed, which achieves the actual goal
(overlay and content in sync) at 150ms rather than the assumed 200ms. Both
layers now carry the same inert class and animate identically. Flagged rather
than "fixed" — changing the real duration is a motion decision, not a cleanup.

Sheet's **content** layer keeps its asymmetric `data-[state=closed]:duration-150
data-[state=open]:duration-200` (`sheet.tsx:32`) — untouched, as ticketed.

---

## 6. `asChild` trigger inventory — the gap this doc closes

The Pilot 3 audit found five `asChild`-wrapped `Button` triggers but never
recorded them, so Pilot 4 re-derived the list from source. Recording it here so
it is not derived a third time.

A complete `grep -rn "asChild" frontend/src --include=*.tsx` returns **nine**
hits: five triggers (below) plus four definitional ones — `button.tsx:40,44,45`
(the prop's own declaration and `Slot` swap) and `select.tsx:44` (a Select
icon, not a trigger).

| # | Trigger site | Primitive | Wrapped Button |
|---|---|---|---|
| 1 | `frontend/src/components/RowActions.tsx:39-40` | `DropdownMenuTrigger` | `variant="ghost" size="icon"` |
| 2 | `frontend/src/components/layout/Topbar.tsx:36-37` | `DropdownMenuTrigger` | `variant="ghost"` + `flex items-center gap-2 px-2` |
| 3 | `frontend/src/components/layout/NotificationBell.tsx:41-42` | `DropdownMenuTrigger` | `variant="ghost" size="icon"` + `relative` |
| 4 | `frontend/src/components/layout/MobileNav.tsx:21-22` | `SheetTrigger` | `variant="ghost" size="icon"` + `md:hidden` |
| 5 | `frontend/src/features/environments/components/VpnResourcePicker.tsx:46-47` | `PopoverTrigger` | `variant="ghost"` |

**All five already inherit Pilot 3's jade `focus-visible:ring-2
focus-visible:ring-primary focus-visible:ring-offset-2` through Radix `Slot`,
which merges the trigger props onto the `Button` element rather than rendering
a wrapper.** No trigger-side change was needed in this pilot, and none was
made. The focus-ring gap was entirely on the raw `DialogPrimitive.Close` /
`SheetPrimitive.Close` elements inside the content, which are not `Button`s and
so were missed by Pilot 3's sweep.

This is also the evidence for closing Popover and Dropdown as no-change:
their only interactive trigger surfaces are rows 1–3 and 5 above, already jade.

---

## 7. Layering and regression checks

| Check | Result |
|---|---|
| Overlay z-index | `50`, unchanged on both components |
| `Select` opened inside `ServerFormDialog` | listbox `z-index: 50`, hit-test at the listbox lands **inside the listbox** — renders above dialog content and overlay, no regression |
| Toast (`toast.tsx:19` `z-[100]`) with a Dialog open | toast viewport `z-index: 100` vs overlay `50`; toast renders crisp and unblurred above the dimmed field |
| Nested overlays | none — decision #20's in-place content-swap convention still holds, so no two overlays ever stack and blur never compounds |
| Build | `tsc -b && vite build` ✅ |
| Test suite | 61 files / 593 tests ✅ |

**Toast hit-testing footnote:** `elementFromPoint` at the toast centre returns
the overlay, not the toast, because the toast viewport carries
`pointer-events: none` and Radix sets `pointer-events: none` on `body` while a
modal dialog is open. That is paint-order-correct and interaction-correct
pre-existing Radix modal behaviour (the dialog traps interaction); it is
unaffected by this pilot and is not a stacking regression.

---

## 8. Deliberately not changed

| Item | Why |
|---|---|
| `popover.tsx`, `dropdown-menu.tsx` | Verified no-change — section 0 and 6 |
| `shadow-none` on both surfaces | Consistent with Card/Button precedent; separation observation in section 9 |
| Sheet content `bg-surface` vs Dialog/Popover `bg-popover` | Both resolve to `#FFFFFF` today, would diverge if `--popover` is repointed — flagged, out of scope |
| Sheet close lacks Dialog's `rounded-sm p-2` | Pre-existing size divergence; only `data-[state=open]:bg-accent` was unified this ticket |
| ~~`dropdown-menu.tsx:48,66` bare `border`~~ | ~~Separate minor cleanup, explicitly out of scope~~ — **✅ RESOLVED after this pilot** by the Phase 2 pre-merge token cleanup (`daf5208`, see `phase2-token-cleanup.md`). Both lines now read `border border-border`. Row retained struck-through rather than deleted, since this document is a point-in-time pilot record |
| `borderRadius.modal: '14px'` (`tailwind.config.js:59`) | Defined for Dialog/Sheet/Popover but unused — Dialog renders `sm:rounded-md` = 6px measured. Pre-existing, unrelated to this pilot |
| Remaining `outline-brand` sites | `Sidebar.tsx:21`, `tabs.tsx:32,47`, `toast.tsx:65,80`, `calendar.tsx:202` — this pilot closed 2 of ~8; the rest are their own tickets |
| `prefers-reduced-motion` | No handling exists anywhere in the codebase; pre-existing gap, noted not fixed |

---

## 9. Separation observation (for a future decision, not acted on)

Measured Dialog surface with the new overlay behind it:

```
box-shadow:    rgba(0,0,0,0) 0 0 0 0  (shadow-none — nothing painted)
border:        1px solid rgb(228,231,236)
border-radius: 6px
background:    rgb(255,255,255)
```

Observed: the flat surface reads as **visually complete, not under-separated**.
The 48% navy tint plus 4px blur does the depth work that an elevation shadow
would otherwise do — the white surface separates on tonal contrast against a
dimmed, defocused field, and the effect is arguably cleaner than a shadow would
be against a blurred backdrop. The 1px border becomes nearly invisible against
the dark overlay, but it is not load-bearing for separation in this state.

Recorded as an observation. No elevation change is recommended from this pilot.
