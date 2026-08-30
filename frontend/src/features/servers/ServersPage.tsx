import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { RowActions } from "@/components/RowActions";
import { useHasRole } from "@/hooks/useHasRole";
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
import { apiErrorMessage } from "@/api/errors";
import { getInitials } from "@/lib/initials";
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

export default function ServersPage() {
  const navigate = useNavigate();
  const canEdit = useHasRole(["admin", "member"]);
  const canDelete = useHasRole(["admin"]);
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
  // project name. Keyed on the full environment object (not just name) so
  // the table can also read vpn_resource_id for the VPN badge below, with no
  // extra fetch beyond this already-existing useEnvironments() call.
  const { data: environments = [] } = useEnvironments();
  const environmentById = new Map(environments.map((e) => [e.id, e]));

  const totalPages = pageInfo?.total_pages ?? 1;

  const [formOpen, setFormOpen] = useState(false);
  const [deletingServer, setDeletingServer] = useState<Server | undefined>(undefined);
  const [restoringServer, setRestoringServer] = useState<Server | undefined>(undefined);

  const deleteServer = useDeleteServer();
  const restoreServer = useRestoreServer();

  function openCreateForm() {
    setFormOpen(true);
  }

  // Editing now lives on ServerDetailPage's inline edit mode, not this
  // dialog — see ServerFormDialog's create-only migration.
  function openEditForm(server: Server) {
    navigate(`/servers/${server.id}?edit=true`);
  }

  function confirmDelete() {
    if (!deletingServer) return;
    deleteServer.mutate(deletingServer.id, {
      onSuccess: () => toast({ title: "Server deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete server",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  function confirmRestore() {
    if (!restoringServer) return;
    restoreServer.mutate(restoringServer.id, {
      onSuccess: () => toast({ title: "Server restored" }),
      onError: (err) => {
        toast({
          title: "Couldn't restore server",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Servers" />

      {/* Unified toolbar: search, filters, and the primary action share one
          visually-bounded surface instead of floating as separate elements
          (Phase A UX pattern, piloted on Clients). */}
      <Toolbar>
        <FilterBar>
          <Input
            placeholder="Search servers..."
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
        </FilterBar>

        {/* Server create/update is admin+member (requireAnyRole), NOT
            admin-only like Environments — verified against
            backend/src/routes/servers.routes.ts. */}
        <RequireRole roles={["admin", "member"]}>
          <Button onClick={openCreateForm}>New server</Button>
        </RequireRole>
      </Toolbar>

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
                <TableHead>Connection</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((server) => {
                const isDeleted = Boolean(server.deleted_at);
                const environment = environmentById.get(server.environment_id);
                // Only surface ip_address separately when it adds information —
                // access_host is already the "how to reach it" value shown in
                // the Connection column, and the two are frequently identical.
                const showIp = server.ip_address && server.ip_address !== server.access_host;
                const goToDetail = () => navigate(`/servers/${server.id}`);
                return (
                  <TableRow
                    key={server.id}
                    className={cn("group cursor-pointer", isDeleted && "opacity-50")}
                    role="button"
                    tabIndex={0}
                    // Explicit aria-label so the row's accessible name doesn't
                    // flatten in the nested Edit/Delete menu's own labels.
                    aria-label={`View ${server.display_name}`}
                    onClick={goToDetail}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToDetail();
                      }
                    }}
                  >
                    <TableCell className="font-medium">
                      {/* Avatar sits beside the whole name block (not inside
                          the title row) so the hostname subtext stays aligned
                          under display_name rather than under the avatar. */}
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-caption font-semibold text-foreground"
                        >
                          {getInitials(server.display_name)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {server.display_name}
                            {isDeleted && <Badge variant="secondary">Deleted</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{server.hostname}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">{environment?.name ?? "—"}</span>
                        {environment?.vpn_resource_id && (
                          <span title="Requires VPN connection">
                            <ShieldCheck
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="Requires VPN connection"
                            />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {server.service_type ? SERVICE_TYPE_LABELS[server.service_type] : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="shrink-0">
                          {server.access_method ? ACCESS_METHOD_LABELS[server.access_method] : "—"}
                        </Badge>
                        <span className="font-mono text-xs text-foreground">
                          {server.access_host}
                          {server.access_port ? `:${server.access_port}` : ""}
                        </span>
                      </div>
                      {server.access_path && (
                        <p
                          className="max-w-[220px] truncate text-xs text-muted-foreground"
                          title={server.access_path}
                        >
                          {server.access_path}
                        </p>
                      )}
                      {showIp && (
                        <p className="text-xs text-muted-foreground">IP: {server.ip_address}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">
                      {new Date(server.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {/* Hover-reveal is scoped to mouse-capable devices via
                          the `hover: hover` media feature, so touch/mobile
                          viewports (which never match it) keep actions at
                          their base opacity-100 — always visible, never
                          hover-gated. Kept as opacity (not display/visibility)
                          so the buttons stay in the tab order and reveal on
                          keyboard focus too. */}
                      <div
                        className={cn(
                          "inline-flex opacity-100 transition-opacity",
                          "[@media(hover:hover)]:opacity-0",
                          "[@media(hover:hover)]:group-hover:opacity-100",
                          "[@media(hover:hover)]:group-focus-within:opacity-100"
                        )}
                      >
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
                          <RowActions
                            onEdit={canEdit ? () => openEditForm(server) : undefined}
                            onDelete={canDelete ? () => setDeletingServer(server) : undefined}
                          />
                        )}
                      </div>
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

      <ServerFormDialog open={formOpen} onOpenChange={setFormOpen} />

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
