import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PEOPLE_TYPES } from "@/lib/peopleTypes";
import type { PeopleType } from "@/types";

// Plural phrasing is specific to this tab UI; the underlying 5 values come
// from the shared PEOPLE_TYPES constant (also used by PersonFormDialog's
// type select) rather than being hardcoded here too.
const TAB_LABELS: Record<PeopleType, string> = {
  internal_engineer: "Internal engineers",
  vendor: "Vendors",
  client_contact: "Client contacts",
  project_owner: "Project owners",
  approver: "Approvers",
};

const TYPES: { value: PeopleType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...PEOPLE_TYPES.map((type) => ({ value: type, label: TAB_LABELS[type] })),
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
