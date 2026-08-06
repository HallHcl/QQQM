import { useCredentialReferences } from "@/hooks/useCredentialReferences";

interface Props {
  serverId: string;
}

export default function CredentialRefList({ serverId }: Props) {
  const { data: references = [], isLoading } = useCredentialReferences(serverId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading credentials...</p>;
  }

  if (references.length === 0) {
    return <p className="text-xs text-muted-foreground">No credential references.</p>;
  }

  return (
    <ul className="space-y-2 border-t pt-3">
      {references.map((ref) => (
        <li key={ref.id} className="text-sm">
          <p className="font-medium">{ref.label}</p>
          <p className="text-xs text-muted-foreground">{ref.reference_location}</p>
          {ref.notes && <p className="text-xs text-muted-foreground">{ref.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
