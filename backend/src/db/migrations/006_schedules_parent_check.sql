ALTER TABLE schedules ADD CONSTRAINT chk_schedules_has_parent
  CHECK (project_id IS NOT NULL OR server_id IS NOT NULL);
