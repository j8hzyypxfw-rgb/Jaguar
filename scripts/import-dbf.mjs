/**
 * Import Master DBF items into Supabase items table.
 * Run: node scripts/import-dbf.mjs
 */
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DBF_PATH =
  process.env.DBF_FILE_PATH ||
  "C:/Users/daled/OneDrive/Shared/Master DBF-2026 - 260505.xlsb";

console.log("Reading", DBF_PATH, "...");
const wb = XLSX.readFile(DBF_PATH);
const ws = wb.Sheets["Sheet1"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

// ── Parse rows ───────────────────────────────────────────────────────────────
const items = [];
let currentCategory = "";
let inData = false;
let sortOrder = 0;

for (const row of rows) {
  const code = String(row[0] ?? "").trim();
  if (code === "START DBF") { inData = true; continue; }
  if (!inData) continue;

  // Category separator
  if (code === "-") {
    currentCategory = String(row[1] ?? "").trim();
    continue;
  }

  // Skip blank or sub-header rows
  if (!code || code === "0") continue;
  const uom = String(row[3] ?? "").trim();
  if (!uom) continue;

  const description = String(row[1] ?? "").trim();
  if (!description || description === "0") continue;

  items.push({
    code,
    description,
    category: currentCategory || "Other",
    unit_of_measure: uom,
    equipment_cost:  Number(row[4]) || 0,
    excavation_cost: Number(row[5]) || 0,
    sub_cost:        Number(row[6]) || 0,
    material_cost:   Number(row[7]) || 0,
    man_hours:       Number(row[8]) || 0,
    watts:           Number(row[9]) || null,
    avg_length:      Number(row[10]) || null,
    cu_lbs_per_ft:   Number(row[11]) || null,
    alum_lbs_per_ft: Number(row[12]) || null,
    is_active:       true,
  });
  sortOrder++;
}

// Deduplicate by code (keep last occurrence)
const byCode = new Map();
for (const item of items) byCode.set(item.code, item);
const unique = [...byCode.values()];
console.log(`Parsed ${items.length} items, ${unique.length} unique codes.`);

// ── Upsert in batches ────────────────────────────────────────────────────────
const BATCH = 500;
// replace items reference with unique
items.length = 0;
unique.forEach(i => items.push(i));
let inserted = 0;
let errors = 0;

for (let i = 0; i < items.length; i += BATCH) {
  const batch = items.slice(i, i + BATCH);
  const { error } = await supabase
    .from("items")
    .upsert(batch, { onConflict: "code", ignoreDuplicates: false });

  if (error) {
    console.error(`Batch ${i / BATCH + 1} error:`, error.message);
    errors++;
  } else {
    inserted += batch.length;
    process.stdout.write(`\rUpserted ${inserted}/${items.length}...`);
  }
}

console.log(`\nDone. ${inserted} items upserted, ${errors} batch errors.`);
