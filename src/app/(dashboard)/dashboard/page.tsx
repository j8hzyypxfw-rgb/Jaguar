import Link from "next/link";
import { Plus, FolderOpen, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " hrs";
}
function gpmColor(pct: number) {
  if (pct >= 15) return "text-emerald-600";
  if (pct >= 10) return "text-amber-600";
  return "text-destructive";
}

const STATUS_CONFIG = {
  draft:     { label: "Draft",     dot: "bg-slate-400" },
  submitted: { label: "Submitted", dot: "bg-blue-500"  },
  awarded:   { label: "Awarded",   dot: "bg-emerald-500" },
  lost:      { label: "Lost",      dot: "bg-red-400"   },
} as const;

type EstRow = {
  project_id: string;
  total_bid: number;
  total_material: number;
  direct_cost: number;
  indirect_labor_cost: number;
  total_mhrs: number;
  profit_cost: number;
};

function MetricBar({ est, size = "sm" }: { est: EstRow | null; size?: "sm" | "lg" }) {
  if (!est || est.total_bid === 0) return null;
  const gpm = est.total_bid > 0 ? (est.profit_cost / est.total_bid) * 100 : 0;
  const valCls = size === "lg" ? "text-xl font-bold mt-1" : "text-sm font-semibold";
  const lblCls = "text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

  return (
    <div className="flex divide-x">
      {[
        { label: "Total Bid",      value: fmt(est.total_bid),             cls: "text-primary" },
        { label: "Material",       value: fmt(est.total_material),         cls: "" },
        { label: "Direct Costs",   value: fmt(est.direct_cost),            cls: "" },
        { label: "Indirect Costs", value: fmt(est.indirect_labor_cost),    cls: "" },
        { label: "Man Hours",      value: fmtHrs(est.total_mhrs),          cls: "" },
        { label: "Profit",         value: fmt(est.profit_cost),            cls: "" },
        { label: "GPM",            value: `${gpm.toFixed(1)}%`,            cls: gpmColor(gpm) },
      ].map(({ label, value, cls }) => (
        <div key={label} className={`flex-1 min-w-0 ${size === "lg" ? "px-5 py-4" : "px-3 py-2"}`}>
          <p className={lblCls}>{label}</p>
          <p className={`${valCls} ${cls} truncate`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, customer_name, status, bid_date, created_at")
    .order("bid_date", { ascending: false });

  const all = projects ?? [];
  const projectIds = all.map((p) => p.id);

  const { data: estimates } = projectIds.length > 0
    ? await supabase
        .from("estimates")
        .select("project_id, total_bid, total_material, direct_cost, indirect_labor_cost, total_mhrs, profit_cost")
        .in("project_id", projectIds)
        .order("version")
    : { data: [] };

  // First estimate per project (base estimate)
  const estByProject = (estimates ?? []).reduce((acc, e) => {
    if (!acc[e.project_id]) acc[e.project_id] = e as EstRow;
    return acc;
  }, {} as Record<string, EstRow>);

  // Aggregate across ALL projects
  const aggregate: EstRow = Object.values(estByProject).reduce(
    (sum, e) => ({
      project_id: "all",
      total_bid:           sum.total_bid           + (e.total_bid           ?? 0),
      total_material:      sum.total_material      + (e.total_material      ?? 0),
      direct_cost:         sum.direct_cost         + (e.direct_cost         ?? 0),
      indirect_labor_cost: sum.indirect_labor_cost + (e.indirect_labor_cost ?? 0),
      total_mhrs:          sum.total_mhrs          + (e.total_mhrs          ?? 0),
      profit_cost:         sum.profit_cost         + (e.profit_cost         ?? 0),
    }),
    { project_id: "all", total_bid: 0, total_material: 0, direct_cost: 0, indirect_labor_cost: 0, total_mhrs: 0, profit_cost: 0 }
  );

  // Status groups
  const groups = [
    { key: "submitted", label: "Submitted", projects: all.filter((p) => p.status === "submitted") },
    { key: "draft",     label: "Draft",     projects: all.filter((p) => p.status === "draft")     },
    { key: "awarded",   label: "Awarded",   projects: all.filter((p) => p.status === "awarded")   },
    { key: "lost",      label: "Lost",      projects: all.filter((p) => p.status === "lost")      },
  ].filter((g) => g.projects.length > 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {all.length} project{all.length !== 1 ? "s" : ""} · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link href="/projects/new" className={cn(buttonVariants())}>
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Link>
      </div>

      {/* Aggregate summary card */}
      {aggregate.total_bid > 0 && (
        <Card>
          <CardContent className="py-0">
            <MetricBar est={aggregate} size="lg" />
          </CardContent>
        </Card>
      )}

      {/* Project groups */}
      {all.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <FolderOpen className="w-14 h-14 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first project to start estimating.</p>
          <Link href="/projects/new" className={cn(buttonVariants())}>
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ key, label, projects: groupProjects }) => {
            const cfg = STATUS_CONFIG[key as keyof typeof STATUS_CONFIG];
            const groupTotal = groupProjects.reduce((s, p) => s + (estByProject[p.id]?.total_bid ?? 0), 0);

            return (
              <div key={key}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <span className="text-xs text-muted-foreground">({groupProjects.length})</span>
                  {groupTotal > 0 && (
                    <span className="ml-auto text-sm font-medium text-muted-foreground">{fmt(groupTotal)}</span>
                  )}
                </div>

                {/* Project rows */}
                <div className="grid gap-2">
                  {groupProjects.map((p) => {
                    const est = estByProject[p.id] ?? null;
                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="block rounded-lg border bg-card hover:bg-accent/20 transition-colors group"
                      >
                        {/* Top row: name + meta */}
                        <div className="flex items-center gap-3 px-4 pt-3 pb-1.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{p.name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {p.customer_name && <span>{p.customer_name}</span>}
                              {p.bid_date && (
                                <span>Bid {new Date(p.bid_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>

                        {/* Metrics bar */}
                        {est && est.total_bid > 0 && (
                          <div className="border-t mx-0 mt-1.5">
                            <MetricBar est={est} size="sm" />
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
