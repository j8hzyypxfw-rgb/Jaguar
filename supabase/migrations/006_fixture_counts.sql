-- ============================================================
-- Migration 006: Fixture Count Matrix
-- ============================================================
-- Stores per-area fixture counts for the lighting takeoff matrix.
-- Each row = how many of fixture type X are in area Y.
-- Drives ALA quote requests and feeds qty back into estimate line items.

CREATE TABLE fixture_counts (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references projects(id) on delete cascade,
  fixture_schedule_id  uuid not null references fixture_schedules(id) on delete cascade,
  area_id              uuid not null references areas(id) on delete cascade,
  qty                  integer not null default 0,
  line_item_id         uuid references line_items(id) on delete set null,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  UNIQUE(fixture_schedule_id, area_id)
);

CREATE INDEX fixture_counts_project_idx    ON fixture_counts (project_id);
CREATE INDEX fixture_counts_fixture_idx    ON fixture_counts (fixture_schedule_id);
CREATE INDEX fixture_counts_area_idx       ON fixture_counts (area_id);

-- RLS: open to authenticated (same pattern as fixture_schedules)
ALTER TABLE fixture_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixture_counts_all"
  ON fixture_counts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
