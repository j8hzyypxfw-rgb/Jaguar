-- ============================================================
-- Jaguar Electrical Estimating Platform
-- Migration 001: Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- WORKSPACES (companies using the platform)
-- ============================================================
create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- MASTER ITEM DATABASE (from Ron's Master DBF)
-- ~9,850 rows imported from Excel
-- ============================================================
create table items (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  description       text not null,
  category          text not null,    -- conduit | wire | gear | gear_assembly | lighting | boxes_devices | site_subs | fire_alarm | av | security | motors | c_bus | ups | typicals
  subcategory       text,             -- emt | grc | pvc | imc | thhn | etc.
  unit_of_measure   text not null,    -- ft | ea | cy | lb | lot | qt
  equipment_cost    numeric(12,4)  default 0,
  excavation_cost   numeric(12,4)  default 0,
  sub_cost          numeric(12,4)  default 0,
  material_cost     numeric(12,4)  default 0,
  man_hours         numeric(10,6)  default 0,
  watts             numeric(10,2),
  avg_length        numeric(10,2),
  cu_lbs_per_ft     numeric(10,6),
  alum_lbs_per_ft   numeric(10,6),
  is_active         boolean        default true,
  created_at        timestamptz    default now(),
  updated_at        timestamptz    default now()
);

create index items_code_idx      on items (code);
create index items_category_idx  on items (category);
create index items_search_idx    on items using gin (to_tsvector('english', code || ' ' || description));

-- ============================================================
-- PROJECTS
-- ============================================================
create table projects (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid references workspaces(id) on delete cascade,
  name              text not null,
  contractor_name   text,
  owner_name        text,
  customer_name     text,
  architect         text,
  engineer          text,
  drawings_dated    date,
  bid_date          date,
  start_date        date,
  completion_date   date,
  status            text default 'draft',   -- draft | submitted | awarded | lost

  -- ---- Labor Parameters ----
  base_labor        numeric(8,4)  default 45.00,   -- $/hr bare labor
  ti_factor         numeric(6,4)  default 1.45,    -- travel & insurance multiplier
  -- labor_rate computed: base_labor * ti_factor
  foreman_base      numeric(8,4)  default 57.00,
  foreman_ti        numeric(6,4)  default 1.45,
  -- foreman_rate computed: foreman_base * foreman_ti

  -- ---- Cost Factors ----
  tax_rate          numeric(6,4)  default 1.0825,  -- material sales tax multiplier
  rental_tax_rate   numeric(6,4)  default 1.0825,
  job_exp_pct       numeric(6,4)  default 0.25,    -- job expense %
  job_exp_cow_pct   numeric(6,4)  default 0.10,    -- job expense cost-of-work %
  overhead_pct      numeric(6,4)  default 0.00,
  profit_pct        numeric(6,4)  default 0.15,
  sub_markup_pct    numeric(6,4)  default 0.00,

  -- ---- Cost Multipliers ----
  equipment_mult    numeric(6,4)  default 1.00,
  materials_mult    numeric(6,4)  default 1.00,
  mhrs_mult         numeric(6,4)  default 1.10,    -- default 10% labor inefficiency
  excavation_mult   numeric(6,4)  default 5.00,    -- 400% site work adder

  -- ---- Overtime ----
  hours_per_week    numeric(5,2)  default 40.00,

  -- ---- Bond ----
  bond_rate_tier1   numeric(6,4)  default 0.025,   -- first 100k
  bond_rate_tier2   numeric(6,4)  default 0.015,   -- next 400k
  bond_rate_tier3   numeric(6,4)  default 0.010,   -- next 2M
  bond_rate_tier4   numeric(6,4)  default 0.0075,  -- next 2.5M
  bond_rate_tier5   numeric(6,4)  default 0.007,   -- next 2.5M
  bond_rate_tier6   numeric(6,4)  default 0.0065,  -- over 7.5M

  -- ---- Sales Tax ----
  sales_tax_rate    numeric(6,4)  default 0.0825,  -- for bid output (%)

  -- ---- Area Notes ----
  area_notes        text,

  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index projects_workspace_idx on projects (workspace_id);
create index projects_status_idx    on projects (status);

-- ============================================================
-- FIXTURE SCHEDULES (Fixt Sch tab — per project)
-- Maps fixture type letters (A, B, BE...) to fixture data
-- ============================================================
create table fixture_schedules (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade,
  type_code       text not null,      -- A, B, BE, F, G, G4, G4E, H, J, K1, R...
  description     text not null,
  manufacturer    text,
  model_number    text,
  watts           numeric(10,2),
  avg_length      numeric(10,2),      -- average home run length (ft)
  equipment_cost  numeric(12,4),      -- per fixture installed cost (equipment portion)
  notes           text,
  sort_order      int default 0,
  unique (project_id, type_code)
);

-- ============================================================
-- ESTIMATES (can have multiple per project: base bid, GMP, alternates)
-- ============================================================
create table estimates (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references projects(id) on delete cascade,
  name                text not null default 'Base Bid',
  estimate_type       text default 'base',   -- base | gmp | alternate | revision
  version             int default 1,
  status              text default 'draft',  -- draft | submitted | awarded | lost

  -- Rolled-up totals (computed and cached)
  total_equipment     numeric(14,2) default 0,
  total_excavation    numeric(14,2) default 0,
  total_subs          numeric(14,2) default 0,
  total_material      numeric(14,2) default 0,
  total_mhrs          numeric(10,2) default 0,
  total_ot_hrs        numeric(10,2) default 0,
  direct_cost         numeric(14,2) default 0,
  indirect_labor_cost numeric(14,2) default 0,
  gen_exp_cost        numeric(14,2) default 0,
  rental_cost         numeric(14,2) default 0,
  job_expense_cost    numeric(14,2) default 0,
  job_exp_cow_cost    numeric(14,2) default 0,
  overhead_cost       numeric(14,2) default 0,
  profit_cost         numeric(14,2) default 0,
  sales_tax_amount    numeric(14,2) default 0,
  bond_premium        numeric(14,2) default 0,
  total_bid           numeric(14,2) default 0,

  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ============================================================
-- AREAS / ZONES (the BB:BP quantity columns in Excel)
-- Each area gets its own quantity column per line item
-- ============================================================
create table areas (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid references estimates(id) on delete cascade,
  name        text not null,        -- "Building A", "Floor 1", "Zone 1", etc.
  sort_order  int not null default 0,
  is_active   boolean default true
);

-- ============================================================
-- PHASES (Phase 1, Phase 2, ... tabs in Excel)
-- ============================================================
create table phases (
  id                    uuid primary key default gen_random_uuid(),
  estimate_id           uuid references estimates(id) on delete cascade,
  name                  text not null,    -- "Phase 1", "Lighting", "Site Work"
  sort_order            int not null default 0,
  description           text,

  -- Per-phase multiplier overrides (null = use project level)
  lighting_branch_mult  numeric(6,4),
  power_branch_mult     numeric(6,4),
  mhrs_mult_override    numeric(6,4),

  -- Cached totals
  total_equipment       numeric(14,2) default 0,
  total_excavation      numeric(14,2) default 0,
  total_subs            numeric(14,2) default 0,
  total_material        numeric(14,2) default 0,
  total_mhrs            numeric(10,2) default 0,
  total_installed       numeric(14,2) default 0
);

-- ============================================================
-- SECTIONS (groupings within a phase tab)
-- e.g. "1. Lighting & Control", "2. Branch Power (120V)"
-- ============================================================
create table sections (
  id              uuid primary key default gen_random_uuid(),
  phase_id        uuid references phases(id) on delete cascade,
  section_number  int,
  name            text not null,   -- "Lighting & Control", "Branch Power (120V)"
  sort_order      int not null default 0,

  -- Cached totals
  total_equipment  numeric(14,2) default 0,
  total_excavation numeric(14,2) default 0,
  total_subs       numeric(14,2) default 0,
  total_material   numeric(14,2) default 0,
  total_mhrs       numeric(10,2) default 0,
  total_installed  numeric(14,2) default 0
);

-- ============================================================
-- LINE ITEMS (each row in a phase/takeoff tab)
-- ============================================================
create table line_items (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid references sections(id) on delete cascade,
  item_id         uuid references items(id),   -- null = custom item

  -- Item identity (snapshot allows customization without breaking db link)
  code            text,
  description     text,                        -- user label override
  fixture_type    text,                        -- lighting: type letter (A, B, BE...)
  unit_of_measure text,

  -- Per-unit costs (from db lookup; user can override any)
  unit_equipment  numeric(12,4) default 0,
  unit_excavation numeric(12,4) default 0,
  unit_sub        numeric(12,4) default 0,
  unit_material   numeric(12,4) default 0,
  unit_mhrs       numeric(10,6) default 0,
  unit_ot_hrs     numeric(10,6) default 0,
  unit_watts      numeric(10,2),
  unit_avg_length numeric(10,2),

  -- Quantity (sum of all area quantities)
  total_qty       numeric(12,4) default 0,    -- cached: sum of line_item_quantities

  -- Pricing flags
  price_locked    boolean default false,
  price_source    text default 'database',    -- database | manual | quote | typical

  -- Computed totals (cached for performance)
  total_equipment  numeric(14,2) default 0,
  total_excavation numeric(14,2) default 0,
  total_sub        numeric(14,2) default 0,
  total_material   numeric(14,2) default 0,
  total_mhrs       numeric(10,2) default 0,
  total_installed  numeric(14,2) default 0,

  sort_order      int not null default 0,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index line_items_section_idx on line_items (section_id);
create index line_items_item_idx    on line_items (item_id);

-- ============================================================
-- LINE ITEM QUANTITIES (qty per area — the BB:BP columns)
-- ============================================================
create table line_item_quantities (
  id           uuid primary key default gen_random_uuid(),
  line_item_id uuid references line_items(id) on delete cascade,
  area_id      uuid references areas(id) on delete cascade,
  quantity     numeric(12,4) default 0,
  unique (line_item_id, area_id)
);

-- ============================================================
-- INDIRECT LABOR (Indirect Labor tab)
-- ============================================================
create table indirect_labor (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid references estimates(id) on delete cascade,
  description  text not null,
  labor_type   text default 'foreman',   -- foreman | super | pm | other
  labor_rate   numeric(8,4),
  people       numeric(6,2) default 1,
  hours_per_wk numeric(6,2) default 40,
  weeks        numeric(8,2),
  total_cost   numeric(14,2) default 0,
  sort_order   int default 0
);

-- ============================================================
-- GENERAL EXPENSES (Gen Exp tab)
-- ============================================================
create table general_expenses (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid references estimates(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) default 1,
  unit        text,                        -- month | week | lot | ea
  unit_cost   numeric(12,4) default 0,
  total_cost  numeric(14,2) default 0,
  sort_order  int default 0
);

-- ============================================================
-- RENTAL EQUIPMENT (Rental tab)
-- ============================================================
create table rentals (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid references estimates(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) default 1,
  rate        numeric(12,4) default 0,
  duration    numeric(10,2) default 1,
  unit        text default 'month',   -- day | week | month
  taxable     boolean default true,
  total_cost  numeric(14,2) default 0,
  sort_order  int default 0
);

-- ============================================================
-- VENDOR QUOTES (Quotes tab)
-- ============================================================
create table quotes (
  id           uuid primary key default gen_random_uuid(),
  estimate_id  uuid references estimates(id) on delete cascade,
  vendor_name  text not null,
  description  text,
  scope        text,
  category     text,   -- lighting | switchgear | fire_alarm | av | security | other
  quote_amount numeric(14,2),
  db_amount    numeric(14,2),   -- database comparison amount
  delta        numeric(14,2),   -- difference (quote - db)
  status       text default 'received',   -- received | selected | rejected | pending
  received_at  date,
  notes        text,
  sort_order   int default 0
);

-- ============================================================
-- TYPICALS (Typicals tab — pre-built complex assemblies)
-- e.g. "Duct Bank (2) 4"" = 15 line items for 100ft
-- ============================================================
create table typicals (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references workspaces(id) on delete cascade,
  name            text not null,          -- "Duct Bank (2) 4""
  code            text,                   -- DB24, 8E4
  description     text,
  unit_of_measure text default 'ea',      -- ea | per 100ft
  -- rolled-up unit costs
  unit_equipment  numeric(12,4) default 0,
  unit_excavation numeric(12,4) default 0,
  unit_sub        numeric(12,4) default 0,
  unit_material   numeric(12,4) default 0,
  unit_mhrs       numeric(10,6) default 0,
  unit_installed  numeric(14,2) default 0,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table typical_line_items (
  id          uuid primary key default gen_random_uuid(),
  typical_id  uuid references typicals(id) on delete cascade,
  item_id     uuid references items(id),
  code        text,
  description text,
  quantity    numeric(12,4) default 0,
  uom         text,
  sort_order  int default 0,
  notes       text
);

-- ============================================================
-- WORK CATEGORIES (for Est Cost / bid summary breakdown)
-- The 23 categories from Est Cost tab — configurable per workspace
-- ============================================================
create table work_categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  number       int not null,
  name         text not null,   -- "Lighting", "Branch Power", "Fire Alarm"...
  sort_order   int default 0,
  is_active    boolean default true
);

-- Link line items / sections to work categories for Est Cost rollup
create table section_categories (
  section_id   uuid references sections(id) on delete cascade,
  category_id  uuid references work_categories(id) on delete cascade,
  primary key (section_id, category_id)
);

-- ============================================================
-- PRICE HISTORY (audit trail for item price changes)
-- ============================================================
create table item_price_history (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references items(id) on delete cascade,
  changed_by    uuid,   -- auth.users.id
  changed_at    timestamptz default now(),
  old_material  numeric(12,4),
  new_material  numeric(12,4),
  old_mhrs      numeric(10,6),
  new_mhrs      numeric(10,6),
  reason        text   -- "2026 price update", "EPIC feed", "manual"
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table workspaces          enable row level security;
alter table items               enable row level security;
alter table projects            enable row level security;
alter table fixture_schedules   enable row level security;
alter table estimates           enable row level security;
alter table areas               enable row level security;
alter table phases              enable row level security;
alter table sections            enable row level security;
alter table line_items          enable row level security;
alter table line_item_quantities enable row level security;
alter table indirect_labor      enable row level security;
alter table general_expenses    enable row level security;
alter table rentals             enable row level security;
alter table quotes              enable row level security;
alter table typicals            enable row level security;
alter table typical_line_items  enable row level security;
alter table work_categories     enable row level security;
alter table section_categories  enable row level security;
alter table item_price_history  enable row level security;

-- Items are readable by all authenticated users
create policy "items_read" on items for select to authenticated using (true);
create policy "items_write" on items for all to authenticated using (true);

-- Workspace members can access their own data
create policy "workspace_read" on workspaces for select to authenticated using (true);
