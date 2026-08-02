-- 009_section_kind.sql
--
-- Sections get a stable `kind` slug. Behavior (the Lighting fixture-schedule
-- integration and its Type column) keyed off `sections.name`, which meant renaming
-- a section silently changed what it could do. `kind` is the thing behavior reads;
-- `name` becomes a pure display label.
--
-- Nullable on purpose: user-invented sections have no kind and get generic behavior.
-- No CHECK constraint — the vocabulary lives in src/lib/sectionKinds.ts so a new
-- kind doesn't need a migration.

ALTER TABLE sections ADD COLUMN IF NOT EXISTS kind text;

-- Backfill existing rows from the seeded default names.
UPDATE sections
SET kind = CASE lower(trim(name))
  WHEN 'lighting'          THEN 'lighting'
  WHEN 'lighting control'  THEN 'lighting_control'
  WHEN 'lighting controls' THEN 'lighting_control'
  WHEN 'branch power'      THEN 'branch_power'
  WHEN 'hvac'              THEN 'hvac'
  WHEN 'equipment'         THEN 'equipment'
  WHEN 'primary'           THEN 'primary'
  WHEN 'distribution'      THEN 'distribution'
  WHEN 'em distribution'   THEN 'em_distribution'
  WHEN 'tele/data'         THEN 'tele_data'
  WHEN 'fire alarm'        THEN 'fire_alarm'
  WHEN 'audio/visual'      THEN 'audio_visual'
  WHEN 'security'          THEN 'security'
  WHEN 'grounding'         THEN 'grounding'
  WHEN 'temporary power'   THEN 'temp_power'
  ELSE NULL
END
WHERE kind IS NULL;

CREATE INDEX IF NOT EXISTS sections_kind_idx ON sections (kind);
