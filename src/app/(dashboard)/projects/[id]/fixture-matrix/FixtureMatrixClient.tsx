"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Zap, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  fixture_type: string | null;
  total_qty: number;
  description: string | null;
  unit_material: number;
  unit_watts: number | null;
  unit_avg_length: number | null;
}

interface Section {
  id: string;
  name: string;
  line_items: LineItem[];
}

interface Area {
  id: string;
  name: string;
  sort_order: number;
  sections: Section[];
}

interface Phase {
  id: string;
  name: string;
  sort_order: number;
  areas: Area[];
}

interface FixtureMeta {
  id: string;
  type_code: string;
  description: string;
  watts: number | null;
  avg_length: number | null;
  equipment_cost: number | null;
}

interface Props {
  projectId: string;
  projectName: string;
  fixtures: FixtureMeta[];
  phases: Phase[];
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Walk the estimate tree and aggregate fixture quantities by type × area.
 * Returns: counts[typeCode][areaId] = total qty
 */
function buildCounts(phases: Phase[]): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  phases.forEach((ph) => {
    (ph.areas ?? []).forEach((area) => {
      (area.sections ?? []).forEach((section) => {
        (section.line_items ?? []).forEach((li) => {
          if (!li.fixture_type || !li.total_qty) return;
          const type = li.fixture_type.toUpperCase();
          if (!counts[type]) counts[type] = {};
          counts[type][area.id] = (counts[type][area.id] ?? 0) + li.total_qty;
        });
      });
    });
  });
  return counts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtN(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FixtureMatrixClient({ projectId, projectName, fixtures, phases }: Props) {
  // Flatten areas in phase order
  const allAreas = useMemo<(Area & { phaseName: string })[]>(() => {
    const result: (Area & { phaseName: string })[] = [];
    [...phases]
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((ph) => {
        [...(ph.areas ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((area) => result.push({ ...area, phaseName: ph.name }));
      });
    return result;
  }, [phases]);

  // Aggregate counts from estimate line items
  const counts = useMemo(() => buildCounts(phases), [phases]);

  // Only show fixture types that actually appear in the estimate OR are in the schedule
  // Rows ordered by fixture schedule sort_order, then any orphaned types alphabetically
  const scheduleTypes = useMemo(() => fixtures.map((f) => f.type_code.toUpperCase()), [fixtures]);
  const estimateTypes = useMemo(() => Object.keys(counts).sort(), [counts]);
  const allTypes = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    // Schedule order first
    scheduleTypes.forEach((t) => {
      if (!seen.has(t)) { seen.add(t); result.push(t); }
    });
    // Then any types in estimate but not in schedule
    estimateTypes.forEach((t) => {
      if (!seen.has(t)) { seen.add(t); result.push(t); }
    });
    return result;
  }, [scheduleTypes, estimateTypes]);

  function getCount(type: string, areaId: string): number {
    return counts[type.toUpperCase()]?.[areaId] ?? 0;
  }

  function rowTotal(type: string): number {
    return allAreas.reduce((sum, a) => sum + getCount(type, a.id), 0);
  }

  function colTotal(areaId: string): number {
    return allTypes.reduce((sum, t) => sum + getCount(t, areaId), 0);
  }

  const grandTotal = useMemo(
    () => allTypes.reduce((sum, t) => sum + rowTotal(t), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, allTypes, allAreas]
  );

  // Fixture schedule lookup by type_code
  const fixtureMeta = useMemo(() => {
    const m: Record<string, FixtureMeta> = {};
    fixtures.forEach((f) => { m[f.type_code.toUpperCase()] = f; });
    return m;
  }, [fixtures]);

  // Phase column grouping
  const phaseGroups = useMemo(() => {
    const groups: { phaseId: string; phaseName: string; count: number }[] = [];
    allAreas.forEach((a) => {
      const last = groups[groups.length - 1];
      if (last && last.phaseName === a.phaseName) {
        last.count++;
      } else {
        groups.push({ phaseId: a.id, phaseName: a.phaseName, count: 1 });
      }
    });
    return groups;
  }, [allAreas]);

  // ── Excel export ──────────────────────────────────────────────────────────

  function handleExport() {
    const header = [
      "Type",
      "Description",
      "Watts",
      "Avg Length",
      ...allAreas.map((a) => `${a.phaseName} / ${a.name}`),
      "Total",
      "Unit Cost",
      "Total Cost",
    ];

    const rows = allTypes.map((type) => {
      const meta = fixtureMeta[type];
      const total = rowTotal(type);
      const unitCost = meta?.equipment_cost ?? 0;
      return [
        type,
        meta?.description ?? `(${type} — not in fixture schedule)`,
        meta?.watts ?? "",
        meta?.avg_length ?? "",
        ...allAreas.map((a) => getCount(type, a.id) || ""),
        total,
        unitCost,
        total * unitCost,
      ];
    });

    const totalsRow = [
      "TOTAL", "", "", "",
      ...allAreas.map((a) => colTotal(a.id) || ""),
      grandTotal, "", "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalsRow]);
    ws["!cols"] = [
      { wch: 6 }, { wch: 40 }, { wch: 8 }, { wch: 10 },
      ...allAreas.map(() => ({ wch: 14 })),
      { wch: 8 }, { wch: 12 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fixture Counts");
    XLSX.writeFile(wb, `${projectName.replace(/[^a-z0-9]/gi, "_")}_Fixture_Counts.xlsx`);
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  const hasData = allTypes.length > 0 && allAreas.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
        <Link
          href={`/projects/${projectId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Fixture Count Matrix</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Read from T&amp;E estimate — enter fixture quantities there using the ⚡ panel
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/estimate`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open T&amp;E
        </Link>
        {hasData && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export for ALA
          </Button>
        )}
      </div>

      {/* Empty states */}
      {allTypes.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center p-12">
          <div>
            <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No fixture line items yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Go to the T&amp;E grid, open a Lighting section, and use the{" "}
              <span className="font-medium text-amber-600">⚡ From Fixture Schedule</span> button
              to add fixtures with quantities. They will appear here automatically.
            </p>
            <Link
              href={`/projects/${projectId}/estimate`}
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-4")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to T&amp;E
            </Link>
          </div>
        </div>
      )}

      {allTypes.length > 0 && allAreas.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-12 text-sm text-muted-foreground">
          No areas found in the estimate.
        </div>
      )}

      {/* Matrix table */}
      {hasData && (
        <div className="flex-1 overflow-auto">
          <table className="text-xs border-collapse min-w-max">
            <thead className="sticky top-0 z-10 bg-background">
              {/* Phase header */}
              <tr>
                <th colSpan={4} className="border-b border-r bg-muted/40 px-3 py-2" />
                {phaseGroups.map((g) => (
                  <th
                    key={g.phaseId}
                    colSpan={g.count}
                    className="border-b border-r bg-primary/5 px-2 py-1.5 text-center font-semibold text-primary/80 whitespace-nowrap"
                  >
                    {g.phaseName}
                  </th>
                ))}
                <th colSpan={3} className="border-b bg-muted/40 px-2 py-1.5" />
              </tr>

              {/* Column labels */}
              <tr className="bg-muted/30">
                <th className="border-b border-r px-3 py-2 text-left font-medium w-12 sticky left-0 bg-muted/30">Type</th>
                <th className="border-b border-r px-3 py-2 text-left font-medium w-72">Description</th>
                <th className="border-b border-r px-2 py-2 text-right font-medium w-16">Watts</th>
                <th className="border-b border-r px-2 py-2 text-right font-medium w-16">Avg Len</th>
                {allAreas.map((a) => (
                  <th
                    key={a.id}
                    className="border-b border-r px-2 py-2 text-center font-medium w-20 whitespace-nowrap"
                    title={`${a.phaseName} / ${a.name}`}
                  >
                    {a.name}
                  </th>
                ))}
                <th className="border-b border-r px-2 py-2 text-right font-medium w-16">Total</th>
                <th className="border-b border-r px-2 py-2 text-right font-medium w-24">Unit Cost</th>
                <th className="border-b px-2 py-2 text-right font-medium w-28">Total Cost</th>
              </tr>
            </thead>

            <tbody>
              {allTypes.map((type, fi) => {
                const meta = fixtureMeta[type];
                const total = rowTotal(type);
                const unitCost = meta?.equipment_cost ?? 0;
                const totalCost = total * unitCost;
                const orphan = !meta; // in estimate but not in fixture schedule

                return (
                  <tr key={type} className={fi % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                    {/* Type */}
                    <td className="border-b border-r px-3 py-1.5 sticky left-0 bg-inherit">
                      <span className={cn(
                        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold min-w-[1.75rem]",
                        orphan
                          ? "bg-amber-100 text-amber-700"
                          : "bg-primary/10 text-primary"
                      )}>
                        {type}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="border-b border-r px-3 py-1.5 max-w-[18rem] truncate text-muted-foreground" title={meta?.description ?? ""}>
                      {meta?.description ?? (
                        <span className="italic text-amber-600">Not in fixture schedule</span>
                      )}
                    </td>

                    {/* Watts */}
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {meta?.watts != null ? fmtN(meta.watts) : "—"}
                    </td>

                    {/* Avg Length */}
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {meta?.avg_length != null ? meta.avg_length.toFixed(1) : "—"}
                    </td>

                    {/* Count cells (read-only) */}
                    {allAreas.map((area) => {
                      const v = getCount(type, area.id);
                      return (
                        <td
                          key={area.id}
                          className="border-b border-r px-2 py-1.5 text-center tabular-nums"
                        >
                          {v > 0 ? (
                            <span className="font-medium">{fmtN(v)}</span>
                          ) : (
                            <span className="text-muted-foreground/25">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Row total */}
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums font-semibold">
                      {total > 0 ? fmtN(total) : <span className="text-muted-foreground/25">—</span>}
                    </td>

                    {/* Unit cost */}
                    <td className="border-b border-r px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {unitCost > 0 ? fmt$(unitCost) : "—"}
                    </td>

                    {/* Total cost */}
                    <td className="border-b px-2 py-1.5 text-right tabular-nums font-medium">
                      {totalCost > 0 ? fmt$(totalCost) : <span className="text-muted-foreground/25">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer */}
            <tfoot className="sticky bottom-0 bg-muted/50 border-t-2 font-semibold">
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-muted/50" colSpan={4}>TOTAL</td>
                {allAreas.map((a) => {
                  const t = colTotal(a.id);
                  return (
                    <td key={a.id} className="px-2 py-2 text-center tabular-nums border-r">
                      {t > 0 ? fmtN(t) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right tabular-nums border-r">
                  {grandTotal > 0 ? fmtN(grandTotal) : "—"}
                </td>
                <td colSpan={2} className="px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
