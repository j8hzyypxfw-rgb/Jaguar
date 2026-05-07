"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { rollupEstimate } from "@/lib/rollupEstimate";

interface IndirectRow {
  id: string;
  estimate_id: string;
  description: string;
  labor_type: string;
  labor_rate: number | null;
  people: number;
  hours_per_wk: number;
  weeks: number | null;
  total_cost: number;
  sort_order: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function computeTotal(row: Partial<IndirectRow>): number {
  const rate = row.labor_rate ?? 0;
  const hrs = row.hours_per_wk ?? 0;
  const weeks = row.weeks ?? 0;
  const people = row.people ?? 1;
  return rate * hrs * weeks * people;
}

export function IndirectLaborTable({
  projectId,
  estimateId,
  initialRows,
}: {
  projectId: string;
  estimateId: string | null;
  initialRows: IndirectRow[];
}) {
  const [rows, setRows] = useState<IndirectRow[]>(initialRows);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  // ── Add a new blank row ──────────────────────────────────────────────────
  const addRow = useCallback(async () => {
    if (!estimateId) {
      alert("No base estimate found for this project. Create an estimate first.");
      return;
    }
    const newRow: Omit<IndirectRow, "id"> = {
      estimate_id: estimateId,
      description: "",
      labor_type: "hourly",
      labor_rate: 0,
      people: 1,
      hours_per_wk: 0,
      weeks: 0,
      total_cost: 0,
      sort_order: rows.length,
    };
    const { data, error } = await supabase
      .from("indirect_labor")
      .insert(newRow)
      .select()
      .single();
    if (!error && data) {
      setRows((prev) => [...prev, data as IndirectRow]);
    }
  }, [estimateId, rows.length, supabase]);

  // ── Save a field on blur ─────────────────────────────────────────────────
  const saveField = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      markSaving(id, true);
      const update: Record<string, unknown> = { [field]: value };
      // Recompute total_cost whenever a cost-affecting field changes
      const row = rows.find((r) => r.id === id);
      if (row) {
        const merged = { ...row, [field]: value };
        update.total_cost = computeTotal(merged);
      }
      const { error } = await supabase
        .from("indirect_labor")
        .update(update)
        .eq("id", id);
      if (!error) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, [field]: value, total_cost: update.total_cost as number }
              : r
          )
        );
        if (estimateId) await rollupEstimate(supabase, estimateId);
      }
      markSaving(id, false);
    },
    [rows, supabase, estimateId]
  );

  // ── Delete a row ─────────────────────────────────────────────────────────
  const deleteRow = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("indirect_labor")
        .delete()
        .eq("id", id);
      if (!error) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        if (estimateId) await rollupEstimate(supabase, estimateId);
      }
    },
    [supabase, estimateId]
  );

  const grandTotal = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Role / Description
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Type
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                People
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Hrs/Wk
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Weeks
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Rate ($/hr)
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Total
              </th>
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No indirect labor rows yet. Click "Add Row" to begin.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`hover:bg-muted/20 transition-colors ${saving.has(row.id) ? "opacity-60" : ""}`}
              >
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border"
                    defaultValue={row.description}
                    placeholder="e.g. Foreman"
                    onBlur={(e) => saveField(row.id, "description", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border w-28"
                    defaultValue={row.labor_type}
                    placeholder="hourly"
                    onBlur={(e) => saveField(row.id, "labor_type", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-20 ml-auto"
                    type="number"
                    min={1}
                    defaultValue={row.people}
                    onBlur={(e) =>
                      saveField(row.id, "people", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-20 ml-auto"
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={row.hours_per_wk}
                    onBlur={(e) =>
                      saveField(row.id, "hours_per_wk", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-20 ml-auto"
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={row.weeks ?? 0}
                    onBlur={(e) =>
                      saveField(row.id, "weeks", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28 ml-auto"
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={row.labor_rate ?? 0}
                    onBlur={(e) =>
                      saveField(row.id, "labor_rate", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {fmt(row.total_cost ?? 0)}
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete row"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 bg-muted/50">
            <tr className="font-semibold">
              <td colSpan={6} className="px-3 py-3 text-right text-sm">
                Grand Total
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-primary text-base">
                {fmt(grandTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end no-print">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="w-4 h-4 mr-2" />
          Add Row
        </Button>
      </div>
    </div>
  );
}
