import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { BOMTable } from "./BOMTable";
import type { BOMRow } from "@/types";

export default async function BOMPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase.from("projects").select("name").eq("id", id).single();
  if (!project) notFound();

  // Fetch all line items with section + phase hierarchy
  const { data: raw } = await supabase
    .from("line_items")
    .select(`
      code, description, unit_of_measure,
      unit_material, total_material,
      unit_mhrs, total_mhrs, total_installed, total_qty,
      items(category),
      sections(name, phases(name))
    `)
    .eq("sections.phases.estimates.project_id", id)
    .gt("total_qty", 0);

  const rows: BOMRow[] = (raw ?? []).map((r: any) => ({
    code:           r.code ?? "",
    description:    r.description ?? "",
    category:       r.items?.category ?? "",
    unit_of_measure: r.unit_of_measure ?? "",
    quantity:       r.total_qty ?? 0,
    unit_material:  r.unit_material ?? 0,
    total_material: r.total_material ?? 0,
    unit_mhrs:      r.unit_mhrs ?? 0,
    total_mhrs:     r.total_mhrs ?? 0,
    unit_installed: r.total_qty > 0 ? (r.total_installed / r.total_qty) : 0,
    total_installed: r.total_installed ?? 0,
    phase:          r.sections?.phases?.name ?? "",
    section:        r.sections?.name ?? "",
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link href={`/projects/${id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Bill of Materials</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Print header */}
      <div className="print-only mb-6">
        <h1 className="text-2xl font-bold">Bill of Materials</h1>
        <p className="text-sm text-gray-600">{project.name} · {new Date().toLocaleDateString()}</p>
      </div>

      <BOMTable rows={rows} />
    </div>
  );
}
