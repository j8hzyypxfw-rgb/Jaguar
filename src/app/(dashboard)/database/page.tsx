import { createClient } from "@/lib/supabase/server";
import { DatabaseClient } from "./DatabaseClient";

export default async function DatabasePage() {
  const supabase = await createClient();

  // Accurate total count (no data fetched)
  const { count: totalCount } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  // Fetch ALL categories (raise limit well above item count)
  const { data: cats } = await supabase
    .from("items")
    .select("category")
    .eq("is_active", true)
    .limit(50000);

  const catCounts = (cats ?? []).reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <DatabaseClient
      categories={catCounts}
      totalCount={totalCount ?? 0}
    />
  );
}
