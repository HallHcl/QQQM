import { useState } from "react";
import { Link } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import ServerFormDialog from "./components/ServerFormDialog";
import { useEnvironments } from "@/hooks/useEnvironments";
import {
  useDeleteServer,
  useRestoreServer,
  useServers,
  type Server,
  type ServerSort,
} from "@/hooks/useServers";
import { usePagination, type DeletedFilter, type SortOrder } from "@/hooks/usePagination";

const SORT_OPTIONS: { value: ServerSort; label: string }[] = [
  { value: "display_name", label: "Display name" },
  { value: "created_at", label: "Created" },
  { value: "updated_at", label: "Updated" },
];

const SERVICE_TYPE_LABELS: Record<string, string> = {
  application: "Application",
  database: "Database",
  proxy: "Proxy",
  monitoring: "Monitoring",
  repository: "Repository",
  metrics: "Metrics",
  jump_host: "Jump host",
  other: "Other",
};

const ACCESS_METHOD_LABELS: Record<string, string> = {
  ssh: "SSH",
  rdp: "RDP",
  telnet: "Telnet",
  web: "Web",
  other: "Other",
};

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

export default function ServersPage() {
  const pagination = usePagination({ initialSort: "display_name", initialOrder: "asc" });
  const {
    data: servers = [],
    pagination: pageInfo,
    isLoading,
    isError,
    error,
    refetch,
  } = useServers(undefined, pagination.params);

  // The list endpoint returns bare environment_id per row (no nested
  // environment name) — cross-reference the environment picker's own list to
  // resolve a display name, same as EnvironmentsPage does for project_id ->
  // project name.
  const { data: environments = [] } = useEnvironments();
  const environmentNameById = new Map(environments.map((e) => [e.id, e.name]));

  const totalPages = pageInfo?.total_pages ?? 1;

  const [formOpen, setFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | undefined>(undefined);
  const [deletingServer, setDeletingServer] = useState<Server | undefined>(undefined);
  const [restoringServer, setRestoringServer] = useState<Server | undefined>(undefined);

  const deleteServer = useDeleteServer();
  const restoreServer = useRestoreServer();

  function openCreateForm() {
    setEditingServer(undefined);
    setFormOpen(true);
  }

  function openEditForm(server: Server) {
    setEditingServer(server);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deletingServer) return;
    deleteServer.mutate(deletingServer.id, {
      onSuccess: () => toast({ title: "Server deleted" }),
    });
  }

  function confirmRestore() {
    if (!restoringServer) return;
    restoreServer.mutate(restoringServer.id, {
      onSuccess: () => toast({ title: "Server restored" }),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search servers..."
            value={pagination.search}
            onChange={(e) => pagination.setSearch(e.target.value)}
            className="w-64"
          />
          {/* Server create/update is admin+member (requireAnyRole), NOT
              admin-only like Environments — verified against
              backend/src/routes/servers.routes.ts. */}
          <RequireRole roles={["admin", "member"]}>
            <Button onClick={openCreateForm}>New server</Button>
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
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <LoadingState message="Loading servers..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : servers.length === 0 ? (
        <EmptyState
          title="No servers found"
          message={pagination.search ? "Try a different search term." : "No servers have been added yet."}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Service type</TableHead>
                <TableHead>Access method</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => {
                const isDeleted = Boolean(server.deleted_at);
                return (
                  <TableRow key={server.id} className={cn(isDeleted && "opacity-50")}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link to={`/servers/${server.id}`} className="hover:underline">
                          {server.display_name}
                        </Link>
                        {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{server.hostname}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {environmentNameById.get(server.environment_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {server.service_type ? SERVICE_TYPE_LABELS[server.service_type] : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {server.access_method ? ACCESS_METHOD_LABELS[server.access_method] : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(server.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDeleted ? (
                        <RequireRole roles={["admin"]}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRestoringServer(server)}
                          >
                            Restore
                          </Button>
                        </RequireRole>
                      ) : (
                        <>
                          <RequireRole roles={["admin", "member"]}>
                            <Button variant="ghost" size="sm" onClick={() => openEditForm(server)}>
                              Edit
                            </Button>
                          </RequireRole>
                          <RequireRole roles={["admin"]}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingServer(server)}
                            >
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

      <ServerFormDialog open={formOpen} onOpenChange={setFormOpen} server={editingServer} />

      <ConfirmDialog
        open={Boolean(deletingServer)}
        onOpenChange={(open) => {
          if (!open) setDeletingServer(undefined);
        }}
        title="Delete this server?"
        description={
          deletingServer
            ? `"${deletingServer.display_name}" will be hidden from the active server list. This also permanently removes (hard-deletes) its stored credential references — that part cannot be undone, even if you restore the server afterward.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={Boolean(restoringServer)}
        onOpenChange={(open) => {
          if (!open) setRestoringServer(undefined);
        }}
        title="Restore this server?"
        description={
          restoringServer
            ? `"${restoringServer.display_name}" will become active again. However, any credential references it had before deletion will NOT come back — restoring a server does not restore its deleted credential references.`
            : ""
        }
        confirmLabel="Restore"
        onConfirm={confirmRestore}
      />
    </div>
  );
}
