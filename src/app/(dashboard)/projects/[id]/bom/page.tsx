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
        .select("id")
        .in("phase_id", phaseIds);

      const sectionIds = (sections ?? []).map((s) => s.id);

      if (sectionIds.length > 0) {
        const { data: lineItems } = await supabase
          .from("line_items")
          .select(`
            id, code, description, unit_of_measure,
            unit_material, total_material, total_qty,
            items(category)
          `)
          .in("section_id", sectionIds)
          .gt("total_qty", 0);

        // Collapse line items for the same part into one purchasable row. Identity is
        // the item code (else the description), the UOM, *and* the unit cost — the
        // section/area a line was taken off in is deliberately ignored.
        //
        // Unit cost is part of the key on purpose. Lines for the same part can carry
        // different costs (manual overrides, fixture costs snapshotted at insert), and
        // a BOM row has to state one real price you could buy at. Blending them into an
        // average would invent a price that isn't quoted anywhere, so differing costs
        // stay on separate rows instead.
        const merged = new Map<string, BOMRow>();

        for (const r of (lineItems ?? []) as any[]) {
          const code = r.code ?? "";
          const description = r.description ?? "";
          const uom = r.unit_of_measure ?? "";
          const unitMaterial = r.unit_material ?? 0;
          const key = [
            (code || description).trim().toLowerCase(),
            uom.trim().toLowerCase(),
            unitMaterial.toFixed(6),
          ].join("|");

          const existing = merged.get(key);
          if (existing) {
            existing.quantity += r.total_qty ?? 0;
            existing.total_material += r.total_material ?? 0;
            existing.line_count += 1;
          } else {
            merged.set(key, {
              code,
              description,
              category:        r.items?.category ?? "other",
              unit_of_measure: uom,
              quantity:        r.total_qty ?? 0,
              unit_material:   unitMaterial,
              total_material:  r.total_material ?? 0,
              line_count:      1,
            });
          }
        }

        rows = [...merged.values()]
          .sort((a, b) => {
            // Coded parts first in code order, uncoded ones after by description
            if (!a.code && b.code) return 1;
            if (a.code && !b.code) return -1;
            const byName = (a.code || a.description).localeCompare(b.code || b.description);
            // Same part at two prices — keep them adjacent, cheapest first
            return byName !== 0 ? byName : a.unit_material - b.unit_material;
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
