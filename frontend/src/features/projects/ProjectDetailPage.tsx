import { useState } from "react";
import { useParams } from "react-router-dom";
import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailPageShell } from "@/components/DetailPageShell";
import ProjectFormDialog from "./components/ProjectFormDialog";
import ProjectRoster from "./components/ProjectRoster";
import { useProject } from "@/hooks/useProjects";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError, error, refetch } = useProject(id);
  const [formOpen, setFormOpen] = useState(false);

  return (
    /**
     * No `aside`: the Team roster is a management surface (table + assign
     * form) that needs the full content width, not a 400px rail — it is the
     * larger half of this page, not a sidebar's worth of related links. The
     * shell is adopted here purely to drop the duplicated back-link and
     * loading/error/not-found chain.
     */
    <DetailPageShell
      backTo="/projects"
      backLabel="Back to projects"
      entity={project}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => refetch()}
      loadingMessage="Loading project..."
      notFoundMessage="This project could not be found."
      main={(project) => (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle asChild>
                  <h1>{project.name}</h1>
                </CardTitle>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{project.owner_status}</Badge>
                  <span className="text-sm text-muted-foreground">{project.client.name}</span>
                </div>
              </div>
              <RequireRole roles={["admin"]}>
                <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
                  Edit
                </Button>
              </RequireRole>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {project.description ?? "No description provided."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              {/* ProjectRoster owns its own queries and its own
                  loading/empty states, plus the two contextual hints about
                  client-linked people — all independent of the shell's
                  page-level chain. */}
              <ProjectRoster projectId={project.id} clientId={project.client_id} />
            </CardContent>
          </Card>

          <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} project={project} />
        </>
      )}
    />
  );
}
