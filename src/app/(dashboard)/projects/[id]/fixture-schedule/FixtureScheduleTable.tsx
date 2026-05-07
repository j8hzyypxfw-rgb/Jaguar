"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { FixtureScheduleEntry } from "@/types";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function FixtureScheduleTable({
  projectId,
  initialFixtures,
}: {
  projectId: string;
  initialFixtures: FixtureScheduleEntry[];
}) {
  const [fixtures, setFixtures] = useState<FixtureScheduleEntry[]>(initialFixtures);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  // ── Add a new blank fixture row ───────────────────────────────────────────
  const addFixture = useCallback(async () => {
    const newFixture: Omit<FixtureScheduleEntry, "id"> = {
      project_id: projectId,
      type_code: "",
      description: "",
      manufacturer: null,
      model_number: null,
      watts: null,
      avg_length: null,
      equipment_cost: null,
      notes: null,
      sort_order: fixtures.length,
    };
    const { data, error } = await supabase
      .from("fixture_schedules")
      .insert(newFixture)
      .select()
      .single();
    if (error) {
      alert(`Failed to add fixture: ${error.message}`);
      return;
    }
    if (data) {
      setFixtures((prev) => [...prev, data as FixtureScheduleEntry]);
    }
  }, [projectId, fixtures.length, supabase]);

  // ── Save a field on blur ─────────────────────────────────────────────────
  const saveField = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      markSaving(id, true);
      const { error } = await supabase
        .from("fixture_schedules")
        .update({ [field]: value })
        .eq("id", id);
      if (!error) {
        setFixtures((prev) =>
          prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
        );
      }
      markSaving(id, false);
    },
    [supabase]
  );

  // ── Delete a row ─────────────────────────────────────────────────────────
  const deleteFixture = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("fixture_schedules")
        .delete()
        .eq("id", id);
      if (!error) {
        setFixtures((prev) => prev.filter((f) => f.id !== id));
      }
    },
    [supabase]
  );

  const totalEquipCost = fixtures.reduce(
    (s, f) => s + (f.equipment_cost ?? 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-20">
                Type
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Description
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-36">
                Manufacturer
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-36">
                Model #
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-24">
                Watts
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">
                Avg Run (ft)
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-32">
                Equip Cost
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Notes
              </th>
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {fixtures.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No fixture types yet. Click "Add Fixture Type" to begin.
                </td>
              </tr>
            )}
            {fixtures.map((fixture) => (
              <tr
                key={fixture.id}
                className={`hover:bg-muted/20 transition-colors ${saving.has(fixture.id) ? "opacity-60" : ""}`}
              >
                {/* Type Code */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm font-mono border-transparent hover:border-border focus:border-border w-16"
                    defaultValue={fixture.type_code}
                    placeholder="A"
                    onBlur={(e) => saveField(fixture.id, "type_code", e.target.value)}
                  />
                </td>
                {/* Description */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border"
                    defaultValue={fixture.description}
                    placeholder="e.g. 2×4 LED Troffer"
                    onBlur={(e) => saveField(fixture.id, "description", e.target.value)}
                  />
                </td>
                {/* Manufacturer */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border"
                    defaultValue={fixture.manufacturer ?? ""}
                    placeholder="Manufacturer"
                    onBlur={(e) =>
                      saveField(fixture.id, "manufacturer", e.target.value || null)
                    }
                  />
                </td>
                {/* Model # */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border"
                    defaultValue={fixture.model_number ?? ""}
                    placeholder="Model #"
                    onBlur={(e) =>
                      saveField(fixture.id, "model_number", e.target.value || null)
                    }
                  />
                </td>
                {/* Watts */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border ml-auto"
                    type="number"
                    min={0}
                    step={1}
                    defaultValue={fixture.watts ?? ""}
                    placeholder="W"
                    onBlur={(e) =>
                      saveField(
                        fixture.id,
                        "watts",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                </td>
                {/* Avg Run Length */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border ml-auto"
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={fixture.avg_length ?? ""}
                    placeholder="ft"
                    onBlur={(e) =>
                      saveField(
                        fixture.id,
                        "avg_length",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                </td>
                {/* Equipment Cost */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border ml-auto"
                    type="number"
                    min={0}
                    step={0.01}
                    defaultValue={fixture.equipment_cost ?? ""}
                    placeholder="$"
                    onBlur={(e) =>
                      saveField(
                        fixture.id,
                        "equipment_cost",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                  />
                </td>
                {/* Notes */}
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm border-transparent hover:border-border focus:border-border"
                    defaultValue={fixture.notes ?? ""}
                    placeholder="Notes"
                    onBlur={(e) =>
                      saveField(fixture.id, "notes", e.target.value || null)
                    }
                  />
                </td>
                {/* Delete */}
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => deleteFixture(fixture.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete fixture type"
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
                Total Equipment Cost
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-primary text-base">
                {fmt(totalEquipCost)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end no-print">
        <Button variant="outline" size="sm" onClick={addFixture}>
          <Plus className="w-4 h-4 mr-2" />
          Add Fixture Type
        </Button>
      </div>
    </div>
  );
}
