import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import ProjectFormDialog from "./components/ProjectFormDialog";
import ProjectRoster from "./components/ProjectRoster";
import { useProject } from "@/hooks/useProjects";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError, error, refetch } = useProject(id);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      {isLoading ? (
        <LoadingState message="Loading project..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !project ? (
        <ErrorState title="Not found" message="This project could not be found." />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{project.name}</CardTitle>
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
              <ProjectRoster projectId={project.id} clientId={project.client_id} />
            </CardContent>
          </Card>

          <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} project={project} />
        </>
      )}
    </div>
  );
}
