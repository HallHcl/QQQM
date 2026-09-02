import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` only knows Tailwind's *built-in* scales. Our governed type
 * scale (tailwind.config.js `theme.extend.fontSize`) uses non-t-shirt keys —
 * `heading-card`, `body`, `label`, … — which tailwind-merge cannot infer, so
 * without this registration it falls back to classifying them as **text
 * colors**. That produced two distinct silent failures:
 *
 *   cn("text-heading-card", "text-base")            // -> BOTH emitted; the
 *                                                   //    cascade decides, so
 *                                                   //    the override does not
 *                                                   //    reliably win and the
 *                                                   //    token's bundled
 *                                                   //    font-weight leaks
 *   cn("text-heading-card", "text-muted-foreground") // -> "text-muted-foreground"
 *                                                   //    ALONE; the size token
 *                                                   //    is deduped away by an
 *                                                   //    unrelated color class
 *
 * Registering the keys in the `font-size` group fixes both directions: a
 * font-size override now replaces the token, and a text color no longer
 * collides with it. Keep this list in sync with `theme.extend.fontSize` —
 * these seven keys are the complete set as of decision #43.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "heading-page",
            "heading-section",
            "heading-card",
            "body",
            "body-sm",
            "label",
            "caption",
          ],
        },
      ],
      /**
       * Custom `boxShadow` tokens (tailwind.config.js `theme.extend.boxShadow`).
       * Without this registration `cn("shadow-elev-1", "shadow-elev-2")` emits
       * both classes — the merge can't tell they belong to the same group.
       * Keep in sync with `theme.extend.boxShadow`.
       */
      shadow: [
        {
          shadow: [
            "underline",
            "underline-focus",
            "underline-disabled",
            "underline-danger",
            "elev-0",
            "elev-1",
            "elev-2",
            "elev-3",
          ],
        },
      ],
      /**
       * Custom `borderRadius` tokens (tailwind.config.js `theme.extend.borderRadius`).
       * Without this registration `cn("rounded-control", "rounded-panel")` emits
       * both classes. Keep in sync with `theme.extend.borderRadius`.
       */
      rounded: [
        {
          rounded: [
            "control",
            "panel",
            "modal",
            "pill",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
