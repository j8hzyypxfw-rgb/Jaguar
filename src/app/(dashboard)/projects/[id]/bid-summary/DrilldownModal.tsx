"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { IndirectLabor, GeneralExpense, Rental } from "@/types";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export interface LineItemRow {
  id: string;
  description: string;
  code: string | null;
  total_qty: number;
  unit_of_measure: string | null;
  unit_equipment: number;
  unit_excavation: number;
  unit_sub: number;
  unit_material: number;
  unit_mhrs: number;
  total_equipment: number;
  total_excavation: number;
  total_sub: number;
  total_material: number;
  total_mhrs: number;
  section_name: string;
  phase_name: string;
}

export type DrillType =
  | "equipment" | "excavation" | "subs" | "material" | "mhrs"
  | "indirect" | "genexp" | "rental";

interface Props {
  type: DrillType;
  title: string;
  total: number;
  lineItems: LineItemRow[];
  indirectLabor: IndirectLabor[];
  genExpenses: GeneralExpense[];
  rentals: Rental[];
  laborRate: number;
  mhrsMult: number;
  onClose: () => void;
}

export function DrilldownModal({
  type, title, total, lineItems,
  indirectLabor, genExpenses, rentals,
  laborRate, mhrsMult,
  onClose,
}: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 bg-background border rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-semibold text-base">{title}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{fmt(total)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 p-0">
          {(type === "equipment" || type === "excavation" || type === "subs" || type === "material" || type === "mhrs") && (
            <LineItemTable type={type} rows={lineItems} laborRate={laborRate} mhrsMult={mhrsMult} />
          )}
          {type === "indirect" && <IndirectTable rows={indirectLabor} />}
          {type === "genexp" && <GenExpTable rows={genExpenses} />}
          {type === "rental" && <RentalTable rows={rentals} />}
        </div>
      </div>
    </div>
  );
}

// ── Line Items Table (Equipment / Excavation / Subs / Material / Mhrs) ────────

function colKey(type: DrillType): keyof LineItemRow {
  if (type === "equipment")  return "total_equipment";
  if (type === "excavation") return "total_excavation";
  if (type === "subs")       return "total_sub";
  if (type === "material")   return "total_material";
  return "total_mhrs";
}

