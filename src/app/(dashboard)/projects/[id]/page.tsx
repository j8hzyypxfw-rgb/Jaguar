import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calculator, FileText, Settings2, Users, Package } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <Link href={`/projects/${id}/settings`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <Settings2 className="w-4 h-4 mr-2" /> Settings
        </Link>
      </div>

      {/* Quick stats */}
      {base && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Bid",    value: fmt(base.total_bid),      color: "text-primary" },
            { label: "Direct Cost",  value: fmt(base.direct_cost),     color: "" },
            { label: "Man Hours",    value: fmtHrs(base.total_mhrs),   color: "" },
            { label: "Labor Rate",   value: `$${laborRate.toFixed(2)}/hr`, color: "" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-semibold mt-0.5 ${color}`}>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
          href={`/projects/${id}/bid-summary`}
          icon={FileText}
          title="Bid Summary"
          description="Full cost breakdown — job expense, overhead, profit, taxes, bond. Ready to print."
        />
        <ActionCard
          href={`/projects/${id}/bom`}
          icon={Package}
          title="Bill of Materials"
          description="Complete material list with quantities, unit costs, and totals. Filterable and printable."
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
