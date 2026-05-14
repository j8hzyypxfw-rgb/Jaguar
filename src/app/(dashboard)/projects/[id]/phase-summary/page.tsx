import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { PhaseSummaryClient } from "./PhaseSummaryClient";

export default async function PhaseSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, base_labor, ti_factor, mhrs_mult")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("project_id", projectId)
    .order("version")
    .limit(1)
    .single();

  if (!estimate) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/projects/${projectId}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Phase Summary</h1>
            <p className="text-sm text-muted-foreground">{project.name}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          No estimate found — phase rollups will appear here once the T&amp;E grid has data.
        </p>
      </div>
    );
  }

  // Pull phases → areas → sections → line_items
  // We sum line_items on the client because section rollup columns aren't
  // kept in sync (rollupEstimate only updates the estimate-level totals).
  const { data: phases } = await supabase
    .from("phases")
    .select(
      `id, name, sort_order,
       areas(
         id, name, sort_order,
         sections(
           id, name, sort_order,
           line_items(
             total_equipment, total_excavation, total_sub,
             total_material, total_mhrs, total_installed
           )
         )
       )`
    )
    .eq("estimate_id", estimate.id)
    .order("sort_order");

  const laborRate = (project.base_labor ?? 0) * (project.ti_factor ?? 0);
  const mhrsMult = project.mhrs_mult ?? 1;

  return (
    <PhaseSummaryClient
      projectId={projectId}
      projectName={project.name}
      phases={(phases as Parameters<typeof PhaseSummaryClient>[0]["phases"]) ?? []}
      laborRate={laborRate}
      mhrsMult={mhrsMult}
    />
  );
}
