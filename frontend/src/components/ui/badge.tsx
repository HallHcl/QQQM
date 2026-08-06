import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors duration-150 focus:outline-none focus:outline focus:outline-1 focus:outline-brand bg-transparent",
  {
    variants: {
      variant: {
        default: "border-brand text-brand",
        secondary: "border-border text-muted-foreground",
        destructive: "border-danger text-danger",
        outline: "border-border text-foreground",
        warning: "border-warning text-warning",
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
