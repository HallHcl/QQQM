import { useState } from "react";
import { RequireRole } from "@/components/auth/RequireRole";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/api/errors";
import { toast } from "@/hooks/use-toast";
import {
  useCredentialReferences,
  useDeleteCredentialReference,
  type CredentialReference,
} from "@/hooks/useCredentialReferences";
import CredentialReferenceFormDialog from "./CredentialReferenceFormDialog";

const ACCESS_METHOD_LABELS: Record<string, string> = {
  ssh: "SSH",
  rdp: "RDP",
  telnet: "Telnet",
  web: "Web",
  other: "Other",
};

interface Props {
  serverId: string;
  /**
   * When true, renders Add/Edit/Delete affordances (per-action RBAC-gated).
   * Defaults to false — the read-only rendering used by ServerCard.tsx on
   * InfrastructurePage/EnvironmentDetailPage, which are browse/overview
   * surfaces, not management surfaces. ServerDetailPage passes true.
   */
  manageable?: boolean;
}

export default function CredentialRefList({ serverId, manageable = false }: Props) {
  const { data: references = [], isLoading } = useCredentialReferences(serverId);
  const deleteCredentialReference = useDeleteCredentialReference();

  const [formOpen, setFormOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<CredentialReference | undefined>(undefined);
  const [deletingReference, setDeletingReference] = useState<CredentialReference | undefined>(undefined);

  function openCreateForm() {
    setEditingReference(undefined);
    setFormOpen(true);
  }

  function openEditForm(reference: CredentialReference) {
    setEditingReference(reference);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deletingReference) return;
    deleteCredentialReference.mutate(deletingReference.id, {
      onSuccess: () => toast({ title: "Credential reference deleted" }),
      onError: (err) => {
        toast({
          title: "Couldn't delete credential reference",
          description: apiErrorMessage(err),
          variant: "destructive",
        });
      },
    });
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading credentials...</p>;
  }

  return (
    <div className={manageable ? "space-y-3" : "space-y-2 border-t pt-3"}>
      {manageable && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {references.length} credential {references.length === 1 ? "reference" : "references"}
          </p>
          {/* Create is admin+member, same as Server create/update — verified
              against backend/src/routes/credentialReferences.routes.ts and
              the nested POST route on servers.routes.ts. */}
          <RequireRole roles={["admin", "member"]}>
            <Button size="sm" variant="secondary" onClick={openCreateForm}>
              Add credential reference
            </Button>
          </RequireRole>
        </div>
      )}

      {references.length === 0 ? (
        <p className="text-xs text-muted-foreground">No credential references.</p>
      ) : (
        <ul className={manageable ? "space-y-2" : "space-y-2"}>
          {references.map((ref) => (
            <li
              key={ref.id}
              className={manageable ? "rounded-md border border-border p-3 text-sm" : "text-sm"}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{ref.label}</p>
                  <p className="text-xs text-muted-foreground">{ref.reference_location}</p>
                  {ref.applies_to_access_method && (
                    <p className="text-xs text-muted-foreground">
                      Applies to: {ACCESS_METHOD_LABELS[ref.applies_to_access_method] ?? ref.applies_to_access_method}
                    </p>
                  )}
                  {ref.notes && <p className="text-xs text-muted-foreground">{ref.notes}</p>}
                  {manageable && (
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(ref.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {manageable && (
                  <div className="flex shrink-0 gap-1">
                    <RequireRole roles={["admin", "member"]}>
                      <Button variant="ghost" size="sm" onClick={() => openEditForm(ref)}>
                        Edit
                      </Button>
                    </RequireRole>
                    {/* Delete is admin-only — stricter than create/update,
                        verified against credentialReferences.routes.ts. */}
                    <RequireRole roles={["admin"]}>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingReference(ref)}>
                        Delete
                      </Button>
                    </RequireRole>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {manageable && (
        <>
          <CredentialReferenceFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            serverId={serverId}
            credentialReference={editingReference}
          />

          <ConfirmDialog
            open={Boolean(deletingReference)}
            onOpenChange={(open) => {
              if (!open) setDeletingReference(undefined);
            }}
            title="Delete this credential reference?"
            description={
              deletingReference
                ? `"${deletingReference.label}" will be permanently deleted immediately. This is not a soft delete — there is no restore for credential references, and this cannot be undone.`
                : ""
            }
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={confirmDelete}
          />
        </>
      )}
    </div>
  );
}
