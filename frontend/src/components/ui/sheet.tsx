import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay backdrop-blur-sm duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-0 border-border bg-surface text-foreground shadow-elev-3 transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:duration-200",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-60 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 h-full w-60 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
      // Width override, layered on top of `side`. Declared AFTER `side` so
      // cva emits its classes last and `cn()`'s tailwind-merge resolves the
      // width conflict (`w-60` vs `w-full`) in this variant's favour. The
      // default is deliberately a no-op so every existing call site — i.e.
      // MobileNav — keeps the `side` variant's `w-60` untouched.
      size: {
        nav: "",
        // Complex-form side sheet (Phase 6). `max-w-xl` is 576px: inside the
        // 560-640px band the spec calls for, and an on-scale Tailwind token
        // rather than an arbitrary `max-w-[580px]`.
        form: "w-full sm:max-w-xl",
      },
    },
    defaultVariants: {
      side: "left",
      size: "nav",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "left", size, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    {/*
      Stacking note (verified Phase 6 / Task 0 spike, Chromium desktop):
      a Radix `Select` opened inside a Sheet portals its listbox to
      `document.body` — NOT into this Content — so the Sheet's own
      `overflow-y-auto` body can never clip the dropdown. The listbox and
      this Content both compute to `z-index: 50`, so the dropdown paints on
      top purely because its portal is appended later in `<body>`; the order
      is resolved by DOM append order, not by explicit layering. It works
      today, but anything that introduces a new stacking context around this
      component, or changes either portal's mount target/order, must
      re-verify that Select dropdowns still render above the Sheet.
    */}
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side, size }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-control p-2 opacity-70 hover:bg-surface-hover transition-colors duration-150 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col", className)} {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Layout mirrors DialogFooter (ui/dialog.tsx). The extra chrome —
      // border, surface fill, own padding — is what DialogFooter gets for
      // free from DialogContent's `p-6`; SheetContent has no padding, and a
      // sheet footer is a pinned bar rather than a run of buttons at the end
      // of a scroll. `shrink-0` keeps it pinned when SheetContent's flex
      // column has a `flex-1 overflow-y-auto` body between it and the header.
      "flex shrink-0 flex-col-reverse border-t border-border bg-surface px-6 py-4 sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(
      // Mirrors DialogTitle (ui/dialog.tsx) exactly so a form reads the same
      // whether it renders in a modal or a side sheet.
      "min-w-0 break-words text-lg font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
