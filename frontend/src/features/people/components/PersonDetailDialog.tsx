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
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
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

  // GET /people/:id/clients already returns the client's own id + name
  // inline (not a raw people_clients junction row), so no separate lookup
  // is needed to display it.
  const availableClients = clients.filter(
    (c) => !relationships.some((r) => r.id === c.id)
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
                      {rel.name}
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
                        removeClient.mutate(
                          { personId: person.id, clientId: rel.id },
                          {
                            onSuccess: () => toast({ title: "Client removed" }),
                            onError: (err) => {
                              toast({
                                title: "Couldn't remove client",
                                description: apiErrorMessage(err),
                                variant: "destructive",
                              });
                            },
                          }
                        )
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
                  <SelectTrigger className="flex-1" aria-label="Add a client to this person">
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
                      addClient.mutate(
                        { personId: person.id, clientId: selectedClientId },
                        {
                          onSuccess: () => toast({ title: "Client added" }),
                          onError: (err) => {
                            toast({
                              title: "Couldn't add client",
                              description: apiErrorMessage(err),
                              variant: "destructive",
                            });
                          },
                        }
                      );
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
