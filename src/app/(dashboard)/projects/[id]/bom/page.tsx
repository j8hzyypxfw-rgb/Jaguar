import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { BOMTable } from "./BOMTable";
import { PrintButton } from "./PrintButton";
import type { BOMRow } from "@/types";

export default async function BOMPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", id).single();
  if (!project) notFound();

  // Step through the hierarchy: project → estimate → phases → sections → line_items
  const { data: estimate } = await supabase
    .from("estimates")
    .select("id")
    .eq("project_id", id)
    .order("version")
    .limit(1)
    .single();

  let rows: BOMRow[] = [];

  if (estimate) {
    const { data: phases } = await supabase
      .from("phases")
      .select("id")
      .eq("estimate_id", estimate.id);

    const phaseIds = (phases ?? []).map((p) => p.id);

    if (phaseIds.length > 0) {
      const { data: sections } = await supabase
        .from("sections")
        .select("id, name, phase_id, phases(name)")
        .in("phase_id", phaseIds);

      const sectionIds = (sections ?? []).map((s) => s.id);
      const sectionMap = Object.fromEntries((sections ?? []).map((s: any) => [s.id, s]));

      if (sectionIds.length > 0) {
        const { data: lineItems } = await supabase
          .from("line_items")
          .select(`
            id, code, description, unit_of_measure, section_id,
            unit_material, total_material,
            unit_mhrs, total_mhrs, total_installed, total_qty,
            items(category)
          `)
          .in("section_id", sectionIds)
          .gt("total_qty", 0)
          .order("sort_order");

        rows = (lineItems ?? []).map((r: any) => {
          const sec = sectionMap[r.section_id];
          return {
            code:            r.code ?? "",
            description:     r.description ?? "",
            category:        r.items?.category ?? "other",
            unit_of_measure: r.unit_of_measure ?? "",
            quantity:        r.total_qty ?? 0,
            unit_material:   r.unit_material ?? 0,
            total_material:  r.total_material ?? 0,
            unit_mhrs:       r.unit_mhrs ?? 0,
            total_mhrs:      r.total_mhrs ?? 0,
            unit_installed:  r.total_qty > 0 ? (r.total_installed / r.total_qty) : 0,
            total_installed: r.total_installed ?? 0,
            phase:           sec?.phases?.name ?? "",
            section:         sec?.name ?? "",
          };
        });
      }
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link href={`/projects/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Bill of Materials</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
        <PrintButton />
      </div>

      <div className="print-only mb-6">
        <h1 className="text-2xl font-bold">Bill of Materials</h1>
        <p className="text-sm text-gray-600">{project.name} · {new Date().toLocaleDateString()}</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-muted-foreground text-sm">No line items with quantities yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Add items in the Takeoff &amp; Estimate tab.</p>
        </div>
      ) : (
        <BOMTable rows={rows} />
      )}
    </div>
  );
}
