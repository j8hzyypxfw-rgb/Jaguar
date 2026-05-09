-- Enforce unique type_code per project on fixture_schedules
-- Blank/empty type codes are excluded from the constraint so unfilled rows don't conflict

ALTER TABLE fixture_schedules
  ADD CONSTRAINT fixture_schedules_project_type_unique
  UNIQUE (project_id, type_code);
