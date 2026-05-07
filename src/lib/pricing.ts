/**
 * Jaguar — Pricing Engine
 *
 * Mirrors Ron's Excel formula exactly:
 * TOTAL = ((Material×Tax + Equipment + Sub + Mhrs×LaborRate + OTHrs×OTRate)
 *          × (JOB_EXP + JECOW) × (1+OH) × (1+PROFIT))
 *
 * All costs are per-unit; multiply by qty to get totals.
 */

import type { PricingConfig } from "@/types";

export function getLaborRate(config: PricingConfig): number {
  return config.base_labor * config.ti_factor;
}

export function getFormanRate(config: PricingConfig): number {
  return config.foreman_base * config.foreman_ti;
}

export interface UnitCosts {
  equipment: number;
  excavation: number;
  sub: number;
  material: number;
  mhrs: number;
  ot_hrs?: number;
}

/**
 * Compute the fully-loaded installed unit price.
 * This is what appears in the "Unit Installed" column.
 */
export function calcUnitInstalled(costs: UnitCosts, config: PricingConfig): number {
  const laborRate = getLaborRate(config);
  const otRate = laborRate * 1.5; // OT = time-and-a-half

  const directCost =
    costs.material * config.tax_rate * config.materials_mult +
    costs.equipment * config.equipment_mult +
    costs.sub +
    costs.mhrs * config.mhrs_mult * laborRate +
    (costs.ot_hrs ?? 0) * otRate;

  const totalJobExp = 1 + config.job_exp_pct + config.job_exp_cow_pct;

  return (
    directCost * totalJobExp * (1 + config.overhead_pct) * (1 + config.profit_pct) +
    costs.sub * config.sub_markup_pct
  );
}

/**
 * Compute line item totals given quantity and unit costs.
 */
export function calcLineItemTotals(
  qty: number,
  costs: UnitCosts,
  config: PricingConfig
) {
  return {
    total_equipment:  qty * costs.equipment * config.equipment_mult,
    total_excavation: qty * costs.excavation * config.excavation_mult,
    total_sub:        qty * costs.sub,
    total_material:   qty * costs.material * config.materials_mult,
    total_mhrs:       qty * costs.mhrs * config.mhrs_mult,
    total_installed:  qty * calcUnitInstalled(costs, config),
  };
}

/**
 * Compute bond premium using Ron's tiered structure.
 */
export interface BondRates {
  bond_rate_tier1: number;
  bond_rate_tier2: number;
  bond_rate_tier3: number;
  bond_rate_tier4: number;
  bond_rate_tier5: number;
  bond_rate_tier6: number;
}

export function calcBondPremium(bidAmount: number, rates: BondRates): number {
  const tiers = [
    { max: 100_000,    rate: rates.bond_rate_tier1 },
    { max: 500_000,    rate: rates.bond_rate_tier2 },
    { max: 2_500_000,  rate: rates.bond_rate_tier3 },
    { max: 5_000_000,  rate: rates.bond_rate_tier4 },
    { max: 7_500_000,  rate: rates.bond_rate_tier5 },
    { max: Infinity,   rate: rates.bond_rate_tier6 },
  ];

  let remaining = bidAmount;
  let premium = 0;
  let prev = 0;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, tier.max - prev);
    premium += taxable * tier.rate;
    remaining -= taxable;
    prev = tier.max;
  }

  return premium;
}

/**
 * Build the full bid summary from direct costs + overhead items.
 */
export function calcBidSummary(params: {
  directEquipment: number;
  directExcavation: number;
  directSubs: number;
  directMaterial: number;
  directMhrs: number;
  directOtHrs: number;
  indirectLabor: number;
  genExp: number;
  rental: number;
  config: PricingConfig & {
    bond_rate_tier1: number;
    bond_rate_tier2: number;
    bond_rate_tier3: number;
    bond_rate_tier4: number;
    bond_rate_tier5: number;
    bond_rate_tier6: number;
  };
}) {
  const {
    directEquipment, directExcavation, directSubs,
    directMaterial, directMhrs, directOtHrs,
    indirectLabor, genExp, rental, config,
  } = params;

  const laborRate = getLaborRate(config);
  const otRate = laborRate * 1.5;

  const directCost =
    directMaterial * config.tax_rate * config.materials_mult +
    directEquipment * config.equipment_mult +
    directSubs +
    directMhrs * config.mhrs_mult * laborRate +
    directOtHrs * otRate +
    indirectLabor + genExp + rental;

  const jobExpense    = directCost * config.job_exp_pct;
  const jobExpCow     = directCost * config.job_exp_cow_pct;
  const directJobCost = directCost + jobExpense + jobExpCow;

  const overhead  = directJobCost * config.overhead_pct;
  const profit    = (directJobCost + overhead) * config.profit_pct;
  const preBond   = directJobCost + overhead + profit;
  const salesTax  = directMaterial * config.materials_mult * config.sales_tax_rate;
  const bond      = calcBondPremium(preBond, config);
  const totalBid  = preBond + salesTax + bond;

  return {
    equipment:      directEquipment,
    excavation:     directExcavation,
    subs:           directSubs,
    material:       directMaterial,
    mhrs:           directMhrs,
    ot_hrs:         directOtHrs,
    direct_cost:    directCost,
    indirect_labor: indirectLabor,
    gen_exp:        genExp,
    rental,
    job_expense:    jobExpense,
    job_exp_cow:    jobExpCow,
    direct_job_cost: directJobCost,
    overhead,
    profit,
    sales_tax:      salesTax,
    bond_premium:   bond,
    total_bid:      totalBid,
  };
}

export function defaultPricingConfig(): PricingConfig {
  return {
    base_labor:      45.00,
    ti_factor:       1.45,
    labor_rate:      65.25,
    foreman_base:    57.00,
    foreman_ti:      1.45,
    foreman_rate:    82.65,
    tax_rate:        1.0825,
    rental_tax_rate: 1.0825,
    job_exp_pct:     0.25,
    job_exp_cow_pct: 0.10,
    overhead_pct:    0.00,
    profit_pct:      0.15,
    sub_markup_pct:  0.00,
    equipment_mult:  1.00,
    materials_mult:  1.00,
    mhrs_mult:       1.10,
    excavation_mult: 5.00,
    hours_per_week:  40,
    sales_tax_rate:  0.0825,
  };
}

export function projectToPricingConfig(project: {
  base_labor: number; ti_factor: number;
  foreman_base: number; foreman_ti: number;
  tax_rate: number; rental_tax_rate: number;
  job_exp_pct: number; job_exp_cow_pct: number;
  overhead_pct: number; profit_pct: number;
  sub_markup_pct: number; equipment_mult: number;
  materials_mult: number; mhrs_mult: number;
  excavation_mult: number; hours_per_week: number;
  sales_tax_rate: number;
}): PricingConfig {
  return {
    ...project,
    labor_rate:   project.base_labor * project.ti_factor,
    foreman_rate: project.foreman_base * project.foreman_ti,
  };
}
