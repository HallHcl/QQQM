import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { usePagination, type SortOrder } from "@/hooks/usePagination";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import type { ActivityAction, EntityType } from "@/types";
import ActivityFilterBar from "./components/ActivityFilterBar";
import ActivityTimeline from "./components/ActivityTimeline";

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function ActivityPage() {
  // Activity has no `deleted`/`search`/`sort` concept of its own (append-only
  // table, no soft delete, and `sort` is confirmed dead server-side — see
  // useActivityLogs.ts) — only the page/perPage/order pieces of
  // usePagination are used here.
  const pagination = usePagination({ initialOrder: "desc" });
  const [entityType, setEntityType] = useState<EntityType | undefined>(undefined);
  const [entityId, setEntityId] = useState("");
  const [action, setAction] = useState<ActivityAction | undefined>(undefined);
  const [changedBy, setChangedBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const {
    data: logs = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useActivityLogs({
    page: pagination.page,
    perPage: pagination.perPage,
    order: pagination.order,
    entityType,
    entityId: entityId || undefined,
    action,
    changedBy: changedBy || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const totalPages = pageInfo?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activity</h1>
      </div>

      <div className="space-y-4">
        <ActivityFilterBar
          entityType={entityType}
          onEntityTypeChange={(value) => {
            setEntityType(value);
            pagination.setPage(1);
          }}
          entityId={entityId}
          onEntityIdChange={(value) => {
            setEntityId(value);
            pagination.setPage(1);
          }}
          action={action}
          onActionChange={(value) => {
            setAction(value);
            pagination.setPage(1);
          }}
          changedBy={changedBy}
          onChangedByChange={(value) => {
            setChangedBy(value);
            pagination.setPage(1);
          }}
          from={from}
          onFromChange={(value) => {
            setFrom(value);
            pagination.setPage(1);
          }}
          to={to}
          onToChange={(value) => {
            setTo(value);
            pagination.setPage(1);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select value={pagination.order} onValueChange={(v) => pagination.setOrder(v as SortOrder)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Oldest first</SelectItem>
              <SelectItem value="desc">Newest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingState message="Loading activity..." />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : logs.length === 0 ? (
          <EmptyState
            title="No activity found"
            message="No activity matches the current filters."
          />
        ) : (
          <>
            <ActivityTimeline logs={logs} />

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select
                  value={String(pagination.perPage)}
                  onValueChange={(v) => pagination.setPerPage(Number(v))}
                >
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PER_PAGE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pagination.prevPage}
                  disabled={pagination.page <= 1}
                >
                  Previous
                </Button>
                <span>
                  Page {pagination.page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pagination.nextPage}
                  disabled={pagination.page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
