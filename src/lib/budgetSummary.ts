/**
 * Jaguar — Budget Summary (phase-by-phase bid document)
 *
 * Mirrors the "Summary" sheet of Ron's workbook, which is built on top of "Est Cost".
 *
 * Est Cost holds RAW cost per phase — equipment, excavation, subs, material as dollars,
 * and man-hours / OT hours / inefficiency hours as hours. The Summary sheet then applies
 * one identical markup chain to every column:
 *
 *     CHAIN = (JOB_EXP + JECOW) x (1 + OH) x (1 + PROFIT)
 *
 * In the workbook JOB_EXP is stored as a 1+x figure (1.1238), which is why the formula
 * has no leading 1. Jaguar stores the same thing as job_exp_pct (0.1238), so here it is
 * written the conventional way: (1 + job_exp_pct + job_exp_cow_pct).
 *
 * This works because Jaguar's line-item totals are already raw: calcLineItemTotals gives
 * total_equipment / total_material / total_mhrs with only the cost multipliers applied.
 * total_installed is the only figure carrying the markup chain, and it is deliberately
 * NOT used here — the seven columns must stay non-overlapping so they sum to the bid.
 *
 * Verified against the reference job (DFW100 / MM26-0199) to within rounding on every
 * column, the sales tax row, and the bond premium.
 */

import { calcBondPremium, getLaborRate, type BondRates } from "@/lib/pricing";
import type { PricingConfig } from "@/types";

/** Raw (pre-markup) totals for one phase, summed from its line items. */
export interface RawPhaseTotals {
  id: string;
  name: string;
  equipment: number;
  excavation: number;
  subs: number;
  material: number;
  mhrs: number;
}

export interface BudgetPhaseRow {
  id: string;
  name: string;
  equipment: number;
  excavation: number;
  subs: number;
  material: number;
  labor: number;
  otLabor: number;
  inefficiency: number;
  total: number;
  /** Hours behind the dollar columns, for the header metrics. */
  hours: { mhrs: number; inefficiency: number; ot: number };
}

export interface BudgetColumns {
  equipment: number;
  excavation: number;
  subs: number;
  material: number;
  labor: number;
  otLabor: number;
  inefficiency: number;
  total: number;
}

export interface BudgetSummaryResult {
  phases: BudgetPhaseRow[];
  /** Sales tax lands in the Equip and Matl columns only — subs and labor aren't taxed. */
  salesTax: { equipment: number; material: number; total: number };
  baseBid: BudgetColumns;
  bondPremium: number;
  baseBidWithBond: number;
  metrics: {
    /** Man-hours + inefficiency hours. The workbook's "Total Productive Mhrs" (=M31+K31). */
    productiveMhrs: number;
    indirectSupvHrs: number;
    otHours: number;
    durationWeeks: number;
    durationMonths: number;
    hoursPerWeek: number;
    manload: number;
  };
  /** Exposed so the page can show what drove the numbers. */
  rates: { chain: number; laborRate: number; otLaborRate: number; otPortion: number };
}

export interface BudgetSummaryInput {
  phases: RawPhaseTotals[];
  /** Estimate-level costs that are taxable but don't belong to a phase. */
  genExp: number;
  rental: number;
  /** Indirect labor & supervision hours, shown in the header block. */
  indirectSupvHrs: number;
  startDate: string | null;
  completionDate: string | null;
  inefficiencyPct: number;
  otLaborRate: number | null;
  config: PricingConfig & BondRates;
}

/** The markup every Summary column is multiplied by. */
export function markupChain(config: PricingConfig): number {
  return (
    (1 + config.job_exp_pct + config.job_exp_cow_pct) *
    (1 + config.overhead_pct) *
    (1 + config.profit_pct)
  );
}

/**
 * Fraction of hours worked as overtime, from the scheduled work week.
 * A 58-hour week is 18 hours over straight time — 31.03%, which is the workbook's OTP.
 * Returns 0 for a normal 40-hour week.
 */
export function overtimePortion(hoursPerWeek: number): number {
  if (!hoursPerWeek || hoursPerWeek <= 40) return 0;
  return (hoursPerWeek - 40) / hoursPerWeek;
}

function emptyColumns(): BudgetColumns {
  return {
    equipment: 0, excavation: 0, subs: 0, material: 0,
    labor: 0, otLabor: 0, inefficiency: 0, total: 0,
  };
}

