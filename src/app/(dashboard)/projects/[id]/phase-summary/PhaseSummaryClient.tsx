"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItemRollup {
  total_equipment: number;
  total_excavation: number;
  total_sub: number;
  total_material: number;
  total_mhrs: number;
  total_installed: number;
}

interface Section {
  id: string;
  name: string;
  sort_order: number;
  line_items: LineItemRollup[];
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

interface Props {
  projectId: string;
  projectName: string;
  phases: Phase[];
  laborRate: number;
  mhrsMult: number;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface SectionTotals {
  equipment: number;
  excavation: number;
  subs: number;
  material: number;
  mhrs: number;
  labor$: number;
  installed: number;
}

const EMPTY: SectionTotals = {
  equipment: 0, excavation: 0, subs: 0,
  material: 0, mhrs: 0, labor$: 0, installed: 0,
};

function addTotals(a: SectionTotals, b: SectionTotals): SectionTotals {
  return {
    equipment:  a.equipment  + b.equipment,
    excavation: a.excavation + b.excavation,
    subs:       a.subs       + b.subs,
    material:   a.material   + b.material,
    mhrs:       a.mhrs       + b.mhrs,
    labor$:     a.labor$     + b.labor$,
    installed:  a.installed  + b.installed,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PhaseSummaryClient({
  projectId,
  projectName,
  phases,
  laborRate,
  mhrsMult,
}: Props) {
  // Toggle which cost figure is shown in the pivot ("installed" = $ total incl. labor)
  const [metric, setMetric] = useState<"installed" | "material" | "labor$" | "mhrs">("installed");

  // Sort phases
  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.sort_order - b.sort_order),
    [phases]
  );

  // Build a pivot: pivot[sectionName][phaseId] = SectionTotals
  // Roll up each phase's sections (across all its areas) by section name
  const { pivot, sectionNames, phaseTotals, sectionTotals, grandTotal } = useMemo(() => {
    const pivot: Record<string, Record<string, SectionTotals>> = {};
    const phaseTotals: Record<string, SectionTotals> = {};
    const sectionTotals: Record<string, SectionTotals> = {};
    let grandTotal: SectionTotals = { ...EMPTY };

    sortedPhases.forEach((ph) => {
      phaseTotals[ph.id] = { ...EMPTY };
      (ph.areas ?? []).forEach((area) => {
        (area.sections ?? []).forEach((s) => {
          const name = (s.name || "Unnamed").trim();
          // Sum the section's line items live (cached section rollups aren't maintained)
          let eq = 0, ex = 0, sub = 0, mat = 0, mh = 0, inst = 0;
          (s.line_items ?? []).forEach((li) => {
            eq   += li.total_equipment  ?? 0;
            ex   += li.total_excavation ?? 0;
            sub  += li.total_sub        ?? 0;
            mat  += li.total_material   ?? 0;
            mh   += li.total_mhrs       ?? 0;
            inst += li.total_installed  ?? 0;
          });
          const labor = mh * mhrsMult * laborRate;
          // If line items don't have total_installed populated, fall back to
          // material + equipment + excavation + subs + labor
          const installed = inst > 0 ? inst : (mat + eq + ex + sub + labor);
          const cell: SectionTotals = {
            equipment:  eq,
            excavation: ex,
            subs:       sub,
            material:   mat,
            mhrs:       mh,
            labor$:     labor,
            installed,
          };

          if (!pivot[name]) pivot[name] = {};
          pivot[name][ph.id] = addTotals(pivot[name][ph.id] ?? EMPTY, cell);

          if (!sectionTotals[name]) sectionTotals[name] = { ...EMPTY };
          sectionTotals[name] = addTotals(sectionTotals[name], cell);

          phaseTotals[ph.id] = addTotals(phaseTotals[ph.id], cell);
          grandTotal = addTotals(grandTotal, cell);
        });
      });
    });

    // Order section names: a sensible electrical-trade order, then alphabetical fallback
    const TRADE_ORDER = [
      "Service", "Distribution", "Feeders", "Power", "Power - Branch", "Branch",
      "Lighting", "Lighting Controls", "Devices", "Wiring Devices",
      "Boxes", "Conduit", "Wire", "Fire Alarm", "Data", "Tele/Data",
      "Security", "AV", "Site", "Site Work", "Grounding", "Temp Power", "Demo", "Other",
    ];
    const orderIdx = (n: string) => {
      const idx = TRADE_ORDER.findIndex((t) => n.toLowerCase().startsWith(t.toLowerCase()));
      return idx === -1 ? 9999 : idx;
    };
    const sectionNames = Object.keys(pivot).sort((a, b) => {
      const oa = orderIdx(a);
      const ob = orderIdx(b);
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });

    return { pivot, sectionNames, phaseTotals, sectionTotals, grandTotal };
  }, [sortedPhases, laborRate, mhrsMult]);

  function cellValue(name: string, phaseId: string): number {
    const cell = pivot[name]?.[phaseId];
    if (!cell) return 0;
    return cell[metric];
  }

  function fmtCell(v: number): string {
    if (v === 0) return "—";
    return metric === "mhrs" ? fmtHrs(v) + " hrs" : fmt$(v);
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  function handleExport() {
    const header = [
      "Section",
      ...sortedPhases.map((p) => p.name),
      "Total",
    ];
    const rows = sectionNames.map((name) => {
      const row: (string | number)[] = [name];
      sortedPhases.forEach((p) => {
        row.push(cellValue(name, p.id));
      });
      row.push(sectionTotals[name][metric]);
      return row;
    });
    const totalRow: (string | number)[] = ["TOTAL"];
    sortedPhases.forEach((p) => totalRow.push(phaseTotals[p.id][metric]));
    totalRow.push(grandTotal[metric]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, totalRow]);
    ws["!cols"] = [
      { wch: 28 },
      ...sortedPhases.map(() => ({ wch: 16 })),
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Phase Summary (${metric})`);
    XLSX.writeFile(
      wb,
      `${projectName.replace(/[^a-z0-9]/gi, "_")}_Phase_Summary.xlsx`
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const noData = sectionNames.length === 0 || sortedPhases.length === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 no-print">
        <Link
          href={`/projects/${projectId}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Phase Summary</h1>
          <p className="text-sm text-muted-foreground">
            {projectName} · totals rolled up by section across all areas in each phase
          </p>
        </div>
        {!noData && (
          <>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </>
        )}
      </div>

      {/* Print header */}
      <div className="print-only mb-6">
        <h1 className="text-2xl font-bold">{projectName}</h1>
        <p className="text-sm text-gray-600">
          Phase Summary · {new Date().toLocaleDateString()}
        </p>
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No section data found. Add line items in the T&amp;E grid to see rollups here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Metric toggle */}
          <div className="flex items-center gap-2 mb-3 no-print">
            <span className="text-xs text-muted-foreground mr-1">Show:</span>
            {([
              { v: "installed", l: "Total Installed" },
              { v: "material",  l: "Material" },
              { v: "labor$",    l: "Labor $" },
              { v: "mhrs",      l: "Man Hours" },
            ] as const).map(({ v, l }) => (
              <button
                key={v}
                onClick={() => setMetric(v)}
                className={cn(
                  "px-3 py-1 rounded text-xs border transition-colors",
                  metric === v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted/50 border-border"
                )}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Pivot table */}
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/40 min-w-[14rem]">
                        Section
                      </th>
                      {sortedPhases.map((p) => (
                        <th
                          key={p.id}
                          className="text-right px-3 py-2 font-semibold whitespace-nowrap min-w-[8rem]"
                        >
                          {p.name}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2 font-semibold border-l bg-primary/5 min-w-[8rem]">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sectionNames.map((name, i) => {
                      const rowTotal = sectionTotals[name][metric];
                      return (
                        <tr
                          key={name}
                          className={cn(
                            "border-b",
                            i % 2 === 0 ? "bg-background" : "bg-muted/10",
                            "hover:bg-muted/30"
                          )}
                        >
                          <td className="px-3 py-1.5 font-medium sticky left-0 bg-inherit">
                            {name}
                          </td>
                          {sortedPhases.map((p) => {
                            const v = cellValue(name, p.id);
                            return (
                              <td
                                key={p.id}
                                className={cn(
                                  "px-3 py-1.5 text-right tabular-nums",
                                  v === 0 && "text-muted-foreground/30"
                                )}
                              >
                                {fmtCell(v)}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-l bg-primary/5">
                            {fmtCell(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="bg-muted/50 border-t-2 font-bold">
                      <td className="px-3 py-2 sticky left-0 bg-muted/50">TOTAL</td>
                      {sortedPhases.map((p) => (
                        <td key={p.id} className="px-3 py-2 text-right tabular-nums">
                          {fmtCell(phaseTotals[p.id][metric])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums text-primary border-l bg-primary/10">
                        {fmtCell(grandTotal[metric])}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Footnote */}
          <p className="text-xs text-muted-foreground mt-3 no-print">
            Labor $ = Man Hours × {mhrsMult.toFixed(2)} ×{" "}
            ${laborRate.toFixed(2)}/hr. Total Installed includes Material +
            Equipment + Excavation + Subs + Labor $ from each section&apos;s rollup.
          </p>
        </>
      )}
    </div>
  );
}
