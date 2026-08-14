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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
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
