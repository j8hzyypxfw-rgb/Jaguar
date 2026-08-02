-- 011_budget_summary_fields.sql
--
-- Fields the Budget Summary document needs that had nowhere to live.
--
-- inefficiency_pct — the Excel's INEF named cell ('Project Info'!G33), a cost-multiplier
--   condition sitting beside MAN/HRS. Inefficiency hours = man-hours * this, priced at
--   the straight labor rate and marked up like every other column, which is why it lands
--   as its own additive bucket rather than being folded into labor.
--
--   DEFAULT 0 on purpose. A nonzero default would silently reprice every existing
--   project the moment this migration ran. Set it per job (0.47 on the AWS/DFW100 job).
--
-- ot_labor_rate — the Excel's OTLR ('Project Info'!D18). It is a separate input, NOT
--   labor_rate * 1.5; on the reference job it happens to equal labor_rate at 72.50.
--   NULL means "same as labor_rate" (base_labor * ti_factor).
--
-- The rest are header/footer text for the printed document.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS inefficiency_pct numeric(6,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_labor_rate    numeric(8,4),
  ADD COLUMN IF NOT EXISTS address          text,
  ADD COLUMN IF NOT EXISTS job_number       text,
  ADD COLUMN IF NOT EXISTS square_feet      numeric(12,2),
  ADD COLUMN IF NOT EXISTS drawings_label   text,
  ADD COLUMN IF NOT EXISTS clarifications   text;
