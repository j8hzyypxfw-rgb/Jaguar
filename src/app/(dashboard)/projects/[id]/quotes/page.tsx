import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { QuotesTable } from "./QuotesTable";
import type { Quote } from "@/types";

export default async function QuotesPage({
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

  // Get base estimate for this project
  const { data: estimates } = await supabase
    .from("estimates")
    .select("id")
    .eq("project_id", id)
    .order("version")
    .limit(1);

  const estimateId = estimates?.[0]?.id ?? null;

  const { data: quotes } = estimateId
    ? await supabase
        .from("quotes")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("sort_order")
    : { data: [] };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link
          href={`/projects/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Vendor Quotes</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <QuotesTable
        projectId={id}
        estimateId={estimateId}
        initialQuotes={(quotes ?? []) as Quote[]}
      />
    </div>
  );
}
