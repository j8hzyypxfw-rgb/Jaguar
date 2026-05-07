"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { rollupEstimate } from "@/lib/rollupEstimate";
import type { Rental } from "@/types";

type DurationUnit = "day" | "week" | "month";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function computeTotal(row: Partial<Rental>, taxRate: number): number {
  const base = (row.quantity ?? 0) * (row.rate ?? 0) * (row.duration ?? 0);
  return row.taxable ? base * (1 + taxRate) : base;
}

export function RentalsTable({
  projectId,
  estimateId,
  rentalTaxRate,
  initialRows,
}: {
  projectId: string;
  estimateId: string | null;
  rentalTaxRate: number;
  initialRows: Rental[];
}) {
  const [rows, setRows] = useState<Rental[]>(initialRows);
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
    const newRow: Omit<Rental, "id"> = {
      estimate_id: estimateId,
      description: "",
      quantity: 1,
      rate: 0,
      duration: 1,
      unit: "day",
      taxable: false,
      total_cost: 0,
      sort_order: rows.length,
    };
    const { data, error } = await supabase
      .from("rentals")
      .insert(newRow)
      .select()
      .single();
    if (!error && data) {
      const next = [...rows, data as Rental];
      setRows(next);
      await updateEstimateTotal();
    }
  }, [estimateId, rows, supabase, updateEstimateTotal]);

  const saveField = useCallback(
    async (id: string, field: string, value: string | number | boolean | null) => {
      markSaving(id, true);
      const update: Record<string, unknown> = { [field]: value };
      const row = rows.find((r) => r.id === id);
      if (row) {
        const merged = { ...row, [field]: value };
        update.total_cost = computeTotal(merged, rentalTaxRate);
      }
      const { error } = await supabase
        .from("rentals")
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
    [rows, rentalTaxRate, supabase, updateEstimateTotal]
  );

  const deleteRow = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("rentals").delete().eq("id", id);
      if (!error) {
        const next = rows.filter((r) => r.id !== id);
        setRows(next);
        await updateEstimateTotal();
      }
    },
    [rows, supabase, updateEstimateTotal]
  );

  const pretaxTotal = rows.reduce((s, r) => {
    const base = (r.quantity ?? 0) * (r.rate ?? 0) * (r.duration ?? 0);
    return s + base;
  }, 0);

  const taxAmount = rows.reduce((s, r) => {
    if (!r.taxable) return s;
    const base = (r.quantity ?? 0) * (r.rate ?? 0) * (r.duration ?? 0);
    return s + base * rentalTaxRate;
  }, 0);

  const grandTotal = pretaxTotal + taxAmount;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Description
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-16">
                Qty
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-20">
                Duration
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">
                Unit
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">
                Rate ($/unit)
              </th>
              <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground w-16">
                Taxable
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
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No rental rows yet. Click &ldquo;Add Row&rdquo; to begin.
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
                    placeholder="e.g. 45ft Boom Lift"
                    onBlur={(e) => saveField(row.id, "description", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-16 ml-auto"
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
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-20 ml-auto"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={row.duration}
                    onBlur={(e) =>
                      saveField(row.id, "duration", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Select
                    defaultValue={row.unit as DurationUnit}
                    onValueChange={(val) => saveField(row.id, "unit", val)}
                  >
                    <SelectTrigger className="h-8 text-sm w-24 border-transparent hover:border-border focus:border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28 ml-auto"
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={row.rate}
                    onBlur={(e) =>
                      saveField(row.id, "rate", Number(e.target.value))
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-border cursor-pointer"
                    defaultChecked={row.taxable}
                    onChange={(e) => saveField(row.id, "taxable", e.target.checked)}
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
            <tr className="text-sm">
              <td colSpan={6} className="px-3 py-2 text-right text-muted-foreground">
                Pre-tax Subtotal
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(pretaxTotal)}
              </td>
              <td />
            </tr>
            {taxAmount > 0 && (
              <tr className="text-sm">
                <td colSpan={6} className="px-3 py-2 text-right text-muted-foreground">
                  Tax ({(rentalTaxRate * 100).toFixed(2)}%)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(taxAmount)}
                </td>
                <td />
              </tr>
            )}
            <tr className="font-semibold border-t">
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
