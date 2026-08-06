import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClients } from "@/hooks/useClients";
import {
  useAddPersonClient,
  usePersonClients,
  useRemovePersonClient,
} from "@/hooks/usePeople";
import type { Person } from "@/types";

interface Props {
  person: Person | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PersonDetailDialog({ person, open, onOpenChange }: Props) {
  const { data: clients = [] } = useClients();
  const { data: relationships = [] } = usePersonClients(person?.id);
  const addClient = useAddPersonClient();
  const removeClient = useRemovePersonClient();
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);

  if (!person) return null;

  const clientName = (clientId: string) =>
    clients.find((c) => c.id === clientId)?.name ?? "Unknown client";

  const availableClients = clients.filter(
    (c) => !relationships.some((r) => r.client_id === c.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{person.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{person.type.replace("_", " ")}</Badge>
          </div>

          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{person.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{person.phone ?? "—"}</dd>
            </div>
          </dl>

          {person.notes && <p className="text-sm text-muted-foreground">{person.notes}</p>}

          <div>
            <h4 className="mb-2 text-sm font-medium">Associated clients</h4>
            {relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No client associations.</p>
            ) : (
              <ul className="space-y-2">
                {relationships.map((rel) => (
                  <li
                    key={rel.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      {clientName(rel.client_id)}
                      {rel.relationship_type && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({rel.relationship_type})
                        </span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeClient.mutate({ personId: person.id, clientId: rel.client_id })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {availableClients.length > 0 && (
              <div className="mt-3 flex gap-2">
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!selectedClientId}
                  onClick={() => {
                    if (selectedClientId) {
                      addClient.mutate({ personId: person.id, clientId: selectedClientId });
                      setSelectedClientId(undefined);
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
