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
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  /** Rendered as a small muted uppercase section header above the group. */
  label: string;
  items: NavItem[];
}

/** Standalone, pinned above the grouped sections. Has no group label. */
export const OVERVIEW_ITEM: NavItem = {
  to: "/overview",
  label: "Overview",
  icon: LayoutDashboard,
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Delivery",
    items: [
      { to: "/clients", label: "Clients", icon: Building2 },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/environments", label: "Environments", icon: Layers },
      { to: "/servers", label: "Servers", icon: HardDrive },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/infrastructure", label: "Infrastructure", icon: Server },
      { to: "/schedule", label: "Schedule", icon: CalendarClock },
      { to: "/activity", label: "Activity", icon: Activity },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/resources", label: "Resources", icon: BookText },
      { to: "/people", label: "People", icon: Users },
    ],
  },
];

/**
 * Standalone, pinned to the bottom of the sidebar below the scrollable groups.
 * There is no bare `/settings` route — Manage Users is the only settings page
 * today, and the Topbar account menu points at the same destination.
 */
export const SETTINGS_ITEM: NavItem = {
  to: "/settings/manage-users",
  label: "Settings",
  icon: Settings,
};

/**
 * Every destination the nav renders, flattened in visual order. Derived from
 * the grouped structure above so the two can never drift apart.
 */
export const NAV_ITEMS: NavItem[] = [
  OVERVIEW_ITEM,
  ...NAV_GROUPS.flatMap((group) => group.items),
  SETTINGS_ITEM,
];
