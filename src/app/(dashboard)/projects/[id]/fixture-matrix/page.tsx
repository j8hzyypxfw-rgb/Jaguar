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

  // Project
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
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
          No estimate found. Create an estimate first, then add fixture line
          items in the T&amp;E grid using the ⚡ Fixture Schedule panel.
        </p>
      </div>
    );
  }

  // Fixture schedule for this project (for watts, avg_length, equipment_cost display)
  const { data: fixtures } = await supabase
    .from("fixture_schedules")
    .select("id, type_code, description, watts, avg_length, equipment_cost")
    .eq("project_id", projectId)
    .order("sort_order");

  // Phases → Areas with sections → line items that have a fixture_type
  // This is the source of truth for counts — no separate fixture_counts table needed
  const { data: phases } = await supabase
    .from("phases")
    .select(
      `id, name, sort_order,
       areas(
         id, name, sort_order,
         sections(
           id, name,
           line_items(
             id, fixture_type, total_qty, description,
             unit_material, unit_watts, unit_avg_length
           )
         )
       )`
    )
    .eq("estimate_id", estimate.id)
    .order("sort_order");

  return (
    <FixtureMatrixClient
      projectId={projectId}
      projectName={project.name}
      fixtures={fixtures ?? []}
      phases={(phases as Parameters<typeof FixtureMatrixClient>[0]["phases"]) ?? []}
    />
  );
}
