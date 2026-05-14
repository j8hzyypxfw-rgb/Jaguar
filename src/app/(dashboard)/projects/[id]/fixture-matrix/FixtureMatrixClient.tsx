"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, Zap } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Fixture {
  id: string;
  type_code: string;
  description: string;
  watts: number | null;
  avg_length: number | null;
  equipment_cost: number | null;
  notes: string | null;
}

interface Area {
  id: string;
  name: string;
  sort_order: number;
}

interface PhaseWithAreas {
  id: string;
  name: string;
  sort_order: number;
  areas: Area[];
}

interface CountRecord {
  id: string;
  fixture_schedule_id: string;
  area_id: string;
  qty: number;
}

interface Props {
  projectId: string;
  projectName: string;
  estimateId: string;
  lightingMarkupFactor: number;
  fixtures: Fixture[];
  phases: PhaseWithAreas[];
  initialCounts: CountRecord[];
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

export function FixtureMatrixClient({
  projectId,
  projectName,
  estimateId,
  lightingMarkupFactor,
  fixtures,
  phases,
  initialCounts,
}: Props) {
  const supabase = createClient();

  // Flatten areas in phase order
  const allAreas = useMemo<(Area & { phaseName: string; phaseId: string })[]>(() => {
    const result: (Area & { phaseName: string; phaseId: string })[] = [];
    [...phases]
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((ph) => {
        [...(ph.areas ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((area) => result.push({ ...area, phaseName: ph.name, phaseId: ph.id }));
      });
    return result;
  }, [phases]);

  // counts keyed as `${fixtureId}__${areaId}`
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    initialCounts.forEach((c) => {
      m[`${c.fixture_schedule_id}__${c.area_id}`] = c.qty;
    });
    return m;
  });

  const [syncing, setSyncing] = useState(false);
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Read/write a count ──────────────────────────────────────────────────

  function getCount(fixtureId: string, areaId: string): number {
    return counts[`${fixtureId}__${areaId}`] ?? 0;
  }

  const handleCountChange = useCallback(
    (fixtureId: string, areaId: string, raw: string) => {
      const qty = Math.max(0, parseInt(raw, 10) || 0);
      const key = `${fixtureId}__${areaId}`;
      setCounts((prev) => ({ ...prev, [key]: qty }));

      // Debounce DB write by 600ms
      clearTimeout(saveTimeouts.current[key]);
      saveTimeouts.current[key] = setTimeout(async () => {
        const { error } = await supabase.from("fixture_counts").upsert(
          {
            project_id:          projectId,
            fixture_schedule_id: fixtureId,
            area_id:             areaId,
            qty,
          },
          { onConflict: "fixture_schedule_id,area_id" }
        );
        if (error) {
          toast.error(`Save failed: ${error.message}`);
        }
      }, 600);
    },
    [projectId, supabase]
  );

  // ── Row/column totals ───────────────────────────────────────────────────

  function rowTotal(fixtureId: string): number {
    return allAreas.reduce((sum, a) => sum + getCount(fixtureId, a.id), 0);
  }

  function colTotal(areaId: string): number {
    return fixtures.reduce((sum, f) => sum + getCount(f.id, areaId), 0);
  }

  const grandTotal = useMemo(
    () => fixtures.reduce((sum, f) => sum + rowTotal(f.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [counts, fixtures, allAreas]
  );

  // ── "Sync to Estimate" — pushes qty × adj unit cost into line items ────

  async function handleSyncToEstimate() {
    if (fixtures.length === 0 || allAreas.length === 0) return;
    setSyncing(true);
    try {
      // For each area that has at least one fixture with qty > 0:
      // 1. Find or create a "Lighting" section in that area
      // 2. For each fixture with qty > 0, upsert a line item

      // Load existing sections for all areas
      const areaIds = allAreas.map((a) => a.id);
      const { data: existingSections } = await supabase
        .from("sections")
        .select("id, area_id, name")
        .in("area_id", areaIds)
        .ilike("name", "Lighting");

      const sectionByArea: Record<string, string> = {};
      (existingSections ?? []).forEach((s) => {
        if (s.area_id) sectionByArea[s.area_id] = s.id;
      });

      // Create missing Lighting sections
      for (const area of allAreas) {
        const hasFixtures = fixtures.some((f) => getCount(f.id, area.id) > 0);
        if (!hasFixtures) continue;
        if (sectionByArea[area.id]) continue;

        // Find max sort_order for sections in this area
        const { data: maxSort } = await supabase
          .from("sections")
          .select("sort_order")
          .eq("area_id", area.id)
          .order("sort_order", { ascending: false })
          .limit(1);

        const nextSort = ((maxSort?.[0]?.sort_order ?? 0) as number) + 10;

        // Need phase_id for the section (legacy compat)
        const ph = phases.find((p) => p.areas?.some((a) => a.id === area.id));

        const { data: newSection, error: secErr } = await supabase
          .from("sections")
          .insert({
            area_id:    area.id,
            phase_id:   ph?.id ?? null,
            name:       "Lighting",
            sort_order: nextSort,
          })
          .select("id")
          .single();

        if (secErr) {
          toast.error(`Could not create Lighting section in ${area.name}: ${secErr.message}`);
          continue;
        }
        sectionByArea[area.id] = newSection.id;
      }

      // Load existing line items in the lighting sections (keyed by fixture_type)
      const sectionIds = Object.values(sectionByArea);
      const { data: existingItems } = await supabase
        .from("line_items")
        .select("id, section_id, fixture_type")
        .in("section_id", sectionIds);

      // Map: `${sectionId}__${type_code}` → line_item_id
      const itemBySectionType: Record<string, string> = {};
      (existingItems ?? []).forEach((li) => {
        if (li.fixture_type) {
          itemBySectionType[`${li.section_id}__${li.fixture_type}`] = li.id;
        }
      });

      let upserted = 0;
      let removed = 0;

      for (const fixture of fixtures) {
        for (const area of allAreas) {
          const qty = getCount(fixture.id, area.id);
          const sectionId = sectionByArea[area.id];
          if (!sectionId) continue;

          const adjCost = (fixture.equipment_cost ?? 0) * lightingMarkupFactor;
          const mapKey = `${sectionId}__${fixture.type_code}`;
          const existingId = itemBySectionType[mapKey];

          if (qty === 0 && !existingId) continue;

          if (qty === 0 && existingId) {
            // Remove line item if qty cleared
            await supabase.from("line_items").delete().eq("id", existingId);
            removed++;
            continue;
          }

          const payload = {
            section_id:      sectionId,
            fixture_type:    fixture.type_code,
            description:     `[${fixture.type_code}] ${fixture.description}`,
            unit_of_measure: "EA",
            unit_material:   adjCost,
            unit_equipment:  0,
            unit_excavation: 0,
            unit_sub:        0,
            unit_mhrs:       0,
            unit_ot_hrs:     0,
            unit_watts:      fixture.watts ?? null,
            unit_avg_length: fixture.avg_length ?? null,
            total_qty:       qty,
            price_source:    "manual",
            price_locked:    false,
            sort_order:      fixtures.indexOf(fixture) * 10,
          };

          if (existingId) {
            await supabase.from("line_items").update(payload).eq("id", existingId);
          } else {
            await supabase.from("line_items").insert(payload);
          }
          upserted++;
        }
      }

      toast.success(`Synced to estimate — ${upserted} line items updated, ${removed} removed`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  // ── Excel export ────────────────────────────────────────────────────────

  function handleExport() {
    const header = [
      "Type",
      "Description",
      "Watts",
      "Avg Length",
      ...allAreas.map((a) => `${a.phaseName} / ${a.name}`),
      "Total",
      "Unit Cost",
      "Adj Unit Cost",
      "Total Cost",
    ];

    const rows = fixtures.map((f) => {
      const adjCost = (f.equipment_cost ?? 0) * lightingMarkupFactor;
      const total = rowTotal(f.id);
      return [
        f.type_code,
        f.description,
        f.watts ?? "",
        f.avg_length ?? "",
        ...allAreas.map((a) => getCount(f.id, a.id) || ""),
        total,
        f.equipment_cost ?? 0,
        adjCost,
        total * adjCost,
      ];
    });

    // Totals row
    const totalsRow = [
      "TOTAL",
      "",
      "",
      "",
      ...allAreas.map((a) => colTotal(a.id) || ""),
      grandTotal,
      "",
      "",
      "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalsRow]);

    // Column widths
    ws["!cols"] = [
      { wch: 6 },   // Type
      { wch: 40 },  // Description
      { wch: 8 },   // Watts
      { wch: 10 },  // Avg Len
      ...allAreas.map(() => ({ wch: 14 })),
      { wch: 8 },   // Total
      { wch: 12 },  // Unit Cost
      { wch: 14 },  // Adj Unit Cost
      { wch: 14 },  // Total Cost
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fixture Counts");

    const filename = `${projectName.replace(/[^a-z0-9]/gi, "_")}_Fixture_Counts.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // ── Phase column spans ──────────────────────────────────────────────────

  const phaseGroups = useMemo(() => {
    const groups: { phaseId: string; phaseName: string; count: number }[] = [];
    allAreas.forEach((a) => {
      const last = groups[groups.length - 1];
      if (last && last.phaseId === a.phaseId) {
        last.count++;
      } else {
        groups.push({ phaseId: a.phaseId, phaseName: a.phaseName, count: 1 });
      }
    });
    return groups;
  }, [allAreas]);

  // ── Render ──────────────────────────────────────────────────────────────

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
          <p className="text-sm text-muted-foreground">{projectName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Markup: {((lightingMarkupFactor - 1) * 100).toFixed(2)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncToEstimate}
            disabled={syncing}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync to Estimate"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Empty states */}
      {fixtures.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-center p-12">
          <div>
            <Zap className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No fixtures in schedule</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add fixture types in the{" "}
              <Link href={`/projects/${projectId}/fixture-schedule`} className="underline">
                Fixture Schedule
              </Link>{" "}
              first.
            </p>
          </div>
        </div>
      )}

      {fixtures.length > 0 && allAreas.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-12 text-sm text-muted-foreground">
          No areas found. Add phases and areas in the estimate first.
        </div>
      )}

      {/* Scrollable table */}
      {fixtures.length > 0 && allAreas.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="text-xs border-collapse min-w-max">
            <thead className="sticky top-0 z-10 bg-background">
              {/* Phase header row */}
              <tr>
                <th
                  colSpan={4}
                  className="border-b border-r bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground"
                />
                {phaseGroups.map((g) => (
                  <th
                    key={g.phaseId}
                    colSpan={g.count}
                    className="border-b border-r bg-primary/5 px-2 py-1.5 text-center font-semibold text-primary/80 whitespace-nowrap"
                  >
                    {g.phaseName}
                  </th>
                ))}
                <th
                  colSpan={4}
                  className="border-b bg-muted/40 px-2 py-1.5 text-center font-medium text-muted-foreground"
                />
              </tr>

              {/* Column headers */}
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
                <th className="border-b border-r px-2 py-2 text-right font-medium w-28">Adj Cost</th>
                <th className="border-b px-2 py-2 text-right font-medium w-28">Total Cost</th>
              </tr>
            </thead>

            <tbody>
              {fixtures.map((fixture, fi) => {
                const total = rowTotal(fixture.id);
                const adjCost = (fixture.equipment_cost ?? 0) * lightingMarkupFactor;
                const totalCost = total * adjCost;
                return (
                  <tr
                    key={fixture.id}
                    className={fi % 2 === 0 ? "bg-background" : "bg-muted/10"}
                  >
                    {/* Type badge */}
                    <td className="border-b border-r px-3 py-1 sticky left-0 bg-inherit">
                      <span className="inline-flex items-center justify-center rounded bg-primary/10 text-primary font-semibold px-1.5 py-0.5 text-[11px] min-w-[1.75rem]">
                        {fixture.type_code}
                      </span>
                    </td>

                    {/* Description */}
                    <td className="border-b border-r px-3 py-1 max-w-[18rem] truncate" title={fixture.description}>
                      {fixture.description}
                    </td>

                    {/* Watts */}
                    <td className="border-b border-r px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {fixture.watts != null ? fmtN(fixture.watts) : "—"}
                    </td>

                    {/* Avg Length */}
                    <td className="border-b border-r px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {fixture.avg_length != null ? fixture.avg_length.toFixed(1) : "—"}
                    </td>

                    {/* Qty cells */}
                    {allAreas.map((area) => {
                      const v = getCount(fixture.id, area.id);
                      return (
                        <td key={area.id} className="border-b border-r p-0">
                          <input
                            type="number"
                            min={0}
                            value={v === 0 ? "" : v}
                            placeholder="—"
                            onChange={(e) => handleCountChange(fixture.id, area.id, e.target.value)}
                            className="w-full h-7 px-2 text-right tabular-nums text-xs bg-transparent border-0 outline-none focus:bg-primary/5 focus:ring-0 placeholder:text-muted-foreground/30"
                          />
                        </td>
                      );
                    })}

                    {/* Row total */}
                    <td className="border-b border-r px-2 py-1 text-right tabular-nums font-medium">
                      {total > 0 ? fmtN(total) : <span className="text-muted-foreground/30">—</span>}
                    </td>

                    {/* Unit Cost (pre-markup) */}
                    <td className="border-b border-r px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {fixture.equipment_cost != null ? fmt$(fixture.equipment_cost) : "—"}
                    </td>

                    {/* Adj Cost */}
                    <td className="border-b border-r px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {fixture.equipment_cost != null ? fmt$(adjCost) : "—"}
                    </td>

                    {/* Total Cost */}
                    <td className="border-b px-2 py-1 text-right tabular-nums font-medium">
                      {totalCost > 0 ? fmt$(totalCost) : <span className="text-muted-foreground/30">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer totals */}
            <tfoot className="sticky bottom-0 bg-muted/40 border-t-2">
              <tr className="font-semibold">
                <td className="px-3 py-2 sticky left-0 bg-muted/40" colSpan={4}>
                  TOTAL
                </td>
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
                <td colSpan={3} className="px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
