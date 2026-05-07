import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { TypicalsTable } from "./TypicalsTable";
import type { Item, Typical, TypicalLineItem } from "@/types";

export default async function TypicalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!project) notFound();

  // Load typicals — global library (workspace_id is null for now)
  const { data: typicals } = await supabase
    .from("typicals")
    .select("*")
    .is("workspace_id", null)
    .order("name");

  // Load all typical_line_items for those typicals
  const typicalIds = (typicals ?? []).map((t) => t.id);
  const { data: lineItems } =
    typicalIds.length > 0
      ? await supabase
          .from("typical_line_items")
          .select("*")
          .in("typical_id", typicalIds)
          .order("sort_order")
      : { data: [] };

  // Load items for the component search panel
  const { data: items } = await supabase
    .from("items")
    .select("id, code, description, unit_of_measure, material_cost, man_hours")
    .eq("is_active", true)
    .order("code");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/projects/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Typicals Library</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <TypicalsTable
        projectId={id}
        initialTypicals={(typicals ?? []) as Typical[]}
        initialLineItems={(lineItems ?? []) as TypicalLineItem[]}
        allItems={(items ?? []) as Item[]}
      />
    </div>
  );
}
