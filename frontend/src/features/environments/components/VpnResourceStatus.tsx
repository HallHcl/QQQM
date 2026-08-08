import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useResource } from "@/hooks/useResources";

interface Props {
  resourceId: string | null | undefined;
  className?: string;
}

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/**
 * Resolves and displays an Environment's `vpn_resource_id`.
 *
 * GET /resources/{id} on the backend excludes soft-deleted rows entirely
 * (no `includeDeleted` option is exposed on this endpoint), so there is no
 * way to fetch a soft-deleted resource by id and inspect its `deleted_at` —
 * a 404 here is the only signal available, and it's treated as "the linked
 * resource was deleted" (soft-delete never checks/blocks on this reference,
 * per the audit, so this is a real and otherwise-silent state). Any other
 * fetch failure is surfaced too, since either way the reference can't be
 * confirmed valid — never silently shown as if it still resolved.
 */
export function VpnResourceStatus({ resourceId, className }: Props) {
  const { data: resource, isLoading, isError, error } = useResource(resourceId ?? undefined);

  if (!resourceId) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>No VPN resource linked</span>
    );
  }

  if (isLoading) {
    return <span className={cn("text-sm text-muted-foreground", className)}>Loading…</span>;
  }

  if (isError) {
    return (
      <Badge variant="warning" className={className}>
        {isNotFoundError(error)
          ? "Linked VPN resource has been deleted"
          : "Couldn't verify linked VPN resource"}
      </Badge>
    );
  }

  return <span className={cn("text-sm text-foreground", className)}>{resource?.title}</span>;
}
