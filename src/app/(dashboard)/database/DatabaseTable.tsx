"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X } from "lucide-react";
import type { Item } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function fmt(n: number) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 }).format(n);
}

export function DatabaseTable({ items }: { items: Item[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Item>>({});
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  function startEdit(item: Item) {
    setEditing(item.id);
    setEditData({
      material_cost: item.material_cost,
      equipment_cost: item.equipment_cost,
      man_hours: item.man_hours,
      excavation_cost: item.excavation_cost,
      sub_cost: item.sub_cost,
    });
  }

  async function saveEdit(item: Item) {
    setSaving(true);
    try {
      // Save price history first
      await supabase.from("item_price_history").insert({
        item_id: item.id,
        old_material: item.material_cost,
        new_material: editData.material_cost ?? item.material_cost,
        old_mhrs: item.man_hours,
        new_mhrs: editData.man_hours ?? item.man_hours,
        reason: "Manual update",
      });

      const { error } = await supabase
        .from("items")
        .update({ ...editData, updated_at: new Date().toISOString() })
        .eq("id", item.id);

      if (error) throw error;
      toast.success(`Updated ${item.code}`);
      setEditing(null);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-32">Code</th>
            <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Description</th>
            <th className="text-left px-2 py-2.5 font-medium text-xs text-muted-foreground w-12">UOM</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">Material/Unit</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">M/Hrs</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">Equipment</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">Excav</th>
            <th className="w-20 px-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => {
            const isEditing = editing === item.id;
            return (
              <tr key={item.id} className={`transition-colors ${isEditing ? "bg-accent/20" : "hover:bg-muted/20"}`}>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.code}</td>
                <td className="px-3 py-2 max-w-xs">
                  <p className="truncate">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.category} · {item.subcategory}</p>
                </td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{item.unit_of_measure}</td>

                {isEditing ? (
                  <>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.0001"
                        className="h-7 text-xs"
                        value={editData.material_cost ?? 0}
                        onChange={(e) => setEditData((p) => ({ ...p, material_cost: parseFloat(e.target.value) }))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.0001"
                        className="h-7 text-xs"
                        value={editData.man_hours ?? 0}
                        onChange={(e) => setEditData((p) => ({ ...p, man_hours: parseFloat(e.target.value) }))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 text-xs"
                        value={editData.equipment_cost ?? 0}
                        onChange={(e) => setEditData((p) => ({ ...p, equipment_cost: parseFloat(e.target.value) }))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 text-xs"
                        value={editData.excavation_cost ?? 0}
                        onChange={(e) => setEditData((p) => ({ ...p, excavation_cost: parseFloat(e.target.value) }))}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        <Button size="icon" className="h-7 w-7" onClick={() => saveEdit(item)} disabled={saving}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(item.material_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{item.man_hours?.toFixed(4) ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(item.equipment_cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">{fmt(item.excavation_cost)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => startEdit(item)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
