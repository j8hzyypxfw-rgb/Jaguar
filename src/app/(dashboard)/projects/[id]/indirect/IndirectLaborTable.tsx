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

type PayType = "salary" | "sub" | "hourly";

const PAY_TYPES: { value: PayType; label: string; hint: string }[] = [
  { value: "hourly", label: "Hourly",      hint: "Own employee, paid by the hour" },
  { value: "sub",    label: "Subcontract", hint: "Subcontracted body, billed hourly" },
  { value: "salary", label: "Salary",      hint: "Annual salary, prorated over the job" },
];

/** Salaried roles are exempt — only these pay types get OT inputs. */
const HOURLY_TYPES: PayType[] = ["hourly", "sub"];
/** Undefined means migration 010 hasn't run yet; treat those rows as hourly, which
 *  is what `computeTotal` does with them, so display and math stay consistent. */
const isHourly = (t: string | null | undefined) =>
  HOURLY_TYPES.includes((t ?? "hourly") as PayType);

const WEEKS_PER_YEAR = 52;

interface IndirectRow {
  id: string;
  estimate_id: string;
  description: string;
  labor_type: string;
  pay_type: string;
  labor_rate: number | null;
  annual_salary: number | null;
  people: number;
  hours_per_wk: number;
  ot_hours_per_wk: number | null;
  ot_multiplier: number | null;
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

/**
 * Salary is annualized: the yearly figure is divided into weeks and charged for the
 * weeks the role is actually on the job. Hourly and sub are straight time plus OT at
 * a multiple of the base rate. Both scale by headcount.
 */
function computeTotal(row: Partial<IndirectRow>): number {
  const people = row.people ?? 1;
  const weeks = row.weeks ?? 0;

  if (row.pay_type === "salary") {
    return ((row.annual_salary ?? 0) / WEEKS_PER_YEAR) * weeks * people;
  }

  const rate = row.labor_rate ?? 0;
  const straight = (row.hours_per_wk ?? 0) * rate;
  const overtime = (row.ot_hours_per_wk ?? 0) * rate * (row.ot_multiplier ?? 1.5);
  return (straight + overtime) * weeks * people;
}

/** Weekly cost per person — shown under the total so the math is checkable. */
function weeklyPerPerson(row: IndirectRow): number {
  const weeks = row.weeks ?? 0;
  const people = row.people ?? 1;
  if (weeks === 0 || people === 0) return 0;
  return computeTotal(row) / weeks / people;
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
      pay_type: "hourly",
      labor_rate: 0,
      annual_salary: 0,
      people: 1,
      hours_per_wk: 40,
      ot_hours_per_wk: 0,
      ot_multiplier: 1.5,
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
                Pay Type
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                People
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Weeks
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Rate
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Hrs/Wk
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                OT Hrs/Wk
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">
                OT ×
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
                  colSpan={10}
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
                  <Select
                    value={row.pay_type ?? "hourly"}
                    onValueChange={(v) => saveField(row.id, "pay_type", v ?? "hourly")}
                  >
                    <SelectTrigger size="sm" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    defaultValue={row.weeks ?? 0}
                    onBlur={(e) =>
                      saveField(row.id, "weeks", Number(e.target.value))
                    }
                  />
                </td>

                {/* Rate — $/hr for hourly & sub, $/yr for salary */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <Input
                      key={`rate-${row.pay_type}`}
                      className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28"
                      type="number"
                      min={0}
                      step={row.pay_type === "salary" ? 1000 : 0.01}
                      defaultValue={
                        row.pay_type === "salary"
                          ? row.annual_salary ?? 0
                          : row.labor_rate ?? 0
                      }
                      onBlur={(e) =>
                        saveField(
                          row.id,
                          row.pay_type === "salary" ? "annual_salary" : "labor_rate",
                          Number(e.target.value)
                        )
                      }
                    />
                    <span className="text-[10px] text-muted-foreground w-6 shrink-0">
                      {row.pay_type === "salary" ? "/yr" : "/hr"}
                    </span>
                  </div>
                </td>

                {/* Hrs/Wk, OT Hrs/Wk, OT × — hourly and sub only */}
                {isHourly(row.pay_type) ? (
                  <>
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
                        defaultValue={row.ot_hours_per_wk ?? 0}
                        onBlur={(e) =>
                          saveField(row.id, "ot_hours_per_wk", Number(e.target.value))
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-16 ml-auto"
                        type="number"
                        min={1}
                        step={0.1}
                        defaultValue={row.ot_multiplier ?? 1.5}
                        onBlur={(e) =>
                          saveField(row.id, "ot_multiplier", Number(e.target.value))
                        }
                      />
                    </td>
                  </>
                ) : (
                  <td
                    colSpan={3}
                    className="px-3 py-1.5 text-center text-xs text-muted-foreground"
                  >
                    Salaried — exempt from OT
                  </td>
                )}

                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {fmt(row.total_cost ?? 0)}
                  {(row.weeks ?? 0) > 0 && (
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {fmt(weeklyPerPerson(row))}/wk ea
                    </span>
                  )}
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
              <td colSpan={8} className="px-3 py-3 text-right text-sm">
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