export function calcBudgetSummary(input: BudgetSummaryInput): BudgetSummaryResult {
  const { config } = input;
  const chain = markupChain(config);
  const laborRate = getLaborRate(config);
  const otLaborRate = input.otLaborRate ?? laborRate;
  const otPortion = overtimePortion(config.hours_per_week);

  const phases: BudgetPhaseRow[] = input.phases.map((p) => {
    const ineffHrs = p.mhrs * input.inefficiencyPct;
    // OT runs on the inefficiency-inflated hours, matching the workbook: Phase 1's
    // (54,076.61 + 25,413.37) x 0.3103 = 24,671 against an actual 24,648.
    const otHrs = (p.mhrs + ineffHrs) * otPortion;

    const equipment    = p.equipment  * chain;
    const excavation   = p.excavation * chain;
    const subs         = p.subs       * chain;
    const material     = p.material   * chain;
    const labor        = p.mhrs     * laborRate   * chain;
    const otLabor      = otHrs      * otLaborRate * chain;
    const inefficiency = ineffHrs   * laborRate   * chain;

    return {
      id: p.id,
      name: p.name,
      equipment, excavation, subs, material, labor, otLabor, inefficiency,
      total: equipment + excavation + subs + material + labor + otLabor + inefficiency,
      hours: { mhrs: p.mhrs, inefficiency: ineffHrs, ot: otHrs },
    };
  });

  // Sales tax is charged on RAW cost, not on the marked-up columns, and only on
  // equipment, material, rental and general expenses — never subs or labor.
  // Rental tax is folded into the material column, which is where the workbook puts it.
  const rawEquipment = input.phases.reduce((s, p) => s + p.equipment, 0);
  const rawMaterial  = input.phases.reduce((s, p) => s + p.material, 0);
  const taxEquipment = rawEquipment * config.sales_tax_rate;
  const taxMaterial  = (rawMaterial + input.genExp + input.rental) * config.sales_tax_rate;

  const salesTax = {
    equipment: taxEquipment,
    material:  taxMaterial,
    total:     taxEquipment + taxMaterial,
  };

  const baseBid = phases.reduce<BudgetColumns>((acc, p) => ({
    equipment:    acc.equipment    + p.equipment,
    excavation:   acc.excavation   + p.excavation,
    subs:         acc.subs         + p.subs,
    material:     acc.material     + p.material,
    labor:        acc.labor        + p.labor,
    otLabor:      acc.otLabor      + p.otLabor,
    inefficiency: acc.inefficiency + p.inefficiency,
    total:        acc.total        + p.total,
  }), emptyColumns());

  baseBid.equipment += salesTax.equipment;
  baseBid.material  += salesTax.material;
  baseBid.total     += salesTax.total;

  const bondPremium = calcBondPremium(baseBid.total, config);

  const totalMhrs = input.phases.reduce((s, p) => s + p.mhrs, 0);
  const totalIneff = phases.reduce((s, p) => s + p.hours.inefficiency, 0);
  const otHours = phases.reduce((s, p) => s + p.hours.ot, 0);
  const productiveMhrs = totalMhrs + totalIneff;

  const durationWeeks = weeksBetween(input.startDate, input.completionDate);
  const durationMonths = monthsBetween(input.startDate, input.completionDate);
  const hoursPerWeek = config.hours_per_week;
  const manload =
    durationWeeks > 0 && hoursPerWeek > 0
      ? productiveMhrs / durationWeeks / hoursPerWeek
      : 0;

  return {
    phases,
    salesTax,
    baseBid,
    bondPremium,
    baseBidWithBond: baseBid.total + bondPremium,
    metrics: {
      productiveMhrs,
      indirectSupvHrs: input.indirectSupvHrs,
      otHours,
      durationWeeks,
      durationMonths,
      hoursPerWeek,
      manload,
    },
    rates: { chain, laborRate, otLaborRate, otPortion },
  };
}

function daysBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return (b - a) / 86_400_000;
}

export function weeksBetween(start: string | null, end: string | null): number {
  return Math.round((daysBetween(start, end) / 7) * 10) / 10;
}

export function monthsBetween(start: string | null, end: string | null): number {
  // 30.4166 days/month is the workbook's divisor
  return Math.round((daysBetween(start, end) / 30.4166) * 10) / 10;
}
