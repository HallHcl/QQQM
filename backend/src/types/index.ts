export type EntityType =
  | "client"
  | "project"
  | "environment"
  | "server"
  | "credential_reference"
  | "people"
  | "resource"
  | "resource_version"
  | "schedule"
  | "user";

export type ActivityAction = "create" | "update" | "delete";

export type ScheduleStatus = "pending" | "in_progress" | "done" | "cancelled";

export type ScheduleType = "PM" | "MA" | "other";

export type PeopleType =
  | "internal_engineer"
  | "vendor"
  | "client_contact"
  | "project_owner"
  | "approver";

export type ResourceType =
  | "runbook"
  | "sop"
  | "architecture"
  | "troubleshooting"
  | "faq"
  | "link"
  | "pdf";

export interface Client {
  id: string;
  name: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Person {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: PeopleType;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface User {
  id: string;
  people_id: string | null;
  username: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface PeopleClient {
  id: string;
  people_id: string;
  client_id: string;
  relationship_type: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  owner_status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectPeople {
  id: string;
  project_id: string;
  people_id: string;
  role_in_project: string;
  created_at: string;
}

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Server {
  id: string;
  environment_id: string;
  hostname: string;
  ip_address: string | null;
  tech_stack: unknown[];
  monitoring_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CredentialReference {
  id: string;
  server_id: string;
  label: string;
  reference_location: string;
  notes: string | null;
  created_at: string;
}

export interface Resource {
  id: string;
  project_id: string | null;
  type: ResourceType;
  title: string;
  category: string | null;
  tags: unknown[];
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ResourceVersion {
  id: string;
  resource_id: string;
  version_number: number;
  content: string | null;
  content_hash: string;
  external_url: string | null;
  file_path: string | null;
  commit_message: string | null;
  author_id: string;
  created_at: string;
}

export interface Schedule {
  id: string;
  project_id: string | null;
  server_id: string | null;
  title: string;
  type: ScheduleType;
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string;
  status: ScheduleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ActivityLog {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  action: ActivityAction;
  changed_by: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface AuthenticatedUser {
  id: string;
  peopleId: string | null;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
