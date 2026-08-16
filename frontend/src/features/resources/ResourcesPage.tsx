import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaginationControls } from "@/components/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import {
  useDeleteResource,
  useResources,
  useRestoreResource,
  type ResourceListItem,
  type ResourceSort,
} from "@/hooks/useResources";
import ResourceFilterBar from "./components/ResourceFilterBar";
import ResourceList from "./components/ResourceList";
import ResourceEditor from "./components/ResourceEditor";
import ResourceMetadataDialog from "./components/ResourceMetadataDialog";
import VersionHistoryPanel from "./components/VersionHistoryPanel";

const SORT_OPTIONS: { value: ResourceSort; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];


export default function ResourcesPage() {
  const pagination = usePagination({ initialSort: "title", initialOrder: "asc" });
  // URL-synced the same way as pagination's own fields (see usePagination.ts)
  // rather than local useState, so a refresh/shared URL reproduces the same
  // filtered view. Matches pre-migration behavior exactly: neither filter
  // resets the page on change (only pagination.setSearch does that).
  const projectId = pagination.getParam("project_id") ?? undefined;
  const type = pagination.getParam("type") ?? undefined;

  function setProjectId(value: string | undefined) {
    pagination.setParams({ project_id: value });
  }

  function setType(value: string | undefined) {
    pagination.setParams({ type: value });
  }

  const {
    data: resources = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useResources({
    ...pagination.params,
    sort: pagination.params.sort as ResourceSort | undefined,
    projectId,
    type,
  });

  const totalPages = pageInfo?.total_pages ?? 1;

  const [selected, setSelected] = useState<ResourceListItem | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  // undefined = pre-fill from the current version (plain "Add version");
  // set to a historical version's id by "Revert to this version".
  const [prefillVersionId, setPrefillVersionId] = useState<string | undefined>(undefined);
  const [editMetadataOpen, setEditMetadataOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const deleteResource = useDeleteResource();
  const restoreResource = useRestoreResource();

  function openAddVersion() {
    setPrefillVersionId(undefined);
    setNewVersionOpen(true);
  }

  function openRevertVersion(versionId: string) {
    setPrefillVersionId(versionId);
    setNewVersionOpen(true);
  }

  function handleDelete() {
    if (!selected) return;
    const target = selected;
    deleteResource.mutate(target.id, {
      onSuccess: (updated) => {
        toast({ title: "Resource deleted" });
        setSelected((prev) => (prev && prev.id === target.id ? { ...prev, ...updated } : prev));
      },
      onError: (err) => {
        toast({
          title: "Couldn't delete resource",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  // Restore's 409 ("Resource is not deleted") is a business-rule conflict,
  // not a stale-write conflict — it's surfaced as a plain error toast here,
  // never routed through useConflictResolution/ConflictState (that
  // primitive is for stale `updated_at` on PATCH, which this isn't, and
  // this button only ever appears on rows the list itself reports as
  // deleted, so it should be rare/impossible to trigger in practice).
  function handleRestore() {
    if (!selected) return;
    const target = selected;
    restoreResource.mutate(target.id, {
      onSuccess: (updated) => {
        toast({ title: "Resource restored" });
        setSelected((prev) => (prev && prev.id === target.id ? { ...prev, ...updated } : prev));
      },
      onError: (err) => {
        toast({
          title: "Couldn't restore resource",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  const isDeletedSelected = Boolean(selected?.deleted_at);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resources"
        actions={
          <RequireRole roles={["admin", "member"]}>
            <Button onClick={() => setCreateOpen(true)}>New resource</Button>
          </RequireRole>
        }
      />

      <ResourceFilterBar
        search={pagination.search}
        onSearchChange={pagination.setSearch}
        type={type}
        onTypeChange={setType}
        projectId={projectId}
        onProjectIdChange={setProjectId}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={pagination.sort} onValueChange={pagination.setSort}>
          <SelectTrigger className="w-40" aria-label="Sort by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pagination.order} onValueChange={(v) => pagination.setOrder(v as SortOrder)}>
          <SelectTrigger className="w-32" aria-label="Sort order">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={pagination.deleted}
          onValueChange={(v) => pagination.setDeleted(v as DeletedFilter)}
        >
          <SelectTrigger className="w-40" aria-label="Record status filter">
            <SelectValue placeholder="Record status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deleted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {isLoading ? (
            <LoadingState message="Loading resources..." />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : resources.length === 0 ? (
            <EmptyState
              title="No resources found"
              message={
                pagination.search ? "Try a different search term." : "No resources have been added yet."
              }
            />
          ) : (
            <>
              <ResourceList resources={resources} selectedId={selected?.id} onSelect={setSelected} />

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

        <div>
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {selected.title}
                    {isDeletedSelected && <Badge variant="secondary">Deleted</Badge>}
                  </CardTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline">{selected.type}</Badge>
                    {selected.category && (
                      <span className="text-xs text-muted-foreground">{selected.category}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isDeletedSelected ? (
                    <RequireRole
                      roles={["admin"]}
                      fallback={
                        <p className="max-w-[220px] text-right text-xs text-muted-foreground">
                          Restoring a deleted resource requires admin access.
                        </p>
                      }
                    >
                      <Button variant="secondary" size="sm" onClick={handleRestore}>
                        Restore
                      </Button>
                    </RequireRole>
                  ) : (
                    <>
                      <RequireRole roles={["admin", "member"]}>
                        <Button variant="secondary" size="sm" onClick={openAddVersion}>
                          Add version
                        </Button>
                      </RequireRole>
                      {/* Member users can create resources and add versions, but
                          metadata edits (title/category/tags) are admin-only — a
                          real asymmetry (verified against
                          backend/src/routes/resources.routes.ts), not a bug. A
                          plain disabled button with only a native tooltip would
                          leave that unexplained, so a member sees this note
                          instead of the Edit button. */}
                      <RequireRole
                        roles={["admin"]}
                        fallback={
                          <p className="max-w-[220px] text-right text-xs text-muted-foreground">
                            Editing this resource&apos;s title/category/tags requires admin access.
                            You can still add new versions.
                          </p>
                        }
                      >
                        <Button variant="ghost" size="sm" onClick={() => setEditMetadataOpen(true)}>
                          Edit
                        </Button>
                      </RequireRole>
                      <RequireRole roles={["admin"]}>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                          Delete
                        </Button>
                      </RequireRole>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <VersionHistoryPanel resourceId={selected.id} onRevert={openRevertVersion} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Select a resource to view its details.</p>
          )}
        </div>
      </div>

      <ResourceEditor mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      {selected && (
        <ResourceEditor
          mode="new-version"
          open={newVersionOpen}
          onOpenChange={setNewVersionOpen}
          resourceId={selected.id}
          resourceType={selected.type}
          currentVersionId={selected.current_version_id}
          prefillVersionId={prefillVersionId}
        />
      )}
      <ResourceMetadataDialog open={editMetadataOpen} onOpenChange={setEditMetadataOpen} resource={selected} />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this resource?"
        description={
          selected
            ? `"${selected.title}" will be hidden from the active resource list. Its version history is not affected — soft-delete only sets this resource's own deleted flag, resource_versions rows are never touched — so every version will still be there, untouched, if you restore it later.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
