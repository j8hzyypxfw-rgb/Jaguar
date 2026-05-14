-- Add lighting markup factor to projects
-- Default 1.2262 = 22.62% markup applied to fixture schedule equipment costs
-- when they flow into the estimate's material column

ALTER TABLE projects
  ADD COLUMN lighting_markup_factor NUMERIC(6,4) NOT NULL DEFAULT 1.2262;
