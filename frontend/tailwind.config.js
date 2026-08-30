import tailwindcssAnimate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ---------------------------------------------------------------------------
      // Type scale — governed tokens for data-dense laptop-first admin UI.
      // See docs/design-tokens.md for the full reference.
      // DO NOT do a blanket replace of existing text-{size} usage outside of
      // PageHeader; per-module migration happens in later tickets.
      // ---------------------------------------------------------------------------
      fontSize: {
        // Page title (h1-equivalent): all module page headers
        "heading-page":    ["1.5rem",   { lineHeight: "2rem",    fontWeight: "600" }],
        // Section heading (h2-equivalent)
        "heading-section": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        // Card / subsection heading (h3-equivalent)
        "heading-card":    ["1rem",     { lineHeight: "1.5rem",  fontWeight: "600" }],
        // Body copy — existing Tailwind text-sm default, kept as-is
        "body":            ["0.875rem", { lineHeight: "1.25rem" }],
        // 13px/20px, 400 — secondary table rows
        "body-sm":         ["0.8125rem", { lineHeight: "1.25rem" }],
        // Form labels — 13px/18px/500
        "label":           ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "500" }],
        // Captions / meta / timestamps
        "caption":         ["0.75rem",  { lineHeight: "1rem" }],
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        // Input/Textarea/SelectTrigger underline treatment (Phase 2 pilot).
        // Implemented as an inset box-shadow rather than a border-bottom so
        // the 1px -> 2px focus change costs zero layout: box-shadow is not a
        // layout property, so the control's border box is byte-identical idle
        // vs focused. A border-bottom-width swap would reflow the content box.
        'underline': 'inset 0 -1px 0 0 rgb(var(--input-underline))',
        'underline-focus': 'inset 0 -2px 0 0 rgb(var(--focus-ring))',
        'underline-disabled': 'inset 0 -1px 0 0 rgb(var(--input-underline) / 0.4)',
        'elev-0': 'none',
        'elev-1': '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)',
        'elev-2': '0 4px 8px -2px rgba(16,24,40,.08), 0 2px 4px -2px rgba(16,24,40,.06)',
        'elev-3': '0 20px 24px -4px rgba(16,24,40,.10), 0 8px 8px -4px rgba(16,24,40,.04)',
      },
      borderRadius: {
        control: '6px',   // Button, Input, Select, Badge, Checkbox
        panel: '10px',    // Card, Table container, Toolbar
        modal: '14px',    // Dialog, Sheet, Popover
        pill: '9999px',   // Avatar, Pill Chip, Status Dot
      },
      // Every entry below wraps its CSS variable as
      // `rgb(var(--x) / <alpha-value>)` rather than a bare `var(--x)` —
      // Tailwind substitutes `<alpha-value>` with the opacity-modifier
      // value (e.g. the `10` in `bg-danger/10`), which only works when the
      // variable itself holds space-separated RGB channels (see
      // globals.css). A bare `var(--x)` reference silently no-ops every
      // opacity-modified class using that color instead of erroring.
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        canvas: "rgb(247 248 250 / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          hover: "rgb(var(--primary-hover) / <alpha-value>)",
          active: "rgb(var(--primary-active) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        // Disabled form-control text (Phase 2 pilot). --text-disabled already
        // existed in globals.css but had no Tailwind mapping.
        disabled: {
          foreground: "rgb(var(--text-disabled) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--shadcn-accent) / <alpha-value>)",
          foreground: "rgb(var(--shadcn-accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        // `brand` resolves to --accent violet (#6C4BF4). Per decision #36 this
        // role is reserved for selection and navigation state only (e.g. the
        // Sidebar active item) — it is NOT a general-purpose action color.
        // Jade --primary is the system's primary action color, including focus
        // rings. The alias name predates that split and is kept only because
        // call sites still reference it; do not reach for it for new actions.
        brand: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          active: "rgb(var(--accent-active) / <alpha-value>)",
          tint: "rgb(var(--accent-tint) / <alpha-value>)",
          // Mapping only, added by decision #43. `--accent-border` and
          // `--accent-text` already existed in globals.css (lines 57-58) but
          // had no Tailwind mapping, which is why badge.tsx's `default`
          // variant could not be converted to Soft Badge at #42c. NOT applied
          // to any component here — the status remap is Phase 4 work.
          border: "rgb(var(--accent-border) / <alpha-value>)",
          text: "rgb(var(--accent-text) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          hover: "rgb(var(--surface-hover) / <alpha-value>)",
          sunken: "rgb(var(--surface-sunken) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--danger) / <alpha-value>)",
          hover: "rgb(var(--danger-hover) / <alpha-value>)",
          active: "rgb(var(--danger-active) / <alpha-value>)",
          tint: "rgb(var(--danger-tint) / <alpha-value>)",
          border: "rgb(var(--danger-border) / <alpha-value>)",
          text: "rgb(var(--danger-text) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          hover: "rgb(var(--warning-hover) / <alpha-value>)",
          active: "rgb(var(--warning-active) / <alpha-value>)",
          tint: "rgb(var(--warning-tint) / <alpha-value>)",
          border: "rgb(var(--warning-border) / <alpha-value>)",
          text: "rgb(var(--warning-text) / <alpha-value>)",
        },
        // Remaining Phase 1.1 semantic status families. These tokens were
        // locked in globals.css but had no Tailwind mapping, so nothing could
        // reach them - which is why "success" states currently render as
        // --accent violet. Mapping only; no component is wired to them here.
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          tint: "rgb(var(--success-tint) / <alpha-value>)",
          border: "rgb(var(--success-border) / <alpha-value>)",
          text: "rgb(var(--success-text) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--info) / <alpha-value>)",
          tint: "rgb(var(--info-tint) / <alpha-value>)",
          border: "rgb(var(--info-border) / <alpha-value>)",
          text: "rgb(var(--info-text) / <alpha-value>)",
        },
        neutral: {
          DEFAULT: "rgb(var(--neutral) / <alpha-value>)",
          tint: "rgb(var(--neutral-tint) / <alpha-value>)",
          border: "rgb(var(--neutral-border) / <alpha-value>)",
          text: "rgb(var(--neutral-text) / <alpha-value>)",
        },
      },
      // Documented exception to the `rgb(var(--x) / <alpha-value>)` rule
      // above. --overlay (globals.css:90-92) is a composite rgba() value with
      // its alpha baked in, not a space-separated channel triplet, so it
      // cannot go through that wrapper — it is referenced as a bare var().
      // Consequence: `bg-overlay` works, but an opacity modifier on it
      // (`bg-overlay/50`) silently no-ops. This is the only color-shaped entry
      // in the theme with that shape; it lives here rather than in `colors` so
      // it cannot be mistaken for a channel-triplet token.
      backgroundColor: {
        overlay: "var(--overlay)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-slow": "pulse-slow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
