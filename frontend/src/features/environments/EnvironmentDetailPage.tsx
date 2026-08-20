import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import EnvironmentEditCard from "./components/EnvironmentEditCard";
import { VpnResourceStatus } from "./components/VpnResourceStatus";
import ServerCard from "@/features/infrastructure/components/ServerCard";
import { useEnvironment } from "@/hooks/useEnvironments";
import { useServers } from "@/hooks/useServers";
import { useHasRole } from "@/hooks/useHasRole";
import { usePagination } from "@/hooks/usePagination";

export default function EnvironmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: environment, isLoading, isError, error, refetch } = useEnvironment(id);
  // Environment update is admin-only — verified against
  // backend/src/routes/environments.routes.ts.
  const canEdit = useHasRole(["admin"]);

  // Only the ?edit escape hatch of usePagination is used here — this page
  // has nothing to paginate. Reflecting edit mode in the URL (rather than
  // local state) is what makes the list page's row-action "Edit" and this
  // page's own Edit button converge on the same state, and keeps edit mode
  // shareable/deep-linkable/bookmarkable.
  const { getParam, setParams } = usePagination();
  const isEditing = canEdit && getParam("edit") === "true";

  function enterEdit() {
    setParams({ edit: "true" });
  }

  function exitEdit() {
    setParams({ edit: undefined });
  }

  // Servers is out of scope for its own CRUD/migration in this ticket —
  // useServers already exists and is read-only-safe to reuse here as-is.
  const { data: servers = [], isLoading: serversLoading } = useServers(environment?.id);

  return (
    <div className="space-y-6">
      <Link
        to="/environments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to environments
      </Link>

      {isLoading ? (
        <LoadingState message="Loading environment..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !environment ? (
        <ErrorState title="Not found" message="This environment could not be found." />
      ) : (
        <>
          <Card>
            {!isEditing && (
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{environment.name}</CardTitle>
                  <div className="mt-1">
                    <Link
                      to={`/projects/${environment.project.id}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {environment.project.name}
                    </Link>
                  </div>
                </div>
                <RequireRole roles={["admin"]}>
                  <Button variant="secondary" size="sm" onClick={enterEdit}>
                    Edit
                  </Button>
                </RequireRole>
              </CardHeader>
            )}
            <CardContent className="space-y-3">
              {isEditing ? (
                <EnvironmentEditCard environment={environment} onSaved={exitEdit} onCancel={exitEdit} />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {environment.description ?? "No description provided."}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      VPN resource
                    </span>
                    <VpnResourceStatus resourceId={environment.vpn_resource_id} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Servers ({servers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {serversLoading ? (
                <LoadingState message="Loading servers..." />
              ) : servers.length === 0 ? (
                <EmptyState title="No servers" message="This environment has no servers yet." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {servers.map((server) => (
                    <ServerCard key={server.id} server={server} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
