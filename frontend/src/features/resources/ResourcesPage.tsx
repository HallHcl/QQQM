import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useResources } from "@/hooks/useResources";
import type { ResourceFilters } from "@/hooks/useResources";
import type { Resource } from "@/types";
import ResourceFilterBar from "./components/ResourceFilterBar";
import ResourceList from "./components/ResourceList";
import ResourceEditor from "./components/ResourceEditor";
import VersionHistoryPanel from "./components/VersionHistoryPanel";

export default function ResourcesPage() {
  const [filters, setFilters] = useState<ResourceFilters>({});
  const { data: resources = [], isLoading } = useResources(filters);
  const [selected, setSelected] = useState<Resource | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const [newVersionOpen, setNewVersionOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Resources</h1>
        <Button onClick={() => setCreateOpen(true)}>New resource</Button>
      </div>

      <ResourceFilterBar filters={filters} onChange={setFilters} />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading resources...</p>
          ) : (
            <ResourceList
              resources={resources}
              selectedId={selected?.id}
              onSelect={setSelected}
            />
          )}
        </div>

        <div>
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{selected.title}</CardTitle>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline">{selected.type}</Badge>
                    {selected.category && (
                      <span className="text-xs text-muted-foreground">{selected.category}</span>
                    )}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setNewVersionOpen(true)}>
                  Add version
                </Button>
              </CardHeader>
              <CardContent>
                <VersionHistoryPanel resourceId={selected.id} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Select a resource to view its details.</p>
          )}
        </div>
      </div>

      <ResourceEditor mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      {selected && (
        <ResourceEditor
          mode="new-version"
          open={newVersionOpen}
          onOpenChange={setNewVersionOpen}
          resourceId={selected.id}
        />
      )}
    </div>
  );
}
