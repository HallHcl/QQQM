import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FilterBar } from "@/components/FilterBar";
import { PaginationControls } from "@/components/PaginationControls";
import { Toolbar } from "@/components/Toolbar";
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
import { RelatedCount } from "@/components/RelatedCount";
import { RowActions } from "@/components/RowActions";
import { PROJECTS_PER_CLIENT, useChildCounts } from "@/hooks/useChildCounts";
import { useHasRole } from "@/hooks/useHasRole";
import { apiErrorMessage } from "@/api/errors";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import ClientFormDialog from "./components/ClientFormDialog";
import {
  useClients,
  useDeleteClient,
  useRestoreClient,
  type ClientSort,
} from "@/hooks/useClients";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";
import type { Client } from "@/types";

const SORT_OPTIONS: { value: ClientSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

export default function ClientsPage() {
  const pagination = usePagination({ initialSort: "name", initialOrder: "asc" });
  const {
    data: clients = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useClients({
    ...pagination.params,
    // Clients' deleted filter is boolean-only server-side (no "all" mode —
    // see useClients.ts) — narrow the shared three-state pagination value
    // down regardless of what it currently holds.
    deleted: pagination.deleted === "true" ? "true" : "false",
  });

  const totalPages = pageInfo?.total_pages ?? 1;

  // One "N Projects" count per rendered row, fanned out in parallel. Empty
  // while the list itself is loading, so no count requests are issued until
  // there are real rows to count.
  const projectCounts = useChildCounts(
    clients.map((client) => client.id),
    PROJECTS_PER_CLIENT
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);
  const [deletingClient, setDeletingClient] = useState<Client | undefined>(undefined);

  const deleteClient = useDeleteClient();
  const restoreClient = useRestoreClient();
  const canDelete = useHasRole(["admin"]);

  function openCreateForm() {
    setEditingClient(undefined);
    setFormOpen(true);
  }

  function openEditForm(client: Client) {
    setEditingClient(client);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deletingClient) return;
    deleteClient.mutate(deletingClient.id, {
      onSuccess: () => toast({ title: "Client deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete client",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  function handleRestore(client: Client) {
    restoreClient.mutate(client.id, {
      onSuccess: () => toast({ title: "Client restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore client",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" />

      {/* Unified toolbar: search, filters, and the primary action share one
          visually-bounded surface instead of floating as separate elements
          (Phase A UX pilot — Clients module only). */}
      <Toolbar>
        <FilterBar>
          <Input
            placeholder="Search clients..."
            value={pagination.search}
            onChange={(e) => pagination.setSearch(e.target.value)}
            className="w-64"
          />
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
          {/* No "All" option: clients.controller.ts:35 only recognizes deleted=true,
              unlike every other soft-deletable module's three-state filter. */}
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
            </SelectContent>
          </Select>
        </FilterBar>

        <RequireRole roles={["admin"]}>
          <Button onClick={openCreateForm}>New client</Button>
        </RequireRole>
      </Toolbar>

      {isLoading ? (
        <LoadingState message="Loading clients..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : clients.length === 0 ? (
        <EmptyState
          title="No clients found"
          message={
            pagination.search ? "Try a different search term." : "No clients have been added yet."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const isDeleted = Boolean(client.deleted_at);
                return (
                  <TableRow
                    key={client.id}
                    className={cn(
                      "group",
                      !isDeleted && "cursor-pointer",
                      isDeleted && "opacity-50"
                    )}
                    role={isDeleted ? undefined : "button"}
                    tabIndex={isDeleted ? undefined : 0}
                    // Explicit aria-label so the row's accessible name doesn't
                    // flatten in the nested Edit/Delete menu's own labels
                    // (which would otherwise make e.g. a role="button" query
                    // for "Delete" ambiguously match this row too).
                    aria-label={isDeleted ? undefined : `Edit ${client.name}`}
                    onClick={isDeleted ? undefined : () => openEditForm(client)}
                    onKeyDown={
                      isDeleted
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEditForm(client);
                            }
                          }
                    }
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground"
                        >
                          {getInitials(client.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {client.name}
                            {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                          </div>
                          <RelatedCount result={projectCounts.get(client.id)} noun="Project" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.status === "active" ? "success" : "neutral"}>
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(client.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {/* Row actions idle at opacity-60 — dimmed but legible
                          and fully operable everywhere, including touch, where
                          there is no hover to reveal them with. Hover or
                          keyboard focus anywhere in the row brings them to full
                          opacity. Kept as opacity (not display/visibility) so
                          the buttons stay in the tab order throughout.
                          Skipped on deleted rows, which the row itself already
                          dims to opacity-50: compounding the two put Restore
                          at 1.95:1, under the 3:1 minimum (decision #53). */}
                      <div
                        className={cn(
                          "inline-flex transition-opacity",
                          !isDeleted && "opacity-60",
                          "group-hover:opacity-100",
                          "group-focus-within:opacity-100"
                        )}
                      >
                        {isDeleted ? (
                          <RequireRole roles={["admin"]}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestore(client)}
                            >
                              Restore
                            </Button>
                          </RequireRole>
                        ) : (
                          <RowActions
                            onEdit={() => openEditForm(client)}
                            onDelete={canDelete ? () => setDeletingClient(client) : undefined}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Capped at 50 (the shared default also offers 100): every rendered
              row fires one extra child-count request, so the page size is what
              bounds that fan-out. Other modules keep the 100 option. */}
          <PaginationControls
            page={pagination.page}
            totalPages={totalPages}
            perPage={pagination.perPage}
            onPrevPage={pagination.prevPage}
            onNextPage={pagination.nextPage}
            onPerPageChange={pagination.setPerPage}
            perPageOptions={[10, 20, 50]}
          />
        </>
      )}

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editingClient} />

      <ConfirmDialog
        open={Boolean(deletingClient)}
        onOpenChange={(open) => {
          if (!open) setDeletingClient(undefined);
        }}
        title="Delete this client?"
        description={
          deletingClient
            ? `"${deletingClient.name}" will be hidden from the active client list. Its projects are not deleted or hidden — they stay fully visible and functional, unaffected by this. You can restore the client at any time.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
