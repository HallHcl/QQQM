import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const labelVariants = cva(
  // Box model: inline-flex items-baseline gap-1.5 — shared with OptionalLabel
  // so both components lay out identically when children are added.
  //
  // TODO(typography): migrate text-xs font-medium uppercase tracking-wide to
  // the governed text-label token. Deferred to a separate ticket — do not
  // change the typography here.
  "inline-flex items-baseline gap-1.5 text-xs font-medium uppercase tracking-wide text-secondary-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
