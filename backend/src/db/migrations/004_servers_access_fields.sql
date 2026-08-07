CREATE TYPE service_type_enum AS ENUM (
  'application','database','proxy','monitoring','repository',
  'metrics','jump_host','other'
);
CREATE TYPE access_method_enum AS ENUM ('ssh','rdp','telnet','web','other');

ALTER TABLE servers ADD COLUMN display_name TEXT;
UPDATE servers SET display_name = hostname WHERE display_name IS NULL;
ALTER TABLE servers ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE servers ADD COLUMN service_type service_type_enum;
ALTER TABLE servers ADD COLUMN access_method access_method_enum;
ALTER TABLE servers ADD COLUMN access_host TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN access_port INT;
ALTER TABLE servers ADD CONSTRAINT chk_servers_access_port
  CHECK (access_port IS NULL OR (access_port BETWEEN 1 AND 65535));
ALTER TABLE servers ADD COLUMN access_path TEXT;

-- monitoring_url (pre-existing) stays a separate, optional "monitoring dashboard
-- link" field, conceptually distinct from access_host/access_port/access_path
-- (the server's primary access method). A server's primary access might be SSH
-- while it also has an unrelated Grafana/monitoring URL — do not conflate them.
ALTER TABLE credential_references ADD COLUMN applies_to_access_method access_method_enum;
