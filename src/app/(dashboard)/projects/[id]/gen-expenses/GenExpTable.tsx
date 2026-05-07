"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { rollupEstimate } from "@/lib/rollupEstimate";
import type { GeneralExpense } from "@/types";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function computeTotal(row: Partial<GeneralExpense>): number {
  return (row.quantity ?? 0) * (row.unit_cost ?? 0);
}

export function GenExpTable({
  projectId,
  estimateId,
  initialRows,
}: {
  projectId: string;
  estimateId: string | null;
  initialRows: GeneralExpense[];
}) {
  const [rows, setRows] = useState<GeneralExpense[]>(initialRows);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const updateEstimateTotal = useCallback(
    async () => {
      if (!estimateId) return;
      await rollupEstimate(supabase, estimateId);
    },
    [estimateId, supabase]
  );

  const addRow = useCallback(async () => {
    if (!estimateId) {
      alert("No base estimate found for this project. Create an estimate first.");
      return;
    }
    const newRow: Omit<GeneralExpense, "id"> = {
      estimate_id: estimateId,
      description: "",
      quantity: 1,
      unit: null,
      unit_cost: 0,
      total_cost: 0,
      sort_order: rows.length,
    };
    const { data, error } = await supabase
      .from("general_expenses")
      .insert(newRow)
      .select()
      .single();
    if (!error && data) {
      const next = [...rows, data as GeneralExpense];
      setRows(next);
      await updateEstimateTotal();
    }
  }, [estimateId, rows, supabase, updateEstimateTotal]);

  const saveField = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      markSaving(id, true);
      const update: Record<string, unknown> = { [field]: value };
      const row = rows.find((r) => r.id === id);
      if (row) {
        const merged = { ...row, [field]: value };
        update.total_cost = computeTotal(merged);
      }
      const { error } = await supabase
        .from("general_expenses")
        .update(update)
        .eq("id", id);
      if (!error) {
        const next = rows.map((r) =>
          r.id === id
            ? { ...r, [field]: value, total_cost: update.total_cost as number }
            : r
        );
        setRows(next);
        await updateEstimateTotal();
      }
      markSaving(id, false);
    },
    [rows, supabase, updateEstimateTotal]
  );

  const deleteRow = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("general_expenses")
        .delete()
        .eq("id", id);
      if (!error) {
        const next = rows.filter((r) => r.id !== id);
        setRows(next);
        await updateEstimateTotal();
      }
    },
    [rows, supabase, updateEstimateTotal]
  );

  const grandTotal = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Description
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-20">
                Qty
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">
                Unit
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">
                Unit Cost ($)
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">
                Total
              </th>
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No general expense rows yet. Click &ldquo;Add Row&rdquo; to begin.
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
                    placeholder="e.g. Trailer Rental"
                    onBlur={(e) => saveField(row.id, "description", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-20 ml-auto"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={row.quantity}
                    onBlur={(e) =>
                      saveField(row.id, "quantity", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border w-24"
                    defaultValue={row.unit ?? ""}
                    placeholder="ea / mo"
                    onBlur={(e) =>
                      saveField(row.id, "unit", e.target.value || null)
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28 ml-auto"
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={row.unit_cost}
                    onBlur={(e) =>
                      saveField(row.id, "unit_cost", Number(e.target.value))
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
              <td colSpan={4} className="px-3 py-3 text-right text-sm">
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
