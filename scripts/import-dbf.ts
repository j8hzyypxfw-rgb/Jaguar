/**
 * Jaguar — Master DBF Import Script
 *
 * Reads the Master DBF Excel file and imports all items into Supabase.
 * Run with: npx ts-node scripts/import-dbf.ts
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (not the anon key — needs write access)
 *   DBF_FILE_PATH              (path to Master DBF-2026.xlsb)
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DBF_PATH =
  process.env.DBF_FILE_PATH ||
  "C:/Users/daled/OneDrive/Shared/Master DBF-2026.xlsb";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Column indices in Sheet1 (0-based after Excel col letters)
// A=0 CODE, B=1 DESCRIPTION, C=2 QTY, D=3 PER(UOM),
// E=4 EQUIPMENT, F=5 EXCAV, G=6 SUB, H=7 MATL, I=8 M/HRS,
// J=9 watts, K=10 avg lgth, L=11 Cu lbs/ft, M=12 Alum lbs/ft
// N=13 UNIT INST'D, O=14 UNIT EQUIP, Q=16 MHM
// ---------------------------------------------------------------------------
const COL = {
  CODE: 0,
  DESC: 1,
  UOM: 3,
  EQUIPMENT: 4,
  EXCAV: 5,
  SUB: 6,
  MATL: 7,
  MHRS: 8,
  WATTS: 9,
  AVG_LEN: 10,
  CU_LBS: 11,
  ALUM_LBS: 12,
};

// ---------------------------------------------------------------------------
// Category mapping — detect from section headers in Sheet1
// ---------------------------------------------------------------------------
type Category =
  | "conduit"
  | "wire"
  | "gear"
  | "gear_assembly"
  | "lighting"
  | "boxes_devices"
  | "site_subs"
  | "fire_alarm"
  | "av"
  | "security"
  | "motors"
  | "c_bus"
  | "ups"
  | "other";

const SUBCATEGORY_MAP: Record<string, { category: Category; subcategory: string }> = {
  Sheet1: { category: "other", subcategory: "master" },
  EMT: { category: "conduit", subcategory: "emt" },
  emtss: { category: "conduit", subcategory: "emt_ss" },
  CEMT: { category: "conduit", subcategory: "cemt" },
  GRC: { category: "conduit", subcategory: "grc" },
  PGRC: { category: "conduit", subcategory: "pgrc" },
  IMC: { category: "conduit", subcategory: "imc" },
  ALUM: { category: "conduit", subcategory: "alum" },
  FG: { category: "conduit", subcategory: "fg" },
  PAL: { category: "conduit", subcategory: "pal" },
  PVC: { category: "conduit", subcategory: "pvc" },
  ENT: { category: "conduit", subcategory: "ent" },
  PVC80: { category: "conduit", subcategory: "pvc80" },
  Flex: { category: "conduit", subcategory: "flex" },
  Wire: { category: "wire", subcategory: "wire" },
  "C BUS": { category: "c_bus", subcategory: "c_bus" },
  "Boxes & Devices": { category: "boxes_devices", subcategory: "boxes" },
  Devices: { category: "boxes_devices", subcategory: "devices" },
  "Site Subs": { category: "site_subs", subcategory: "site" },
  Gear: { category: "gear", subcategory: "gear" },
  "Gear Assemblies": { category: "gear_assembly", subcategory: "gear_assembly" },
  UPS: { category: "ups", subcategory: "ups" },
  SWBDS: { category: "gear", subcategory: "switchboard" },
  Lighting: { category: "lighting", subcategory: "lighting" },
  "Fire Alarm": { category: "fire_alarm", subcategory: "fire_alarm" },
  AV: { category: "av", subcategory: "av" },
  Security: { category: "security", subcategory: "security" },
  Motors: { category: "motors", subcategory: "motors" },
};

// ---------------------------------------------------------------------------
// Data sheets that have items (exclude utility/calc sheets)
// ---------------------------------------------------------------------------
const ITEM_SHEETS = [
  "Sheet1",
  "Wire",
  "C BUS",
  "Boxes & Devices",
  "Devices",
  "Site Subs",
  "Gear",
  "Gear Assemblies",
  "UPS",
  "SWBDS",
  "Lighting",
  "Fire Alarm",
  "AV",
  "Security",
  "Motors",
];

// Sheet1 data rows start at row 12 (0-indexed = 11) after the START DBF marker
const SHEET1_DATA_START = 11;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function num(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n = parseFloat(String(val).replace(/[$,()]/g, "").trim());
  return isNaN(n) ? 0 : Math.abs(n);
}

function str(val: unknown): string {
  return val === null || val === undefined ? "" : String(val).trim();
}

// ---------------------------------------------------------------------------
// Parse Sheet1 — the compiled master unit price list
// ---------------------------------------------------------------------------
function parseSheet1(ws: XLSX.WorkSheet): ItemRow[] {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:R9850");
  const rows: ItemRow[] = [];

  for (let r = SHEET1_DATA_START; r <= range.e.r; r++) {
    const code = str(ws[XLSX.utils.encode_cell({ r, c: COL.CODE })]?.v);
    const desc = str(ws[XLSX.utils.encode_cell({ r, c: COL.DESC })]?.v);

    if (!code || code === "START DBF" || code === "-" || code === " -  ") continue;

    // Detect section header rows (no material/labor data)
    const matl = ws[XLSX.utils.encode_cell({ r, c: COL.MATL })]?.v;
    const mhrs = ws[XLSX.utils.encode_cell({ r, c: COL.MHRS })]?.v;
    if (matl === undefined && mhrs === undefined) continue;

    rows.push({
      code,
      description: desc,
      category: "other",
      subcategory: "master",
      unit_of_measure: str(ws[XLSX.utils.encode_cell({ r, c: COL.UOM })]?.v) || "ea",
      equipment_cost: num(ws[XLSX.utils.encode_cell({ r, c: COL.EQUIPMENT })]?.v),
      excavation_cost: num(ws[XLSX.utils.encode_cell({ r, c: COL.EXCAV })]?.v),
      sub_cost: num(ws[XLSX.utils.encode_cell({ r, c: COL.SUB })]?.v),
      material_cost: num(ws[XLSX.utils.encode_cell({ r, c: COL.MATL })]?.v),
      man_hours: num(ws[XLSX.utils.encode_cell({ r, c: COL.MHRS })]?.v),
      watts: num(ws[XLSX.utils.encode_cell({ r, c: COL.WATTS })]?.v) || null,
      avg_length: num(ws[XLSX.utils.encode_cell({ r, c: COL.AVG_LEN })]?.v) || null,
      cu_lbs_per_ft: num(ws[XLSX.utils.encode_cell({ r, c: COL.CU_LBS })]?.v) || null,
      alum_lbs_per_ft: num(ws[XLSX.utils.encode_cell({ r, c: COL.ALUM_LBS })]?.v) || null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Detect category from Sheet1 by matching known item code prefixes
// ---------------------------------------------------------------------------
function inferCategory(code: string): { category: Category; subcategory: string } {
  const c = code.toUpperCase();
  // Conduit codes use letter prefixes for conduit type embedded in code
  if (/^E\d/.test(c)) return { category: "conduit", subcategory: "emt" };
  if (/^G\d/.test(c)) return { category: "conduit", subcategory: "grc" };
  if (/^S\d/.test(c)) return { category: "conduit", subcategory: "pvc" };
  if (/^I\d/.test(c)) return { category: "conduit", subcategory: "imc" };
  if (/^F\d/.test(c)) return { category: "conduit", subcategory: "fg" };
  if (/^(M\d|M[A-Z]\d)/.test(c)) return { category: "gear", subcategory: "gear" };
  if (/^T\d+[A-Z]/.test(c)) return { category: "gear_assembly", subcategory: "gear_assembly" };
  if (/^(ALED|A1LED|AFP|ACLS|AINDDM|LED|VTW|P\d+LED|X1|E-\d)/.test(c))
    return { category: "lighting", subcategory: "lighting" };
  if (/^(DUP|EQC|FL-|QUAD|RECPT|GFCI)/i.test(c))
    return { category: "boxes_devices", subcategory: "devices" };
  if (/^(FA|SMK|PULL|HORN|STRB)/i.test(c))
    return { category: "fire_alarm", subcategory: "fire_alarm" };
  if (/^(CAM|CCTV|ACS|DOOR|PROX)/i.test(c))
    return { category: "security", subcategory: "security" };
  if (/^(MTR|MOT|STARTER)/i.test(c)) return { category: "motors", subcategory: "motors" };
  if (/^(SC|GRD|ASD|CONCD|EXCY|BFCY)/i.test(c))
    return { category: "site_subs", subcategory: "site" };
  return { category: "other", subcategory: "master" };
}

interface ItemRow {
  code: string;
  description: string;
  category: string;
  subcategory: string;
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
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Reading DBF from: ${DBF_PATH}`);

  if (!fs.existsSync(DBF_PATH)) {
    console.error(`File not found: ${DBF_PATH}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(DBF_PATH, { type: "file", cellText: false, cellDates: true });

  // Parse Sheet1 (the compiled master list with 9,850 rows)
  const sheet1 = workbook.Sheets["Sheet1"];
  if (!sheet1) {
    console.error("Sheet1 not found in workbook");
    process.exit(1);
  }

  const rows = parseSheet1(sheet1);
  console.log(`Parsed ${rows.length} items from Sheet1`);

  // Enrich with inferred categories
  const enriched = rows.map((r) => {
    const cat = inferCategory(r.code);
    return { ...r, ...cat };
  });

  // Deduplicate by code (keep last occurrence)
  const seen = new Map<string, ItemRow>();
  for (const r of enriched) seen.set(r.code, r);
  const unique = Array.from(seen.values());
  console.log(`After dedup: ${unique.length} unique items`);

  // Upsert in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const { error } = await supabase.from("items").upsert(batch, { onConflict: "code" });
    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${unique.length} items`);
    }
  }

  // Also insert default work categories
  await seedWorkCategories();

  console.log(`\nImport complete. ${inserted} items in database.`);
}

async function seedWorkCategories() {
  const categories = [
    "Lighting",
    "Lighting Control",
    "Branch Power",
    "HVAC",
    "Equipment",
    "Primary",
    "Distribution",
    "Emergency Distribution",
    "Tele / Data",
    "Fire Alarm",
    "Audio / Visual",
    "Security",
    "Spare Raceways for Future",
    "Grounding",
    "Commissioning Participation",
    "Demolition",
    "Temporary Power",
    "Excavation / Site",
    "General Conditions",
    "Alternates",
    "Allowances",
    "Subcontractors",
    "Other",
  ];

  // Get or create a default workspace
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("name", "Default")
    .single();

  let workspaceId: string;

  if (!ws) {
    const { data: newWs, error } = await supabase
      .from("workspaces")
      .insert({ name: "Default" })
      .select("id")
      .single();
    if (error) { console.error("Workspace create error:", error.message); return; }
    workspaceId = newWs!.id;
  } else {
    workspaceId = ws.id;
  }

  const rows = categories.map((name, i) => ({
    workspace_id: workspaceId,
    number: i + 1,
    name,
    sort_order: i,
  }));

  const { error } = await supabase.from("work_categories").upsert(rows, {
    onConflict: "workspace_id,number",
    ignoreDuplicates: true,
  });

  if (error) console.error("Work categories error:", error.message);
  else console.log(`Seeded ${rows.length} work categories`);
}

main().catch(console.error);
