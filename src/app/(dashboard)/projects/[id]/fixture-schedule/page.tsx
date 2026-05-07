import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { FixtureScheduleTable } from "./FixtureScheduleTable";
import type { FixtureScheduleEntry } from "@/types";

export default async function FixtureSchedulePage({
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

  const { data: fixtures } = await supabase
    .from("fixture_schedules")
    .select("*")
    .eq("project_id", id)
    .order("sort_order");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link
          href={`/projects/${id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Fixture Schedule</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <FixtureScheduleTable
        projectId={id}
        initialFixtures={(fixtures ?? []) as FixtureScheduleEntry[]}
      />
    </div>
  );
}
