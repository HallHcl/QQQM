import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { RowActions } from "@/components/RowActions";
import { useHasRole } from "@/hooks/useHasRole";
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
import { PageHeader } from "@/components/layout/PageHeader";
import { apiErrorMessage } from "@/api/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import ProjectFormDialog from "./components/ProjectFormDialog";
import { useClients } from "@/hooks/useClients";
import {
  useDeleteProject,
  useProjects,
  useRestoreProject,
  type ProjectSort,
} from "@/hooks/useProjects";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import type { Project } from "@/types";

const SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const canManage = useHasRole(["admin"]);
  const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
  const {
    data: projects = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useProjects(undefined, pagination.params);

  // The list endpoint returns bare client_id per row (no nested client name,
  // unlike the single-record ProjectDetail response) — cross-reference the
  // client picker's own list to resolve a display name, same as
  // InfrastructurePage/OverviewPage already do for their own client pickers.
  // Projects deliberately do NOT cascade-hide when their parent Client is
  // soft-deleted (decisions.md #6) — the project row stays fully visible and
  // functional here, so its Client column must still resolve a real name,
  // not silently fall back to "—" just because that client is no longer
  // active. Clients' `deleted` filter is boolean-only server-side, with no
  // "all" mode (decisions.md #11) — a single deleted:"all" call isn't an
  // option here — so active and deleted clients are fetched separately and
  // merged into one lookup, both already-supported query shapes.
  const { data: activeClients = [] } = useClients();
  const { data: deletedClients = [] } = useClients({ deleted: "true" });
  const clientNameById = new Map(
    [...activeClients, ...deletedClients].map((c) => [c.id, c.name])
  );

  const totalPages = pageInfo?.total_pages ?? 1;

  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [deletingProject, setDeletingProject] = useState<Project | undefined>(undefined);

  const deleteProject = useDeleteProject();
  const restoreProject = useRestoreProject();

  function openCreateForm() {
    setEditingProject(undefined);
    setFormOpen(true);
  }

  function openEditForm(project: Project) {
    setEditingProject(project);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deletingProject) return;
    deleteProject.mutate(deletingProject.id, {
      onSuccess: () => toast({ title: "Project deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete project",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  function handleRestore(project: Project) {
    restoreProject.mutate(project.id, {
      onSuccess: () => toast({ title: "Project restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore project",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        actions={
          <>
            <Input
              placeholder="Search projects..."
              value={pagination.search}
              onChange={(e) => pagination.setSearch(e.target.value)}
              className="w-64"
            />
            <RequireRole roles={["admin"]}>
              <Button onClick={openCreateForm}>New project</Button>
            </RequireRole>
          </>
        }
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

      {isLoading ? (
        <LoadingState message="Loading projects..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="No projects found"
          message={
            pagination.search ? "Try a different search term." : "No projects have been added yet."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const isDeleted = Boolean(project.deleted_at);
                const goToDetail = () => navigate(`/projects/${project.id}`);
                return (
                  <TableRow
                    key={project.id}
                    className={cn("cursor-pointer", isDeleted && "opacity-50")}
                    role="button"
                    tabIndex={0}
                    // Explicit aria-label so the row's accessible name doesn't
                    // flatten in the nested Edit/Delete menu's own labels.
                    aria-label={`View ${project.name}`}
                    onClick={goToDetail}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToDetail();
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {project.name}
                        {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {clientNameById.get(project.client_id) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{project.owner_status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(project.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {isDeleted ? (
                        <RequireRole roles={["admin"]}>
                          <Button variant="ghost" size="sm" onClick={() => handleRestore(project)}>
                            Restore
                          </Button>
                        </RequireRole>
                      ) : (
                        <RowActions
                          onEdit={canManage ? () => openEditForm(project) : undefined}
                          onDelete={canManage ? () => setDeletingProject(project) : undefined}
                        />
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

      <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} project={editingProject} />

      <ConfirmDialog
        open={Boolean(deletingProject)}
        onOpenChange={(open) => {
          if (!open) setDeletingProject(undefined);
        }}
        title="Delete this project?"
        description={
          deletingProject
            ? `"${deletingProject.name}" will be hidden from the active project list. Its environments, servers, and schedules are not deleted or hidden — they stay fully visible and functional, unaffected by this. You can restore the project at any time.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
