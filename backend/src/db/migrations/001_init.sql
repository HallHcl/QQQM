CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TYPE entity_type_enum AS ENUM (
  'client','project','environment','server','credential_reference',
  'people','resource','resource_version','schedule','user'
);
CREATE TYPE activity_action_enum AS ENUM ('create','update','delete');
CREATE TYPE schedule_status_enum AS ENUM ('pending','in_progress','done','cancelled');
CREATE TYPE schedule_type_enum AS ENUM ('PM','MA','other');
CREATE TYPE people_type_enum AS ENUM ('internal_engineer','vendor','client_contact','project_owner','approver');
CREATE TYPE resource_type_enum AS ENUM ('runbook','sop','architecture','troubleshooting','faq','link','pdf');

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_clients_name_active ON clients (name) WHERE deleted_at IS NULL;

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_roles_name_active ON roles (name) WHERE deleted_at IS NULL;

CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email CITEXT,
  phone TEXT,
  type people_type_enum NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_people_type ON people(type);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  people_id UUID REFERENCES people(id) ON DELETE SET NULL,
  username CITEXT NOT NULL,
  email CITEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_users_username_active ON users (username) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_email_active ON users (email) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_people_id ON users (people_id) WHERE deleted_at IS NULL AND people_id IS NOT NULL;

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

CREATE TABLE people_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  people_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relationship_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(people_id, client_id)
);
CREATE INDEX idx_people_clients_people ON people_clients(people_id);
CREATE INDEX idx_people_clients_client ON people_clients(client_id);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  owner_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE UNIQUE INDEX uq_projects_client_name_active ON projects (client_id, name) WHERE deleted_at IS NULL;

CREATE TABLE project_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  people_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role_in_project TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, people_id, role_in_project)
);
CREATE INDEX idx_project_people_project ON project_people(project_id);
CREATE INDEX idx_project_people_people ON project_people(people_id);

CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_environments_project ON environments(project_id);

CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  ip_address INET,
  tech_stack JSONB NOT NULL DEFAULT '[]',
  monitoring_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_servers_environment ON servers(environment_id);
CREATE INDEX idx_servers_ip ON servers(ip_address);

CREATE TABLE credential_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  reference_location TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credential_references_server ON credential_references(server_id);

CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type resource_type_enum NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_resources_project ON resources(project_id);
CREATE INDEX idx_resources_type ON resources(type);

CREATE TABLE resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content TEXT,
  content_hash TEXT NOT NULL,
  external_url TEXT,
  file_path TEXT,
  commit_message TEXT,
  author_id UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_id, version_number)
);
CREATE INDEX idx_resource_versions_resource ON resource_versions(resource_id, created_at);
CREATE INDEX idx_resource_versions_content_gin ON resource_versions USING GIN (to_tsvector('english', coalesce(content,'')));

ALTER TABLE resources
  ADD CONSTRAINT fk_resources_current_version
  FOREIGN KEY (current_version_id) REFERENCES resource_versions(id) ON DELETE SET NULL;

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type schedule_type_enum NOT NULL,
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  status schedule_status_enum NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_schedules_date ON schedules(scheduled_date);
CREATE INDEX idx_schedules_assigned ON schedules(assigned_to);
CREATE INDEX idx_schedules_project ON schedules(project_id);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type_enum NOT NULL,
  entity_id UUID NOT NULL,
  action activity_action_enum NOT NULL,
  changed_by UUID NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);

CREATE OR REPLACE FUNCTION prevent_activity_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_logs_block_update
  BEFORE UPDATE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_log_mutation();

CREATE TRIGGER trg_activity_logs_block_delete
  BEFORE DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_log_mutation();
