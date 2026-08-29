# QQM Design Tokens

Single canonical reference for the design system tokens that govern QQM's
laptop-first enterprise admin UI (IT Glue / NinjaOne aesthetic).

> **Source of truth**: `tailwind.config.js` → `theme.extend.fontSize` (and the
> existing color / radius / animation sections). This document is the human-readable
> companion; the config file is the machine-authoritative source.

---

## Typography Scale

Defined in `tailwind.config.js` as `theme.extend.fontSize` named tokens.
These generate utility classes like `text-heading-page`, `text-body`, etc.

| Token | Class | Size | Line height | Weight | Usage |
|-------|-------|------|-------------|--------|-------|
| `heading-page` | `text-heading-page` | 1.5 rem (24 px) | 2 rem | 600 (semibold) | Page title — h1 in every module page header via `<PageHeader>` |
| `heading-section` | `text-heading-section` | 1.125 rem (18 px) | 1.75 rem | 600 | Section headings — h2-equivalent inside a page |
| `heading-card` | `text-heading-card` | 1 rem (16 px) | 1.5 rem | 600 | Card / subsection headings — h3-equivalent |
| `body` | `text-body` | 0.875 rem (14 px) | 1.25 rem | 400 | Body copy — matches default Tailwind `text-sm` |
| `body-sm` | `text-body-sm` | 0.8125 rem (13 px) | 1.25 rem | 400 | Secondary table rows |
| `label` | `text-label` | 0.8125 rem (13 px) | 1.125 rem | 500 (medium) | Form labels |
| `caption` | `text-caption` | 0.75 rem (12 px) | 1 rem | 400 | Captions, timestamps, meta text |

### Migration policy

- **`<PageHeader>`** is the first and only component fully migrated to the scale
  tokens in this ticket (`text-heading-page`). All other existing `text-{size}`
  usages are left unchanged — per-module migration happens in later tickets.
- **Do not** do a blanket find-and-replace of the 200+ existing `text-sm` /
  `text-lg` / etc. occurrences without a dedicated module ticket.

---

## Color Tokens

Defined as CSS variables in `src/styles/globals.css` and aliased in
`tailwind.config.js` → `theme.extend.colors`.

| Tailwind alias | CSS variable | Usage |
|----------------|-------------|-------|
| `background` | `--background` | Page/app background |
| `foreground` | `--foreground` | Primary text |
| `surface` | `--surface` | Card / panel backgrounds |
| `surface-hover` | `--surface-hover` | Card hover state |
| `muted` | `--muted` | Muted backgrounds (input, tag) |
| `muted-foreground` | `--muted-foreground` | Secondary / de-emphasised text |
| `primary` | `--primary` | Primary action color |
| `primary-foreground` | `--primary-foreground` | Text on primary |
| `secondary` | `--secondary` | Secondary element backgrounds |
| `secondary-foreground` | `--secondary-foreground` | Text on secondary |
| `accent` / `brand` | `--shadcn-accent` / `--accent` | Brand accent (Razer-inspired green) |
| `border` | `--border` | Border color |
| `destructive` | `--destructive` | Danger / error actions |
| `danger` | `--danger` | Inline danger text |
| `warning` | `--warning` | Warning states |

> **Removed 2026-08-28 (Phase 2 pre-merge cleanup).** The `input` / `--input`
> and `ring` / `--ring` rows were deleted from this table because the tokens
> themselves were deleted — both had zero consumers. The `--status-*` teal
> family went with them. See [`phase2-token-cleanup.md`](phase2-token-cleanup.md),
> which also carries the **shadcn generator caveat**: newly generated
> components will reference `border-input` and `ring-ring`, which no longer
> exist and fail silently.

---

## Border Radius

Defined in `tailwind.config.js` as `theme.extend.borderRadius`. Staged Foundation
tokens — defined but **not yet applied to any component**. Named by component role
(not size) to avoid colliding with Tailwind's built-in `sm` / `md` / `lg` keys,
which differ in value and already have 53 live usages. See `decisions.md` #35.

| Token | Class | Value | Intended for |
|-------|-------|-------|--------------|
| `control` | `rounded-control` | `6px` | Button, Input, Select, Badge, Checkbox |
| `panel` | `rounded-panel` | `10px` | Card, Table container, Toolbar |
| `modal` | `rounded-modal` | `14px` | Dialog, Sheet, Popover |
| `pill` | `rounded-pill` | `9999px` | Avatar, Pill Chip, Status Dot |

**Live usage today**: `rounded-md` (×31), `rounded-sm` (×22), `rounded-full` (×4)
and `rounded-none` (×3) remain in place, untouched. Migration to the semantic
scale happens per-component in a later phase.

**Known overlap**: `pill` (`9999px`) is identical in value to the pre-existing
`rounded-full` utility (4 live usages) — resolve at migration time.

---

## Shadows

Defined in `tailwind.config.js` as `theme.extend.boxShadow`. Staged Foundation
tokens — defined but **not yet applied to any component**. The live baseline is
still flat: `shadow-none` is applied at all 11 sites that would normally carry a
shadow, a deliberate override of shadcn/ui's defaults. Per-component adoption
happens in a later phase, pilot-first. See `decisions.md` #34.

| Token | Class | Value | Intended for |
|-------|-------|-------|--------------|
| `elev-0` | `shadow-elev-0` | `none` | Current baseline (unchanged) |
| `elev-1` | `shadow-elev-1` | `0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)` | Card, Table |
| `elev-2` | `shadow-elev-2` | `0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.06)` | Dropdown, Popover, Select |
| `elev-3` | `shadow-elev-3` | `0 20px 24px -4px rgba(16,24,40,.10), 0 8px 8px -4px rgba(16,24,40,.04)` | Dialog, Sheet |

**Known overlap**: `elev-0` (`none`) is identical in value to the pre-existing
`shadow-none` utility (11 live usages). Whether migration retires `shadow-none`
in favor of `elev-0`, or keeps both, is not yet decided — revisit at migration time.

---

## Spacing

Tailwind's default spacing scale (4 px base unit). No custom additions.
The layout uses `p-4 sm:p-6` for page-level padding (applied in `AppLayout.tsx`).
Content is constrained to `max-w-7xl` via an inner wrapper inside `<main>`.

---

## Optional-Field Indicator Pattern

Required fields: **no visual marker** (majority case — clean and uncluttered).

Optional fields: `<OptionalLabel>` component (`src/components/ui/optional-label.tsx`)
appends ` (optional)` in `text-muted-foreground` at `text-sm` after the label text.

Accessibility: required form controls carry `aria-required="true"` on the control
element (Input, Textarea, SelectTrigger). Not on the Label.

Conditionally-required fields (Resources Content/ExternalURL, Schedule
Project/Server) do not use `<OptionalLabel>` — their requiredness is
dynamic/composite and is communicated via existing error/hint text.
