import { NavLink } from "react-router-dom";
import {
  Activity,
  BookText,
  Building2,
  CalendarClock,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  Layers,
  Server,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/environments", label: "Environments", icon: Layers },
  { to: "/servers", label: "Servers", icon: HardDrive },
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/infrastructure", label: "Infrastructure", icon: Server },
  { to: "/resources", label: "Resources", icon: BookText },
  { to: "/people", label: "People", icon: Users },
  { to: "/schedule", label: "Schedule", icon: CalendarClock },
  { to: "/activity", label: "Activity", icon: Activity },
];

export default function Sidebar() {
  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 flex-col justify-center border-b border-border px-4">
        <span className="text-base font-bold tracking-tight text-foreground">
          QQM
        </span>
        <span className="mt-1 h-0.5 w-6 bg-brand" />
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
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
    </aside>
  );
}
