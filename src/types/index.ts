// ============================================================
// Jaguar — Core Type Definitions
// ============================================================

export type ProjectStatus = "draft" | "submitted" | "awarded" | "lost";
export type EstimateType = "base" | "gmp" | "alternate" | "revision";
export type PriceSource = "database" | "manual" | "quote" | "typical";
export type QuoteStatus = "received" | "selected" | "rejected" | "pending";

// ---------------------------------------------------------------------------
// Master Database Item
// ---------------------------------------------------------------------------
export interface Item {
  id: string;
  code: string;
  description: string;
  category: string;
  subcategory: string | null;
  unit_of_measure: string;
  equipment_cost: number;
  excavation_cost: number;
  sub_cost: number;
  material_cost: number;
  man_hours: number;
  watts: number | null;
  avg_length: number | null;
  cu_lbs_per_ft: number | null;
  alum_lbs_per_ft: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Pricing Config (derived from project parameters)
// ---------------------------------------------------------------------------
export interface PricingConfig {
  base_labor: number;
  ti_factor: number;
  labor_rate: number;       // computed: base_labor * ti_factor
  foreman_base: number;
  foreman_ti: number;
  foreman_rate: number;     // computed: foreman_base * foreman_ti
  tax_rate: number;
  rental_tax_rate: number;
  job_exp_pct: number;
  job_exp_cow_pct: number;
  overhead_pct: number;
  profit_pct: number;
  sub_markup_pct: number;
  equipment_mult: number;
  materials_mult: number;
  mhrs_mult: number;
  excavation_mult: number;
  hours_per_week: number;
  sales_tax_rate: number;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  contractor_name: string | null;
  owner_name: string | null;
  customer_name: string | null;
  architect: string | null;
  engineer: string | null;
  drawings_dated: string | null;
  bid_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  status: ProjectStatus;
  // pricing params
  base_labor: number;
  ti_factor: number;
  foreman_base: number;
  foreman_ti: number;
  tax_rate: number;
  rental_tax_rate: number;
  job_exp_pct: number;
  job_exp_cow_pct: number;
  overhead_pct: number;
  profit_pct: number;
  sub_markup_pct: number;
  equipment_mult: number;
  materials_mult: number;
  mhrs_mult: number;
  excavation_mult: number;
  hours_per_week: number;
  sales_tax_rate: number;
  lighting_markup_factor: number;
  bond_rate_tier1: number;
  bond_rate_tier2: number;
  bond_rate_tier3: number;
  bond_rate_tier4: number;
  bond_rate_tier5: number;
  bond_rate_tier6: number;
  area_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fixture Schedule
// ---------------------------------------------------------------------------
export interface FixtureScheduleEntry {
  id: string;
  project_id: string;
  type_code: string;
  description: string;
  manufacturer: string | null;
  model_number: string | null;
  watts: number | null;
  avg_length: number | null;
  equipment_cost: number | null;
  notes: string | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------
export interface Estimate {
  id: string;
  project_id: string;
  name: string;
  estimate_type: EstimateType;
  version: number;
  status: ProjectStatus;
  total_equipment: number;
  total_excavation: number;
  total_subs: number;
  total_material: number;
  total_mhrs: number;
  total_ot_hrs: number;
  direct_cost: number;
  indirect_labor_cost: number;
  gen_exp_cost: number;
  rental_cost: number;
  job_expense_cost: number;
  job_exp_cow_cost: number;
  overhead_cost: number;
  profit_cost: number;
  sales_tax_amount: number;
  bond_premium: number;
  total_bid: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Area (structural container: Phase → Area → Section)
// ---------------------------------------------------------------------------
export interface Area {
  id: string;
  estimate_id: string | null;   // legacy; still set on insert for RLS compat
  phase_id: string;             // NEW: areas belong to a phase
  name: string;
  sort_order: number;
  is_active: boolean;
  // rollup totals (summed from sections below)
  total_equipment: number;
  total_excavation: number;
  total_subs: number;
  total_material: number;
  total_mhrs: number;
  total_installed: number;
  sections?: Section[];
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------
export interface Phase {
  id: string;
  estimate_id: string;
  name: string;
  sort_order: number;
  description: string | null;
  lighting_branch_mult: number | null;
  power_branch_mult: number | null;
  mhrs_mult_override: number | null;
  total_equipment: number;
  total_excavation: number;
  total_subs: number;
  total_material: number;
  total_mhrs: number;
  total_installed: number;
  areas?: Area[];       // NEW: phases contain areas
  sections?: Section[]; // legacy, kept for compat
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
export interface Section {
  id: string;
  phase_id: string | null;    // legacy (kept for rollup compat); set on insert
  area_id: string | null;     // NEW: sections belong to an area
  section_number: number | null;
  name: string;
  sort_order: number;
  total_equipment: number;
  total_excavation: number;
  total_subs: number;
  total_material: number;
  total_mhrs: number;
  total_installed: number;
  line_items?: LineItem[];
}

// ---------------------------------------------------------------------------
// Line Item
// ---------------------------------------------------------------------------
export interface LineItem {
  id: string;
  section_id: string;
  item_id: string | null;
  code: string | null;
  description: string | null;
  fixture_type: string | null;
  unit_of_measure: string | null;
  unit_equipment: number;
  unit_excavation: number;
  unit_sub: number;
  unit_material: number;
  unit_mhrs: number;
  unit_ot_hrs: number;
  unit_watts: number | null;
  unit_avg_length: number | null;
  total_qty: number;
  price_locked: boolean;
  price_source: PriceSource;
  total_equipment: number;
  total_excavation: number;
  total_sub: number;
  total_material: number;
  total_mhrs: number;
  total_installed: number;
  sort_order: number;
  notes: string | null;
  // legacy per-area quantities (no longer used in new hierarchy)
  quantities?: LineItemQuantity[];
}

// ---------------------------------------------------------------------------
// Line Item Quantity (per area)
// ---------------------------------------------------------------------------
export interface LineItemQuantity {
  id: string;
  line_item_id: string;
  area_id: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Indirect Labor
// ---------------------------------------------------------------------------
export interface IndirectLabor {
  id: string;
  estimate_id: string;
  description: string;
  labor_type: string;
  labor_rate: number | null;
  people: number;
  hours_per_wk: number;
  weeks: number | null;
  total_cost: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// General Expense
// ---------------------------------------------------------------------------
export interface GeneralExpense {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  total_cost: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Rental
// ---------------------------------------------------------------------------
export interface Rental {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  rate: number;
  duration: number;
  unit: string;
  taxable: boolean;
  total_cost: number;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------
export interface Quote {
  id: string;
  estimate_id: string;
  vendor_name: string;
  description: string | null;
  scope: string | null;
  category: string | null;
  quote_amount: number | null;
  db_amount: number | null;
  delta: number | null;
  status: QuoteStatus;
  received_at: string | null;
  notes: string | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Typical
// ---------------------------------------------------------------------------
export interface Typical {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  description: string | null;
  unit_of_measure: string;
  unit_equipment: number;
  unit_excavation: number;
  unit_sub: number;
  unit_material: number;
  unit_mhrs: number;
  unit_installed: number;
  is_active: boolean;
  line_items?: TypicalLineItem[];
}

export interface TypicalLineItem {
  id: string;
  typical_id: string;
  item_id: string | null;
  code: string | null;
  description: string | null;
  quantity: number;
  uom: string | null;
  sort_order: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Work Category
// ---------------------------------------------------------------------------
export interface WorkCategory {
  id: string;
  workspace_id: string;
  number: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Bid Summary (computed)
// ---------------------------------------------------------------------------
export interface BidSummary {
  equipment: number;
  excavation: number;
  subs: number;
  material: number;
  mhrs: number;
  ot_hrs: number;
  direct_cost: number;
  indirect_labor: number;
  gen_exp: number;
  rental: number;
  job_expense: number;
  job_exp_cow: number;
  direct_job_cost: number;
  overhead: number;
  profit: number;
  sales_tax: number;
  bond_premium: number;
  total_bid: number;
  cu_weight_lbs: number;
  alum_weight_lbs: number;
}

// ---------------------------------------------------------------------------
// Bill of Materials row
// ---------------------------------------------------------------------------
export interface BOMRow {
  code: string;
  description: string;
  category: string;
  unit_of_measure: string;
  quantity: number;
  unit_material: number;
  total_material: number;
  unit_mhrs: number;
  total_mhrs: number;
  unit_installed: number;
  total_installed: number;
  phase: string;
  section: string;
}
