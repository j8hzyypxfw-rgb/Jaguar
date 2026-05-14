import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FixtureMatrixClient } from "./FixtureMatrixClient";

export default async function FixtureMatrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  // Project (need name + lighting_markup_factor)
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, lighting_markup_factor")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  // Base estimate
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("project_id", projectId)
    .order("version")
    .limit(1)
    .single();

  if (!estimate) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground text-sm">
          No estimate found for this project. Create an estimate first.
        </p>
      </div>
    );
  }

  // Fixture schedule for this project
  const { data: fixtures } = await supabase
    .from("fixture_schedules")
    .select("id, type_code, description, watts, avg_length, equipment_cost, notes")
    .eq("project_id", projectId)
    .order("sort_order");

  // Phases → Areas (flatten to a list of areas with phase info)
  const { data: phases } = await supabase
    .from("phases")
    .select("id, name, sort_order, areas(id, name, sort_order)")
    .eq("estimate_id", estimate.id)
    .order("sort_order");

  // Existing fixture counts
  const { data: counts } = await supabase
    .from("fixture_counts")
    .select("id, fixture_schedule_id, area_id, qty")
    .eq("project_id", projectId);

  return (
    <FixtureMatrixClient
      projectId={projectId}
      projectName={project.name}
      estimateId={estimate.id}
      lightingMarkupFactor={project.lighting_markup_factor ?? 1.2262}
      fixtures={fixtures ?? []}
      phases={phases ?? []}
      initialCounts={counts ?? []}
    />
  );
}
