import { useState } from "react";
import { Link } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaginationControls } from "@/components/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { apiErrorMessage } from "@/api/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import EnvironmentFormDialog from "./components/EnvironmentFormDialog";
import { useProjects } from "@/hooks/useProjects";
import {
  useDeleteEnvironment,
  useEnvironments,
  useRestoreEnvironment,
  type Environment,
  type EnvironmentSort,
} from "@/hooks/useEnvironments";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";

const SORT_OPTIONS: { value: EnvironmentSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

export default function EnvironmentsPage() {
  const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
  const {
    data: environments = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useEnvironments(undefined, pagination.params);

  // The list endpoint returns bare project_id per row (no nested project
  // name) — cross-reference the project picker's own list to resolve a
  // display name, same as ProjectsPage does for client_id -> client name.
  const { data: projects = [] } = useProjects();
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const totalPages = pageInfo?.total_pages ?? 1;

  const [formOpen, setFormOpen] = useState(false);
  const [editingEnvironment, setEditingEnvironment] = useState<Environment | undefined>(undefined);
  const [deletingEnvironment, setDeletingEnvironment] = useState<Environment | undefined>(undefined);
  const [restoringEnvironment, setRestoringEnvironment] = useState<Environment | undefined>(undefined);

  const deleteEnvironment = useDeleteEnvironment();
  const restoreEnvironment = useRestoreEnvironment();

  function openCreateForm() {
    setEditingEnvironment(undefined);
    setFormOpen(true);
  }

  function openEditForm(environment: Environment) {
    setEditingEnvironment(environment);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deletingEnvironment) return;
    deleteEnvironment.mutate(deletingEnvironment.id, {
      onSuccess: () => toast({ title: "Environment deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete environment",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  function confirmRestore() {
    if (!restoringEnvironment) return;
    restoreEnvironment.mutate(restoringEnvironment.id, {
      onSuccess: () => toast({ title: "Environment restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore environment",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Environments</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search environments..."
            value={pagination.search}
            onChange={(e) => pagination.setSearch(e.target.value)}
            className="w-64"
          />
          <RequireRole roles={["admin"]}>
            <Button onClick={openCreateForm}>New environment</Button>
          </RequireRole>
        </div>
      </div>

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
        <Select
          value={pagination.order}
          onValueChange={(v) => pagination.setOrder(v as SortOrder)}
        >
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
          <SelectTrigger className="w-32" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deleted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState message="Loading environments..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : environments.length === 0 ? (
        <EmptyState
          title="No environments found"
          message={
            pagination.search
              ? "Try a different search term."
              : "No environments have been added yet."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((environment) => {
                const isDeleted = Boolean(environment.deleted_at);
                return (
                  <TableRow key={environment.id} className={cn(isDeleted && "opacity-50")}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link to={`/environments/${environment.id}`} className="hover:underline">
                          {environment.name}
                        </Link>
                        {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {projectNameById.get(environment.project_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {environment.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(environment.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDeleted ? (
                        <RequireRole roles={["admin"]}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRestoringEnvironment(environment)}
                          >
                            Restore
                          </Button>
                        </RequireRole>
                      ) : (
                        <RequireRole roles={["admin"]}>
                          <Button variant="ghost" size="sm" onClick={() => openEditForm(environment)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingEnvironment(environment)}
                          >
                            Delete
                          </Button>
                        </RequireRole>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

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

      <EnvironmentFormDialog open={formOpen} onOpenChange={setFormOpen} environment={editingEnvironment} />

      <ConfirmDialog
        open={Boolean(deletingEnvironment)}
        onOpenChange={(open) => {
          if (!open) setDeletingEnvironment(undefined);
        }}
        title="Delete this environment?"
        description={
          deletingEnvironment
            ? `"${deletingEnvironment.name}" will be hidden from the active environment list. This also soft-deletes all of its servers, and permanently removes (hard-deletes) their stored credential references — that part cannot be undone. You can restore the environment itself at any time, but its servers and credentials will not come back.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={Boolean(restoringEnvironment)}
        onOpenChange={(open) => {
          if (!open) setRestoringEnvironment(undefined);
        }}
        title="Restore this environment?"
        description={
          restoringEnvironment
            ? `"${restoringEnvironment.name}" will become active again. However, any servers that existed under it before deletion will NOT come back — environment restore does not cascade-restore servers or their credentials.`
            : ""
        }
        confirmLabel="Restore"
        onConfirm={confirmRestore}
      />
    </div>
  );
}
