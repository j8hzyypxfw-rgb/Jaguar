"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { FixtureScheduleEntry, Item } from "@/types";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCost(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(n);
}

// ── Description search cell ───────────────────────────────────────────────────
// Searches the items table and auto-fills Watts / Avg Run / Equip Cost

interface DescriptionSearchCellProps {
  value: string;
  onBlurSave: (val: string) => void;
  onChange: (val: string) => void;
  onSelectItem: (item: Partial<Item>) => void;
}

function DescriptionSearchCell({
  value,
  onBlurSave,
  onChange,
  onSelectItem,
}: DescriptionSearchCellProps) {
  const supabase = createClient();
  const [localVal, setLocalVal] = useState(value);
  const [results, setResults] = useState<Partial<Item>[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync when parent pushes a new value (e.g. after auto-fill)
  useEffect(() => { setLocalVal(value); }, [value]);

  // Live search — debounced 200 ms
  useEffect(() => {
    const q = localVal.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("items")
        .select("id, code, description, watts, avg_length, equipment_cost, category")
        .eq("is_active", true)
        .or(`description.ilike.%${q}%,code.ilike.%${q}%`)
        .order("code")
        .limit(25);
      setResults((data ?? []) as Partial<Item>[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [localVal]); // eslint-disable-line

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        className="h-8 text-sm border-transparent hover:border-border focus:border-border"
        value={localVal}
        placeholder="Type to search DB or enter manually…"
        onChange={(e) => {
          setLocalVal(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (localVal.length >= 2 && results.length > 0) setOpen(true); }}
        onBlur={() => {
          // Small delay so mousedown on dropdown fires first
          setTimeout(() => { setOpen(false); onBlurSave(localVal); }, 150);
        }}
      />

      {/* Dropdown */}
      {open && (loading || results.length > 0) && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[480px] bg-card border rounded-lg shadow-xl overflow-hidden">
          {loading ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Searching…</div>
          ) : (
            <>
              <div className="px-3 py-1.5 border-b bg-muted/40 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-500" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Select to auto-fill Watts · Avg Run · Equip Cost
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {results.map((item) => (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep input focused, prevent blur handler
                      setLocalVal(item.description ?? "");
                      onChange(item.description ?? "");
                      setOpen(false);
                      onSelectItem(item);
                    }}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0">{item.code}</span>
                    <span className="text-xs flex-1 truncate">{item.description}</span>
                    <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {item.watts != null && item.watts > 0 && (
                        <span className="text-amber-600 font-medium">{item.watts}W</span>
                      )}
                      {item.avg_length != null && item.avg_length > 0 && (
                        <span>{item.avg_length} ft</span>
                      )}
                      {item.equipment_cost != null && item.equipment_cost > 0 && (
                        <span>{fmtCost(item.equipment_cost)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FixtureScheduleTable({
  projectId,
  initialFixtures,
}: {
  projectId: string;
  initialFixtures: FixtureScheduleEntry[];
}) {
  const supabase = createClient();
  const [fixtures, setFixtures] = useState<FixtureScheduleEntry[]>(initialFixtures);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  // Update local state for a fixture
  function updateLocal(id: string, updates: Partial<FixtureScheduleEntry>) {
    setFixtures((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  // Save a single field on blur
  const saveField = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      markSaving(id, true);
      await supabase.from("fixture_schedules").update({ [field]: value }).eq("id", id);
      markSaving(id, false);
    },
    [supabase]
  );

  // Auto-fill from DB item selection (saves all fields at once)
  const handleSelectItem = useCallback(
    async (fixtureId: string, item: Partial<Item>) => {
      const updates: Partial<FixtureScheduleEntry> = {
        description:    item.description    ?? "",
        watts:          item.watts          ?? null,
        avg_length:     item.avg_length     ?? null,
        equipment_cost: item.equipment_cost ?? null,
      };
      updateLocal(fixtureId, updates);
      markSaving(fixtureId, true);
      await supabase.from("fixture_schedules").update(updates).eq("id", fixtureId);
      markSaving(fixtureId, false);
    },
    [supabase]
  );

  // Add a new blank row
  const addFixture = useCallback(async () => {
    const { data, error } = await supabase
      .from("fixture_schedules")
      .insert({
        project_id:  projectId,
        type_code:   "",
        description: "",
        sort_order:  fixtures.length,
      })
      .select()
      .single();
    if (error) { console.error(error); return; }
    setFixtures((prev) => [...prev, data as FixtureScheduleEntry]);
  }, [projectId, fixtures.length, supabase]);

  // Delete a row
  const deleteFixture = useCallback(
    async (id: string) => {
      await supabase.from("fixture_schedules").delete().eq("id", id);
      setFixtures((prev) => prev.filter((f) => f.id !== id));
    },
    [supabase]
  );

  const totalEquipCost = fixtures.reduce((s, f) => s + (f.equipment_cost ?? 0), 0);

  const cellCls = "h-8 text-sm border-transparent hover:border-border focus:border-border";
  const numCellCls = cellCls + " text-right tabular-nums";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-20">Type</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">
                Description
                <span className="ml-1.5 text-[10px] font-normal text-amber-600 normal-case">
                  ← search DB to auto-fill →
                </span>
              </th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-36">Manufacturer</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground w-36">Model #</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-20">Watts</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-28">Avg Run (ft)</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground w-32">Equip Cost</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Notes</th>
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>

          <tbody className="divide-y">
            {fixtures.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No fixture types yet. Click "Add Fixture Type" to begin.
                </td>
              </tr>
            )}

            {fixtures.map((fixture) => (
              <tr
                key={fixture.id}
                className={cn("hover:bg-muted/20 transition-colors", saving.has(fixture.id) && "opacity-60")}
              >
                {/* Type code */}
                <td className="px-2 py-1.5">
                  <Input
                    className={cellCls + " font-mono w-16"}
                    defaultValue={fixture.type_code}
                    placeholder="A"
                    onBlur={(e) => {
                      updateLocal(fixture.id, { type_code: e.target.value });
                      saveField(fixture.id, "type_code", e.target.value);
                    }}
                  />
                </td>

                {/* Description — live DB search */}
                <td className="px-2 py-1.5">
                  <DescriptionSearchCell
                    value={fixture.description}
                    onChange={(val) => updateLocal(fixture.id, { description: val })}
                    onBlurSave={(val) => saveField(fixture.id, "description", val)}
                    onSelectItem={(item) => handleSelectItem(fixture.id, item)}
                  />
                </td>

                {/* Manufacturer — uncontrolled */}
                <td className="px-2 py-1.5">
                  <Input
                    className={cellCls}
                    defaultValue={fixture.manufacturer ?? ""}
                    placeholder="Manufacturer"
                    onBlur={(e) => saveField(fixture.id, "manufacturer", e.target.value || null)}
                  />
                </td>

                {/* Model # — uncontrolled */}
                <td className="px-2 py-1.5">
                  <Input
                    className={cellCls}
                    defaultValue={fixture.model_number ?? ""}
                    placeholder="Model #"
                    onBlur={(e) => saveField(fixture.id, "model_number", e.target.value || null)}
                  />
                </td>

                {/* Watts — controlled (auto-fill target) */}
                <td className="px-2 py-1.5">
                  <Input
                    className={numCellCls + " w-full"}
                    type="number"
                    min={0}
                    step={1}
                    value={fixture.watts ?? ""}
                    placeholder="W"
                    onChange={(e) =>
                      updateLocal(fixture.id, { watts: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={(e) =>
                      saveField(fixture.id, "watts", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </td>

                {/* Avg Run (ft) — controlled (auto-fill target) */}
                <td className="px-2 py-1.5">
                  <Input
                    className={numCellCls + " w-full"}
                    type="number"
                    min={0}
                    step={0.5}
                    value={fixture.avg_length ?? ""}
                    placeholder="ft"
                    onChange={(e) =>
                      updateLocal(fixture.id, { avg_length: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={(e) =>
                      saveField(fixture.id, "avg_length", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </td>

                {/* Equip Cost — controlled (auto-fill target) */}
                <td className="px-2 py-1.5">
                  <Input
                    className={numCellCls + " w-full"}
                    type="number"
                    min={0}
                    step={0.01}
                    value={fixture.equipment_cost ?? ""}
                    placeholder="$"
                    onChange={(e) =>
                      updateLocal(fixture.id, { equipment_cost: e.target.value ? Number(e.target.value) : null })
                    }
                    onBlur={(e) =>
                      saveField(fixture.id, "equipment_cost", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </td>

                {/* Notes — uncontrolled */}
                <td className="px-2 py-1.5">
                  <Input
                    className={cellCls}
                    defaultValue={fixture.notes ?? ""}
                    placeholder="Notes"
                    onBlur={(e) => saveField(fixture.id, "notes", e.target.value || null)}
                  />
                </td>

                {/* Delete */}
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => deleteFixture(fixture.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove fixture"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot className="border-t-2 bg-muted/50">
            <tr className="font-semibold">
              <td colSpan={6} className="px-3 py-3 text-right text-sm text-muted-foreground">
                Total Equipment Cost
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-primary text-base">
                {fmtCost(totalEquipCost)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={addFixture}>
          <Plus className="w-4 h-4 mr-2" />
          Add Fixture Type
        </Button>
      </div>
    </div>
  );
}
