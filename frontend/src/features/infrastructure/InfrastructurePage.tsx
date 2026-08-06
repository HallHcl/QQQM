import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useServers } from "@/hooks/useServers";
import EnvironmentTabs from "./components/EnvironmentTabs";
import ServerCard from "./components/ServerCard";

export default function InfrastructurePage() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id);
  }, [clients, clientId]);

  const { data: projects = [] } = useProjects(clientId);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setProjectId(projects[0]?.id);
  }, [projects]);

  const { data: environments = [] } = useEnvironments(projectId);
  const [environmentId, setEnvironmentId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setEnvironmentId(environments[0]?.id);
  }, [environments]);

  const { data: servers = [], isLoading: serversLoading } = useServers(environmentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Infrastructure</h1>
        <div className="flex gap-2">
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <EnvironmentTabs
        environments={environments}
        value={environmentId}
        onValueChange={setEnvironmentId}
      />

      {environmentId && (
        <div>
          {serversLoading ? (
            <p className="text-sm text-muted-foreground">Loading servers...</p>
          ) : servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No servers in this environment.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servers.map((server) => (
                <ServerCard key={server.id} server={server} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
