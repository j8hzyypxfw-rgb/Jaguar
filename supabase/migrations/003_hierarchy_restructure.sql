-- ============================================================
-- Migration 003: Phase → Area → Section → Subsection hierarchy
-- ============================================================
-- New hierarchy: Phase → Area → Section → (Subsection via typical_name)
-- Areas now belong to Phases (structural containers, not qty dimensions)
-- Sections now belong to Areas
-- line_item_quantities is no longer used; total_qty is direct on line_items

-- Add phase_id to areas (areas become per-phase structural containers)
ALTER TABLE areas ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES phases(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS areas_phase_idx ON areas (phase_id);

-- Add area_id to sections (sections now live under areas)
-- Keep phase_id on sections for rollup compat (set both when inserting new sections)
ALTER TABLE sections ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES areas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS sections_area_idx ON sections (area_id);

-- Add rollup columns to areas (aggregate of all sections below)
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_equipment  numeric(14,2) default 0;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_excavation numeric(14,2) default 0;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_subs       numeric(14,2) default 0;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_material   numeric(14,2) default 0;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_mhrs       numeric(10,2) default 0;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS total_installed  numeric(14,2) default 0;
