-- ============================================================
-- Migration 008: Man hours on fixture schedule
-- ============================================================
-- Track per-fixture install labor on each fixture schedule row so it
-- flows through to estimate line items when added via "From Fixture
-- Schedule." Default 0.5 hrs is a reasonable lighting starting point.

ALTER TABLE fixture_schedules
  ADD COLUMN IF NOT EXISTS man_hours numeric(10,6) DEFAULT 0;
