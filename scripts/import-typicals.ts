/**
 * Jaguar — Typicals Import Script
 *
 * Reads the Typicals tab from RB-Est Template and imports into Supabase.
 * Run with:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/import-typicals.ts
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const TEMPLATE_PATH =
  process.env.TEMPLATE_PATH ||
  "C:/Users/daled/OneDrive/Shared/RB-Est Template- COPY.xlsb";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Column indices in the Typicals sheet (0-based)
// Col 0:  item code
// Col 6:  typical name (when col 0 is blank = header row)
// Col 11: qty
// Col 12: UOM
// Col 13: description

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

interface TypicalDef {
  name: string;
  components: { code: string; description: string; quantity: number; uom: string }[];
}

function parseTypicals(rows: unknown[][]): TypicalDef[] {
  const typicals: TypicalDef[] = [];
  let current: TypicalDef | null = null;

  for (let i = 8; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const col0 = str(r[0]);
    const col6 = str(r[6]);

    // Typical header: col 0 blank, col 6 has a real string name (not a number, not a placeholder)
    const isNumeric = col6 !== "" && !isNaN(Number(col6));
    const isPlaceholder = ["EQUIPMENT", "XX", "cost + GC's + fee"].includes(col6) ||
      col6.startsWith("Number") || col6.startsWith("Ditch") || col6.startsWith("Width") ||
      col6.startsWith("Depth") || col6.startsWith("Profile") || col6.startsWith("Sand") ||
      col6.startsWith("Concrete") || col6.startsWith("Conduit") || col6.startsWith("Special") ||
      col6.startsWith("Minimum") || col6.includes("Drawings");

    if (col0 === "" && col6 && !isNumeric && !isPlaceholder) {
      if (current && current.components.length > 0) {
        typicals.push(current);
      }
      current = { name: col6, components: [] };
      continue;
    }

    // EQUIPMENT summary section — skip these rows (they summarize the typical as a single item)
    if (col0 === "" && col6 === "EQUIPMENT") {
      // next few rows are the summary DB item — skip until next typical
      continue;
    }

    // Component row: col 0 has an item code
    if (current && col0 && col0 !== "0" && !isNaN(Number(col0)) === false || (col0.match(/[A-Za-z]/))) {
      const qty = num(r[11]);
      const uom = str(r[12]);
      const desc = str(r[13]);

      // Only include rows with a valid code and non-zero qty
      if (col0.match(/[A-Za-z]/) && qty > 0 && desc) {
        current.components.push({
          code: col0,
          description: desc,
          quantity: qty,
          uom: uom || "ea",
        });
      }
    }
  }

  // Push the last one
  if (current && current.components.length > 0) {
    typicals.push(current);
  }

  return typicals;
}

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("duct bank") || n.includes("conduit") || n.includes("pvc") || n.includes("emt")) return "conduit";
  if (n.includes("wire") || n.includes("cable") || n.includes("conductor")) return "wire";
  if (n.includes("panel") || n.includes("gear") || n.includes("switchboard")) return "gear";
  if (n.includes("light") || n.includes("fixture")) return "lighting";
  if (n.includes("fire") || n.includes("alarm")) return "fire_alarm";
  if (n.includes("motor") || n.includes("drive")) return "motors";
  return "other";
}

async function main() {
  console.log("Reading Typicals from:", TEMPLATE_PATH);
  const wb = XLSX.readFile(TEMPLATE_PATH);
  const ws = wb.Sheets["Typicals"];

  if (!ws) {
    console.error("No 'Typicals' sheet found in workbook");
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  console.log(`Total rows in sheet: ${rows.length}`);

  const typicals = parseTypicals(rows);
  console.log(`Parsed ${typicals.length} typicals with components`);

  if (typicals.length === 0) {
    console.log("No typicals found — check the sheet structure.");
    return;
  }

  // Load existing item codes from Supabase for matching
  console.log("Loading item codes from Supabase for matching...");
  const { data: items } = await supabase.from("items").select("id, code");
  const itemsByCode = Object.fromEntries((items ?? []).map((it: { id: string; code: string }) => [it.code.toUpperCase(), it.id]));
  console.log(`Loaded ${Object.keys(itemsByCode).length} item codes`);

  let typicalsInserted = 0;
  let componentsInserted = 0;
  let componentsUnmatched = 0;

  for (const typ of typicals) {
    // Upsert typical
    const { data: typRow, error: typErr } = await supabase
      .from("typicals")
      .upsert({ name: typ.name, description: typ.name, workspace_id: null },
               { onConflict: "name" })
      .select("id")
      .single();

    if (typErr || !typRow) {
      console.error(`  Failed to upsert typical "${typ.name}":`, typErr?.message);
      continue;
    }

    // Delete existing components so we can re-seed cleanly
    await supabase.from("typical_line_items").delete().eq("typical_id", typRow.id);

    const componentRows = typ.components.map((c, idx) => {
      const itemId = itemsByCode[c.code.toUpperCase()] ?? null;
      if (!itemId) componentsUnmatched++;
      return {
        typical_id: typRow.id,
        item_id: itemId,
        code: c.code,
        description: c.description,
        quantity: c.quantity,
        uom: c.uom,
        sort_order: idx,
      };
    });

    const { error: compErr } = await supabase.from("typical_line_items").insert(componentRows);
    if (compErr) {
      console.error(`  Failed inserting components for "${typ.name}":`, compErr.message);
    } else {
      componentsInserted += componentRows.length;
      typicalsInserted++;
      console.log(`  ✓ "${typ.name}" — ${componentRows.length} components (${componentRows.filter(c => c.item_id).length} matched to DB)`);
    }
  }

  console.log(`\nImport complete:`);
  console.log(`  ${typicalsInserted} typicals imported`);
  console.log(`  ${componentsInserted} components total`);
  console.log(`  ${componentsUnmatched} components with no DB item match (saved with item_id = null)`);
}

main().catch(console.error);
