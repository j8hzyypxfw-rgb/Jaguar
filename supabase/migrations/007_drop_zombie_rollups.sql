-- ============================================================
-- Migration 007: Drop zombie rollup columns
-- ============================================================
-- Phases, areas, and sections each had cached total_* columns
-- intended to mirror sums of their child line_items. Nothing in the
-- application ever wrote to them, so they were always zero.
--
-- We now compute these totals on the fly from line_items when needed
-- (see PhaseSummaryClient.tsx). Estimate-level totals are still cached
-- (maintained by rollupEstimate), and line_items.total_* are still
-- cached (maintained on qty change).

-- Phases
ALTER TABLE phases DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE phases DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE phases DROP COLUMN IF EXISTS total_subs;
ALTER TABLE phases DROP COLUMN IF EXISTS total_material;
ALTER TABLE phases DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE phases DROP COLUMN IF EXISTS total_installed;

-- Areas (these were added in migration 003)
ALTER TABLE areas DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE areas DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE areas DROP COLUMN IF EXISTS total_subs;
ALTER TABLE areas DROP COLUMN IF EXISTS total_material;
ALTER TABLE areas DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE areas DROP COLUMN IF EXISTS total_installed;

-- Sections
ALTER TABLE sections DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE sections DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE sections DROP COLUMN IF EXISTS total_subs;
ALTER TABLE sections DROP COLUMN IF EXISTS total_material;
ALTER TABLE sections DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE sections DROP COLUMN IF EXISTS total_installed;
