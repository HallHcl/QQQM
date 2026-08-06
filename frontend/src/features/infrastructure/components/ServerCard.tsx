import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Server } from "@/types";
import CredentialRefList from "./CredentialRefList";

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
          <CardTitle className="text-base">{server.hostname}</CardTitle>
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
