import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { useActivityLogs } from "@/hooks/useActivityLogs";

export default function OverviewPage() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!clientId && clients.length > 0) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  const client = clients.find((c) => c.id === clientId);
  const { data: projects = [] } = useProjects(clientId);
  const { data: activity = [] } = useActivityLogs();

  const recentActivity = activity.slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        actions={
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-64" aria-label="Client">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {client && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{client.name}</CardTitle>
              <Badge variant={client.status === "active" ? "default" : "secondary"}>
                {client.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {client.description ?? "No description provided."}
            </p>

            <div>
              <h3 className="mb-2 text-sm font-medium">Projects</h3>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <ul className="space-y-2">
                  {projects.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.description ?? "No description"}
                        </p>
                      </div>
                      <Badge variant="outline">{project.owner_status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((log) => (
                <li key={log.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium capitalize">{log.action}</span>{" "}
                    <span className="text-muted-foreground">
                      {log.entity_type.replace("_", " ")}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
