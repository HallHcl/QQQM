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
| `label` | `text-label` | 0.875 rem (14 px) | 1.25 rem | 500 (medium) | Form labels |
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
| `input` | `--input` | Input border color |
| `ring` | `--ring` | Focus ring color |
| `destructive` | `--destructive` | Danger / error actions |
| `danger` | `--danger` | Inline danger text |
| `warning` | `--warning` | Warning states |

---

## Border Radius

**Decision (finalized)**: `rounded-sm` / `rounded-md` are the accepted tokens.
No sharp-corner cleanup was done; these are confirmed as the de facto convention.
Do not change without a dedicated decision.

---

## Shadows

**Decision (finalized)**: `shadow-none` is already consistent across the app.
No shadow tokens are needed beyond Tailwind defaults.

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
