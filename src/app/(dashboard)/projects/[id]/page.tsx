import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calculator, FileText, Settings2, Users, Package, Receipt, Truck, Layers, Grid3X3 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n) + " hrs";
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const { data: estimates } = await supabase
    .from("estimates")
    .select("*")
    .eq("project_id", id)
    .order("version");

  const base = estimates?.[0];

  const laborRate = project.base_labor * project.ti_factor;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/projects" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {project.customer_name && `${project.customer_name} · `}
            {project.bid_date && `Bid: ${new Date(project.bid_date).toLocaleDateString()}`}
          </p>
        </div>
        <Badge variant={project.status === "awarded" ? "outline" : "secondary"} className="capitalize">
          {project.status}
        </Badge>
        <Link href={`/projects/${id}/bid-summary`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <FileText className="w-4 h-4 mr-2" /> Bid Summary
        </Link>
        <Link href={`/projects/${id}/bom`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Package className="w-4 h-4 mr-2" /> BOM
        </Link>
        <Link href={`/projects/${id}/settings`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Settings2 className="w-4 h-4 mr-2" /> Settings
        </Link>
      </div>

      {/* Quick stats */}
      {base && (() => {
        const gpm = base.total_bid > 0 ? (base.profit_cost / base.total_bid) * 100 : 0;
        const stats = [
          { label: "Total Bid",       value: fmt(base.total_bid),            accent: true },
          { label: "Material",        value: fmt(base.total_material),        accent: false },
          { label: "Direct Costs",    value: fmt(base.direct_cost),           accent: false },
          { label: "Indirect Costs",  value: fmt(base.indirect_labor_cost),   accent: false },
          { label: "Man Hours",       value: fmtHrs(base.total_mhrs),         accent: false },
          { label: "Profit",          value: fmt(base.profit_cost),           accent: false },
          { label: "GPM",             value: `${gpm.toFixed(1)}%`,            accent: false, highlight: gpm >= 15 ? "text-emerald-600" : gpm >= 10 ? "text-amber-600" : "text-destructive" },
        ];
        return (
          <Card className="mb-6">
            <CardContent className="py-0">
              <div className="flex divide-x">
                {stats.map(({ label, value, accent, highlight }) => (
                  <div key={label} className="flex-1 px-4 py-4 min-w-0">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">{label}</p>
                    <p className={`text-lg font-semibold mt-1 truncate ${highlight ?? (accent ? "text-primary" : "")}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Action cards */}
      <div className="grid grid-cols-3 gap-4">
        <ActionCard
          href={`/projects/${id}/estimate`}
          icon={Calculator}
          title="Takeoff &amp; Estimate"
          description="Enter quantities by phase, section, and area. Live pricing calculated automatically."
          primary
        />
        <ActionCard
          href={`/projects/${id}/indirect`}
          icon={Users}
          title="Indirect Labor"
          description="Foreman, superintendent, PM time. Tracked separately from field labor."
        />
        <ActionCard
          href={`/projects/${id}/quotes`}
          icon={FileText}
          title="Vendor Quotes"
          description="Compare vendor quotes against database pricing. Select best value."
        />
        <ActionCard
          href={`/projects/${id}/fixture-schedule`}
          icon={Package}
          title="Fixture Schedule"
          description="Map fixture type letters to fixture specifications, watts, and run lengths."
        />
        <ActionCard
          href={`/projects/${id}/fixture-matrix`}
          icon={Grid3X3}
          title="Fixture Count Matrix"
          description="Enter fixture quantities by type and area. Export to Excel for ALA quotes. Sync counts into estimate."
        />
        <ActionCard
          href={`/projects/${id}/gen-expenses`}
          icon={Receipt}
          title="General Expenses"
          description="Trailer, tools, consumables, per diem, safety, permits, and other project overhead."
        />
        <ActionCard
          href={`/projects/${id}/rentals`}
          icon={Truck}
          title="Rental Equipment"
          description="Lifts, compressors, generators, and other equipment rentals with tax."
        />
        <ActionCard
          href={`/projects/${id}/typicals`}
          icon={Layers}
          title="Typicals"
          description="Pre-built assemblies. Insert a typical to explode into all component line items instantly."
        />
      </div>
    </div>
  );
}

function ActionCard({
  href, icon: Icon, title, description, primary,
}: {
  href: string;
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-3 p-5 rounded-lg border transition-all hover:shadow-sm group ${
        primary ? "border-primary/30 bg-accent/40 hover:bg-accent/70" : "bg-card hover:bg-muted/50"
      }`}
    >
      <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${primary ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="font-medium text-sm" dangerouslySetInnerHTML={{ __html: title }} />
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </Link>
  );
}
