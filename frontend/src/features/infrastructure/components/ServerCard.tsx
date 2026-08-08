import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Server } from "@/types";
import CredentialRefList from "./CredentialRefList";

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

interface Props {
  server: Server;
}

export default function ServerCard({ server }: Props) {
  const [expanded, setExpanded] = useState(false);
  const techStack = Array.isArray(server.tech_stack) ? server.tech_stack : [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">
            <Link to={`/servers/${server.id}`} className="hover:underline">
              {server.display_name}
            </Link>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{server.hostname}</p>
          {server.ip_address && (
            <p className="text-xs text-muted-foreground">{server.ip_address}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Hide credentials" : "Show credentials"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {techStack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {techStack.map((tech, index) => (
              <Badge key={index} variant="secondary">
                {String(tech)}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {server.service_type && <span>{SERVICE_TYPE_LABELS[server.service_type] ?? server.service_type}</span>}
          {server.access_method && (
            <span>
              {ACCESS_METHOD_LABELS[server.access_method] ?? server.access_method}
              {" · "}
              {server.access_host}
              {server.access_port ? `:${server.access_port}` : ""}
              {server.access_path ?? ""}
            </span>
          )}
        </div>

        {server.monitoring_url && (
          <a
            href={server.monitoring_url}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-brand underline underline-offset-2"
          >
            Monitoring dashboard
          </a>
        )}
        {server.notes && <p className="text-sm text-muted-foreground">{server.notes}</p>}
        {expanded && <CredentialRefList serverId={server.id} />}
      </CardContent>
    </Card>
  );
}
