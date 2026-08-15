import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { EmptyState } from "@/components/state/EmptyState";
import { ErrorState } from "@/components/state/ErrorState";
import { LoadingState } from "@/components/state/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useServers } from "@/hooks/useServers";
import EnvironmentTabs from "./components/EnvironmentTabs";
import ServerCard from "./components/ServerCard";

export default function InfrastructurePage() {
  const {
    data: clients = [],
    isLoading: clientsLoading,
    isError: clientsIsError,
    error: clientsError,
    refetch: refetchClients,
  } = useClients();
  const [clientId, setClientId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id);
  }, [clients, clientId]);

  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError: projectsIsError,
    error: projectsError,
    refetch: refetchProjects,
  } = useProjects(clientId);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setProjectId(projects[0]?.id);
  }, [projects]);

  const {
    data: environments = [],
    isLoading: environmentsLoading,
    isError: environmentsIsError,
    error: environmentsError,
    refetch: refetchEnvironments,
  } = useEnvironments(projectId);
  const [environmentId, setEnvironmentId] = useState<string | undefined>(undefined);

  useEffect(() => {
    setEnvironmentId(environments[0]?.id);
  }, [environments]);

  const {
    data: servers = [],
    isLoading: serversLoading,
    isError: serversIsError,
    error: serversError,
    refetch: refetchServers,
  } = useServers(environmentId);

  const isLoading = clientsLoading || projectsLoading || environmentsLoading || serversLoading;
  const isError = clientsIsError || projectsIsError || environmentsIsError || serversIsError;
  const error = clientsError ?? projectsError ?? environmentsError ?? serversError;

  function retry() {
    refetchClients();
    refetchProjects();
    refetchEnvironments();
    refetchServers();
  }

  return (
    <div className="space-y-6">
      {/* flex-wrap + gap-3 overrides the default header wrapper via the
          className prop — needed because two wide picker controls
          (Client + Project) would overflow at narrow laptop widths. */}
      <PageHeader
        title="Infrastructure"
        className="flex flex-wrap items-center justify-between gap-3"
        actions={
          <>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-48" aria-label="Client">
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
            <ProjectPicker
              value={projectId}
              onChange={setProjectId}
              clientId={clientId}
              placeholder="Project"
              className="w-48"
              aria-label="Project"
            />
          </>
        }
      />

      {isLoading ? (
        <LoadingState message="Loading infrastructure..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={retry} />
      ) : (
        <>
          <EnvironmentTabs
            environments={environments}
            value={environmentId}
            onValueChange={setEnvironmentId}
          />

          {environmentId && (
            <div>
              {servers.length === 0 ? (
                <EmptyState title="No servers found" message="No servers in this environment." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {servers.map((server) => (
                    <ServerCard key={server.id} server={server} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
