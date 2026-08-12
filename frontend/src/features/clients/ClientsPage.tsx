import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
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

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

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

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>(undefined);

  const deleteClient = useDeleteClient();
  const restoreClient = useRestoreClient();

  function openCreateForm() {
    setEditingClient(undefined);
    setFormOpen(true);
  }

  function openEditForm(client: Client) {
    setEditingClient(client);
    setFormOpen(true);
  }

  function handleDelete(client: Client) {
    deleteClient.mutate(client.id, {
      onSuccess: () => toast({ title: "Client deleted" }),
    });
  }

  function handleRestore(client: Client) {
    restoreClient.mutate(client.id, {
      onSuccess: () => toast({ title: "Client restored" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search clients..."
            value={pagination.search}
            onChange={(e) => pagination.setSearch(e.target.value)}
            className="w-64"
          />
          <RequireRole roles={["admin"]}>
            <Button onClick={openCreateForm}>New client</Button>
          </RequireRole>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={pagination.sort} onValueChange={pagination.setSort}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-32">
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
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Active</SelectItem>
            <SelectItem value="true">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
                  <TableRow key={client.id} className={cn(isDeleted && "opacity-50")}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {client.name}
                        {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.status === "active" ? "default" : "secondary"}>
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(client.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDeleted ? (
                        <RequireRole roles={["admin"]}>
                          <Button variant="ghost" size="sm" onClick={() => handleRestore(client)}>
                            Restore
                          </Button>
                        </RequireRole>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEditForm(client)}>
                            Edit
                          </Button>
                          <RequireRole roles={["admin"]}>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(client)}>
                              Delete
                            </Button>
                          </RequireRole>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pagination.perPage)}
                onValueChange={(v) => pagination.setPerPage(Number(v))}
              >
                <SelectTrigger className="w-20">
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
              <span className="text-sm text-muted-foreground">
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

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editingClient} />
    </div>
  );
}
