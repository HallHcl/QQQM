import type { PeopleType } from "@/types";

// The 5 real values (verified against the PEOPLE_TYPES const in
// backend/src/validators/people.validator.ts and the generated OpenAPI
// schema's PeopleType enum). Single source of truth — previously hardcoded
// independently in RoleFilterTabs.tsx, matching the same duplication pattern
// RESOURCE_TYPES fixed for Resources.
export const PEOPLE_TYPES: PeopleType[] = [
  "internal_engineer",
  "vendor",
  "client_contact",
  "project_owner",
  "approver",
];

export const PEOPLE_TYPE_LABELS: Record<PeopleType, string> = {
  internal_engineer: "Internal engineer",
  vendor: "Vendor",
  client_contact: "Client contact",
  project_owner: "Project owner",
  approver: "Approver",
};
