import { Suspense } from "react";
import { Search, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { DatabaseTable } from "./DatabaseTable";

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const cat = sp.cat ?? "";
  const page = parseInt(sp.page ?? "1");
  const pageSize = 100;

  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("code")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (q) query = query.or(`code.ilike.%${q}%,description.ilike.%${q}%`);
  if (cat) query = query.eq("category", cat);

  const { data: items, count } = await query;

  // Category counts
  const { data: cats } = await supabase
    .from("items")
    .select("category")
    .eq("is_active", true);

  const catCounts = (cats ?? []).reduce((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Item Database</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {count?.toLocaleString()} items · {Object.keys(catCounts).length} categories
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Sync Prices
          </Button>
          <Button size="sm">
            <Upload className="w-4 h-4 mr-2" /> Import DBF
          </Button>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a href="/database" className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!cat ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"}`}>
          All ({count?.toLocaleString()})
        </a>
        {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
          <a
            key={c}
            href={`/database?cat=${c}${q ? `&q=${q}` : ""}`}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"}`}
          >
            {c.replace("_", " ")} ({n})
          </a>
        ))}
      </div>

      {/* Search */}
      <form className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search code or description…"
            className="pl-9"
          />
          {cat && <input type="hidden" name="cat" value={cat} />}
        </div>
      </form>

      <DatabaseTable items={items ?? []} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <a href={`/database?page=${page - 1}${q ? `&q=${q}` : ""}${cat ? `&cat=${cat}` : ""}`}
                className="px-3 py-1 rounded border hover:bg-muted">← Prev</a>
            )}
            {page < totalPages && (
              <a href={`/database?page=${page + 1}${q ? `&q=${q}` : ""}${cat ? `&cat=${cat}` : ""}`}
                className="px-3 py-1 rounded border hover:bg-muted">Next →</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
