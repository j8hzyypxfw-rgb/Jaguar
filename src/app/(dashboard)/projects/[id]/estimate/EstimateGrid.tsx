"use client";

import React, {
  useState,
  useRef,
  useMemo,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  LayoutGrid,
  Check,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { calcLineItemTotals, calcBidSummary } from "@/lib/pricing";
import type {
  Project,
  Estimate,
  Area,
  Phase,
  Section,
  LineItem,
  LineItemQuantity,
  PricingConfig,
  Item,
} from "@/types";

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

function fmtQty(n: number) {
  if (n === 0) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function fmtHrs(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types for local state
// ─────────────────────────────────────────────────────────────────────────────

interface LocalLineItem extends LineItem {
  quantities: LineItemQuantity[];
}

interface LocalSection extends Section {
  line_items: LocalLineItem[];
  open: boolean;
}

interface LocalPhase extends Phase {
  sections: LocalSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface EstimateGridProps {
  project: Project;
  estimate: Estimate | null;
  areas: Area[];
  phases: Phase[];
  items: Item[];
  pricingConfig: PricingConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function EstimateGrid({
  project,
  estimate: initialEstimate,
  areas: initialAreas,
  phases: initialPhases,
  items: allItems,
  pricingConfig,
}: EstimateGridProps) {
  const supabase = createClient();
  // ── Core state ──────────────────────────────────────────────────────────────
  const [estimate, setEstimate] = useState<Estimate | null>(initialEstimate);
  const [areas, setAreas] = useState<Area[]>(initialAreas);
  const [phases, setPhases] = useState<LocalPhase[]>(() =>
    (initialPhases as Phase[]).map((p) => ({
      ...p,
      sections: ((p.sections ?? []) as Section[]).map((s) => ({
        ...s,
        line_items: ((s.line_items ?? []) as LineItem[]).map((li) => ({
          ...li,
          quantities: (li.quantities ?? []) as LineItemQuantity[],
        })),
        open: true,
      })),
    }))
  );
  const [activePhaseIdx, setActivePhaseIdx] = useState(0);

  // ── Modal / panel state ─────────────────────────────────────────────────────
  const [areasModalOpen, setAreasModalOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");

  // Add-phase inline
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");

  // Add-section inline (keyed by phase id)
  const [addingSectionPhaseId, setAddingSectionPhaseId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState("");

  // Add-line-item search (keyed by section id)
  const [addingItemSectionId, setAddingItemSectionId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");

  // ── Debounce qty updates ────────────────────────────────────────────────────
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ─────────────────────────────────────────────────────────────────────────
  // Ensure estimate exists (create on demand)
  // ─────────────────────────────────────────────────────────────────────────

  async function ensureEstimate(): Promise<Estimate> {
    if (estimate) return estimate;
    const { data, error } = await supabase
      .from("estimates")
      .insert({ project_id: project.id, name: "Base Bid", estimate_type: "base" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    setEstimate(data as Estimate);
    return data as Estimate;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Areas management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddArea() {
    const name = newAreaName.trim();
    if (!name) return;
    const est = await ensureEstimate();
    const { data, error } = await supabase
      .from("areas")
      .insert({ estimate_id: est.id, name, sort_order: areas.length })
      .select()
      .single();
    if (error) { console.error(error); return; }
    setAreas((prev) => [...prev, data as Area]);
    setNewAreaName("");
  }

  async function handleDeleteArea(areaId: string) {
    await supabase.from("areas").delete().eq("id", areaId);
    setAreas((prev) => prev.filter((a) => a.id !== areaId));
    // Remove quantities for this area from local state
    setPhases((prev) =>
      prev.map((ph) => ({
        ...ph,
        sections: ph.sections.map((sec) => ({
          ...sec,
          line_items: sec.line_items.map((li) => ({
            ...li,
            quantities: li.quantities.filter((q) => q.area_id !== areaId),
          })),
        })),
      }))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddPhase() {
    const name = newPhaseName.trim();
    if (!name) return;
    const est = await ensureEstimate();
    const { data, error } = await supabase
      .from("phases")
      .insert({ estimate_id: est.id, name, sort_order: phases.length })
      .select()
      .single();
    if (error) { console.error(error); return; }
    const newPhase: LocalPhase = { ...(data as Phase), sections: [] };
    setPhases((prev) => [...prev, newPhase]);
    setActivePhaseIdx(phases.length);
    setNewPhaseName("");
    setAddingPhase(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddSection(phaseId: string) {
    const name = newSectionName.trim();
    if (!name) return;
    const phaseIdx = phases.findIndex((p) => p.id === phaseId);
    const phase = phases[phaseIdx];
    const { data, error } = await supabase
      .from("sections")
      .insert({
        phase_id: phaseId,
        name,
        sort_order: phase.sections.length,
      })
      .select()
      .single();
    if (error) { console.error(error); return; }
    const newSection: LocalSection = {
      ...(data as Section),
      line_items: [],
      open: true,
    };
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId
          ? { ...p, sections: [...p.sections, newSection] }
          : p
      )
    );
    setNewSectionName("");
    setAddingSectionPhaseId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Line item management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddLineItem(sectionId: string, item: Item) {
    const phaseIdx = phases.findIndex((p) =>
      p.sections.some((s) => s.id === sectionId)
    );
    const section = phases[phaseIdx]?.sections.find((s) => s.id === sectionId);
    if (!section) return;

    const { data, error } = await supabase
      .from("line_items")
      .insert({
        section_id: sectionId,
        item_id: item.id,
        code: item.code,
        description: item.description,
        unit_of_measure: item.unit_of_measure,
        unit_equipment: item.equipment_cost,
        unit_excavation: item.excavation_cost,
        unit_sub: item.sub_cost,
        unit_material: item.material_cost,
        unit_mhrs: item.man_hours,
        unit_ot_hrs: 0,
        total_qty: 0,
        sort_order: section.line_items.length,
        price_source: "database",
      })
      .select()
      .single();

    if (error) { console.error(error); return; }

    const newLI: LocalLineItem = { ...(data as LineItem), quantities: [] };
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id === sectionId
            ? { ...s, line_items: [...s.line_items, newLI] }
            : s
        ),
      }))
    );
    setAddingItemSectionId(null);
    setItemSearch("");
  }

  async function handleDeleteLineItem(sectionId: string, lineItemId: string) {
    await supabase.from("line_items").delete().eq("id", lineItemId);
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        sections: p.sections.map((s) =>
          s.id === sectionId
            ? { ...s, line_items: s.line_items.filter((li) => li.id !== lineItemId) }
            : s
        ),
      }))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Quantity input handling (debounced upsert)
  // ─────────────────────────────────────────────────────────────────────────

  function handleQtyChange(
    sectionId: string,
    lineItemId: string,
    areaId: string,
    rawValue: string
  ) {
    const qty = rawValue === "" ? 0 : parseFloat(rawValue) || 0;

    // Optimistic local update
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        sections: p.sections.map((s) => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            line_items: s.line_items.map((li) => {
              if (li.id !== lineItemId) return li;
              const existingIdx = li.quantities.findIndex(
                (q) => q.area_id === areaId
              );
              let newQtys: LineItemQuantity[];
              if (existingIdx >= 0) {
                newQtys = li.quantities.map((q, i) =>
                  i === existingIdx ? { ...q, quantity: qty } : q
                );
              } else {
                newQtys = [
                  ...li.quantities,
                  {
                    id: `tmp-${lineItemId}-${areaId}`,
                    line_item_id: lineItemId,
                    area_id: areaId,
                    quantity: qty,
                  },
                ];
              }
              const totalQty = newQtys.reduce((sum, q) => sum + q.quantity, 0);
              const totals = calcLineItemTotals(
                totalQty,
                {
                  equipment: li.unit_equipment,
                  excavation: li.unit_excavation,
                  sub: li.unit_sub,
                  material: li.unit_material,
                  mhrs: li.unit_mhrs,
                  ot_hrs: li.unit_ot_hrs,
                },
                pricingConfig
              );
              return {
                ...li,
                quantities: newQtys,
                total_qty: totalQty,
                ...totals,
              };
            }),
          };
        }),
      }))
    );

    // Debounced DB write
    const key = `${lineItemId}:${areaId}`;
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      debounceTimers.current.delete(key);
      // Upsert quantity
      await supabase.from("line_item_quantities").upsert(
        { line_item_id: lineItemId, area_id: areaId, quantity: qty },
        { onConflict: "line_item_id,area_id" }
      );
      // Compute new total qty from DB to be safe
      const { data: qtys } = await supabase
        .from("line_item_quantities")
        .select("quantity")
        .eq("line_item_id", lineItemId);
      const totalQty = (qtys ?? []).reduce(
        (sum: number, r: { quantity: number }) => sum + (r.quantity ?? 0),
        0
      );
      // Get unit costs for this line item from current state
      setPhases((prev) => {
        let unitCosts = {
          equipment: 0,
          excavation: 0,
          sub: 0,
          material: 0,
          mhrs: 0,
          ot_hrs: 0,
        };
        for (const p of prev) {
          for (const s of p.sections) {
            if (s.id !== sectionId) continue;
            for (const li of s.line_items) {
              if (li.id !== lineItemId) continue;
              unitCosts = {
                equipment: li.unit_equipment,
                excavation: li.unit_excavation,
                sub: li.unit_sub,
                material: li.unit_material,
                mhrs: li.unit_mhrs,
                ot_hrs: li.unit_ot_hrs,
              };
            }
          }
        }
        const totals = calcLineItemTotals(totalQty, unitCosts, pricingConfig);
        // Update line_items row in DB then roll up to estimate
        supabase
          .from("line_items")
          .update({ total_qty: totalQty, ...totals })
          .eq("id", lineItemId)
          .then(() => rollupEstimate(prev));
        return prev; // local state already updated optimistically
      });
    }, 500);
    debounceTimers.current.set(key, timer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Roll up all line-item totals into the estimates record
  // Called after any qty or line-item change so dashboard + bid summary stay current
  // ─────────────────────────────────────────────────────────────────────────

  async function rollupEstimate(currentPhases: LocalPhase[]) {
    if (!estimate) return;
    let totalEquipment = 0, totalExcavation = 0, totalSubs = 0;
    let totalMaterial = 0, totalMhrs = 0, totalInstalled = 0;
    for (const ph of currentPhases) {
      for (const sec of ph.sections) {
        for (const li of sec.line_items) {
          totalEquipment  += li.total_equipment  ?? 0;
          totalExcavation += li.total_excavation ?? 0;
          totalSubs       += li.total_sub        ?? 0;
          totalMaterial   += li.total_material   ?? 0;
          totalMhrs       += li.total_mhrs       ?? 0;
          totalInstalled  += li.total_installed  ?? 0;
        }
      }
    }

    const bondRates = {
      bond_rate_tier1: 0.025, bond_rate_tier2: 0.015, bond_rate_tier3: 0.010,
      bond_rate_tier4: 0.0075, bond_rate_tier5: 0.0070, bond_rate_tier6: 0.0065,
    };

    const summary = calcBidSummary({
      directEquipment: totalEquipment,
      directExcavation: totalExcavation,
      directSubs: totalSubs,
      directMaterial: totalMaterial,
      directMhrs: totalMhrs,
      directOtHrs: 0,
      indirectLabor: 0,
      genExp: 0,
      rental: 0,
      config: { ...pricingConfig, ...bondRates },
    });

    await supabase.from("estimates").update({
      total_equipment:  totalEquipment,
      total_excavation: totalExcavation,
      total_subs:       totalSubs,
      total_material:   totalMaterial,
      total_mhrs:       totalMhrs,
      direct_cost:      summary.direct_cost,
      job_expense_cost: summary.job_expense,
      job_exp_cow_cost: summary.job_exp_cow,
      overhead_cost:    summary.overhead,
      profit_cost:      summary.profit,
      sales_tax_amount: summary.sales_tax,
      bond_premium:     summary.bond_premium,
      total_bid:        summary.total_bid,
    }).eq("id", estimate.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Toggle section open/closed
  // ─────────────────────────────────────────────────────────────────────────

  function toggleSection(phaseId: string, sectionId: string) {
    setPhases((prev) =>
      prev.map((p) =>
        p.id !== phaseId
          ? p
          : {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId ? { ...s, open: !s.open } : s
              ),
            }
      )
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Item search filter
  // ─────────────────────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return allItems.slice(0, 50);
    const q = itemSearch.toLowerCase();
    return allItems
      .filter(
        (it) =>
          it.code.toLowerCase().includes(q) ||
          it.description.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allItems, itemSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase totals (computed from local line items)
  // ─────────────────────────────────────────────────────────────────────────

  function computePhaseTotals(phase: LocalPhase) {
    let mat = 0,
      hrs = 0,
      installed = 0;
    for (const sec of phase.sections) {
      for (const li of sec.line_items) {
        mat += li.total_material;
        hrs += li.total_mhrs;
        installed += li.total_installed;
      }
    }
    return { mat, hrs, installed };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Active phase
  // ─────────────────────────────────────────────────────────────────────────

  const safeActiveIdx = Math.min(activePhaseIdx, phases.length - 1);
  const activePhase = phases[safeActiveIdx] ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b bg-card shrink-0">
        <Link
          href={`/projects/${project.id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground truncate">
              {project.name}
            </span>
            <span className="text-xs text-muted-foreground">/</span>
            <h1 className="text-sm font-semibold">Takeoff &amp; Estimate</h1>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setAreasModalOpen(true)}
        >
          <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
          Manage Areas
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAddingPhase(true);
            setNewPhaseName("");
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Phase
        </Button>
      </header>

      {/* ── Phase tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-4 border-b bg-card shrink-0 overflow-x-auto">
        {phases.map((phase, idx) => {
          const { mat, hrs, installed } = computePhaseTotals(phase);
          return (
            <button
              key={phase.id}
              onClick={() => setActivePhaseIdx(idx)}
              className={cn(
                "flex flex-col items-start px-4 py-2 text-xs border-b-2 transition-colors whitespace-nowrap shrink-0",
                idx === safeActiveIdx
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}
            >
              <span>{phase.name}</span>
              {installed > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {fmt$(installed)}
                </span>
              )}
            </button>
          );
        })}

        {/* Inline add-phase input */}
        {addingPhase && (
          <div className="flex items-center gap-1 px-2 py-1.5 shrink-0">
            <Input
              autoFocus
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPhase();
                if (e.key === "Escape") setAddingPhase(false);
              }}
              placeholder="Phase name…"
              className="h-6 text-xs w-36 px-2"
            />
            <Button size="icon-xs" onClick={handleAddPhase}>
              <Check className="w-3 h-3" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setAddingPhase(false)}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {phases.length === 0 && !addingPhase && (
          <div className="px-4 py-3 text-xs text-muted-foreground italic">
            No phases yet — click &ldquo;Add Phase&rdquo; to start
          </div>
        )}
      </div>

      {/* ── Main content area ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {!activePhase ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <Layers className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No phases yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first phase to get started
              </p>
            </div>
            <Button
              onClick={() => {
                setAddingPhase(true);
                setNewPhaseName("");
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Phase
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {/* Add section button */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{activePhase.name}</span>
              {addingSectionPhaseId !== activePhase.id ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAddingSectionPhaseId(activePhase.id);
                    setNewSectionName("");
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Section
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddSection(activePhase.id);
                      if (e.key === "Escape") setAddingSectionPhaseId(null);
                    }}
                    placeholder="Section name…"
                    className="h-7 text-xs w-44 px-2"
                  />
                  <Button
                    size="icon-xs"
                    onClick={() => handleAddSection(activePhase.id)}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setAddingSectionPhaseId(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Sections */}
            {activePhase.sections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No sections in this phase. Add a section above.
                </p>
              </div>
            ) : (
              activePhase.sections.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  areas={areas}
                  pricingConfig={pricingConfig}
                  filteredItems={filteredItems}
                  itemSearch={itemSearch}
                  addingItemSectionId={addingItemSectionId}
                  onToggle={() => toggleSection(activePhase.id, section.id)}
                  onQtyChange={(liId, areaId, val) =>
                    handleQtyChange(section.id, liId, areaId, val)
                  }
                  onAddLineItemClick={() => {
                    setAddingItemSectionId(section.id);
                    setItemSearch("");
                  }}
                  onCancelAddItem={() => setAddingItemSectionId(null)}
                  onSelectItem={(item) =>
                    handleAddLineItem(section.id, item)
                  }
                  onItemSearchChange={(v) => setItemSearch(v)}
                  onDeleteLineItem={(liId) =>
                    handleDeleteLineItem(section.id, liId)
                  }
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ── Areas modal ─────────────────────────────────────────────────────── */}
      {areasModalOpen && (
        <AreasModal
          areas={areas}
          newAreaName={newAreaName}
          onNewAreaNameChange={setNewAreaName}
          onAddArea={handleAddArea}
          onDeleteArea={handleDeleteArea}
          onClose={() => setAreasModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionBlock
// ─────────────────────────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: LocalSection;
  areas: Area[];
  pricingConfig: PricingConfig;
  filteredItems: Item[];
  itemSearch: string;
  addingItemSectionId: string | null;
  onToggle: () => void;
  onQtyChange: (liId: string, areaId: string, val: string) => void;
  onAddLineItemClick: () => void;
  onCancelAddItem: () => void;
  onSelectItem: (item: Item) => void;
  onItemSearchChange: (v: string) => void;
  onDeleteLineItem: (liId: string) => void;
}

function SectionBlock({
  section,
  areas,
  pricingConfig,
  filteredItems,
  itemSearch,
  addingItemSectionId,
  onToggle,
  onQtyChange,
  onAddLineItemClick,
  onCancelAddItem,
  onSelectItem,
  onItemSearchChange,
  onDeleteLineItem,
}: SectionBlockProps) {
  const isAddingItems = addingItemSectionId === section.id;

  // Section totals
  const secMat = section.line_items.reduce((s, li) => s + li.total_material, 0);
  const secHrs = section.line_items.reduce((s, li) => s + li.total_mhrs, 0);
  const secInstalled = section.line_items.reduce(
    (s, li) => s + li.total_installed,
    0
  );

  // Number of fixed + computed columns (before area columns)
  const fixedColCount = 4; // Description, UOM, Unit Matl, Unit M/Hrs
  const computedColCount = 4; // Total Qty, Total Material, Total Hrs, Total Installed
  const actionColCount = 1; // delete

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b cursor-pointer select-none hover:bg-muted/60 transition-colors"
        onClick={onToggle}
      >
        {section.open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-semibold flex-1">{section.name}</span>
        {secInstalled > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt$(secInstalled)}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtHrs(secHrs)} hrs
        </span>
      </div>

      {section.open && (
        <>
          {/* Spreadsheet table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b">
                  {/* Fixed columns */}
                  <th className="sticky left-0 z-10 bg-muted/30 text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r min-w-[200px]">
                    Description
                  </th>
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-12">
                    UOM
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20">
                    Unit Matl
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20">
                    Unit M/Hrs
                  </th>

                  {/* Area columns */}
                  {areas.map((area) => (
                    <th
                      key={area.id}
                      className="text-center px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20 bg-blue-50/30 dark:bg-blue-950/20"
                    >
                      {area.name}
                    </th>
                  ))}

                  {/* No areas yet placeholder */}
                  {areas.length === 0 && (
                    <th className="text-center px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-28 bg-blue-50/30 dark:bg-blue-950/20 italic">
                      (no areas)
                    </th>
                  )}

                  {/* Computed columns */}
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-16 bg-muted/50">
                    Total Qty
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-24 bg-muted/50">
                    Total Matl
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20 bg-muted/50">
                    Total Hrs
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-28 bg-muted/50">
                    Total Installed
                  </th>

                  {/* Action */}
                  <th className="w-8" />
                </tr>
              </thead>

              <tbody className="divide-y">
                {section.line_items.length === 0 && !isAddingItems && (
                  <tr>
                    <td
                      colSpan={
                        fixedColCount +
                        Math.max(areas.length, 1) +
                        computedColCount +
                        actionColCount
                      }
                      className="px-3 py-4 text-center text-xs text-muted-foreground italic"
                    >
                      No line items — click &ldquo;Add Line Item&rdquo; to add from
                      the database
                    </td>
                  </tr>
                )}

                {section.line_items.map((li, rowIdx) => (
                  <LineItemRow
                    key={li.id}
                    li={li}
                    areas={areas}
                    rowIdx={rowIdx}
                    onQtyChange={(areaId, val) => onQtyChange(li.id, areaId, val)}
                    onDelete={() => onDeleteLineItem(li.id)}
                  />
                ))}
              </tbody>

              {/* Section subtotal */}
              {section.line_items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td
                      colSpan={
                        fixedColCount + Math.max(areas.length, 1)
                      }
                      className="sticky left-0 bg-muted/20 px-2 py-1.5 text-right text-xs text-muted-foreground"
                    >
                      Section Total
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs" />
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs">
                      {fmt$(secMat)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs">
                      {fmtHrs(secHrs)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs text-primary">
                      {fmt$(secInstalled)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Add line item area */}
          <div className="border-t px-3 py-2">
            {!isAddingItems ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={onAddLineItemClick}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Line Item
              </Button>
            ) : (
              <ItemSearchPanel
                items={filteredItems}
                search={itemSearch}
                onSearchChange={onItemSearchChange}
                onSelect={onSelectItem}
                onCancel={onCancelAddItem}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LineItemRow
// ─────────────────────────────────────────────────────────────────────────────

interface LineItemRowProps {
  li: LocalLineItem;
  areas: Area[];
  rowIdx: number;
  onQtyChange: (areaId: string, val: string) => void;
  onDelete: () => void;
}

function LineItemRow({ li, areas, rowIdx, onQtyChange, onDelete }: LineItemRowProps) {
  const isEven = rowIdx % 2 === 0;

  function getQty(areaId: string): number {
    return li.quantities.find((q) => q.area_id === areaId)?.quantity ?? 0;
  }

  return (
    <tr
      className={cn(
        "group hover:bg-primary/5 transition-colors",
        isEven ? "bg-background" : "bg-muted/10"
      )}
    >
      {/* Description — sticky */}
      <td className={cn(
        "sticky left-0 z-10 px-2 py-1 border-r",
        isEven ? "bg-background" : "bg-muted/10",
        "group-hover:bg-primary/5"
      )}>
        <div className="flex items-center gap-1.5 min-w-0">
          {li.code && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
              {li.code}
            </span>
          )}
          <span className="truncate" title={li.description ?? ""}>
            {li.description ?? "—"}
          </span>
        </div>
      </td>

      {/* UOM */}
      <td className="px-2 py-1 border-r text-muted-foreground whitespace-nowrap">
        {li.unit_of_measure ?? ""}
      </td>

      {/* Unit material */}
      <td className="px-2 py-1 border-r text-right tabular-nums whitespace-nowrap">
        {li.unit_material > 0 ? fmt$(li.unit_material) : "—"}
      </td>

      {/* Unit M/Hrs */}
      <td className="px-2 py-1 border-r text-right tabular-nums whitespace-nowrap">
        {li.unit_mhrs > 0 ? li.unit_mhrs.toFixed(4) : "—"}
      </td>

      {/* Area qty inputs */}
      {areas.map((area) => (
        <td
          key={area.id}
          className="px-1 py-0.5 border-r bg-blue-50/20 dark:bg-blue-950/10 text-center"
        >
          <QtyInput
            value={getQty(area.id)}
            onChange={(val) => onQtyChange(area.id, val)}
          />
        </td>
      ))}

      {/* No areas placeholder */}
      {areas.length === 0 && (
        <td className="px-2 py-1 border-r text-center text-muted-foreground italic text-[10px]">
          add areas
        </td>
      )}

      {/* Total qty */}
      <td className="px-2 py-1 border-r text-right tabular-nums bg-muted/10 whitespace-nowrap">
        {fmtQty(li.total_qty)}
      </td>

      {/* Total material */}
      <td className="px-2 py-1 border-r text-right tabular-nums bg-muted/10 whitespace-nowrap">
        {li.total_material > 0 ? fmt$(li.total_material) : "—"}
      </td>

      {/* Total hrs */}
      <td className="px-2 py-1 border-r text-right tabular-nums bg-muted/10 whitespace-nowrap">
        {li.total_mhrs > 0 ? fmtHrs(li.total_mhrs) : "—"}
      </td>

      {/* Total installed */}
      <td className="px-2 py-1 border-r text-right tabular-nums bg-muted/10 font-medium text-primary whitespace-nowrap">
        {li.total_installed > 0 ? fmt$(li.total_installed) : "—"}
      </td>

      {/* Delete */}
      <td className="px-1 py-0.5 text-center">
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded"
          title="Remove line item"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QtyInput — memoized, small number input cell
// ─────────────────────────────────────────────────────────────────────────────

const QtyInput = React.memo(function QtyInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (val: string) => void;
}) {
  const [localVal, setLocalVal] = useState(value === 0 ? "" : String(value));
  const isDirty = useRef(false);

  // Sync from parent only if user isn't actively editing
  React.useEffect(() => {
    if (!isDirty.current) {
      setLocalVal(value === 0 ? "" : String(value));
    }
  }, [value]);

  return (
    <input
      type="number"
      min="0"
      step="any"
      value={localVal}
      onChange={(e) => {
        isDirty.current = true;
        setLocalVal(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={() => {
        isDirty.current = false;
      }}
      className={cn(
        "w-16 h-6 text-xs text-center tabular-nums rounded border border-transparent",
        "bg-transparent hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50",
        "transition-colors px-1",
        localVal && Number(localVal) > 0
          ? "font-medium text-foreground"
          : "text-muted-foreground"
      )}
      placeholder="0"
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ItemSearchPanel
// ─────────────────────────────────────────────────────────────────────────────

interface ItemSearchPanelProps {
  items: Item[];
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (item: Item) => void;
  onCancel: () => void;
}

function ItemSearchPanel({
  items,
  search,
  onSearchChange,
  onSelect,
  onCancel,
}: ItemSearchPanelProps) {
  return (
    <div className="rounded-lg border bg-card shadow-md p-3 space-y-2 max-w-xl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by code or description…"
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="max-h-48 overflow-y-auto rounded border divide-y">
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
              <span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0 truncate">
                {item.code}
              </span>
              <span className="text-xs flex-1 truncate">{item.description}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {item.unit_of_measure}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
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

// ─────────────────────────────────────────────────────────────────────────────
// AreasModal
// ─────────────────────────────────────────────────────────────────────────────

interface AreasModalProps {
  areas: Area[];
  newAreaName: string;
  onNewAreaNameChange: (v: string) => void;
  onAddArea: () => void;
  onDeleteArea: (id: string) => void;
  onClose: () => void;
}

function AreasModal({
  areas,
  newAreaName,
  onNewAreaNameChange,
  onAddArea,
  onDeleteArea,
  onClose,
}: AreasModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-card border shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Manage Areas</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Areas are the quantity columns in your takeoff (e.g., &ldquo;Building A&rdquo;,
          &ldquo;Floor 1&rdquo;, &ldquo;Zone 1&rdquo;).
        </p>

        {/* Existing areas */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {areas.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-3">
              No areas yet
            </p>
          ) : (
            areas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 group"
              >
                <span className="text-sm">{area.name}</span>
                <button
                  onClick={() => onDeleteArea(area.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add new area */}
        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={newAreaName}
            onChange={(e) => onNewAreaNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddArea();
            }}
            placeholder="New area name…"
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" onClick={onAddArea} disabled={!newAreaName.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add
          </Button>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
