"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Check,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Item, Typical, TypicalLineItem } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TypicalsTableProps {
  projectId: string;
  initialTypicals: Typical[];
  initialLineItems: TypicalLineItem[];
  allItems: Item[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TypicalsTable({
  initialTypicals,
  initialLineItems,
  allItems,
}: TypicalsTableProps) {
  const supabase = createClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [typicals, setTypicals] = useState<Typical[]>(initialTypicals);
  const [lineItems, setLineItems] = useState<TypicalLineItem[]>(initialLineItems);

  // Expand/collapse per typical
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // "Add Typical" inline form
  const [addingTypical, setAddingTypical] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // "Add Component" panel — keyed by typical_id
  const [addingComponentForId, setAddingComponentForId] = useState<string | null>(null);
  const [componentSearch, setComponentSearch] = useState("");
  const [componentQty, setComponentQty] = useState("1");

  // Inline editing for typical name/description
  const [editingTypicalId, setEditingTypicalId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ── Filtered items for component search ───────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!componentSearch.trim()) return allItems.slice(0, 50);
    const q = componentSearch.toLowerCase();
    return allItems
      .filter(
        (it) =>
          it.code.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allItems, componentSearch]);

  // ── Toggle expand ─────────────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Add a new typical ─────────────────────────────────────────────────────
  async function handleAddTypical() {
    const name = newName.trim();
    if (!name) return;

    const { data, error } = await supabase
      .from("typicals")
      .insert({
        workspace_id: null,
        name,
        code: null,
        description: newCategory.trim() || null,
        unit_of_measure: "ea",
        unit_equipment: 0,
        unit_excavation: 0,
        unit_sub: 0,
        unit_material: 0,
        unit_mhrs: 0,
        unit_installed: 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setTypicals((prev) => [...prev, data as Typical]);
    setExpandedIds((prev) => new Set([...prev, (data as Typical).id]));
    setNewName("");
    setNewCategory("");
    setAddingTypical(false);
  }

  // ── Delete a typical ──────────────────────────────────────────────────────
  async function handleDeleteTypical(id: string) {
    if (!confirm("Delete this typical and all its components?")) return;
    const { error } = await supabase.from("typicals").delete().eq("id", id);
    if (!error) {
      setTypicals((prev) => prev.filter((t) => t.id !== id));
      setLineItems((prev) => prev.filter((li) => li.typical_id !== id));
    }
  }

  // ── Add a component from items DB ─────────────────────────────────────────
  async function handleAddComponent(typicalId: string, item: Item) {
    const qty = parseFloat(componentQty) || 1;

    const existingCount = lineItems.filter(
      (li) => li.typical_id === typicalId
    ).length;

    const { data, error } = await supabase
      .from("typical_line_items")
      .insert({
        typical_id: typicalId,
        item_id: item.id,
        code: item.code,
        description: item.description,
        quantity: qty,
        uom: item.unit_of_measure,
        sort_order: existingCount,
        notes: null,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }

    setLineItems((prev) => [...prev, data as TypicalLineItem]);
    // Keep the panel open, reset search so user can add another
    setComponentSearch("");
    setComponentQty("1");
  }

  // ── Save typical name/description inline edit ─────────────────────────────
  async function handleSaveTypicalName(id: string) {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase
      .from("typicals")
      .update({ name, description: editDescription.trim() || null })
      .eq("id", id);
    if (!error) {
      setTypicals((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, name, description: editDescription.trim() || null } : t
        )
      );
    }
    setEditingTypicalId(null);
  }

  // ── Save component qty inline ─────────────────────────────────────────────
  async function handleSaveComponentQty(compId: string, raw: string) {
    const qty = parseFloat(raw) || 0;
    const { error } = await supabase
      .from("typical_line_items")
      .update({ quantity: qty })
      .eq("id", compId);
    if (!error) {
      setLineItems((prev) =>
        prev.map((li) => (li.id === compId ? { ...li, quantity: qty } : li))
      );
    }
  }

  // ── Delete a component ────────────────────────────────────────────────────
  const handleDeleteComponent = useCallback(
    async (lineItemId: string) => {
      const { error } = await supabase
        .from("typical_line_items")
        .delete()
        .eq("id", lineItemId);
      if (!error) {
        setLineItems((prev) => prev.filter((li) => li.id !== lineItemId));
      }
    },
    [supabase]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Header actions ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          {typicals.length} typical{typicals.length !== 1 ? "s" : ""} in library
        </p>
        {!addingTypical ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddingTypical(true);
              setNewName("");
              setNewCategory("");
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Typical
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTypical();
                if (e.key === "Escape") setAddingTypical(false);
              }}
              placeholder="Typical name…"
              className="h-8 text-sm w-52"
            />
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTypical();
                if (e.key === "Escape") setAddingTypical(false);
              }}
              placeholder="Category / description (optional)"
              className="h-8 text-sm w-56"
            />
            <Button size="sm" onClick={handleAddTypical}>
              <Check className="w-3.5 h-3.5 mr-1" />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAddingTypical(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {typicals.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No typicals yet. Click &ldquo;Add Typical&rdquo; to build your first assembly.
          </p>
        </div>
      )}

      {/* ── Typical cards ───────────────────────────────────────────────── */}
      {typicals.map((typical) => {
        const components = lineItems.filter(
          (li) => li.typical_id === typical.id
        );
        const isExpanded = expandedIds.has(typical.id);
        const isAddingComponent = addingComponentForId === typical.id;

        return (
          <div key={typical.id} className="group rounded-lg border bg-card overflow-hidden">
            {/* Card header */}
            {editingTypicalId === typical.id ? (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20" onClick={(e) => e.stopPropagation()}>
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTypicalName(typical.id);
                    if (e.key === "Escape") setEditingTypicalId(null);
                  }}
                  placeholder="Typical name"
                  className="h-8 text-sm w-52"
                />
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTypicalName(typical.id);
                    if (e.key === "Escape") setEditingTypicalId(null);
                  }}
                  placeholder="Category / description (optional)"
                  className="h-8 text-sm w-56"
                />
                <Button size="sm" onClick={() => handleSaveTypicalName(typical.id)}>
                  <Check className="w-3.5 h-3.5 mr-1" />Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingTypicalId(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-muted/40 transition-colors"
                onClick={() => toggleExpand(typical.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-medium text-sm">{typical.name}</span>
                    {typical.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        {typical.description}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {components.length} component{components.length !== 1 ? "s" : ""}
                </span>

                {/* Edit name button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTypicalId(typical.id);
                    setEditName(typical.name);
                    setEditDescription(typical.description ?? "");
                  }}
                  className="ml-1 p-1 text-muted-foreground hover:text-foreground transition-colors rounded opacity-0 group-hover:opacity-100"
                  title="Edit name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Delete typical button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTypical(typical.id);
                  }}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                  title="Delete typical"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
              <>
                {/* Components table */}
                <div className="border-t overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[200px]">
                          Description
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">
                          Code
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">
                          Qty Factor
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">
                          UOM
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">
                          Unit Material
                        </th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {components.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-3 py-5 text-center text-muted-foreground italic"
                          >
                            No components yet — click &ldquo;Add Component&rdquo; below
                          </td>
                        </tr>
                      ) : (
                        components.map((comp, idx) => {
                          const dbItem = allItems.find(
                            (it) => it.id === comp.item_id
                          );
                          return (
                            <tr
                              key={comp.id}
                              className={`group hover:bg-primary/5 transition-colors ${
                                idx % 2 === 0 ? "bg-background" : "bg-muted/10"
                              }`}
                            >
                              <td className="px-3 py-1.5">
                                {comp.description ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
                                {comp.code ?? "—"}
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  defaultValue={comp.quantity}
                                  onBlur={(e) => handleSaveComponentQty(comp.id, e.target.value)}
                                  className="h-7 text-xs text-right w-20 ml-auto border-transparent hover:border-border focus:border-border"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {comp.uom ?? "—"}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                                {dbItem?.material_cost
                                  ? fmt$(dbItem.material_cost)
                                  : "—"}
                              </td>
                              <td className="px-2 py-1 text-center">
                                <button
                                  onClick={() => handleDeleteComponent(comp.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded"
                                  title="Remove component"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add component footer */}
                <div className="border-t px-3 py-2 bg-muted/10">
                  {!isAddingComponent ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingComponentForId(typical.id);
                        setComponentSearch("");
                        setComponentQty("1");
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Component
                    </Button>
                  ) : (
                    <ComponentSearchPanel
                      items={filteredItems}
                      search={componentSearch}
                      qty={componentQty}
                      onSearchChange={setComponentSearch}
                      onQtyChange={setComponentQty}
                      onSelect={(item) => handleAddComponent(typical.id, item)}
                      onCancel={() => {
                        setAddingComponentForId(null);
                        setComponentSearch("");
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComponentSearchPanel
// ─────────────────────────────────────────────────────────────────────────────

interface ComponentSearchPanelProps {
  items: Item[];
  search: string;
  qty: string;
  onSearchChange: (v: string) => void;
  onQtyChange: (v: string) => void;
  onSelect: (item: Item) => void;
  onCancel: () => void;
}

function ComponentSearchPanel({
  items,
  search,
  qty,
  onSearchChange,
  onQtyChange,
  onSelect,
  onCancel,
}: ComponentSearchPanelProps) {
  function fmt$(n: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }

  return (
    <div className="rounded-lg border bg-card shadow-md p-3 space-y-2 max-w-2xl">
      <div className="flex items-center gap-2">
        {/* Qty factor input */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Qty factor:
          </span>
          <Input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            className="h-7 text-xs w-20 text-right"
          />
        </div>

        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items by code or description…"
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>

        <Button size="icon-xs" variant="ghost" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="max-h-52 overflow-y-auto rounded border divide-y">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No items found
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
            >
              <span className="font-mono text-[10px] text-muted-foreground w-24 shrink-0 truncate">
                {item.code}
              </span>
              <span className="text-xs flex-1 truncate">{item.description}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 w-10 text-center">
                {item.unit_of_measure}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums w-20 text-right">
                {item.material_cost > 0 ? fmt$(item.material_cost) : ""}
              </span>
            </button>
          ))
        )}
      </div>

      {items.length === 50 && (
        <p className="text-[10px] text-muted-foreground">
          Showing first 50 results. Refine your search.
        </p>
      )}
    </div>
  );
}
