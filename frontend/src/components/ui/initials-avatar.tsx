import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";

export interface InitialsAvatarProps {
  /** Full display name; initials are derived from it. */
  name: string;
  className?: string;
}

/**
 * The square initials tile that fronts a named entity in a table row.
 *
 * Decorative only — it is always `aria-hidden`, because the name it
 * abbreviates is rendered as real text immediately beside it.
 *
 * Distinct from `ui/avatar.tsx`, which is the Radix avatar primitive used by
 * the Topbar for the signed-in user and carries image-with-fallback
 * behaviour this tile does not need.
 */
export function InitialsAvatar({ name, className }: InitialsAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground",
        className
      )}
    >
      {getInitials(name)}
    </span>
  );
}
