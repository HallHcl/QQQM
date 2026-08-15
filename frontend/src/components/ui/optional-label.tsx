import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const OptionalLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, children, ...props }, ref) => (
  <Label ref={ref} className={cn("flex items-baseline gap-1.5", className)} {...props}>
    {children}
    <span className="text-sm font-normal text-muted-foreground">(optional)</span>
  </Label>
))
OptionalLabel.displayName = "OptionalLabel"

export { OptionalLabel }
