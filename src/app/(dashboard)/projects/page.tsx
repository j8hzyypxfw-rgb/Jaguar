import Link from "next/link";
import { Plus, FolderOpen, Clock, CheckCircle2, XCircle, Send } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.FC<{className?: string}> }> = {
  draft:     { label: "Draft",     variant: "secondary",    icon: Clock },
  submitted: { label: "Submitted", variant: "default",      icon: Send },
  awarded:   { label: "Awarded",   variant: "outline",      icon: CheckCircle2 },
  lost:      { label: "Lost",      variant: "destructive",  icon: XCircle },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("*, estimates(total_bid)")
    .order("created_at", { ascending: false });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/projects/new" className={cn(buttonVariants())}>
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Link>
      </div>

      {/* Project grid */}
      {!projects?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium mb-1">No projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first project to get started.
          </p>
          <Link href="/projects/new" className={cn(buttonVariants())}>
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((p: Project & { estimates?: { total_bid: number }[] }) => {
            const status = statusConfig[p.status] ?? statusConfig.draft;
            const Icon = status.icon;
            const bid = p.estimates?.[0]?.total_bid ?? 0;

            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/30 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{p.name}</p>
                    <Badge variant={status.variant} className="shrink-0 text-[10px] gap-1">
                      <Icon className="w-2.5 h-2.5" />
                      {status.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {p.customer_name && <span>{p.customer_name}</span>}
                    {p.bid_date && (
                      <span>Bid: {new Date(p.bid_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                {bid > 0 && (
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{fmt(bid)}</p>
                    <p className="text-[10px] text-muted-foreground">Total Bid</p>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
