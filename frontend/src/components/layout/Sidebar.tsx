import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  NAV_GROUPS,
  OVERVIEW_ITEM,
  SETTINGS_ITEM,
  type NavItem,
} from "./nav-items";

/**
 * Shared by every destination in the sidebar, grouped or standalone, so the
 * reorganisation into sections does not change how an individual item looks or
 * behaves.
 */
function SidebarLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:ring-primary focus-visible:ring-2",
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

export default function Sidebar() {
  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 flex-col justify-center border-b border-border px-4">
        <span className="text-base font-bold tracking-tight text-foreground">
          QQM
        </span>
        <span className="mt-1 h-0.5 w-6 bg-brand" />
      </div>
      <nav
        aria-label="Main navigation"
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Overview, then the labelled groups. Scrolls independently so the
            Settings item below stays pinned at short viewport heights. */}
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          <SidebarLink {...OVERVIEW_ITEM} />
          {NAV_GROUPS.map((group) => {
            const labelId = `sidebar-nav-group-${group.label.toLowerCase()}`;
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
                  <SidebarLink key={item.to} {...item} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <SidebarLink {...SETTINGS_ITEM} />
        </div>
      </nav>
    </aside>
  );
}
