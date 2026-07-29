# Jaguar — Session Handoff

Last updated: 2026-05-15 · HEAD `3ea1ecf`

Working notes for continuing development. Not user-facing docs.

---

## ⚠️ Pending — run these in the Supabase SQL editor

The Supabase CLI is **not linked** (`npx supabase db push` fails with "Cannot find
project ref"). Every migration must be pasted into the SQL editor by hand.

Migrations 001–004 are applied. These are **committed but NOT yet run**:

```sql
-- 005_lighting_markup_factor.sql
ALTER TABLE projects
  ADD COLUMN lighting_markup_factor NUMERIC(6,4) NOT NULL DEFAULT 1.2262;
```

```sql
-- 007_drop_zombie_rollups.sql  (see "Rollups" below for why)
ALTER TABLE phases   DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE phases   DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE phases   DROP COLUMN IF EXISTS total_subs;
ALTER TABLE phases   DROP COLUMN IF EXISTS total_material;
ALTER TABLE phases   DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE phases   DROP COLUMN IF EXISTS total_installed;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_subs;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_material;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE areas    DROP COLUMN IF EXISTS total_installed;
ALTER TABLE sections DROP COLUMN IF EXISTS total_equipment;
ALTER TABLE sections DROP COLUMN IF EXISTS total_excavation;
ALTER TABLE sections DROP COLUMN IF EXISTS total_subs;
ALTER TABLE sections DROP COLUMN IF EXISTS total_material;
ALTER TABLE sections DROP COLUMN IF EXISTS total_mhrs;
ALTER TABLE sections DROP COLUMN IF EXISTS total_installed;
```

```sql
-- 008_fixture_man_hours.sql
ALTER TABLE fixture_schedules
  ADD COLUMN IF NOT EXISTS man_hours numeric(10,6) DEFAULT 0;
```

There is no `006` — it was a `fixture_counts` table that got designed, then deleted
before it was ever run (see "Fixture matrix" below). The gap is intentional.

**Symptom if you skip 005:** `/projects/[id]/settings` breaks. A missing column makes
PostgREST fail the whole `select`, the page's `if (!project) notFound()` fires, and you
get a Next.js 404 that looks like a missing route. A 404 on a route that shows up in
`next build` output is almost always a failed Supabase query, not a routing problem.

---

## Data model

```
Project
└── Estimate (base; supports gmp/alternate/revision, UI not built)
    └── Phase          e.g. "1", "2", "3"
        └── Area       e.g. "Office", "Warehouse"
            └── Section  e.g. "Lighting", "Branch Power", "Fire Alarm"
                └── LineItem
```

- `sections` still carries a legacy `phase_id` alongside `area_id`. Set **both** on
  insert — `rollupEstimate` walks `phases → sections.phase_id → line_items`, so a
  section with a null `phase_id` silently drops out of the estimate totals.
- `line_item_quantities` is dead. Quantity lives on `line_items.total_qty`.

### Rollups — what's cached vs. computed

| Level | Cached? | Maintained by |
|---|---|---|
| `line_items.total_*` | yes | `calcLineItemTotals` on qty/unit-cost change |
| `estimates.total_*` | yes | `rollupEstimate()` in `src/lib/rollupEstimate.ts` |
| `sections` / `areas` / `phases` | **no** | computed on the fly from `line_items` |

Section/area/phase totals were columns that nothing ever wrote to — always zero.
Migration 007 drops them. Anything needing those numbers must sum `line_items`
itself (see `PhaseSummaryClient.tsx` for the pattern). If a summary page renders all
dashes, this is the first thing to check.

### Pricing

`src/lib/pricing.ts` is the single source of truth.

```
unit_installed = (matl×tax×matl_mult + equip×equip_mult + sub + mhrs×mhrs_mult×labor_rate + ot_hrs×ot_rate)
                 × (1 + job_exp_pct + job_exp_cow_pct)
                 × (1 + overhead_pct)
                 × (1 + profit_pct)
               + sub × sub_markup_pct
```

`labor_rate = base_labor × ti_factor`. A line with material but zero hours still shows
Installed > Material — that's the markup chain, not labor. Don't read it as a bug.

---

## Recent work

**Fixture schedule → estimate.** Lighting sections have a ⚡ "From Fixture Schedule"
button that opens a search panel over the project's fixture types and inserts a line
item. Field mapping: `equipment_cost → unit_material` (Unit Matl, *not* Unit
Equipment — Unit Equipment is rental), `man_hours → unit_mhrs`, plus watts and
avg_length. Costs are snapshotted at insert time.

**Fixture schedule table.** Description cell does a live search against `items` and
auto-fills watts / avg run / equip cost / man hours. The dropdown renders through
`createPortal` to `document.body` with fixed positioning — an absolutely-positioned
dropdown gets clipped by the table's `overflow-x-auto`. `type_code` is unique per
project, enforced both by DB constraint (004) and client-side with an inline error
that reverts the field.

**Fixture matrix** (`/projects/[id]/fixture-matrix`). Read-only pivot: fixture type ×
area, aggregated from line items where `fixture_type IS NOT NULL`. Exports to Excel for
sending to ALA. Originally built with its own `fixture_counts` table and a "Sync to
Estimate" button; that was double-entry, so it was torn out — the estimate is the only
place counts are entered.

**Phase summary** (`/projects/[id]/phase-summary`). Pivot of section totals across
phases — "Lighting total for Phase 2", etc. Metric toggle: Total Installed / Material /
Labor $ / Man Hours. Sections sort by electrical-trade convention (Service →
Distribution → Feeders → Power → Lighting → Controls → Devices → Conduit → Wire → Fire
Alarm → Data → Security → AV → Site), unrecognized names fall to alphabetical.

**Items database.** ~9,000 rows upserted from `C:\Users\daled\OneDrive\Shared\db.xlsb`
via `C:\Users\daled\upsert_items.py`. Categories are assigned by priority-ordered
keyword matching on description, with code-prefix fallbacks (`FA*` → Fire Alarm, `G*` →
Grounding). Upserts need `?on_conflict=code` on the URL — the
`Prefer: resolution=merge-duplicates` header alone is not enough. ~1,900 rows remain
"General"; those are specialty equipment that doesn't map to a wiring trade.

---

## Roadmap

The Excel workbooks are being replaced wholesale, so everything below is required
eventually. Rough priority:

1. **ALA quote reconciliation** — the loop is open. Fixture costs are snapshotted into
   line items at insert, so when a quote comes back there's no way to re-price except
   by hand. Needs: bulk entry (type code → quoted price), write back to
   `fixture_schedules.equipment_cost`, then bulk-update every line item with a matching
   `fixture_type` to `quoted × lighting_markup_factor` and set `price_source = 'quote'`.
   Keep a `quotes` row for audit.
2. **Quotes / buyout module** — the current `/quotes` page is a flat vendor list. The
   spreadsheet has a 31-category × 12-phase grid: Est Cost | Low Quote | Vendor 1-6 |
   Variance, with Low Quote = MIN(vendors) and Est Cost synced from Jaguar rollups.
   Needs `quote_categories`, `project_quotes`, `quote_vendor_entries`.
3. **Bid form / proposal output** — print-optimized page, `@media print`,
   `window.print()`. Header, scope summary, cost breakdown, signature block.
4. **GMP / GMax / alternates** — `estimates` already has `estimate_type` and `version`;
   needs `parent_estimate_id`, `label`, `is_active`, a clone RPC, and a version
   switcher in the project header.
5. **Temp power planning** — `temp_power_plans` table + page.

---

## Environment gotchas

- **Bash tool resets cwd** between calls, and `cd C:\path && ...` frequently fails.
  Use `git -C "C:/github-jaguar" ...` with forward slashes. For builds,
  `cd "C:/github-jaguar" && npx next build` does work — quoted, forward slashes.
- **PowerShell tool** silently returned nothing for `npx tsc --noEmit` in this repo.
  `npx next build` through the Bash tool is the reliable typecheck.
- **Vercel** auto-deploys on push to `main` (`jaguar-self.vercel.app`, project
  `j8hzyypxfw-rgbs-projects/jaguar`). `npx vercel ls` and
  `npx vercel inspect <dpl_id> --logs` both work for checking a deploy.
- Git warns about LF→CRLF on every commit. Harmless.
