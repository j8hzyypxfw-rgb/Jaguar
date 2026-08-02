"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import type { BOMRow } from "@/types";

const CATEGORIES = [
  "all", "conduit", "wire", "gear", "gear_assembly", "lighting",
  "boxes_devices", "site_subs", "fire_alarm", "av", "security", "motors", "other",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function fmtQty(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function BOMTable({ rows }: { rows: BOMRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  // No "group by phase" — rows are merged across phases, so a row has no single phase
  const [groupBy, setGroupBy] = useState<"none" | "category">("category");

  const filtered = useMemo(() => {
    let r = rows;
    if (category !== "all") r = r.filter((x) => x.category === category);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        x.code.toLowerCase().includes(q) ||
        x.description.toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, search, category]);

  const totalMaterial = useMemo(
    () => filtered.reduce((s, r) => s + r.total_material, 0),
    [filtered]
  );

  // Group rows
  const grouped = useMemo(() => {
    if (groupBy === "none") return { "All Items": filtered };
    return filtered.reduce((acc, r) => {
      const g = r.category || "Other";
      acc[g] = acc[g] ?? [];
      acc[g].push(r);
      return acc;
    }, {} as Record<string, BOMRow[]>);
  }, [filtered, groupBy]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 no-print">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search code or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c === "all" ? "All Categories" : c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "none" | "category")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">Group by Category</SelectItem>
            <SelectItem value="none">No Grouping</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          {fmtQty(filtered.length)} items
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Code</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Description</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Qty</th>
              <th className="text-left px-2 py-2.5 font-medium text-xs text-muted-foreground">UOM</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Unit Matl</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Total Matl</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(grouped).map(([group, groupRows]) => (
              <>
                {groupBy !== "none" && (
                  <tr key={`g-${group}`} className="bg-muted/30">
                    <td colSpan={6} className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                      {group.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      <span className="ml-2 font-normal">({groupRows.length} items)</span>
                    </td>
                  </tr>
                )}
                {groupRows.map((row, i) => (
                  <tr key={`${group}-${i}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.code}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <span className="truncate">{row.description}</span>
                      {row.line_count > 1 && (
                        <span
                          className="ml-2 text-[10px] text-muted-foreground whitespace-nowrap"
                          title={`Merged from ${row.line_count} estimate lines`}
                        >
                          ({row.line_count} lines)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(row.quantity)}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{row.unit_of_measure}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(row.unit_material)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{fmt(row.total_material)}</td>
                  </tr>
                ))}
                {groupBy !== "none" && (
                  <tr key={`sub-${group}`} className="bg-muted/20 border-t border-b font-medium">
                    <td colSpan={5} className="px-3 py-2 text-xs text-right text-muted-foreground">Subtotal</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm text-primary">
                      {fmt(groupRows.reduce((s, r) => s + r.total_material, 0))}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/50">
            <tr className="font-semibold">
              <td colSpan={5} className="px-3 py-3 text-right text-sm">Total Material</td>
              <td className="px-3 py-3 text-right tabular-nums text-primary text-base">{fmt(totalMaterial)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
