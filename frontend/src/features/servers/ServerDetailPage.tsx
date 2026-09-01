import { Link, useParams } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailPageShell } from "@/components/DetailPageShell";
import CredentialRefList from "@/features/infrastructure/components/CredentialRefList";
import ServerEditCard from "./components/ServerEditCard";
import { useServer, type ServerDetail } from "@/hooks/useServers";
import { useHasRole } from "@/hooks/useHasRole";
import { usePagination } from "@/hooks/usePagination";

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

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: server, isLoading, isError, error, refetch } = useServer(id);
  // Server create/update is admin+member (requireAnyRole), NOT admin-only
  // like Environments — verified against backend/src/routes/servers.routes.ts.
  const canEdit = useHasRole(["admin", "member"]);

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

  return (
    <DetailPageShell<ServerDetail>
      backTo="/servers"
      backLabel="Back to servers"
      entity={server}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Loading server..."
      notFoundMessage="This server could not be found."
      main={(server) => (
        <Card>
          {!isEditing && (
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{server.display_name}</CardTitle>
                  {server.deleted_at && <Badge variant="neutral">Deleted</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{server.hostname}</p>
                <div className="mt-1">
                  <Link
                    to={`/environments/${server.environment.id}`}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {server.environment.name}
                  </Link>
                  <span className="text-sm text-muted-foreground"> · {server.environment.project.name}</span>
                </div>
              </div>
              <RequireRole roles={["admin", "member"]}>
                <Button variant="secondary" size="sm" onClick={enterEdit}>
                  Edit
                </Button>
              </RequireRole>
            </CardHeader>
          )}
          <CardContent className="space-y-4">
            {isEditing ? (
              <ServerEditCard server={server} onSaved={exitEdit} onCancel={exitEdit} />
            ) : (
              <>
                {server.ip_address && (
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      IP address
                    </span>
                    <p className="text-sm">{server.ip_address}</p>
                  </div>
                )}

                {server.tech_stack.length > 0 && (
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Tech stack
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {server.tech_stack.map((tech, index) => (
                        <Badge key={index} variant="secondary">
                          {String(tech)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Access documentation
                  </p>
                  {/* Single column until sm, two above it. This block used to
                      be flatly grid-cols-2 while the page was one 992px-wide
                      column, which stranded each value ~450px from its
                      neighbour. In the shell's ~590px main column two columns
                      read as a pair; below sm they would only crush long
                      hostnames, so they stack. */}
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Service type</dt>
                      <dd>{server.service_type ? SERVICE_TYPE_LABELS[server.service_type] : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Access method</dt>
                      <dd>{server.access_method ? ACCESS_METHOD_LABELS[server.access_method] : "—"}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">Access host</dt>
                      <dd className="break-words">{server.access_host || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Port</dt>
                      <dd>{server.access_port ?? "—"}</dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Access path</dt>
                      <dd className="break-words">{server.access_path ?? "—"}</dd>
                    </div>
                  </dl>
                </div>

                {server.monitoring_url && (
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Monitoring
                    </span>
                    <p>
                      <a
                        href={server.monitoring_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-brand underline underline-offset-2"
                      >
                        Monitoring dashboard
                      </a>
                    </p>
                  </div>
                )}

                {server.notes && (
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Notes
                    </span>
                    <p className="text-sm text-muted-foreground">{server.notes}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      aside={(server) => (
        <Card>
          <CardHeader>
            <CardTitle>Credential references</CardTitle>
          </CardHeader>
          <CardContent>
            {/* manageable: this is the management surface for credential
                references (create/edit/delete, Part 23d). ServerCard's
                embedding on InfrastructurePage/EnvironmentDetailPage stays
                read-only (manageable defaults to false there) — those are
                browse/overview surfaces, not management surfaces. */}
            <CredentialRefList serverId={server.id} manageable />
          </CardContent>
        </Card>
      )}
    />
  );
}
