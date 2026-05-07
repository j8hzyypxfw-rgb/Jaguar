"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { calcBidSummary, projectToPricingConfig } from "@/lib/pricing";
import type { Project, Estimate, IndirectLabor, GeneralExpense, Rental } from "@/types";

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n) + " hrs";
}

function pct(n: number) {
  return (n * 100).toFixed(2) + "%";
}

// ── Row components ────────────────────────────────────────────────────────────
function SummaryRow({
  label,
  value,
  sub,
  indent,
  muted,
  large,
  primary,
  bold,
  separator,
}: {
  label: string;
  value: string | number;
  sub?: string;
  indent?: boolean;
  muted?: boolean;
  large?: boolean;
  primary?: boolean;
  bold?: boolean;
  separator?: boolean;
}) {
  const display = typeof value === "number" ? fmt(value) : value;
  return (
    <>
      {separator && <tr><td colSpan={3} className="py-0"><div className="border-t my-1" /></td></tr>}
      <tr
        className={cn(
          "transition-colors",
          muted ? "text-muted-foreground" : "",
          bold ? "font-semibold" : "",
          primary ? "text-primary" : ""
        )}
      >
        <td
          className={cn(
            "py-1.5 pr-3",
            indent ? "pl-8" : "pl-3",
            large ? "text-base" : "text-sm"
          )}
        >
          {label}
          {sub && (
            <span className="ml-2 text-xs text-muted-foreground">{sub}</span>
          )}
        </td>
        <td
          className={cn(
            "py-1.5 px-3 text-right tabular-nums",
            large ? "text-lg font-bold" : ""
          )}
        >
          {display}
        </td>
      </tr>
    </>
  );
}

// ── Main page (client component so Print button works) ────────────────────────
export default function BidSummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const supabase = createClient();

  const [project, setProject] = useState<Project | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [indirectLabor, setIndirectLabor] = useState<IndirectLabor[]>([]);
  const [genExpenses, setGenExpenses] = useState<GeneralExpense[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);

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
          supabase.from("indirect_labor").select("*").eq("estimate_id", est.id),
          supabase.from("general_expenses").select("*").eq("estimate_id", est.id),
          supabase.from("rentals").select("*").eq("estimate_id", est.id),
        ]);
        setIndirectLabor((il as IndirectLabor[]) ?? []);
        setGenExpenses((ge as GeneralExpense[]) ?? []);
        setRentals((ren as Rental[]) ?? []);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-sm text-muted-foreground">Loading bid summary…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-destructive">Project not found.</p>
      </div>
    );
  }

  // ── Compute summary ─────────────────────────────────────────────────────────
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

  const laborRate = project.base_labor * project.ti_factor;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header — no-print on controls */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link
          href={`/projects/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Bid Summary</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="no-print"
          onClick={() => window.print()}
        >
          <Printer className="w-4 h-4 mr-2" />
          Print
        </Button>
      </div>

      {/* Print header */}
      <div className="print-only mb-6">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-gray-600">Bid Summary · {new Date().toLocaleDateString()}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <colgroup>
              <col className="w-full" />
              <col className="w-44" />
            </colgroup>
            <tbody>
              {/* ── Section header: Direct Costs ─────────── */}
              <tr className="bg-muted/50 border-b">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Direct Costs
                </td>
              </tr>

              <SummaryRow label="Equipment"      value={summary.equipment}  indent />
              <SummaryRow label="Excavation"     value={summary.excavation} indent />
              <SummaryRow label="Subcontractors" value={summary.subs}       indent />
              <SummaryRow label="Material"       value={summary.material}   indent />
              <SummaryRow
                label="Man Hours"
                value={fmt(summary.mhrs * config.mhrs_mult * laborRate)}
                sub={`(${fmtHrs(summary.mhrs)} × ${pct(config.mhrs_mult)} × $${laborRate.toFixed(2)}/hr)`}
                indent
              />
              <SummaryRow
                label="OT Hours"
                value={fmt(summary.ot_hrs * laborRate * 1.5)}
                sub={`(${fmtHrs(summary.ot_hrs)} × $${(laborRate * 1.5).toFixed(2)}/hr)`}
                indent
              />

              {/* ── Section header: Indirect ─────────────── */}
              <tr className="bg-muted/50 border-b border-t">
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Indirect
                </td>
              </tr>

              <SummaryRow label="Indirect Labor"  value={summary.indirect_labor} indent />
              <SummaryRow label="General Expenses" value={summary.gen_exp}       indent />
              <SummaryRow label="Rental"           value={summary.rental}        indent />

              {/* Direct Cost subtotal */}
              <SummaryRow
                label="Direct Cost Subtotal"
                value={summary.direct_cost}
                bold
                separator
              />

              {/* Job Expense */}
              <SummaryRow
                label="Job Expense"
                value={summary.job_expense}
                sub={`(${pct(config.job_exp_pct)} of direct cost)`}
                indent
                separator
              />
              <SummaryRow
                label="Job Expense COW"
                value={summary.job_exp_cow}
                sub={`(${pct(config.job_exp_cow_pct)} of direct cost)`}
                indent
              />

              {/* Direct Job Cost */}
              <SummaryRow
                label="Direct Job Cost"
                value={summary.direct_job_cost}
                bold
                separator
              />

              {/* Overhead */}
              <SummaryRow
                label="Overhead"
                value={summary.overhead}
                sub={`(${pct(config.overhead_pct)})`}
                indent
                separator
              />

              {/* Profit */}
              <SummaryRow
                label="Profit"
                value={summary.profit}
                sub={`(${pct(config.profit_pct)})`}
                indent
              />

              {/* Pre-Bond Total */}
              <SummaryRow
                label="Pre-Bond Total"
                value={summary.direct_job_cost + summary.overhead + summary.profit}
                bold
                separator
              />

              {/* Sales Tax */}
              <SummaryRow
                label="Sales Tax"
                value={summary.sales_tax}
                sub={`(${pct(config.sales_tax_rate)} on material)`}
                indent
                separator
              />

              {/* Bond Premium */}
              <SummaryRow
                label="Bond Premium"
                value={summary.bond_premium}
                sub="(tiered)"
                indent
              />

              {/* TOTAL BID */}
              <tr className="bg-primary/5 border-t-2">
                <td className="px-3 py-4 text-base font-bold text-primary">
                  TOTAL BID
                </td>
                <td className="px-3 py-4 text-right tabular-nums text-xl font-bold text-primary">
                  {fmt(summary.total_bid)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Config reference — visible in screen only */}
      <div className="mt-6 text-xs text-muted-foreground space-y-0.5 no-print">
        <p className="font-medium text-foreground text-sm mb-1">Pricing Parameters</p>
        <p>Labor Rate: ${laborRate.toFixed(2)}/hr (${project.base_labor}/hr base × {project.ti_factor}× TI)</p>
        <p>Equipment ×{project.equipment_mult} · Materials ×{project.materials_mult} · Mhrs ×{project.mhrs_mult}</p>
        <p>Tax Rate: {pct(project.tax_rate - 1)} · Sales Tax: {pct(project.sales_tax_rate)}</p>
        {!estimate && (
          <p className="text-amber-600 mt-2">No estimate found — all direct costs show $0. Create an estimate to see real values.</p>
        )}
      </div>
    </div>
  );
}
