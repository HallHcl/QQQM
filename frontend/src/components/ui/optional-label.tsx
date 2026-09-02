import * as React from "react"
import { Label } from "@/components/ui/label"

const OptionalLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, children, ...props }, ref) => (
  <Label ref={ref} className={className} {...props}>
    {children}
    <span className="text-sm font-normal text-muted-foreground">(optional)</span>
  </Label>
))
OptionalLabel.displayName = "OptionalLabel"

export { OptionalLabel }