function LineItemTable({ type, rows, laborRate, mhrsMult }: {
  type: DrillType; rows: LineItemRow[]; laborRate: number; mhrsMult: number;
}) {
  const key = colKey(type);
  const filtered = rows
    .filter((r) => (r[key] as number) !== 0)
    .sort((a, b) => (b[key] as number) - (a[key] as number));

  if (!filtered.length) {
    return <p className="px-5 py-8 text-sm text-muted-foreground text-center">No line items for this cost type.</p>;
  }

  const isMhrs = type === "mhrs";

  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0">
        <tr>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Phase / Section</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Qty</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
            {isMhrs ? "Hrs" : "$"}
          </th>
          {isMhrs && (
            <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">$ Cost</th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y">
        {filtered.map((r) => {
          const rawVal = r[key] as number;
          const displayVal = isMhrs ? fmtHrs(rawVal) : fmt(rawVal);
          const dollarCost = isMhrs ? fmt(rawVal * mhrsMult * laborRate) : null;
          return (
            <tr key={r.id} className="hover:bg-muted/20">
              <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {r.phase_name}<br />
                <span className="italic">{r.section_name}</span>
              </td>
              <td className="px-4 py-2">
                {r.code && <span className="text-xs text-muted-foreground mr-2">{r.code}</span>}
                {r.description}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {fmtHrs(r.total_qty)} {r.unit_of_measure ?? ""}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{displayVal}</td>
              {isMhrs && (
                <td className="px-4 py-2 text-right tabular-nums font-medium">{dollarCost}</td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot className="border-t-2 bg-muted/50">
        <tr className="font-semibold">
          <td colSpan={isMhrs ? 3 : 3} className="px-4 py-2.5 text-right text-sm">Total</td>
          <td className="px-4 py-2.5 text-right tabular-nums">
            {isMhrs
              ? fmtHrs(filtered.reduce((s, r) => s + (r.total_mhrs as number), 0))
              : fmt(filtered.reduce((s, r) => s + (r[key] as number), 0))}
          </td>
          {isMhrs && (
            <td className="px-4 py-2.5 text-right tabular-nums">
              {fmt(filtered.reduce((s, r) => s + r.total_mhrs * mhrsMult * laborRate, 0))}
            </td>
          )}
        </tr>
      </tfoot>
    </table>
  );
}

// ── Indirect Labor Table ───────────────────────────────────────────────────────

function IndirectTable({ rows }: { rows: IndirectLabor[] }) {
  const active = rows.filter((r) => (r.total_cost ?? 0) > 0);
  if (!active.length) return <p className="px-5 py-8 text-sm text-muted-foreground text-center">No indirect labor costs entered.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0">
        <tr>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rate/hr</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">People</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Hrs/Wk</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Weeks</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {active.map((r) => (
          <tr key={r.id} className="hover:bg-muted/20">
            <td className="px-4 py-2">{r.description}</td>
            <td className="px-4 py-2 text-right tabular-nums">${(r.labor_rate ?? 0).toFixed(2)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.people}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.hours_per_wk}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.weeks ?? 0}</td>
            <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.total_cost ?? 0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 bg-muted/50">
        <tr className="font-semibold">
          <td colSpan={5} className="px-4 py-2.5 text-right text-sm">Total</td>
          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(active.reduce((s, r) => s + (r.total_cost ?? 0), 0))}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ── General Expenses Table ─────────────────────────────────────────────────────

function GenExpTable({ rows }: { rows: GeneralExpense[] }) {
  const active = rows.filter((r) => (r.total_cost ?? 0) > 0);
  if (!active.length) return <p className="px-5 py-8 text-sm text-muted-foreground text-center">No general expenses entered.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0">
        <tr>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Qty</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Unit</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Unit Cost</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {active.map((r) => (
          <tr key={r.id} className="hover:bg-muted/20">
            <td className="px-4 py-2">{r.description}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.quantity}</td>
            <td className="px-4 py-2 text-muted-foreground">{r.unit ?? "—"}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(r.unit_cost ?? 0)}</td>
            <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.total_cost ?? 0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 bg-muted/50">
        <tr className="font-semibold">
          <td colSpan={4} className="px-4 py-2.5 text-right text-sm">Total</td>
          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(active.reduce((s, r) => s + (r.total_cost ?? 0), 0))}</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ── Rental Table ───────────────────────────────────────────────────────────────

function RentalTable({ rows }: { rows: Rental[] }) {
  const active = rows.filter((r) => (r.total_cost ?? 0) > 0);
  if (!active.length) return <p className="px-5 py-8 text-sm text-muted-foreground text-center">No rental costs entered.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 sticky top-0">
        <tr>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Qty</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Duration</th>
          <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Unit</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rate</th>
          <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {active.map((r) => (
          <tr key={r.id} className="hover:bg-muted/20">
            <td className="px-4 py-2">{r.description}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.quantity}</td>
            <td className="px-4 py-2 text-right tabular-nums">{r.duration}</td>
            <td className="px-4 py-2 text-muted-foreground capitalize">{r.unit}</td>
            <td className="px-4 py-2 text-right tabular-nums">{fmt(r.rate ?? 0)}</td>
            <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.total_cost ?? 0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t-2 bg-muted/50">
        <tr className="font-semibold">
          <td colSpan={5} className="px-4 py-2.5 text-right text-sm">Total</td>
          <td className="px-4 py-2.5 text-right tabular-nums">{fmt(active.reduce((s, r) => s + (r.total_cost ?? 0), 0))}</td>
        </tr>
      </tfoot>
    </table>
  );
}
