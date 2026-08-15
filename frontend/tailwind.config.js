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
        // Form labels
        "label":           ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500" }],
        // Captions / meta / timestamps
        "caption":         ["0.75rem",  { lineHeight: "1rem" }],
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--shadcn-accent)",
          foreground: "var(--shadcn-accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        // Brand palette (Razer-inspired)
        brand: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          dim: "var(--accent-dim)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          hover: "var(--surface-hover)",
        },
        subtle: "var(--text-muted)",
        danger: "var(--danger)",
        warning: "var(--warning)",
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
