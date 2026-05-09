"use client";

import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
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
  Check,
  Pencil,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { calcLineItemTotals } from "@/lib/pricing";
import { rollupEstimate as sharedRollup } from "@/lib/rollupEstimate";
import type {
  Project,
  Estimate,
  Area,
  Phase,
  Section,
  LineItem,
  PricingConfig,
  Item,
  Typical,
  TypicalLineItem,
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
// Default sections seeded for every new area
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SECTIONS = [
  "Lighting",
  "Lighting Control",
  "Branch Power",
  "HVAC",
  "Equipment",
  "Primary",
  "Distribution",
  "Em Distribution",
  "Tele/Data",
  "Fire Alarm",
  "Audio/Visual",
  "Security",
  "Grounding",
  "Temporary Power",
];

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

interface LocalLineItem extends LineItem {}

interface LocalSection extends Section {
  line_items: LocalLineItem[];
}

interface LocalArea extends Area {
  sections: LocalSection[];
}

interface LocalPhase extends Phase {
  areas: LocalArea[];
}

// ─────────────────────────────────────────────────────────────────────────────
// State helpers
// ─────────────────────────────────────────────────────────────────────────────

function updateSection(
  phases: LocalPhase[],
  sectionId: string,
  updater: (s: LocalSection) => LocalSection
): LocalPhase[] {
  return phases.map((ph) => ({
    ...ph,
    areas: ph.areas.map((a) => ({
      ...a,
      sections: a.sections.map((s) => (s.id === sectionId ? updater(s) : s)),
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface EstimateGridProps {
  project: Project;
  estimate: Estimate | null;
  phases: Phase[];
  items: Item[];
  typicals: Typical[];
  typicalLineItems: TypicalLineItem[];
  pricingConfig: PricingConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function EstimateGrid({
  project,
  estimate: initialEstimate,
  phases: initialPhases,
  items: allItems,
  typicals: allTypicals,
  typicalLineItems: allTypicalLineItems,
  pricingConfig,
}: EstimateGridProps) {
  const supabase = createClient();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [estimate, setEstimate] = useState<Estimate | null>(initialEstimate);

  const [phases, setPhases] = useState<LocalPhase[]>(() =>
    (initialPhases as any[]).map((p) => ({
      ...p,
      areas: ((p.areas ?? []) as any[])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((a: any) => ({
          ...a,
          sections: ((a.sections ?? []) as any[])
            .sort((s1: any, s2: any) => s1.sort_order - s2.sort_order)
            .map((s: any) => ({
              ...s,
              line_items: ((s.line_items ?? []) as LineItem[]).sort(
                (l1: any, l2: any) => l1.sort_order - l2.sort_order
              ),
            })),
        })),
    }))
  );

  // Open/collapse for phases and areas
  const [openPhaseIds, setOpenPhaseIds] = useState<Set<string>>(
    () => new Set((initialPhases as Phase[]).map((p) => p.id))
  );
  const [openAreaIds, setOpenAreaIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    for (const p of initialPhases as any[]) {
      for (const a of p.areas ?? []) ids.add(a.id);
    }
    return ids;
  });

  function togglePhase(id: string) {
    setOpenPhaseIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleArea(id: string) {
    setOpenAreaIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Phase CRUD state ────────────────────────────────────────────────────────
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editPhaseName, setEditPhaseName] = useState("");
  const [confirmDeletePhaseId, setConfirmDeletePhaseId] = useState<string | null>(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");

  // ── Area CRUD state ─────────────────────────────────────────────────────────
  const [addingAreaPhaseId, setAddingAreaPhaseId] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState("");
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editAreaName, setEditAreaName] = useState("");
  const [confirmDeleteAreaId, setConfirmDeleteAreaId] = useState<string | null>(null);

  // ── Section CRUD state ──────────────────────────────────────────────────────
  const [addingSectionAreaId, setAddingSectionAreaId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState("");

  // ── Line-item panel state (global — only one open at a time) ────────────────
  const [addingItemSectionId, setAddingItemSectionId] = useState<string | null>(null);
  const [addingItemGroupName, setAddingItemGroupName] = useState<string | null>(null);
  const [insertTypicalSectionId, setInsertTypicalSectionId] = useState<string | null>(null);
  const [typicalSearch, setTypicalSearch] = useState("");
  const [typicalMultiplier, setTypicalMultiplier] = useState("1");

  // ── Debounce map ────────────────────────────────────────────────────────────
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
    const newPhase: LocalPhase = { ...(data as Phase), areas: [] };
    setPhases((prev) => [...prev, newPhase]);
    setOpenPhaseIds((prev) => new Set([...prev, newPhase.id]));
    setNewPhaseName("");
    setAddingPhase(false);
  }

  async function handleRenamePhase(phaseId: string) {
    const name = editPhaseName.trim();
    if (!name) return;
    await supabase.from("phases").update({ name }).eq("id", phaseId);
    setPhases((prev) => prev.map((p) => (p.id === phaseId ? { ...p, name } : p)));
    setEditingPhaseId(null);
  }

  async function handleDeletePhase(phaseId: string) {
    await supabase.from("phases").delete().eq("id", phaseId);
    setPhases((prev) => prev.filter((p) => p.id !== phaseId));
    setOpenPhaseIds((prev) => { const next = new Set(prev); next.delete(phaseId); return next; });
    setConfirmDeletePhaseId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Area management
  // ─────────────────────────────────────────────────────────────────────────

  // Seed default sections into a new area
  async function seedDefaultSections(phaseId: string, areaId: string) {
    const rows = DEFAULT_SECTIONS.map((name, i) => ({
      phase_id: phaseId,  // kept for rollupEstimate compat
      area_id: areaId,
      name,
      sort_order: i,
    }));
    const { data, error } = await supabase.from("sections").insert(rows).select();
    if (error) { console.error("seed sections:", error); return; }
    const newSections: LocalSection[] = (data as Section[]).map((s) => ({
      ...s,
      line_items: [],
    }));
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId
          ? {
              ...p,
              areas: p.areas.map((a) =>
                a.id === areaId ? { ...a, sections: newSections } : a
              ),
            }
          : p
      )
    );
  }

  // Seed any area that came from DB with 0 sections (run once on mount)
  const seededAreaRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const ph of phases) {
      for (const area of ph.areas) {
        if (area.sections.length === 0 && !seededAreaRef.current.has(area.id)) {
          seededAreaRef.current.add(area.id);
          seedDefaultSections(ph.id, area.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddArea(phaseId: string) {
    const name = newAreaName.trim();
    if (!name) return;
    const est = await ensureEstimate();
    const phase = phases.find((p) => p.id === phaseId);
    const { data, error } = await supabase
      .from("areas")
      .insert({
        estimate_id: est.id,
        phase_id: phaseId,
        name,
        sort_order: phase?.areas.length ?? 0,
      })
      .select()
      .single();
    if (error) { console.error(error); return; }
    const newArea: LocalArea = { ...(data as Area), sections: [] };
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId ? { ...p, areas: [...p.areas, newArea] } : p
      )
    );
    setOpenAreaIds((prev) => new Set([...prev, newArea.id]));
    setNewAreaName("");
    setAddingAreaPhaseId(null);
    // Seed 14 default sections for this new area
    seededAreaRef.current.add(newArea.id);
    seedDefaultSections(phaseId, newArea.id);
  }

  async function handleRenameArea(areaId: string) {
    const name = editAreaName.trim();
    if (!name) return;
    await supabase.from("areas").update({ name }).eq("id", areaId);
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        areas: p.areas.map((a) => (a.id === areaId ? { ...a, name } : a)),
      }))
    );
    setEditingAreaId(null);
  }

  async function handleDeleteArea(areaId: string) {
    await supabase.from("areas").delete().eq("id", areaId);
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        areas: p.areas.filter((a) => a.id !== areaId),
      }))
    );
    setOpenAreaIds((prev) => { const next = new Set(prev); next.delete(areaId); return next; });
    setConfirmDeleteAreaId(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddSection(areaId: string, phaseId: string) {
    const name = newSectionName.trim();
    if (!name) return;
    let sortOrder = 0;
    for (const ph of phases) {
      if (ph.id === phaseId) {
        const area = ph.areas.find((a) => a.id === areaId);
        if (area) sortOrder = area.sections.length;
      }
    }
    const { data, error } = await supabase
      .from("sections")
      .insert({ phase_id: phaseId, area_id: areaId, name, sort_order: sortOrder })
      .select()
      .single();
    if (error) { console.error(error); return; }
    const newSection: LocalSection = { ...(data as Section), line_items: [] };
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId
          ? {
              ...p,
              areas: p.areas.map((a) =>
                a.id === areaId
                  ? { ...a, sections: [...a.sections, newSection] }
                  : a
              ),
            }
          : p
      )
    );
    setNewSectionName("");
    setAddingSectionAreaId(null);
  }

  async function handleDeleteSection(sectionId: string, areaId: string) {
    await supabase.from("sections").delete().eq("id", sectionId);
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        areas: p.areas.map((a) =>
          a.id === areaId
            ? { ...a, sections: a.sections.filter((s) => s.id !== sectionId) }
            : a
        ),
      }))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Line item management
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAddLineItem(sectionId: string, item: Item, groupName?: string | null) {
    let sortOrder = 0;
    for (const ph of phases) {
      for (const area of ph.areas) {
        const sec = area.sections.find((s) => s.id === sectionId);
        if (sec) { sortOrder = sec.line_items.length; break; }
      }
    }
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
        sort_order: sortOrder,
        price_source: "database",
        typical_name: groupName ?? null,
      })
      .select()
      .single();
    if (error) { console.error(error); return; }
    const newLI: LocalLineItem = data as LocalLineItem;
    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: [...s.line_items, newLI],
      }))
    );
  }

  async function handleDeleteLineItem(sectionId: string, lineItemId: string) {
    await supabase.from("line_items").delete().eq("id", lineItemId);
    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: s.line_items.filter((li) => li.id !== lineItemId),
      }))
    );
    await rollupEstimate();
  }

  async function handleDeleteLineItems(sectionId: string, lineItemIds: string[]) {
    await supabase.from("line_items").delete().in("id", lineItemIds);
    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: s.line_items.filter((li) => !lineItemIds.includes(li.id)),
      }))
    );
    await rollupEstimate();
  }

  async function handleRenameLineItems(sectionId: string, lineItemIds: string[], newGroupName: string) {
    await supabase.from("line_items").update({ typical_name: newGroupName }).in("id", lineItemIds);
    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: s.line_items.map((li) =>
          lineItemIds.includes(li.id) ? ({ ...li, typical_name: newGroupName } as any) : li
        ),
      }))
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Insert typical — explodes typical_line_items into section
  // ─────────────────────────────────────────────────────────────────────────

  const handleInsertTypical = useCallback(
    async (sectionId: string, typical: Typical, multiplier: number) => {
      const components = allTypicalLineItems.filter((tli) => tli.typical_id === typical.id);
      if (components.length === 0) return;

      let currentSortBase = 0;
      for (const ph of phases) {
        for (const area of ph.areas) {
          const sec = area.sections.find((s) => s.id === sectionId);
          if (sec) { currentSortBase = sec.line_items.length; break; }
        }
      }

      const insertedLineItems: LocalLineItem[] = [];

      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const dbItem = allItems.find((it) => it.id === comp.item_id);
        const qty = comp.quantity * multiplier;

        const unitEquipment  = dbItem?.equipment_cost  ?? 0;
        const unitExcavation = dbItem?.excavation_cost ?? 0;
        const unitSub        = dbItem?.sub_cost        ?? 0;
        const unitMaterial   = dbItem?.material_cost   ?? 0;
        const unitMhrs       = dbItem?.man_hours       ?? 0;

        const totals = calcLineItemTotals(
          qty,
          { equipment: unitEquipment, excavation: unitExcavation, sub: unitSub, material: unitMaterial, mhrs: unitMhrs, ot_hrs: 0 },
          pricingConfig
        );

        const { data, error } = await supabase
          .from("line_items")
          .insert({
            section_id:      sectionId,
            item_id:         comp.item_id,
            code:            comp.code,
            description:     comp.description,
            unit_of_measure: comp.uom,
            unit_equipment:  unitEquipment,
            unit_excavation: unitExcavation,
            unit_sub:        unitSub,
            unit_material:   unitMaterial,
            unit_mhrs:       unitMhrs,
            unit_ot_hrs:     0,
            total_qty:       qty,
            sort_order:      currentSortBase + i,
            price_source:    "typical",
            typical_name:    typical.name,
            ...totals,
          })
          .select()
          .single();

        if (error) { console.error(error); continue; }
        insertedLineItems.push(data as LocalLineItem);
      }

      if (insertedLineItems.length === 0) return;

      setPhases((prev) =>
        updateSection(prev, sectionId, (s) => ({
          ...s,
          line_items: [...s.line_items, ...insertedLineItems],
        }))
      );
      await rollupEstimate();
      setInsertTypicalSectionId(null);
      setTypicalSearch("");
      setTypicalMultiplier("1");
    },
    [allTypicalLineItems, allItems, phases, pricingConfig, supabase]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Quantity change (debounced direct update to total_qty)
  // ─────────────────────────────────────────────────────────────────────────

  function handleQtyChange(sectionId: string, lineItemId: string, rawValue: string) {
    const qty = rawValue === "" ? 0 : parseFloat(rawValue) || 0;

    // Optimistic local update
    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: s.line_items.map((li) => {
          if (li.id !== lineItemId) return li;
          const totals = calcLineItemTotals(
            qty,
            {
              equipment:  li.unit_equipment,
              excavation: li.unit_excavation,
              sub:        li.unit_sub,
              material:   li.unit_material,
              mhrs:       li.unit_mhrs,
              ot_hrs:     li.unit_ot_hrs,
            },
            pricingConfig
          );
          return { ...li, total_qty: qty, ...totals };
        }),
      }))
    );

    // Debounced DB write
    const existing = debounceTimers.current.get(lineItemId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      debounceTimers.current.delete(lineItemId);
      const { data: liRow } = await supabase
        .from("line_items")
        .select("unit_equipment, unit_excavation, unit_sub, unit_material, unit_mhrs, unit_ot_hrs")
        .eq("id", lineItemId)
        .single();
      const unitCosts = {
        equipment:  liRow?.unit_equipment  ?? 0,
        excavation: liRow?.unit_excavation ?? 0,
        sub:        liRow?.unit_sub        ?? 0,
        material:   liRow?.unit_material   ?? 0,
        mhrs:       liRow?.unit_mhrs       ?? 0,
        ot_hrs:     liRow?.unit_ot_hrs     ?? 0,
      };
      const totals = calcLineItemTotals(qty, unitCosts, pricingConfig);
      await supabase
        .from("line_items")
        .update({ total_qty: qty, ...totals })
        .eq("id", lineItemId);
      await rollupEstimate();
    }, 500);
    debounceTimers.current.set(lineItemId, timer);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Line item field editing (description, UOM, unit costs)
  // ─────────────────────────────────────────────────────────────────────────

  async function handleLineItemFieldChange(
    sectionId: string,
    lineItemId: string,
    field: string,
    value: string | number | null
  ) {
    const isCostField = ["unit_equipment", "unit_excavation", "unit_sub", "unit_material", "unit_mhrs", "unit_ot_hrs"].includes(field);
    const needsRecalc = isCostField;

    setPhases((prev) =>
      updateSection(prev, sectionId, (s) => ({
        ...s,
        line_items: s.line_items.map((li) => {
          if (li.id !== lineItemId) return li;
          const updated = { ...li, [field]: value };
          if (needsRecalc) {
            const totals = calcLineItemTotals(
              li.total_qty,
              {
                equipment:  field === "unit_equipment"  ? (value as number) : li.unit_equipment,
                excavation: field === "unit_excavation" ? (value as number) : li.unit_excavation,
                sub:        field === "unit_sub"        ? (value as number) : li.unit_sub,
                material:   field === "unit_material"   ? (value as number) : li.unit_material,
                mhrs:       field === "unit_mhrs"       ? (value as number) : li.unit_mhrs,
                ot_hrs:     field === "unit_ot_hrs"     ? (value as number) : li.unit_ot_hrs,
              },
              pricingConfig
            );
            return { ...updated, ...totals };
          }
          return updated;
        }),
      }))
    );

    const { error } = await supabase.from("line_items").update({ [field]: value }).eq("id", lineItemId);
    if (error) return;

    if (needsRecalc) {
      const { data: liRow } = await supabase
        .from("line_items")
        .select("total_qty, unit_equipment, unit_excavation, unit_sub, unit_material, unit_mhrs, unit_ot_hrs")
        .eq("id", lineItemId)
        .single();
      if (liRow) {
        const totals = calcLineItemTotals(
          liRow.total_qty ?? 0,
          {
            equipment:  liRow.unit_equipment  ?? 0,
            excavation: liRow.unit_excavation ?? 0,
            sub:        liRow.unit_sub        ?? 0,
            material:   liRow.unit_material   ?? 0,
            mhrs:       liRow.unit_mhrs       ?? 0,
            ot_hrs:     liRow.unit_ot_hrs     ?? 0,
          },
          pricingConfig
        );
        await supabase.from("line_items").update(totals).eq("id", lineItemId);
      }
      await rollupEstimate();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Rollup
  // ─────────────────────────────────────────────────────────────────────────

  async function rollupEstimate(estimateId?: string) {
    const eid = estimateId ?? estimate?.id;
    if (!eid) return;
    await sharedRollup(supabase, eid);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered typicals
  // ─────────────────────────────────────────────────────────────────────────

  const filteredTypicals = useMemo(() => {
    if (!typicalSearch.trim()) return allTypicals.slice(0, 50);
    const q = typicalSearch.toLowerCase();
    return allTypicals
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.code ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allTypicals, typicalSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Totals helpers
  // ─────────────────────────────────────────────────────────────────────────

  function computeAreaTotals(area: LocalArea) {
    let mat = 0, hrs = 0, installed = 0;
    for (const sec of area.sections) {
      for (const li of sec.line_items) {
        mat += li.total_material;
        hrs += li.total_mhrs;
        installed += li.total_installed;
      }
    }
    return { mat, hrs, installed };
  }

  function computePhaseTotals(phase: LocalPhase) {
    let mat = 0, hrs = 0, installed = 0;
    for (const area of phase.areas) {
      const t = computeAreaTotals(area);
      mat += t.mat;
      hrs += t.hrs;
      installed += t.installed;
    }
    return { mat, hrs, installed };
  }

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
            <span className="text-xs text-muted-foreground truncate">{project.name}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <h1 className="text-sm font-semibold">Takeoff &amp; Estimate</h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAddingPhase(true); setNewPhaseName(""); }}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add Phase
        </Button>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {phases.length === 0 && !addingPhase ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <Layers className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No phases yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first phase to get started</p>
            </div>
            <Button onClick={() => { setAddingPhase(true); setNewPhaseName(""); }}>
              <Plus className="w-4 h-4 mr-2" /> Add Phase
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Add phase inline input */}
            {addingPhase && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
                <Input
                  autoFocus
                  value={newPhaseName}
                  onChange={(e) => setNewPhaseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddPhase();
                    if (e.key === "Escape") setAddingPhase(false);
                  }}
                  placeholder="Phase name…"
                  className="h-7 text-xs w-48 px-2"
                />
                <Button size="icon-xs" onClick={handleAddPhase}><Check className="w-3 h-3" /></Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setAddingPhase(false)}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {/* Phase blocks */}
            {phases.map((phase) => {
              const isPhaseOpen = openPhaseIds.has(phase.id);
              const { hrs: phHrs, installed: phInstalled } = computePhaseTotals(phase);

              return (
                <div key={phase.id} className="rounded-lg border bg-card">
                  {/* Phase header */}
                  {confirmDeletePhaseId === phase.id ? (
                    <div className="flex items-center gap-3 px-4 py-3 bg-destructive/10 border-b">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-sm flex-1">
                        <span className="font-semibold">Delete "{phase.name}"?</span>
                        <span className="text-muted-foreground ml-2">All areas, sections, and line items will be permanently deleted.</span>
                      </p>
                      <Button size="sm" variant="destructive" onClick={() => handleDeletePhase(phase.id)}>Delete</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeletePhaseId(null)}>Cancel</Button>
                    </div>
                  ) : editingPhaseId === phase.id ? (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b">
                      <Input
                        autoFocus
                        value={editPhaseName}
                        onChange={(e) => setEditPhaseName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenamePhase(phase.id);
                          if (e.key === "Escape") setEditingPhaseId(null);
                        }}
                        className="h-7 text-sm font-semibold w-52 px-2"
                      />
                      <Button size="icon-xs" onClick={() => handleRenamePhase(phase.id)}><Check className="w-3 h-3" /></Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => setEditingPhaseId(null)}><X className="w-3 h-3" /></Button>
                    </div>
                  ) : (
                    <div
                      className="group/phase flex items-center gap-2 px-4 py-3 bg-muted/20 border-b cursor-pointer select-none hover:bg-muted/40 transition-colors"
                      onClick={() => togglePhase(phase.id)}
                    >
                      {isPhaseOpen
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <span className="font-semibold text-sm flex-1">{phase.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {phase.areas.length} area{phase.areas.length !== 1 ? "s" : ""}
                      </span>
                      {phInstalled > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">{fmt$(phInstalled)}</span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtHrs(phHrs)} hrs</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover/phase:opacity-100 transition-opacity ml-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingPhaseId(phase.id); setEditPhaseName(phase.name); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Rename phase"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeletePhaseId(phase.id); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title="Delete phase"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Phase body */}
                  {isPhaseOpen && (
                    <div className="p-3 space-y-2">
                      {/* Add area control */}
                      <div className="flex justify-end">
                        {addingAreaPhaseId !== phase.id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddingAreaPhaseId(phase.id);
                              setNewAreaName("");
                            }}
                          >
                            <MapPin className="w-3.5 h-3.5 mr-1.5" />
                            Add Area
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Input
                              autoFocus
                              value={newAreaName}
                              onChange={(e) => setNewAreaName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddArea(phase.id);
                                if (e.key === "Escape") setAddingAreaPhaseId(null);
                              }}
                              placeholder="Area name… (e.g. Building A, Floor 1)"
                              className="h-7 text-xs w-56 px-2"
                            />
                            <Button size="icon-xs" onClick={() => handleAddArea(phase.id)}><Check className="w-3 h-3" /></Button>
                            <Button size="icon-xs" variant="ghost" onClick={() => setAddingAreaPhaseId(null)}><X className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </div>

                      {/* Areas */}
                      {phase.areas.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                          <p className="text-sm text-muted-foreground">
                            No areas yet. Add an area to begin adding sections and line items.
                          </p>
                        </div>
                      ) : (
                        phase.areas.map((area) => {
                          const isAreaOpen = openAreaIds.has(area.id);
                          const { hrs: aHrs, installed: aInstalled } = computeAreaTotals(area);

                          return (
                            <div key={area.id} className="rounded-lg border bg-muted/10">
                              {/* Area header */}
                              {confirmDeleteAreaId === area.id ? (
                                <div className="flex items-center gap-3 px-3 py-2 bg-destructive/10 border-b rounded-t-lg">
                                  <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                  <p className="text-xs flex-1">
                                    <span className="font-semibold">Delete "{area.name}"?</span>
                                    <span className="text-muted-foreground ml-2">All sections and line items will be deleted.</span>
                                  </p>
                                  <Button size="xs" variant="destructive" onClick={() => handleDeleteArea(area.id)}>Delete</Button>
                                  <Button size="xs" variant="ghost" onClick={() => setConfirmDeleteAreaId(null)}>Cancel</Button>
                                </div>
                              ) : editingAreaId === area.id ? (
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b rounded-t-lg">
                                  <Input
                                    autoFocus
                                    value={editAreaName}
                                    onChange={(e) => setEditAreaName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleRenameArea(area.id);
                                      if (e.key === "Escape") setEditingAreaId(null);
                                    }}
                                    className="h-6 text-xs font-semibold w-44 px-2"
                                  />
                                  <Button size="icon-xs" onClick={() => handleRenameArea(area.id)}><Check className="w-3 h-3" /></Button>
                                  <Button size="icon-xs" variant="ghost" onClick={() => setEditingAreaId(null)}><X className="w-3 h-3" /></Button>
                                </div>
                              ) : (
                                <div
                                  className="group/area flex items-center gap-2 px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 border-b cursor-pointer select-none hover:bg-blue-100/50 dark:hover:bg-blue-950/30 transition-colors rounded-t-lg"
                                  onClick={() => toggleArea(area.id)}
                                >
                                  {isAreaOpen
                                    ? <ChevronDown className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                  <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span className="font-semibold text-xs text-blue-900 dark:text-blue-200 flex-1">{area.name}</span>
                                  <span className="text-[10px] text-blue-600/70">
                                    {area.sections.length} section{area.sections.length !== 1 ? "s" : ""}
                                  </span>
                                  {aInstalled > 0 && (
                                    <span className="text-xs text-blue-700 tabular-nums font-medium">{fmt$(aInstalled)}</span>
                                  )}
                                  <span className="text-xs text-blue-600/80 tabular-nums">{fmtHrs(aHrs)} hrs</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/area:opacity-100 transition-opacity ml-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingAreaId(area.id); setEditAreaName(area.name); }}
                                      className="p-0.5 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-700"
                                      title="Rename area"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteAreaId(area.id); }}
                                      className="p-0.5 rounded hover:bg-blue-100 text-blue-400 hover:text-destructive"
                                      title="Delete area"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Area body */}
                              {isAreaOpen && (
                                <div className="p-2 space-y-2">
                                  {/* Add section control */}
                                  <div className="flex justify-end">
                                    {addingSectionAreaId !== area.id ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => { setAddingSectionAreaId(area.id); setNewSectionName(""); }}
                                      >
                                        <Plus className="w-3 h-3 mr-1" /> Add Section
                                      </Button>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <Input
                                          autoFocus
                                          value={newSectionName}
                                          onChange={(e) => setNewSectionName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleAddSection(area.id, phase.id);
                                            if (e.key === "Escape") setAddingSectionAreaId(null);
                                          }}
                                          placeholder="Section name…"
                                          className="h-6 text-xs w-44 px-2"
                                        />
                                        <Button size="icon-xs" onClick={() => handleAddSection(area.id, phase.id)}><Check className="w-3 h-3" /></Button>
                                        <Button size="icon-xs" variant="ghost" onClick={() => setAddingSectionAreaId(null)}><X className="w-3 h-3" /></Button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Section blocks */}
                                  {area.sections.length === 0 ? (
                                    <div className="rounded border border-dashed p-4 text-center">
                                      <p className="text-xs text-muted-foreground">No sections yet. Add a section above.</p>
                                    </div>
                                  ) : (
                                    area.sections.map((section) => (
                                      <SectionBlock
                                        key={section.id}
                                        section={section}
                                        pricingConfig={pricingConfig}
                                        addingItemSectionId={addingItemSectionId}
                                        addingItemGroupName={addingItemGroupName}
                                        filteredTypicals={filteredTypicals}
                                        typicalSearch={typicalSearch}
                                        typicalMultiplier={typicalMultiplier}
                                        insertTypicalSectionId={insertTypicalSectionId}
                                        onQtyChange={(liId, val) =>
                                          handleQtyChange(section.id, liId, val)
                                        }
                                        onLineItemFieldChange={(liId, field, val) =>
                                          handleLineItemFieldChange(section.id, liId, field, val)
                                        }
                                        onDeleteSection={() =>
                                          handleDeleteSection(section.id, area.id)
                                        }
                                        onAddLineItemClick={(groupName) => {
                                          setAddingItemSectionId(section.id);
                                          setAddingItemGroupName(groupName ?? null);
                                          setInsertTypicalSectionId(null);
                                        }}
                                        onCancelAddItem={() => {
                                          setAddingItemSectionId(null);
                                          setAddingItemGroupName(null);
                                        }}
                                        onSelectItem={(item, groupName) =>
                                          handleAddLineItem(section.id, item, groupName)
                                        }
                                        onDeleteLineItem={(liId) =>
                                          handleDeleteLineItem(section.id, liId)
                                        }
                                        onDeleteLineItems={(liIds) =>
                                          handleDeleteLineItems(section.id, liIds)
                                        }
                                        onRenameLineItems={(liIds, name) =>
                                          handleRenameLineItems(section.id, liIds, name)
                                        }
                                        onInsertTypicalClick={() => {
                                          setInsertTypicalSectionId(section.id);
                                          setAddingItemSectionId(null);
                                          setTypicalSearch("");
                                          setTypicalMultiplier("1");
                                        }}
                                        onCancelInsertTypical={() => setInsertTypicalSectionId(null)}
                                        onSelectTypical={(typical) =>
                                          handleInsertTypical(
                                            section.id,
                                            typical,
                                            parseFloat(typicalMultiplier) || 1
                                          )
                                        }
                                        onTypicalSearchChange={(v) => setTypicalSearch(v)}
                                        onTypicalMultiplierChange={(v) => setTypicalMultiplier(v)}
                                      />
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionBlock
// ─────────────────────────────────────────────────────────────────────────────

interface SectionBlockProps {
  section: LocalSection;
  pricingConfig: PricingConfig;
  addingItemSectionId: string | null;
  addingItemGroupName: string | null;  // lifted from EstimateGrid — single source of truth
  filteredTypicals: Typical[];
  typicalSearch: string;
  typicalMultiplier: string;
  insertTypicalSectionId: string | null;
  onQtyChange: (liId: string, val: string) => void;
  onLineItemFieldChange: (liId: string, field: string, value: string | number | null) => void;
  onDeleteSection: () => void;
  onAddLineItemClick: (groupName?: string | null) => void;
  onCancelAddItem: () => void;
  onSelectItem: (item: Item, groupName?: string | null) => void;
  onDeleteLineItem: (liId: string) => void;
  onDeleteLineItems: (liIds: string[]) => void;
  onRenameLineItems: (liIds: string[], newGroupName: string) => void;
  onInsertTypicalClick: () => void;
  onCancelInsertTypical: () => void;
  onSelectTypical: (typical: Typical) => void;
  onTypicalSearchChange: (v: string) => void;
  onTypicalMultiplierChange: (v: string) => void;
}

function SectionBlock({
  section,
  pricingConfig,
  addingItemSectionId,
  addingItemGroupName,
  filteredTypicals,
  typicalSearch,
  typicalMultiplier,
  insertTypicalSectionId,
  onQtyChange,
  onLineItemFieldChange,
  onDeleteSection,
  onAddLineItemClick,
  onCancelAddItem,
  onSelectItem,
  onDeleteLineItem,
  onDeleteLineItems,
  onRenameLineItems,
  onInsertTypicalClick,
  onCancelInsertTypical,
  onSelectTypical,
  onTypicalSearchChange,
  onTypicalMultiplierChange,
}: SectionBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isLighting = section.name === "Lighting";
  const isAddingItems = addingItemSectionId === section.id;
  const isInsertingTypical = insertTypicalSectionId === section.id;

  // Subsection/group state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [confirmDeleteGroupIdx, setConfirmDeleteGroupIdx] = useState<number | null>(null);
  const [editingGroupIdx, setEditingGroupIdx] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  // NOTE: activeGroupName is NOT local state — it lives in EstimateGrid as addingItemGroupName
  const [addingSubsection, setAddingSubsection] = useState(false);
  const [newSubsectionName, setNewSubsectionName] = useState("");

  function toggleGroup(idx: number) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function handleCreateSubsection() {
    const name = newSubsectionName.trim();
    if (!name) return;
    setAddingSubsection(false);
    setNewSubsectionName("");
    // Pass the group name up so EstimateGrid sets it atomically with opening the panel
    onAddLineItemClick(name);
  }

  // Section totals
  const secHrs = section.line_items.reduce((s, li) => s + li.total_mhrs, 0);
  const secInstalled = section.line_items.reduce((s, li) => s + li.total_installed, 0);

  // Column counts for colspan
  const fixedColCount = isLighting ? 5 : 4; // desc + (type) + uom + unit matl + unit mhrs
  const computedColCount = 3; // total qty + total matl + total hrs + total installed
  const totalCols = fixedColCount + 1 + computedColCount + 1 + 1; // +qty col +installed +action

  // Build groups from consecutive line items with same typical_name
  type ItemGroup = { name: string | null; idx: number; items: typeof section.line_items };
  const groups: ItemGroup[] = [];
  let gIdx = 0;
  for (const li of section.line_items) {
    const gName = (li as any).typical_name as string | null ?? null;
    const last = groups[groups.length - 1];
    if (!last || last.name !== gName) {
      groups.push({ name: gName, idx: gIdx++, items: [li] });
    } else {
      last.items.push(li);
    }
  }

  return (
    <div className="rounded border bg-card">
      {/* Section header */}
      <div
        className="group/hdr flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b cursor-pointer select-none hover:bg-muted/60 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-semibold flex-1">{section.name}</span>
        {secInstalled > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{fmt$(secInstalled)}</span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums">{fmtHrs(secHrs)} hrs</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteSection(); }}
          className="opacity-0 group-hover/hdr:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded ml-1"
          title="Remove section"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isOpen && (
        <>
          {/* Spreadsheet table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="sticky left-0 z-20 bg-muted text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r min-w-[200px]">
                    Description
                  </th>
                  {isLighting && (
                    <th className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-14">Type</th>
                  )}
                  <th className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-12">UOM</th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20">Unit Matl</th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20">Unit Hrs</th>
                  <th className="text-center px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-24 bg-blue-50/30 dark:bg-blue-950/20">QTY</th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-24 bg-muted/50">Total Matl</th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-20 bg-muted/50">Total Hrs</th>
                  <th className="text-right px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap border-r w-28 bg-muted/50">Installed</th>
                  <th className="w-8" />
                </tr>
              </thead>

              <tbody className="divide-y">
                {section.line_items.length === 0 && !isAddingItems && (
                  <tr>
                    <td colSpan={totalCols} className="px-3 py-4 text-center text-xs text-muted-foreground italic">
                      No line items — click "Add Line Item" or "Insert Typical" below
                    </td>
                  </tr>
                )}

                {groups.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.idx);
                  const gMat = group.items.reduce((s, li) => s + li.total_material, 0);
                  const gHrs = group.items.reduce((s, li) => s + li.total_mhrs, 0);
                  const gInstalled = group.items.reduce((s, li) => s + li.total_installed, 0);

                  return (
                    <React.Fragment key={`grp-${group.idx}`}>
                      {/* Group header row — only for named groups */}
                      {group.name && (
                        confirmDeleteGroupIdx === group.idx ? (
                          <tr className="bg-destructive/10 border-t border-destructive/20">
                            <td colSpan={totalCols} className="px-3 py-1.5">
                              <div className="flex items-center gap-3">
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                <span className="text-xs flex-1">
                                  <span className="font-semibold text-destructive">Remove "{group.name}"?</span>
                                  <span className="text-muted-foreground ml-2">All {group.items.length} line items will be deleted.</span>
                                </span>
                                <Button size="xs" variant="destructive" onClick={() => { onDeleteLineItems(group.items.map((li) => li.id)); setConfirmDeleteGroupIdx(null); }}>Delete</Button>
                                <Button size="xs" variant="ghost" onClick={() => setConfirmDeleteGroupIdx(null)}>Cancel</Button>
                              </div>
                            </td>
                          </tr>
                        ) : editingGroupIdx === group.idx ? (
                          <tr className="bg-amber-50/70 border-t border-amber-200">
                            <td colSpan={totalCols} className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <Input
                                  autoFocus
                                  value={editGroupName}
                                  onChange={(e) => setEditGroupName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && editGroupName.trim()) {
                                      onRenameLineItems(group.items.map((li) => li.id), editGroupName.trim());
                                      setEditingGroupIdx(null);
                                    }
                                    if (e.key === "Escape") setEditingGroupIdx(null);
                                  }}
                                  className="h-6 text-xs w-52 px-2 font-semibold"
                                />
                                <Button size="icon-xs" onClick={() => { if (editGroupName.trim()) { onRenameLineItems(group.items.map((li) => li.id), editGroupName.trim()); setEditingGroupIdx(null); } }}>
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button size="icon-xs" variant="ghost" onClick={() => setEditingGroupIdx(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr
                            className="group/grphdr bg-amber-50/70 border-t border-amber-200 cursor-pointer hover:bg-amber-100/70 select-none"
                            onClick={() => toggleGroup(group.idx)}
                          >
                            <td colSpan={fixedColCount + 1} className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                {isCollapsed
                                  ? <ChevronRight className="w-3 h-3 text-amber-700 shrink-0" />
                                  : <ChevronDown className="w-3 h-3 text-amber-700 shrink-0" />}
                                <span className="text-xs font-semibold text-amber-900">{group.name}</span>
                                <span className="text-[10px] text-amber-600 ml-1">({group.items.length} items)</span>
                                <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover/grphdr:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onAddLineItemClick(group.name); }}
                                    className="text-amber-500 hover:text-amber-800 p-0.5 rounded"
                                    title="Add line item to this group"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEditingGroupIdx(group.idx); setEditGroupName(group.name ?? ""); }}
                                    className="text-amber-500 hover:text-amber-800 p-0.5 rounded"
                                    title="Rename group"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteGroupIdx(group.idx); }}
                                    className="text-amber-500 hover:text-destructive p-0.5 rounded"
                                    title="Remove group and all its items"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-right text-xs text-amber-700 tabular-nums font-medium">{gMat > 0 ? fmt$(gMat) : ""}</td>
                            <td className="px-2 py-1.5 text-right text-xs text-amber-700 tabular-nums">{gHrs > 0 ? fmtHrs(gHrs) : ""}</td>
                            <td className="px-2 py-1.5 text-right text-xs font-semibold text-amber-900 tabular-nums">{gInstalled > 0 ? fmt$(gInstalled) : ""}</td>
                            <td />
                          </tr>
                        )
                      )}

                      {/* Line item rows */}
                      {!isCollapsed && group.items.map((li, rowIdx) => (
                        <LineItemRow
                          key={li.id}
                          li={li}
                          rowIdx={rowIdx}
                          isLighting={isLighting}
                          isTypicalChild={!!group.name}
                          onQtyChange={(val) => onQtyChange(li.id, val)}
                          onFieldChange={(field, val) => onLineItemFieldChange(li.id, field, val)}
                          onDelete={() => onDeleteLineItem(li.id)}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer actions */}
          <div className="border-t px-3 py-2">
            {addingSubsection ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground shrink-0">Subsection name:</span>
                <Input
                  autoFocus
                  value={newSubsectionName}
                  onChange={(e) => setNewSubsectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubsection();
                    if (e.key === "Escape") { setAddingSubsection(false); setNewSubsectionName(""); }
                  }}
                  placeholder='e.g. Duct Bank (12) 4"'
                  className="h-6 text-xs w-48 px-2"
                />
                <Button size="icon-xs" onClick={handleCreateSubsection}><Check className="w-3 h-3" /></Button>
                <Button size="icon-xs" variant="ghost" onClick={() => { setAddingSubsection(false); setNewSubsectionName(""); }}><X className="w-3 h-3" /></Button>
              </div>
            ) : !isAddingItems && !isInsertingTypical ? (
              <div className="flex items-center gap-2">
                <Button size="xs" variant="ghost" onClick={() => onAddLineItemClick(null)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Line Item
                </Button>
                <Button size="xs" variant="ghost" onClick={onInsertTypicalClick}>
                  <Layers className="w-3 h-3 mr-1" /> Insert Typical
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setAddingSubsection(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add Subsection
                </Button>
              </div>
            ) : isAddingItems ? (
              <ItemSearchPanel
                onSelect={(item) => onSelectItem(item, addingItemGroupName)}
                onCancel={onCancelAddItem}
                keepOpenAfterSelect
                groupLabel={addingItemGroupName ?? undefined}
              />
            ) : (
              <TypicalSearchPanel
                typicals={filteredTypicals}
                search={typicalSearch}
                multiplier={typicalMultiplier}
                onSearchChange={onTypicalSearchChange}
                onMultiplierChange={onTypicalMultiplierChange}
                onSelect={onSelectTypical}
                onCancel={onCancelInsertTypical}
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
  rowIdx: number;
  onQtyChange: (val: string) => void;
  onFieldChange: (field: string, value: string | number | null) => void;
  onDelete: () => void;
  isTypicalChild?: boolean;
  isLighting?: boolean;
}

const cellInput = "w-full h-6 text-xs bg-transparent border border-transparent rounded px-1 hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50 transition-colors";

function LineItemRow({ li, rowIdx, onQtyChange, onFieldChange, onDelete, isTypicalChild, isLighting }: LineItemRowProps) {
  const isEven = rowIdx % 2 === 0;

  return (
    <tr
      className={cn(
        "group hover:bg-primary/10 transition-colors",
        isEven ? "bg-white dark:bg-background" : "bg-muted/40"
      )}
    >
      {/* Description — sticky */}
      <td className={cn(
        "sticky left-0 z-20 px-2 py-1 border-r",
        isEven ? "bg-white dark:bg-background" : "bg-muted",
        "group-hover:bg-primary/10"
      )}>
        <div className={cn("flex items-center gap-1.5 min-w-0", isTypicalChild && "pl-3")}>
          {li.code && (
            <span className="text-[10px] font-mono text-muted-foreground shrink-0 select-none">
              {li.code}
            </span>
          )}
          <input
            className={cn(cellInput, "min-w-0 flex-1")}
            defaultValue={li.description ?? ""}
            placeholder="Description"
            onBlur={(e) => onFieldChange("description", e.target.value || null)}
          />
        </div>
      </td>

      {/* Type (Lighting only) */}
      {isLighting && (
        <td className="px-2 py-1 border-r whitespace-nowrap">
          <input
            className={cn(cellInput, "w-12 font-mono text-center")}
            defaultValue={li.fixture_type ?? ""}
            placeholder="A"
            onBlur={(e) => onFieldChange("fixture_type", e.target.value || null)}
          />
        </td>
      )}

      {/* UOM */}
      <td className="px-2 py-1 border-r whitespace-nowrap">
        <input
          className={cn(cellInput, "w-14")}
          defaultValue={li.unit_of_measure ?? ""}
          placeholder="UOM"
          onBlur={(e) => onFieldChange("unit_of_measure", e.target.value || null)}
        />
      </td>

      {/* Unit material */}
      <td className="px-2 py-1 border-r whitespace-nowrap">
        <input
          type="number"
          min={0}
          step={0.01}
          className={cn(cellInput, "w-20 text-right tabular-nums")}
          defaultValue={li.unit_material > 0 ? li.unit_material : ""}
          placeholder="0.00"
          onBlur={(e) => onFieldChange("unit_material", e.target.value ? Number(e.target.value) : 0)}
        />
      </td>

      {/* Unit M/Hrs */}
      <td className="px-2 py-1 border-r whitespace-nowrap">
        <input
          type="number"
          min={0}
          step={0.0001}
          className={cn(cellInput, "w-20 text-right tabular-nums")}
          defaultValue={li.unit_mhrs > 0 ? li.unit_mhrs : ""}
          placeholder="0.0000"
          onBlur={(e) => onFieldChange("unit_mhrs", e.target.value ? Number(e.target.value) : 0)}
        />
      </td>

      {/* QTY */}
      <td className="px-1 py-0.5 border-r bg-blue-50/20 dark:bg-blue-950/10 text-center">
        <QtyInput
          value={li.total_qty}
          onChange={onQtyChange}
        />
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
// QtyInput
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
      onBlur={() => { isDirty.current = false; }}
      className={cn(
        "w-20 h-6 text-xs text-center tabular-nums rounded border border-transparent",
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
  onSelect: (item: Item) => void;
  onCancel: () => void;
  keepOpenAfterSelect?: boolean;
  groupLabel?: string;
}

function ItemSearchPanel({ onSelect, onCancel, keepOpenAfterSelect, groupLabel }: ItemSearchPanelProps) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("items")
        .select("id, code, description, category, unit_of_measure, material_cost, man_hours, equipment_cost, excavation_cost, sub_cost")
        .eq("is_active", true)
        .or(`code.ilike.%${q}%,description.ilike.%${q}%`)
        .order("code")
        .limit(50);
      setResults((data ?? []) as Item[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  function handleSelect(item: Item) {
    onSelect(item);
    if (keepOpenAfterSelect) {
      setAddedCodes((prev) => new Set([...prev, item.code]));
      inputRef.current?.focus();
    }
  }

  return (
    <div className="rounded-lg border bg-card shadow-md p-3 space-y-2 max-w-xl">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code or description…"
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>
        {groupLabel && (
          <span className="text-[10px] bg-amber-100 border border-amber-200 text-amber-800 rounded px-1.5 py-0.5 shrink-0 font-medium truncate max-w-[140px]">
            → {groupLabel}
          </span>
        )}
        {keepOpenAfterSelect ? (
          <Button size="xs" variant="outline" onClick={onCancel}>Done</Button>
        ) : (
          <Button size="icon-xs" variant="ghost" onClick={onCancel}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto rounded border divide-y">
        {loading ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Searching…</div>
        ) : !search.trim() ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Type to search items</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">No items found</div>
        ) : (
          results.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors",
                addedCodes.has(item.code) && "bg-emerald-50/60"
              )}
            >
              <span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0 truncate">{item.code}</span>
              <span className="text-xs flex-1 truncate">{item.description}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{item.unit_of_measure}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {item.material_cost > 0 ? fmt$(item.material_cost) : ""}
              </span>
              {addedCodes.has(item.code) && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
            </button>
          ))
        )}
      </div>

      {results.length === 50 && (
        <p className="text-[10px] text-muted-foreground">Showing first 50. Refine your search.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypicalSearchPanel
// ─────────────────────────────────────────────────────────────────────────────

interface TypicalSearchPanelProps {
  typicals: Typical[];
  search: string;
  multiplier: string;
  onSearchChange: (v: string) => void;
  onMultiplierChange: (v: string) => void;
  onSelect: (typical: Typical) => void;
  onCancel: () => void;
}

function TypicalSearchPanel({
  typicals,
  search,
  multiplier,
  onSearchChange,
  onMultiplierChange,
  onSelect,
  onCancel,
}: TypicalSearchPanelProps) {
  return (
    <div className="rounded-lg border bg-card shadow-md p-3 space-y-2 max-w-2xl">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Qty multiplier:</span>
          <Input
            type="number"
            min="0"
            step="any"
            value={multiplier}
            onChange={(e) => onMultiplierChange(e.target.value)}
            className="h-7 text-xs w-20 text-right"
          />
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search typicals…"
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="max-h-52 overflow-y-auto rounded border divide-y">
        {typicals.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No typicals found. Build your library on the Typicals page.
          </div>
        ) : (
          typicals.map((typical) => (
            <button
              key={typical.id}
              onClick={() => onSelect(typical)}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
            >
              {typical.code && (
                <span className="font-mono text-[10px] text-muted-foreground w-16 shrink-0 truncate">{typical.code}</span>
              )}
              <span className="text-xs flex-1 truncate font-medium">{typical.name}</span>
              {typical.description && (
                <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[180px]">{typical.description}</span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0">{typical.unit_of_measure}</span>
            </button>
          ))
        )}
      </div>

      {typicals.length === 50 && (
        <p className="text-[10px] text-muted-foreground">Showing first 50 results. Refine your search.</p>
      )}
    </div>
  );
}
