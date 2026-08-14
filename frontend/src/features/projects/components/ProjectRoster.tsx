import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/state/EmptyState";
import { LoadingState } from "@/components/state/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import { useClientPeople } from "@/hooks/useClients";
import {
  useAssignPersonToProject,
  useProjectPeople,
  useRemovePersonFromProject,
} from "@/hooks/useProjectPeople";

interface Props {
  projectId: string;
  clientId: string;
}

interface RemovalTarget {
  peopleId: string;
  name: string;
}

/**
 * Roster management for a project: who's assigned, with what role, plus
 * assign/remove controls. Assigning is scoped to people already linked to
 * the project's client (Project -> Client -> people_clients -> People) —
 * not every person in the system. The roster itself is never filtered by
 * that same client link: a person who was assigned and later unlinked from
 * the client still shows up here, since project_people is its own
 * historical record, not a live view over people_clients.
 */
export default function ProjectRoster({ projectId, clientId }: Props) {
  const { data: roster = [], isLoading: rosterLoading } = useProjectPeople(projectId);
  const { data: clientPeople = [] } = useClientPeople(clientId);
  const assignPerson = useAssignPersonToProject();
  const removePerson = useRemovePersonFromProject();

  const [selectedPersonId, setSelectedPersonId] = useState<string | undefined>(undefined);
  const [roleInProject, setRoleInProject] = useState("");
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget | undefined>(undefined);

  // Only offer people already linked to this project's client, and not
  // already on the roster (any existing role) — matches the real
  // relationship chain rather than every person in the system.
  const rosterPersonIds = new Set(roster.map((entry) => entry.person.id));
  const availablePeople = clientPeople.filter((person) => !rosterPersonIds.has(person.id));

  function handleAssign() {
    if (!selectedPersonId || !roleInProject.trim()) return;
    assignPerson.mutate(
      { projectId, peopleId: selectedPersonId, roleInProject: roleInProject.trim() },
      {
        onSuccess: () => {
          toast({ title: "Person assigned" });
          setSelectedPersonId(undefined);
          setRoleInProject("");
        },
        onError: (err) => {
          toast({
            title: "Couldn't assign person",
            description: apiErrorMessage(err),
            variant: "destructive",
          });
        },
      }
    );
  }

  function confirmRemove() {
    if (!removalTarget) return;
    removePerson.mutate(
      { projectId, peopleId: removalTarget.peopleId },
      {
        onSuccess: () => toast({ title: "Person removed from project" }),
        onError: (err) => {
          toast({
            title: "Couldn't remove person",
            description: apiErrorMessage(err),
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Team</h2>

      {rosterLoading ? (
        <LoadingState message="Loading team..." />
      ) : roster.length === 0 ? (
        <EmptyState title="No one assigned yet" message="Assign a person below to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roster.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.person.name}</TableCell>
                <TableCell className="text-muted-foreground">{entry.role_in_project}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRemovalTarget({ peopleId: entry.person.id, name: entry.person.name })
                    }
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="space-y-1">
          <Label htmlFor="roster-person" className="text-muted-foreground">
            Person
          </Label>
          <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
            <SelectTrigger id="roster-person" className="w-56">
              <SelectValue placeholder="Select a person" />
            </SelectTrigger>
            <SelectContent>
              {availablePeople.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="roster-role" className="text-muted-foreground">
            Role
          </Label>
          <Input
            id="roster-role"
            value={roleInProject}
            onChange={(e) => setRoleInProject(e.target.value)}
            placeholder="e.g. Lead engineer"
            className="w-48"
          />
        </div>

        <Button
          onClick={handleAssign}
          disabled={!selectedPersonId || !roleInProject.trim() || assignPerson.isPending}
        >
          {assignPerson.isPending ? "Assigning..." : "Assign"}
        </Button>
      </div>

      {availablePeople.length === 0 && clientPeople.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Everyone linked to this project's client is already on the team.
        </p>
      )}
      {clientPeople.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No people are linked to this project's client yet — link people to the client first.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(removalTarget)}
        onOpenChange={(open) => {
          if (!open) setRemovalTarget(undefined);
        }}
        title="Remove from project?"
        description={
          removalTarget
            ? `"${removalTarget.name}" will be unassigned from this project. This does not delete the person, only their assignment here — including their current role, which you'd need to re-enter if you reassign them later.`
            : ""
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={confirmRemove}
      />
    </div>
  );
}
