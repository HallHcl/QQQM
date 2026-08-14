import { PaginationControls } from "@/components/PaginationControls";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { usePagination } from "@/hooks/usePagination";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import type { ActivityAction, EntityType } from "@/types";
import ActivityFilterBar from "./components/ActivityFilterBar";
import ActivityTimeline from "./components/ActivityTimeline";

const ENTITY_TYPES: EntityType[] = [
  "client",
  "project",
  "environment",
  "server",
  "credential_reference",
  "people",
  "resource",
  "resource_version",
  "schedule",
  "user",
];

const ACTIONS: ActivityAction[] = ["create", "update", "delete", "restore"];

export default function ActivityPage() {
  // Activity has no `deleted`/`search`/`sort` concept of its own (append-only
  // table, no soft delete, and `sort` is confirmed dead server-side — see
  // useActivityLogs.ts) — only the page/perPage/order pieces of
  // usePagination are used here.
  const pagination = usePagination({ initialOrder: "desc" });
  // URL-synced via pagination.getParam/setParams (see usePagination.ts)
  // rather than local useState, so a refresh/shared URL reproduces the same
  // filter set. Each raw URL value is validated against its known enum (or
  // just read as free text for entityId/changedBy/from/to) and falls back to
  // "unset" rather than crashing on a malformed value. Every change here
  // goes through a single combined setParams call (filter + resetPage
  // together) rather than a separate pagination.setPage(1) call, since two
  // independent URL writes in the same handler would race — see
  // usePagination.ts's doc comment.
  const rawEntityType = pagination.getParam("entity_type");
  const entityType = (
    rawEntityType && (ENTITY_TYPES as string[]).includes(rawEntityType) ? rawEntityType : undefined
  ) as EntityType | undefined;
  const entityId = pagination.getParam("entity_id") ?? "";
  const rawAction = pagination.getParam("action");
  const action = (
    rawAction && (ACTIONS as string[]).includes(rawAction) ? rawAction : undefined
  ) as ActivityAction | undefined;
  const changedBy = pagination.getParam("changed_by") ?? "";
  const from = pagination.getParam("from") ?? "";
  const to = pagination.getParam("to") ?? "";

  function setEntityType(value: EntityType | undefined) {
    pagination.setParams({ entity_type: value }, { resetPage: true });
  }

  function setEntityId(value: string) {
    pagination.setParams({ entity_id: value }, { resetPage: true });
  }

  function setAction(value: ActivityAction | undefined) {
    pagination.setParams({ action: value }, { resetPage: true });
  }

  function setChangedBy(value: string) {
    pagination.setParams({ changed_by: value }, { resetPage: true });
  }

  function setFrom(value: string) {
    pagination.setParams({ from: value }, { resetPage: true });
  }

  function setTo(value: string) {
    pagination.setParams({ to: value }, { resetPage: true });
  }

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
          onEntityTypeChange={setEntityType}
          entityId={entityId}
          onEntityIdChange={setEntityId}
          action={action}
          onActionChange={setAction}
          changedBy={changedBy}
          onChangedByChange={setChangedBy}
          from={from}
          onFromChange={setFrom}
          to={to}
          onToChange={setTo}
          order={pagination.order}
          onOrderChange={pagination.setOrder}
        />

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

            <PaginationControls
              page={pagination.page}
              totalPages={totalPages}
              perPage={pagination.perPage}
              onPrevPage={pagination.prevPage}
              onNextPage={pagination.nextPage}
              onPerPageChange={pagination.setPerPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
