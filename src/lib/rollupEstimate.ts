import type { SupabaseClient } from "@supabase/supabase-js";
import { calcBidSummary } from "./pricing";

export async function rollupEstimate(
  supabase: SupabaseClient,
  estimateId: string
): Promise<void> {
  // Get project config from the estimate
  const { data: est } = await supabase
    .from("estimates")
    .select("project_id")
    .eq("id", estimateId)
    .single();
  if (!est) return;

  const { data: project } = await supabase
    .from("projects")
    .select(
      "base_labor, ti_factor, foreman_base, foreman_ti, tax_rate, rental_tax_rate, " +
      "job_exp_pct, job_exp_cow_pct, overhead_pct, profit_pct, sub_markup_pct, " +
      "equipment_mult, materials_mult, mhrs_mult, excavation_mult, hours_per_week, " +
      "sales_tax_rate, bond_rate_tier1, bond_rate_tier2, bond_rate_tier3, " +
      "bond_rate_tier4, bond_rate_tier5, bond_rate_tier6"
    )
    .eq("id", est.project_id)
    .single();
  if (!project) return;

  // ── Line item totals ────────────────────────────────────────────────────
  let totalEquipment = 0, totalExcavation = 0, totalSubs = 0;
  let totalMaterial = 0, totalMhrs = 0;

  const { data: phaseRows } = await supabase
    .from("phases").select("id").eq("estimate_id", estimateId);
  const phaseIds = (phaseRows ?? []).map((p: { id: string }) => p.id);

  if (phaseIds.length > 0) {
    const { data: sectionRows } = await supabase
      .from("sections").select("id").in("phase_id", phaseIds);
    const sectionIds = (sectionRows ?? []).map((s: { id: string }) => s.id);

    if (sectionIds.length > 0) {
      const { data: liRows } = await supabase
        .from("line_items")
        .select("total_equipment, total_excavation, total_sub, total_material, total_mhrs")
        .in("section_id", sectionIds);

      for (const li of (liRows ?? []) as Record<string, number>[]) {
        totalEquipment  += li.total_equipment  ?? 0;
        totalExcavation += li.total_excavation ?? 0;
        totalSubs       += li.total_sub        ?? 0;
        totalMaterial   += li.total_material   ?? 0;
        totalMhrs       += li.total_mhrs       ?? 0;
      }
    }
  }

  // ── Indirect labor total ────────────────────────────────────────────────
  const { data: ilRows } = await supabase
    .from("indirect_labor").select("total_cost").eq("estimate_id", estimateId);
  const indirectLabor = (ilRows ?? []).reduce(
    (s: number, r: { total_cost: number }) => s + (r.total_cost ?? 0), 0
  );

  // ── General expenses total ──────────────────────────────────────────────
  const { data: geRows } = await supabase
    .from("general_expenses").select("total_cost").eq("estimate_id", estimateId);
  const genExp = (geRows ?? []).reduce(
    (s: number, r: { total_cost: number }) => s + (r.total_cost ?? 0), 0
  );

  // ── Rental total ────────────────────────────────────────────────────────
  const { data: rnRows } = await supabase
    .from("rentals").select("total_cost").eq("estimate_id", estimateId);
  const rental = (rnRows ?? []).reduce(
    (s: number, r: { total_cost: number }) => s + (r.total_cost ?? 0), 0
  );

  // ── Compute full bid summary ────────────────────────────────────────────
  const p = project as unknown as Record<string, number>;
  const config = {
    base_labor:       p.base_labor,
    ti_factor:        p.ti_factor,
    labor_rate:       p.base_labor * p.ti_factor,
    foreman_base:     p.foreman_base,
    foreman_ti:       p.foreman_ti,
    foreman_rate:     p.foreman_base * p.foreman_ti,
    tax_rate:         p.tax_rate,
    rental_tax_rate:  p.rental_tax_rate,
    job_exp_pct:      p.job_exp_pct,
    job_exp_cow_pct:  p.job_exp_cow_pct,
    overhead_pct:     p.overhead_pct,
    profit_pct:       p.profit_pct,
    sub_markup_pct:   p.sub_markup_pct,
    equipment_mult:   p.equipment_mult,
    materials_mult:   p.materials_mult,
    mhrs_mult:        p.mhrs_mult,
    excavation_mult:  p.excavation_mult,
    hours_per_week:   p.hours_per_week,
    sales_tax_rate:   p.sales_tax_rate,
    bond_rate_tier1:  p.bond_rate_tier1 ?? 0.025,
    bond_rate_tier2:  p.bond_rate_tier2 ?? 0.015,
    bond_rate_tier3:  p.bond_rate_tier3 ?? 0.010,
    bond_rate_tier4:  p.bond_rate_tier4 ?? 0.0075,
    bond_rate_tier5:  p.bond_rate_tier5 ?? 0.0070,
    bond_rate_tier6:  p.bond_rate_tier6 ?? 0.0065,
  };

  const summary = calcBidSummary({
    directEquipment:  totalEquipment,
    directExcavation: totalExcavation,
    directSubs:       totalSubs,
    directMaterial:   totalMaterial,
    directMhrs:       totalMhrs,
    directOtHrs:      0,
    indirectLabor,
    genExp,
    rental,
    config,
  });

  await supabase.from("estimates").update({
    total_equipment:      totalEquipment,
    total_excavation:     totalExcavation,
    total_subs:           totalSubs,
    total_material:       totalMaterial,
    total_mhrs:           totalMhrs,
    indirect_labor_cost:  indirectLabor,
    gen_exp_cost:         genExp,
    rental_cost:          rental,
    direct_cost:          summary.direct_cost,
    job_expense_cost:     summary.job_expense,
    job_exp_cow_cost:     summary.job_exp_cow,
    overhead_cost:        summary.overhead,
    profit_cost:          summary.profit,
    sales_tax_amount:     summary.sales_tax,
    bond_premium:         summary.bond_premium,
    total_bid:            summary.total_bid,
  }).eq("id", estimateId);
}
