ALTER TABLE environments ADD COLUMN updated_at TIMESTAMPTZ;
UPDATE environments SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE environments ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE environments ALTER COLUMN updated_at SET DEFAULT now();

-- Mirrors the (client_id, name) / (client_id, name) uniqueness pattern already
-- enforced for clients and projects: two active environments with the same name
-- under the same project (e.g. two "PROD" environments) would be a data-entry
-- error, not a legitimate case. Scoped to active rows so a soft-deleted
-- environment's name can be reused.
CREATE UNIQUE INDEX uq_environments_project_name_active
  ON environments (project_id, name)
  WHERE deleted_at IS NULL;
