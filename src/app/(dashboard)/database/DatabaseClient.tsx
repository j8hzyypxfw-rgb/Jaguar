"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Plus, Trash2, ChevronLeft, ChevronRight, X, Check, Upload, Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Item } from "@/types";

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtCost(n: number | null | undefined) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4,
  }).format(n);
}

function fmtHrs(n: number | null | undefined) {
  if (!n) return "—";
  return n.toFixed(4);
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({
  item,
  onSave,
  onClose,
}: {
  item: Item;
  onSave: (id: string, updates: Partial<Item>) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Item>>({
    code: item.code,
    description: item.description,
    category: item.category,
    unit_of_measure: item.unit_of_measure,
    material_cost: item.material_cost ?? 0,
    man_hours: item.man_hours ?? 0,
    equipment_cost: item.equipment_cost ?? 0,
    excavation_cost: item.excavation_cost ?? 0,
    sub_cost: item.sub_cost ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  // Close on backdrop click or Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setStr(field: keyof Item) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((p) => ({ ...p, [field]: e.target.value }));
  }
  function setNum(field: keyof Item) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((p) => ({ ...p, [field]: parseFloat(e.target.value) || 0 }));
  }

  async function handleSave() {
    if (!draft.code?.trim() || !draft.description?.trim()) return;
    setSaving(true);
    await onSave(item.id, draft);
    setSaving(false);
    onClose();
  }

  const inputCls = "h-8 text-sm";
  const numCls = inputCls + " text-right tabular-nums";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="bg-card border rounded-xl shadow-2xl w-[520px] max-w-[95vw] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-sm font-semibold">Edit Item</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{item.code}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Code */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Code</Label>
            <Input ref={firstRef} className={inputCls + " font-mono"} value={draft.code ?? ""} onChange={setStr("code")} />
          </div>
          {/* UOM */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Unit of Measure</Label>
            <Input className={inputCls} value={draft.unit_of_measure ?? ""} onChange={setStr("unit_of_measure")} />
          </div>
          {/* Description (full width) */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Description</Label>
            <Input className={inputCls} value={draft.description ?? ""} onChange={setStr("description")} />
          </div>
          {/* Category (full width) */}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs">Category</Label>
            <Input className={inputCls} value={draft.category ?? ""} onChange={setStr("category")} />
          </div>

          {/* Divider */}
          <div className="col-span-2 border-t my-1" />

          {/* Cost fields */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Material Cost / Unit</Label>
            <Input type="number" step="0.0001" className={numCls} value={draft.material_cost ?? 0} onChange={setNum("material_cost")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Man Hours</Label>
            <Input type="number" step="0.0001" className={numCls} value={draft.man_hours ?? 0} onChange={setNum("man_hours")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Equipment Cost</Label>
            <Input type="number" step="0.01" className={numCls} value={draft.equipment_cost ?? 0} onChange={setNum("equipment_cost")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Excavation Cost</Label>
            <Input type="number" step="0.01" className={numCls} value={draft.excavation_cost ?? 0} onChange={setNum("excavation_cost")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Sub Cost</Label>
            <Input type="number" step="0.01" className={numCls} value={draft.sub_cost ?? 0} onChange={setNum("sub_cost")} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-muted/30 rounded-b-xl">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !draft.code?.trim() || !draft.description?.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Add-item row ──────────────────────────────────────────────────────────────

const EMPTY_NEW: Partial<Item> = {
  code: "", description: "", category: "", unit_of_measure: "",
  material_cost: 0, man_hours: 0, equipment_cost: 0,
  excavation_cost: 0, sub_cost: 0,
};

function AddItemRow({
  defaultCategory,
  onSave,
  onCancel,
}: {
  defaultCategory: string;
  onSave: (item: Partial<Item>) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({ ...EMPTY_NEW, category: defaultCategory });
  const [saving, setSaving] = useState(false);

  function f(field: keyof typeof draft) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((p) => ({ ...p, [field]: e.target.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }));
  }

  async function handleSave() {
    if (!draft.code?.trim() || !draft.description?.trim()) return;
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  }

  const inputCls = "h-7 text-xs px-1.5";

  return (
    <tr className="bg-primary/5 border-b-2 border-primary/20">
      <td className="px-2 py-1.5">
        <Input autoFocus className={inputCls + " font-mono w-28"} placeholder="CODE" value={draft.code ?? ""} onChange={f("code")} />
      </td>
      <td className="px-2 py-1.5">
        <Input className={inputCls} placeholder="Description" value={draft.description ?? ""} onChange={f("description")} />
      </td>
      <td className="px-2 py-1.5">
        <Input className={inputCls + " w-20"} placeholder="Category" value={draft.category ?? ""} onChange={f("category")} />
      </td>
      <td className="px-2 py-1.5">
        <Input className={inputCls + " w-16"} placeholder="ea" value={draft.unit_of_measure ?? ""} onChange={f("unit_of_measure")} />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.0001" className={inputCls + " w-24 text-right"} placeholder="0.0000" value={draft.material_cost ?? 0} onChange={f("material_cost")} />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.0001" className={inputCls + " w-20 text-right"} placeholder="0.0000" value={draft.man_hours ?? 0} onChange={f("man_hours")} />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.01" className={inputCls + " w-20 text-right"} placeholder="0.00" value={draft.equipment_cost ?? 0} onChange={f("equipment_cost")} />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.01" className={inputCls + " w-20 text-right"} placeholder="0.00" value={draft.excavation_cost ?? 0} onChange={f("excavation_cost")} />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          <Button size="icon" className="h-7 w-7" onClick={handleSave} disabled={saving || !draft.code?.trim() || !draft.description?.trim()}>
            <Check className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export function DatabaseClient({
  categories,
  totalCount,
}: {
  categories: Record<string, number>;
  totalCount: number;
}) {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([]);
  const [count, setCount] = useState(totalCount);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [page, setPage] = useState(1);
  const [catCounts, setCatCounts] = useState(categories);

  // UI state
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async (q: string, cat: string, pg: number) => {
    setLoading(true);
    let query = supabase
      .from("items")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("category")
      .order("code")
      .range((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE - 1);

    if (q.trim()) query = query.or(`code.ilike.%${q.trim()}%,description.ilike.%${q.trim()}%`);
    if (cat) query = query.eq("category", cat);

    const { data, count: c } = await query;
    setItems((data ?? []) as Item[]);
    setCount(c ?? 0);
    setLoading(false);
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchItems(search, activeCategory, 1);
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, activeCategory, fetchItems]);

  useEffect(() => { fetchItems(search, activeCategory, page); }, [page]);// eslint-disable-line

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async function handleAddItem(draft: Partial<Item>) {
    const { data, error } = await supabase
      .from("items")
      .insert({ ...draft, is_active: true })
      .select()
      .single();
    if (error || !data) return;
    setItems((prev) => [data as Item, ...prev]);
    setCount((c) => c + 1);
    setCatCounts((prev) => ({
      ...prev,
      [draft.category ?? "Other"]: (prev[draft.category ?? "Other"] ?? 0) + 1,
    }));
    setAddingItem(false);
  }

  async function handleUpdateItem(id: string, updates: Partial<Item>) {
    const { error } = await supabase
      .from("items")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...updates } : it));
    // If category changed, refresh sidebar counts
    const changed = items.find((i) => i.id === id);
    if (changed && updates.category && changed.category !== updates.category) {
      setCatCounts((prev) => {
        const next = { ...prev };
        next[changed.category] = Math.max((next[changed.category] ?? 1) - 1, 0);
        next[updates.category!] = (next[updates.category!] ?? 0) + 1;
        return next;
      });
    }
    toast.success("Item updated");
  }

  async function handleDelete(id: string) {
    await supabase.from("items").update({ is_active: false }).eq("id", id);
    const removed = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setCount((c) => c - 1);
    if (removed?.category) {
      setCatCounts((prev) => ({ ...prev, [removed.category]: Math.max((prev[removed.category] ?? 1) - 1, 0) }));
    }
    setConfirmDeleteId(null);
  }

  // ── Categories sidebar ─────────────────────────────────────────────────────

  const sortedCats = Object.entries(catCounts)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const totalPages = Math.ceil(count / PAGE_SIZE);

  // Group items by category for section headers
  const grouped: { cat: string; items: Item[] }[] = [];
  let lastCat = "";
  for (const item of items) {
    const c = item.category ?? "Other";
    if (c !== lastCat) { grouped.push({ cat: c, items: [] }); lastCat = c; }
    grouped[grouped.length - 1].items.push(item);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 border-r flex flex-col bg-card">
        <div className="px-4 py-4 border-b">
          <h2 className="text-sm font-semibold">Item Database</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{totalCount.toLocaleString()} items</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => { setActiveCategory(""); setPage(1); }}
            className={cn(
              "w-full flex items-center justify-between px-4 py-1.5 text-xs transition-colors",
              !activeCategory
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <span>All Items</span>
            <span className="tabular-nums">{totalCount.toLocaleString()}</span>
          </button>
          <div className="mt-1 space-y-px">
            {sortedCats.map(([cat, n]) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setPage(1); }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-1.5 text-xs transition-colors",
                  activeCategory === cat
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <span className="truncate mr-2">{cat}</span>
                <span className="tabular-nums shrink-0">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or description…"
              className="pl-8 h-8 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs text-muted-foreground ml-1">
            {loading ? "Loading…" : `${count.toLocaleString()} items`}
          </span>

          <div className="flex-1" />

          <Button variant="outline" size="sm" className="h-8">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Import DBF
          </Button>
          <Button size="sm" className="h-8" onClick={() => setAddingItem(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Item
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-10 bg-muted border-b shadow-sm">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-32">Code</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Description</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-36">Category</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-14">UOM</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-28">Material</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">M/Hrs</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Equipment</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground w-24">Excav</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {/* Add item row */}
              {addingItem && (
                <AddItemRow
                  defaultCategory={activeCategory}
                  onSave={handleAddItem}
                  onCancel={() => setAddingItem(false)}
                />
              )}

              {grouped.map(({ cat, items: rows }) => (
                <>
                  {/* Category group header */}
                  {!activeCategory && (
                    <tr key={`hdr-${cat}`} className="bg-muted/60 border-y border-border/60">
                      <td colSpan={9} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
                        {cat} <span className="font-normal normal-case ml-1">({rows.length})</span>
                      </td>
                    </tr>
                  )}

                  {rows.map((item) => (
                    confirmDeleteId === item.id ? (
                      /* Delete confirm row */
                      <tr key={item.id} className="bg-destructive/10 border-b border-destructive/20">
                        <td colSpan={6} className="px-3 py-2 text-xs">
                          <span className="font-medium text-destructive">Delete {item.code}?</span>
                          <span className="text-muted-foreground ml-2">This item will be removed from the database.</span>
                        </td>
                        <td colSpan={3} className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDelete(item.id)}>
                              Delete
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id} className="group border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.code}</td>
                        <td className="px-3 py-2 text-xs max-w-xs">
                          <p className="truncate">{item.description}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[140px]">{item.category}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.unit_of_measure}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtCost(item.material_cost)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtHrs(item.man_hours)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtCost(item.equipment_cost)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtCost(item.excavation_cost)}</td>
                        {/* Actions */}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              onClick={() => setEditingItem(item)}
                              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors"
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-muted transition-colors"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </>
              ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-sm text-muted-foreground">
                    No items found{search ? ` for "${search}"` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t bg-card shrink-0">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {count.toLocaleString()} items
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs px-2 tabular-nums">{page}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onSave={handleUpdateItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
