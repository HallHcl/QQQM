import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-sm bg-surface px-3 py-2 text-base text-foreground shadow-underline transition duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-underline-focus read-only:focus-visible:shadow-underline disabled:cursor-not-allowed disabled:text-disabled-foreground disabled:shadow-underline-disabled md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
