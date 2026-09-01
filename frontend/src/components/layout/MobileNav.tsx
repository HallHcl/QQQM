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
import {
  NAV_GROUPS,
  OVERVIEW_ITEM,
  SETTINGS_ITEM,
  type NavItem,
} from "./nav-items";

function MobileNavLink({
  item: { to, label, icon: Icon },
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150",
          isActive
            ? "border-brand bg-[rgb(var(--surface-active))] text-foreground"
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
  );
}

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
          <SheetTitle className="text-base font-bold">QQM</SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation menu
          </SheetDescription>
          <span className="mt-1 h-0.5 w-6 bg-brand" />
        </SheetHeader>
        <nav
          aria-label="Main navigation"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            <MobileNavLink item={OVERVIEW_ITEM} onNavigate={close} />
            {NAV_GROUPS.map((group) => {
              const labelId = `mobile-nav-group-${group.label.toLowerCase()}`;
              return (
                <div
                  key={group.label}
                  role="group"
                  aria-labelledby={labelId}
                  className="space-y-0.5 pt-3"
                >
                  <p
                    id={labelId}
                    className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <MobileNavLink
                      key={item.to}
                      item={item}
                      onNavigate={close}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-2">
            <MobileNavLink item={SETTINGS_ITEM} onNavigate={close} />
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
