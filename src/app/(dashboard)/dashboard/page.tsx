import Link from "next/link";
import { Plus, TrendingUp, Award, Clock, XCircle, ChevronRight, FolderOpen } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n) + " hrs";
}

const STATUS_CONFIG = {
  draft:     { label: "Draft",     color: "bg-slate-100 text-slate-700 border-slate-200",   dot: "bg-slate-400" },
  submitted: { label: "Submitted", color: "bg-blue-50 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  awarded:   { label: "Awarded",   color: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  lost:      { label: "Lost",      color: "bg-red-50 text-red-700 border-red-200",          dot: "bg-red-400" },
} as const;

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, customer_name, status, bid_date, created_at")
    .order("bid_date", { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id);

  // Fetch estimates for all projects in one query
  const { data: estimates } = projectIds.length > 0
    ? await supabase
        .from("estimates")
        .select("project_id, total_bid, direct_cost, total_mhrs, total_material")
        .in("project_id", projectIds)
        .order("version")
    : { data: [] };

  // Map estimate by project_id (first/base estimate per project)
  type EstRow = { project_id: string; total_bid: number; direct_cost: number; total_mhrs: number; total_material: number };
  const estByProject = (estimates ?? []).reduce((acc, e) => {
    if (!acc[e.project_id]) acc[e.project_id] = e as EstRow;
    return acc;
  }, {} as Record<string, EstRow>);

  // Rollup stats
  const all = projects ?? [];
  const active    = all.filter((p) => p.status === "draft" || p.status === "submitted");
  const awarded   = all.filter((p) => p.status === "awarded");
  const lost      = all.filter((p) => p.status === "lost");
  const submitted = all.filter((p) => p.status === "submitted");

  const pipeline      = active.reduce((s, p)   => s + ((estByProject[p.id] as any)?.total_bid ?? 0), 0);
  const awardedValue  = awarded.reduce((s, p)  => s + ((estByProject[p.id] as any)?.total_bid ?? 0), 0);
  const submittedVal  = submitted.reduce((s, p) => s + ((estByProject[p.id] as any)?.total_bid ?? 0), 0);
  const totalBid      = [...awarded, ...lost].length > 0
    ? Math.round((awarded.length / (awarded.length + lost.length)) * 100)
    : null;

  const summaryCards = [
    {
      label: "Active Pipeline",
      value: fmt(pipeline),
      sub: `${active.length} project${active.length !== 1 ? "s" : ""}`,
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Submitted",
      value: fmt(submittedVal),
      sub: `${submitted.length} pending decision`,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Awarded",
      value: fmt(awardedValue),
      sub: `${awarded.length} project${awarded.length !== 1 ? "s" : ""}`,
      icon: Award,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Win Rate",
      value: totalBid !== null ? `${totalBid}%` : "—",
      sub: `${awarded.length}W / ${lost.length}L`,
      icon: XCircle,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  // Group projects by status for the board
  const groups = [
    { key: "submitted", label: "Submitted", projects: submitted },
    { key: "draft",     label: "Draft",     projects: all.filter((p) => p.status === "draft") },
    { key: "awarded",   label: "Awarded",   projects: awarded },
    { key: "lost",      label: "Lost",      projects: lost },
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

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${bg}`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
            const groupTotal = groupProjects.reduce((s, p) => s + ((estByProject[p.id] as any)?.total_bid ?? 0), 0);

            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <span className="text-xs text-muted-foreground">({groupProjects.length})</span>
                  {groupTotal > 0 && (
                    <span className="ml-auto text-sm font-medium text-muted-foreground">{fmt(groupTotal)}</span>
                  )}
                </div>

                <div className="grid gap-2">
                  {groupProjects.map((p) => {
                    const est = (estByProject[p.id] as any);
                    const bid       = est?.total_bid ?? 0;
                    const mhrs      = est?.total_mhrs ?? 0;
                    const material  = est?.total_material ?? 0;

                    return (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/20 transition-colors group"
                      >
                        {/* Status dot */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

                        {/* Project info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{p.name}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            {p.customer_name && <span>{p.customer_name}</span>}
                            {p.bid_date && (
                              <span>Bid {new Date(p.bid_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            )}
                          </div>
                        </div>

                        {/* Rollup stats */}
                        {bid > 0 && (
                          <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                            {material > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Material</p>
                                <p className="text-sm font-medium">{fmt(material)}</p>
                              </div>
                            )}
                            {mhrs > 0 && (
                              <div>
                                <p className="text-xs text-muted-foreground">Man Hours</p>
                                <p className="text-sm font-medium">{fmtHrs(mhrs)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-muted-foreground">Total Bid</p>
                              <p className="text-base font-bold text-primary">{fmt(bid)}</p>
                            </div>
                          </div>
                        )}

                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
