import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectToPricingConfig } from "@/lib/pricing";
import { EstimateGrid } from "./EstimateGrid";
import type { Project, Estimate, Phase, Item, Typical, TypicalLineItem } from "@/types";

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

  let phases: Phase[] = [];

  if (estimate) {
    // Fetch Phase → Area → Section → LineItems (new 4-level hierarchy)
    const { data: phasesData } = await supabase
      .from("phases")
      .select(`
        *,
        areas!areas_phase_id_fkey (
          *,
          sections!sections_area_id_fkey (
            *,
            line_items (*)
          )
        )
      `)
      .eq("estimate_id", estimate.id)
      .order("sort_order");

    if (phasesData) {
      phases = phasesData.map((phase: any) => ({
        ...phase,
        areas: (phase.areas ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((area: any) => ({
            ...area,
            sections: (area.sections ?? [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((section: any) => ({
                ...section,
                line_items: (section.line_items ?? []).sort(
                  (a: any, b: any) => a.sort_order - b.sort_order
                ),
              })),
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

  // Load global typicals library
  const { data: typicalsData } = await supabase
    .from("typicals")
    .select("*")
    .is("workspace_id", null)
    .eq("is_active", true)
    .order("name");

  const typicals: Typical[] = (typicalsData ?? []) as Typical[];

  // Load all typical_line_items for those typicals
  const typicalIds = typicals.map((t) => t.id);
  const { data: typicalLineItemsData } =
    typicalIds.length > 0
      ? await supabase
          .from("typical_line_items")
          .select("*")
          .in("typical_id", typicalIds)
          .order("sort_order")
      : { data: [] };

  const typicalLineItems: TypicalLineItem[] = (typicalLineItemsData ?? []) as TypicalLineItem[];

  const pricingConfig = projectToPricingConfig(project);

  return (
    <EstimateGrid
      project={project as Project}
      estimate={estimate}
      phases={phases as Phase[]}
      items={items as Item[]}
      typicals={typicals}
      typicalLineItems={typicalLineItems}
      pricingConfig={pricingConfig}
    />
  );
}
