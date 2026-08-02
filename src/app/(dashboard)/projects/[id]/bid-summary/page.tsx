"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { calcBidSummary, projectToPricingConfig } from "@/lib/pricing";
import { calcBudgetSummary, type RawPhaseTotals } from "@/lib/budgetSummary";
import type { Project, Estimate, IndirectLabor, GeneralExpense, Rental } from "@/types";
import { DrilldownModal, type DrillType, type LineItemRow } from "./DrilldownModal";

// ── Formatting helpers ─────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
/** Bare number, no currency symbol — the document's money columns are unadorned. */
function num(n: number) {
  if (!n) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function num2(n: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n) + " hrs";
}
function pct(n: number) { return (n * 100).toFixed(2) + "%"; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Clickable summary row (detailed breakdown, screen only) ────────────────────
function SummaryRow({
  label, value, sub, indent, muted, large, primary, bold, separator, onClick,
}: {
  label: string; value: string | number; sub?: string;
  indent?: boolean; muted?: boolean; large?: boolean;
  primary?: boolean; bold?: boolean; separator?: boolean;
  onClick?: () => void;
}) {
  const display = typeof value === "number" ? fmt(value) : value;
  const clickable = !!onClick;
  return (
    <>
      {separator && <tr><td colSpan={3} className="py-0"><div className="border-t my-1" /></td></tr>}
      <tr
        onClick={onClick}
        className={cn(
          "transition-colors",
          muted ? "text-muted-foreground" : "",
          bold ? "font-semibold" : "",
          primary ? "text-primary" : "",
          clickable ? "cursor-pointer hover:bg-muted/40 group" : ""
        )}
      >
        <td className={cn("py-1.5 pr-3", indent ? "pl-8" : "pl-3", large ? "text-base" : "text-sm")}>
          <span className="inline-flex items-center gap-1">
            {label}
            {clickable && (
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
            )}
          </span>
          {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
        </td>
        <td className={cn("py-1.5 px-3 text-right tabular-nums", large ? "text-lg font-bold" : "")}>
          {display}
        </td>
      </tr>
    </>
  );
}

const MONEY_CELL = "px-2 py-1 text-right tabular-nums whitespace-nowrap";

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BidSummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const supabase = createClient();

  const [project, setProject] = useState<Project | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [indirectLabor, setIndirectLabor] = useState<IndirectLabor[]>([]);
  const [genExpenses, setGenExpenses] = useState<GeneralExpense[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [phaseTotals, setPhaseTotals] = useState<RawPhaseTotals[]>([]);
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState<{ type: DrillType; title: string; total: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      const [{ data: proj }, { data: ests }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).single(),
        supabase.from("estimates").select("*").eq("project_id", id).order("version").limit(1),
      ]);
      setProject(proj as Project | null);
      const est = ests?.[0] as Estimate | undefined ?? null;
      setEstimate(est);

      if (est?.id) {
        const [{ data: il }, { data: ge }, { data: ren }] = await Promise.all([
          supabase.from("indirect_labor").select("*").eq("estimate_id", est.id).order("sort_order"),
          supabase.from("general_expenses").select("*").eq("estimate_id", est.id).order("sort_order"),
          supabase.from("rentals").select("*").eq("estimate_id", est.id).order("sort_order"),
        ]);
        setIndirectLabor((il as IndirectLabor[]) ?? []);
        setGenExpenses((ge as GeneralExpense[]) ?? []);
        setRentals((ren as Rental[]) ?? []);

        const { data: phases } = await supabase
          .from("phases").select("id, name, sort_order").eq("estimate_id", est.id).order("sort_order");
        const phaseIds = (phases ?? []).map((p: { id: string }) => p.id);
        const phaseMap = Object.fromEntries((phases ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

        if (phaseIds.length > 0) {
          const { data: sections } = await supabase
            .from("sections").select("id, name, phase_id").in("phase_id", phaseIds);
          const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);
          const sectionMap = Object.fromEntries(
            (sections ?? []).map((s: { id: string; name: string; phase_id: string }) => [
              s.id, { name: s.name, phase_id: s.phase_id }
            ])
          );

          if (sectionIds.length > 0) {
            const { data: lis } = await supabase
              .from("line_items")
              .select(
                "id, description, code, total_qty, unit_of_measure, " +
                "unit_equipment, unit_excavation, unit_sub, unit_material, unit_mhrs, " +
                "total_equipment, total_excavation, total_sub, total_material, total_mhrs, " +
                "section_id"
              )
              .in("section_id", sectionIds);

            const rows: LineItemRow[] = (lis ?? []).map((li: unknown) => {
              const li2 = li as Record<string, unknown>;
              const sec = sectionMap[li2.section_id as string];
              return {
                ...li2,
                section_name: sec?.name ?? "",
                phase_name: phaseMap[sec?.phase_id ?? ""] ?? "",
              } as LineItemRow;
            });
            setLineItems(rows);

            // Raw per-phase totals for the budget matrix. Sections carry phase_id, so
            // this walks line item -> section -> phase. These are pre-markup figures;
            // the markup chain is applied per column in calcBudgetSummary.
            const byPhase = new Map<string, RawPhaseTotals>();
            for (const p of phases ?? []) {
              byPhase.set(p.id, {
                id: p.id, name: p.name,
                equipment: 0, excavation: 0, subs: 0, material: 0, mhrs: 0,
              });
            }
            for (const li of ((lis ?? []) as unknown as Record<string, number | string>[])) {
              const sec = sectionMap[li.section_id as string];
              const row = sec ? byPhase.get(sec.phase_id) : undefined;
              if (!row) continue;
              row.equipment  += (li.total_equipment  as number) ?? 0;
              row.excavation += (li.total_excavation as number) ?? 0;
              row.subs       += (li.total_sub        as number) ?? 0;
              row.material   += (li.total_material   as number) ?? 0;
              row.mhrs       += (li.total_mhrs       as number) ?? 0;
            }
            setPhaseTotals([...byPhase.values()]);
          }
        }
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openDrill = useCallback((type: DrillType, title: string, total: number) => {
    setDrilldown({ type, title, total });
  }, []);

  if (loading) {
    return <div className="p-6 max-w-3xl mx-auto text-sm text-muted-foreground">Loading bid summary…</div>;
  }
  if (!project) {
    return <div className="p-6 max-w-3xl mx-auto"><p className="text-sm text-destructive">Project not found.</p></div>;
  }

  const config = {
    ...projectToPricingConfig(project),
    bond_rate_tier1: project.bond_rate_tier1,
    bond_rate_tier2: project.bond_rate_tier2,
    bond_rate_tier3: project.bond_rate_tier3,
    bond_rate_tier4: project.bond_rate_tier4,
    bond_rate_tier5: project.bond_rate_tier5,
    bond_rate_tier6: project.bond_rate_tier6,
  };

  const est = estimate;
  const totalIndirectLabor = indirectLabor.reduce((s, r) => s + (r.total_cost ?? 0), 0);
  const totalGenExp = genExpenses.reduce((s, r) => s + (r.total_cost ?? 0), 0);
  const totalRental = rentals.reduce((s, r) => s + (r.total_cost ?? 0), 0);

  // Indirect & supervision hours — headcount x weekly hours (incl. OT) x weeks.
  const indirectSupvHrs = indirectLabor.reduce((s, r) => {
    const rec = r as unknown as Record<string, number | null>;
    const weekly = (rec.hours_per_wk ?? 0) + (rec.ot_hours_per_wk ?? 0);
    return s + weekly * (rec.weeks ?? 0) * (rec.people ?? 1);
  }, 0);

  const budget = calcBudgetSummary({
    phases: phaseTotals,
    genExp: totalGenExp,
    rental: totalRental,
    indirectSupvHrs,
    startDate: project.start_date,
    completionDate: project.completion_date,
    inefficiencyPct: project.inefficiency_pct ?? 0,
    otLaborRate: project.ot_labor_rate ?? null,
    config,
  });

  // Legacy waterfall — kept on screen below the document, hidden from print.
  const summary = calcBidSummary({
    directEquipment:  est?.total_equipment  ?? 0,
    directExcavation: est?.total_excavation ?? 0,
    directSubs:       est?.total_subs       ?? 0,
    directMaterial:   est?.total_material   ?? 0,
    directMhrs:       est?.total_mhrs       ?? 0,
    directOtHrs:      est?.total_ot_hrs     ?? 0,
    indirectLabor:    totalIndirectLabor,
    genExp:           totalGenExp,
    rental:           totalRental,
    config,
  });

  const laborRate = budget.rates.laborRate;
  const mhrsDollar = summary.mhrs * config.mhrs_mult * laborRate;
  const clarifications = (project.clarifications ?? "")
    .split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Screen-only chrome */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link href={`/projects/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Budget Summary</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" />Print
        </Button>
      </div>

      {/* ── The document ──────────────────────────────────────────────────── */}
      <div className="border rounded-lg p-6 bg-card text-[13px]">
        {/* Header block */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-8 gap-y-1 mb-6">
          <div className="space-y-0.5">
            <div className="font-bold text-base">{project.name}</div>
            {project.address && <div>{project.address}</div>}
            {project.drawings_label && <div>{project.drawings_label}</div>}
            <div className="pt-3 font-bold">{project.contractor_name ?? ""}</div>
            <div>Budget Summary</div>
          </div>

          <div className="space-y-0.5 text-right">
            <div className="text-muted-foreground">Start Date:</div>
            <div className="text-muted-foreground">Duration Months</div>
            <div className="text-muted-foreground">Total Productive Mhrs</div>
            <div className="text-muted-foreground">Total OT Hours</div>
            <div className="text-muted-foreground">Duration (Weeks)</div>
            <div className="text-muted-foreground">Hours per Week</div>
            <div className="text-muted-foreground">Manload</div>
          </div>

          <div className="space-y-0.5 text-right tabular-nums min-w-[13rem]">
            <div className="text-right">{new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</div>
            <div>{fmtDate(project.start_date)}</div>
            <div>{budget.metrics.durationMonths || "—"}</div>
            <div>
              {num2(budget.metrics.productiveMhrs)}
              {budget.metrics.indirectSupvHrs > 0 && (
                <span className="ml-3 text-muted-foreground">
                  {num2(budget.metrics.indirectSupvHrs)} Indirect &amp; Supv
                </span>
              )}
            </div>
            <div>{num2(budget.metrics.otHours)}</div>
            <div>{budget.metrics.durationWeeks || "—"}</div>
            <div>{budget.metrics.hoursPerWeek}</div>
            <div>{num2(budget.metrics.manload)}</div>
          </div>
        </div>

        {project.job_number && (
          <div className="text-right font-bold mb-4">
            MM JOB # <span className="ml-3">{project.job_number}</span>
          </div>
        )}

        {/* Phase matrix */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y-2">
                <th className="text-left px-2 py-2 font-medium">Description</th>
                <th className="text-right px-2 py-2 font-medium">sf</th>
                <th className="text-right px-2 py-2 font-medium">Quantity</th>
                <th className="text-left px-1 py-2 font-medium" />
                <th className="text-right px-2 py-2 font-medium">Equip</th>
                <th className="text-right px-2 py-2 font-medium">Excav</th>
                <th className="text-right px-2 py-2 font-medium">Subs</th>
                <th className="text-right px-2 py-2 font-medium">Matl</th>
                <th className="text-right px-2 py-2 font-medium">Labor $</th>
                <th className="text-right px-2 py-2 font-medium">OT Labor $</th>
                <th className="text-right px-2 py-2 font-medium">Ineffiency $</th>
                <th className="text-right px-2 py-2 font-medium">Totals</th>
              </tr>
            </thead>
            <tbody>
              {project.square_feet != null && (
                <tr>
                  <td />
                  <td className="px-2 py-1 text-right tabular-nums">{num(Number(project.square_feet))}</td>
                  <td colSpan={10} />
                </tr>
              )}

              {budget.phases.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-2 py-8 text-center text-muted-foreground">
                    No phases yet. Add phases in Takeoff &amp; Estimate.
                  </td>
                </tr>
              )}

              {budget.phases.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20">
                  <td className="px-2 py-1 whitespace-nowrap">{p.name}</td>
                  <td />
                  <td className="px-2 py-1 text-right tabular-nums">1</td>
                  <td className="px-1 py-1 text-muted-foreground">Lot</td>
                  <td className={MONEY_CELL}>{num(p.equipment)}</td>
                  <td className={MONEY_CELL}>{num(p.excavation)}</td>
                  <td className={MONEY_CELL}>{num(p.subs)}</td>
                  <td className={MONEY_CELL}>{num(p.material)}</td>
                  <td className={MONEY_CELL}>{num(p.labor)}</td>
                  <td className={MONEY_CELL}>{num(p.otLabor)}</td>
                  <td className={MONEY_CELL}>{num(p.inefficiency)}</td>
                  <td className={cn(MONEY_CELL, "font-medium")}>{num(p.total)}</td>
                </tr>
              ))}

              <tr><td colSpan={12} className="h-3" /></tr>

              {/* Sales tax — charged on raw cost, lands in Equip and Matl only */}
              <tr className="text-blue-700 dark:text-blue-400">
                <td className="px-2 py-1 whitespace-nowrap">Estimated Sales Tax</td>
                <td /><td /><td />
                <td className={MONEY_CELL}>{num(budget.salesTax.equipment)}</td>
                <td /><td />
                <td className={MONEY_CELL}>{num(budget.salesTax.material)}</td>
                <td /><td /><td />
                <td className={MONEY_CELL}>{num(budget.salesTax.total)}</td>
              </tr>

              <tr><td colSpan={12} className="h-3" /></tr>

              <tr className="border-y-2 font-semibold">
                <td className="px-2 py-2 whitespace-nowrap">Base Bid Totals</td>
                <td /><td /><td />
                <td className={MONEY_CELL}>{num(budget.baseBid.equipment)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.excavation)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.subs)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.material)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.labor)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.otLabor)}</td>
                <td className={MONEY_CELL}>{num(budget.baseBid.inefficiency)}</td>
                <td className={cn(MONEY_CELL, "text-base")}>{num(budget.baseBid.total)}</td>
              </tr>

              <tr><td colSpan={12} className="h-4" /></tr>

              <tr className="font-semibold">
                <td className="px-2 py-1 whitespace-nowrap">Base Bid&nbsp;&nbsp;&nbsp;w/Bond</td>
                <td colSpan={10} />
                <td className={cn(MONEY_CELL, "text-base")}>{num(budget.baseBidWithBond)}</td>
              </tr>
              <tr className="text-blue-700 dark:text-blue-400">
                <td className="px-2 py-1 pl-6 whitespace-nowrap">Bond Premiums Included</td>
                <td /><td />
                <td className="px-1 py-1 text-right tabular-nums whitespace-nowrap" colSpan={2}>
                  ${num2(budget.bondPremium)}
                </td>
                <td colSpan={7} />
              </tr>
            </tbody>
          </table>
        </div>

        {/* Regulatory footer */}
        <div className="mt-10 text-center text-xs text-muted-foreground leading-relaxed">
          “Regulated by The Texas Department of Licensing and Regulation,<br />
          P.O. Box 12157, Austin, Texas 78711, 1.800.803.9202.512.463.6599;<br />
          website: www.tdlr.texas.gov/complaints.”
        </div>

        {clarifications.length > 0 && (
          <div className="mt-8">
            <p className="font-medium underline mb-2">Clarifications &amp; Assumptions:</p>
            <ul className="space-y-1">
              {clarifications.map((line, i) => (
                <li key={i} className="leading-snug">{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Screen-only: how the columns were built ───────────────────────── */}
      <div className="mt-6 text-xs text-muted-foreground space-y-0.5 no-print">
        <p className="font-medium text-foreground text-sm mb-1">Column Math</p>
        <p>
          Every column ×{budget.rates.chain.toFixed(5)} = (1 + {pct(config.job_exp_pct)} job exp
          + {pct(config.job_exp_cow_pct)} COW) × (1 + {pct(config.overhead_pct)} OH)
          × (1 + {pct(config.profit_pct)} profit)
        </p>
        <p>
          Labor ${laborRate.toFixed(2)}/hr · OT ${budget.rates.otLaborRate.toFixed(2)}/hr ·
          Inefficiency {pct(project.inefficiency_pct ?? 0)} of man-hours ·
          OT {pct(budget.rates.otPortion)} of hours ({budget.metrics.hoursPerWeek} hr week)
        </p>
        <p>Sales tax {pct(config.sales_tax_rate)} on raw equipment, material, rental and general expenses — not on subs or labor.</p>
        {(project.inefficiency_pct ?? 0) === 0 && (
          <p className="text-amber-600">Inefficiency is 0% — set it in project settings to populate that column.</p>
        )}
        {!estimate && <p className="text-amber-600">No estimate found — all costs show zero.</p>}
      </div>

      {/* ── Screen-only: detailed waterfall with drilldowns ───────────────── */}
      <div className="mt-8 no-print">
        <h2 className="text-sm font-semibold mb-2">Cost Breakdown</h2>
        <div className="rounded-lg border">
          <table className="w-full">
            <colgroup><col className="w-full" /><col className="w-44" /></colgroup>
            <tbody>
              <tr className="bg-muted/50 border-b">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Direct Costs
                </td>
              </tr>
              <SummaryRow label="Equipment"      value={summary.equipment}  indent onClick={summary.equipment  ? () => openDrill("equipment",  "Equipment",      summary.equipment)  : undefined} />
              <SummaryRow label="Excavation"     value={summary.excavation} indent onClick={summary.excavation ? () => openDrill("excavation", "Excavation",     summary.excavation) : undefined} />
              <SummaryRow label="Subcontractors" value={summary.subs}       indent onClick={summary.subs       ? () => openDrill("subs",       "Subcontractors", summary.subs)       : undefined} />
              <SummaryRow label="Material"       value={summary.material}   indent onClick={summary.material   ? () => openDrill("material",   "Material",       summary.material)   : undefined} />
              <SummaryRow
                label="Man Hours"
                value={fmt(mhrsDollar)}
                sub={`(${fmtHrs(summary.mhrs)} × ${pct(config.mhrs_mult)} × $${laborRate.toFixed(2)}/hr)`}
                indent
                onClick={summary.mhrs ? () => openDrill("mhrs", "Man Hours", mhrsDollar) : undefined}
              />

              <tr className="bg-muted/50 border-b border-t">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Indirect
                </td>
              </tr>
              <SummaryRow label="Indirect Labor"   value={summary.indirect_labor} indent onClick={summary.indirect_labor ? () => openDrill("indirect", "Indirect Labor",    summary.indirect_labor) : undefined} />
              <SummaryRow label="General Expenses" value={summary.gen_exp}        indent onClick={summary.gen_exp        ? () => openDrill("genexp",   "General Expenses",  summary.gen_exp)        : undefined} />
              <SummaryRow label="Rental"           value={summary.rental}         indent onClick={summary.rental         ? () => openDrill("rental",   "Rental Equipment",  summary.rental)         : undefined} />

              <SummaryRow label="Direct Cost Subtotal" value={summary.direct_cost} bold separator />
              <SummaryRow label="Job Expense"     value={summary.job_expense} sub={`(${pct(config.job_exp_pct)} of direct cost)`}     indent separator />
              <SummaryRow label="Job Expense COW" value={summary.job_exp_cow} sub={`(${pct(config.job_exp_cow_pct)} of direct cost)`} indent />
              <SummaryRow label="Direct Job Cost" value={summary.direct_job_cost} bold separator />
              <SummaryRow label="Overhead"        value={summary.overhead}    sub={`(${pct(config.overhead_pct)})`}  indent separator />
              <SummaryRow label="Profit"          value={summary.profit}      sub={`(${pct(config.profit_pct)})`}   indent />
              <SummaryRow label="Sales Tax"       value={summary.sales_tax}   sub={`(${pct(config.sales_tax_rate)} on material)`} indent separator />
              <SummaryRow label="Bond Premium"    value={summary.bond_premium} sub="(tiered)" indent />
              <tr className="bg-primary/5 border-t-2">
                <td className="px-3 py-4 text-base font-bold text-primary">TOTAL BID</td>
                <td className="px-3 py-4 text-right tabular-nums text-xl font-bold text-primary">{fmt(summary.total_bid)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This waterfall prices man-hours through <code>total_installed</code> and does not
          carry inefficiency or OT hours, so it will not tie to the Base Bid above on a job
          that uses them. The document is the bid figure.
        </p>
      </div>

      {drilldown && (
        <DrilldownModal
          type={drilldown.type}
          title={drilldown.title}
          total={drilldown.total}
          lineItems={lineItems}
          indirectLabor={indirectLabor}
          genExpenses={genExpenses}
          rentals={rentals}
          laborRate={laborRate}
          mhrsMult={config.mhrs_mult}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
