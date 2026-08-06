import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PeopleType } from "@/types";

const TYPES: { value: PeopleType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "internal_engineer", label: "Internal engineers" },
  { value: "vendor", label: "Vendors" },
  { value: "client_contact", label: "Client contacts" },
  { value: "project_owner", label: "Project owners" },
  { value: "approver", label: "Approvers" },
];

interface Props {
  value: string;
  onValueChange: (value: string) => void;
}

export default function RoleFilterTabs({ value, onValueChange }: Props) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList className="flex-wrap">
        {TYPES.map((type) => (
          <TabsTrigger key={type.value} value={type.value}>
            {type.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
