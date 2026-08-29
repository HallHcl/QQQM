import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Soft Badge: tint background + subtle border + high-contrast text, drawn
 * from each status family's Phase 1 `-tint` / `-border` / `-text` sub-tokens
 * rather than the single flat `DEFAULT` channel used by the previous
 * outline treatment. Sentence case at 12px / font-medium.
 *
 * `default`, `secondary` and `outline` intentionally keep their outline
 * treatment: they are not status families. `default` maps to `brand`
 * (--accent), which has a `-tint` mapping but no `-border` / `-text`
 * mapping in tailwind.config.js, and `secondary` / `outline` have no status
 * token set at all — so converting them would mean inventing values, which
 * this ticket forbids. They still lose the uppercase/tracking treatment via
 * the shared base. See decisions.md #42c.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "bg-transparent border-brand text-brand",
        secondary: "bg-transparent border-border text-muted-foreground",
        destructive: "bg-danger-tint border-danger-border text-danger-text",
        outline: "bg-transparent border-border text-foreground",
        warning: "bg-warning-tint border-warning-border text-warning-text",
        success: "bg-success-tint border-success-border text-success-text",
        info: "bg-info-tint border-info-border text-info-text",
        neutral: "bg-neutral-tint border-neutral-border text-neutral-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
