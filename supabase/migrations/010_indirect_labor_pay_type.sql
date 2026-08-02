-- 010_indirect_labor_pay_type.sql
--
-- Indirect labor rows get a pay type: salary | sub | hourly.
--
--   salary  — annualized. `annual_salary` is the yearly figure; cost prorates over the
--             weeks the role is on the job (annual / 52 * weeks * people). No OT:
--             salaried roles are exempt, so OT inputs are hidden for these rows.
--   sub     — subcontracted body, billed hourly. Same math as hourly; tracked
--             separately because it's a vendor cost, not payroll.
--   hourly  — own hourly employee.
--
-- sub and hourly both support OT: `ot_hours_per_wk` at `ot_multiplier` times the base
-- rate (1.5 by default).
--
-- No CHECK constraint on pay_type — the vocabulary lives in the client
-- (PAY_TYPES in IndirectLaborTable.tsx), same convention as sections.kind in 009.

ALTER TABLE indirect_labor
  ADD COLUMN IF NOT EXISTS pay_type        text          NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS annual_salary   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_hours_per_wk numeric(6,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_multiplier   numeric(5,3)  DEFAULT 1.5;

-- The old free-text "Type" column was being used for whatever the estimator typed.
-- Where that text already names a pay type, carry it over; everything else stays
-- 'hourly', which is what the client was inserting as its default anyway.
UPDATE indirect_labor
SET pay_type = CASE
  WHEN lower(trim(labor_type)) IN ('salary', 'salaried')             THEN 'salary'
  WHEN lower(trim(labor_type)) IN ('sub', 'subcontract', 'contract') THEN 'sub'
  ELSE 'hourly'
END
WHERE pay_type = 'hourly';

-- `labor_type` is left in place. It was documented as the role (foreman | super | pm)
-- and may still hold that; the UI now takes the role from `description` and no longer
-- surfaces it. Drop it in a later migration once the existing rows are confirmed dead.
