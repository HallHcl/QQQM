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
import {
  BookText,
  Building2,
  CalendarClock,
  FolderKanban,
  HardDrive,
  Layers,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import UrgentActionItems from "./UrgentActionItems";
import { useClients } from "@/hooks/useClients";
import { useProjects } from "@/hooks/useProjects";
import { useEnvironments } from "@/hooks/useEnvironments";
import { useServers } from "@/hooks/useServers";
import { useResources } from "@/hooks/useResources";
import { useSchedules } from "@/hooks/useSchedules";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { cn } from "@/lib/utils";
import { panelSurface } from "@/lib/panelSurface";

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

  // System-wide KPI counts. Each is its own independent query asking for a
  // single row and reading `pagination.total` off it — the same trick
  // useChildCounts.ts uses per row, except this fires once per page load, not
  // once per visible row. Independent queries are the point: one failing
  // endpoint greys out its own tile and leaves the other five intact.
  //
  // These are separate cache entries from the pickers' own zero-arg calls
  // above (`[KEY, {}]` vs `[KEY, { per_page: 1 }]`), so a tile costs one
  // extra request rather than reusing the list — cheap, but not free.
  //
  // No "active"/"managed" qualifiers: Environments and Servers have no status
  // concept in the data model (only `deleted_at`), and every hook already
  // defaults to `deleted: "false"`, so these are non-deleted totals. Clients
  // is a plain total for a different reason — GET /clients has no server-side
  // `status` filter, so an active/inactive split isn't queryable at all.
  const clientCount = useClients({ per_page: 1 });
  const projectCount = useProjects(undefined, { per_page: 1 });
  const environmentCount = useEnvironments(undefined, { per_page: 1 });
  const serverCount = useServers(undefined, { per_page: 1 });
  const resourceCount = useResources({ per_page: 1 });
  const pendingScheduleCount = useSchedules({ status: "pending", per_page: 1 });

  // `to` carries any pre-applied filter as search params — the destination
  // page reads them back through usePagination's getParam, so the filter
  // survives a refresh or a shared link. Only Pending Schedules needs one;
  // the other five are unfiltered list views.
  const metrics = [
    { label: "Total Clients", query: clientCount, icon: Building2, to: "/clients" },
    { label: "Total Projects", query: projectCount, icon: FolderKanban, to: "/projects" },
    { label: "Environments", query: environmentCount, icon: Layers, to: "/environments" },
    { label: "Servers", query: serverCount, icon: HardDrive, to: "/servers" },
    { label: "Resources", query: resourceCount, icon: BookText, to: "/resources" },
    {
      label: "Pending Schedules",
      query: pendingScheduleCount,
      icon: CalendarClock,
      to: "/schedule?status=pending",
    },
  ];

  const recentActivity = activity.slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />

      <UrgentActionItems />

      {/* 2 cols at 375px keeps each tile wide enough for a label like "Pending
          Schedules" on two lines; 6 across at lg puts the whole system on one
          row at laptop width without the tiles going narrower than their
          longest label. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map(({ label, query, icon, to }) => (
          <MetricCard
            key={label}
            label={label}
            icon={icon}
            to={to}
            count={query.pagination?.total}
            isLoading={query.isLoading}
            isError={query.isError}
          />
        ))}
      </div>

      {client && (
        <Card>
          <CardHeader>
            {/* The client picker lives here rather than in PageHeader's
                actions slot: it scopes this card only, and sitting above the
                KPI tiles it read as though it scoped those too (it doesn't). */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle className="truncate">{client.name}</CardTitle>
                <Badge variant={client.status === "active" ? "success" : "neutral"}>
                  {client.status}
                </Badge>
              </div>
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
                      className={cn(panelSurface(), "flex items-center justify-between p-3")}
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
