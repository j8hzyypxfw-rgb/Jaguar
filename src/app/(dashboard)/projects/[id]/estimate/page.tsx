import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectToPricingConfig } from "@/lib/pricing";
import { EstimateGrid } from "./EstimateGrid";
import type { Project, Estimate, Area, Phase, Item } from "@/types";

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch project
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  // Fetch estimate (first / base bid)
  const { data: estimates } = await supabase
    .from("estimates")
    .select("*")
    .eq("project_id", id)
    .order("version")
    .limit(1);

  const estimate: Estimate | null = estimates?.[0] ?? null;

  let areas: Area[] = [];
  let phases: Phase[] = [];

  if (estimate) {
    // Fetch areas
    const { data: areasData } = await supabase
      .from("areas")
      .select("*")
      .eq("estimate_id", estimate.id)
      .eq("is_active", true)
      .order("sort_order");

    areas = areasData ?? [];

    // Fetch phases → sections → line_items → quantities in one query
    const { data: phasesData } = await supabase
      .from("phases")
      .select(`
        *,
        sections (
          *,
          line_items (
            *,
            line_item_quantities ( * )
          )
        )
      `)
      .eq("estimate_id", estimate.id)
      .order("sort_order");

    if (phasesData) {
      // Sort nested arrays by sort_order
      phases = phasesData.map((phase: any) => ({
        ...phase,
        sections: (phase.sections ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((section: any) => ({
            ...section,
            line_items: (section.line_items ?? []).sort(
              (a: any, b: any) => a.sort_order - b.sort_order
            ),
          })),
      }));
    }
  }

  // Load items for the search/add flow (active items only, lightweight columns)
  const { data: itemsData } = await supabase
    .from("items")
    .select("id, code, description, category, unit_of_measure, material_cost, man_hours, equipment_cost, excavation_cost, sub_cost")
    .eq("is_active", true)
    .order("code");

  const items: Partial<Item>[] = itemsData ?? [];

  const pricingConfig = projectToPricingConfig(project);

  return (
    <EstimateGrid
      project={project as Project}
      estimate={estimate}
      areas={areas}
      phases={phases as Phase[]}
      items={items as Item[]}
      pricingConfig={pricingConfig}
    />
  );
}
