import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0">
        <SheetHeader className="h-14 justify-center border-b border-border px-4">
          <SheetTitle>QQM</SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation menu
          </SheetDescription>
          <span className="mt-1 h-0.5 w-6 bg-brand" />
        </SheetHeader>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "border-brand bg-surface-hover text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn("h-4 w-4", isActive && "text-brand")} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
