/**
 * Jaguar — Seed Estimate Defaults
 *
 * Populates indirect_labor, general_expenses, and rentals for every existing
 * estimate that has no rows yet. Safe to re-run — skips estimates that already
 * have rows in any of the three tables.
 *
 * Run with:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-estimate-defaults.ts
 */

import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_INDIRECT_LABOR,
  DEFAULT_GEN_EXPENSES,
  DEFAULT_RENTALS,
} from "../src/lib/estimateDefaults";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seedEstimate(estimateId: string, estimateName: string) {
  // Check if already seeded
  const [{ count: ilCount }, { count: geCount }, { count: rnCount }] = await Promise.all([
    supabase.from("indirect_labor").select("*", { count: "exact", head: true }).eq("estimate_id", estimateId),
    supabase.from("general_expenses").select("*", { count: "exact", head: true }).eq("estimate_id", estimateId),
    supabase.from("rentals").select("*", { count: "exact", head: true }).eq("estimate_id", estimateId),
  ]);

  const alreadySeeded = (ilCount ?? 0) > 0 || (geCount ?? 0) > 0 || (rnCount ?? 0) > 0;
  if (alreadySeeded) {
    console.log(`  ⏭  "${estimateName}" already has rows — skipping`);
    return;
  }

  const [ilRes, geRes, rnRes] = await Promise.all([
    supabase.from("indirect_labor").insert(
      DEFAULT_INDIRECT_LABOR.map((r) => ({ ...r, estimate_id: estimateId }))
    ),
    supabase.from("general_expenses").insert(
      DEFAULT_GEN_EXPENSES.map((r) => ({ ...r, estimate_id: estimateId }))
    ),
    supabase.from("rentals").insert(
      DEFAULT_RENTALS.map((r) => ({ ...r, estimate_id: estimateId }))
    ),
  ]);

  const errors = [ilRes.error, geRes.error, rnRes.error].filter(Boolean);
  if (errors.length) {
    console.error(`  ✗  "${estimateName}":`, errors.map((e) => e?.message).join(", "));
  } else {
    console.log(
      `  ✓  "${estimateName}" — ${DEFAULT_INDIRECT_LABOR.length} indirect labor, ` +
      `${DEFAULT_GEN_EXPENSES.length} gen expenses, ${DEFAULT_RENTALS.length} rentals`
    );
  }
}

async function main() {
  const { data: estimates, error } = await supabase
    .from("estimates")
    .select("id, name, project_id");

  if (error) { console.error("Failed to load estimates:", error.message); process.exit(1); }
  if (!estimates?.length) { console.log("No estimates found."); return; }

  console.log(`Found ${estimates.length} estimate(s). Seeding defaults...\n`);

  for (const est of estimates) {
    await seedEstimate(est.id, est.name);
  }

  console.log("\nDone.");
}

main().catch(console.error);
