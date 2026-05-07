"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { Quote, QuoteStatus } from "@/types";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function getDelta(quote: Quote): number | null {
  if (quote.quote_amount == null || quote.db_amount == null) return null;
  return quote.db_amount - quote.quote_amount;
}

function getDeltaPct(quote: Quote): number | null {
  const d = getDelta(quote);
  if (d == null || !quote.db_amount) return null;
  return d / quote.db_amount;
}

function rowColorClass(quote: Quote): string {
  if (quote.status === "selected") return "bg-green-50 dark:bg-green-950/30";
  const d = getDelta(quote);
  if (d != null && d > 0) return "bg-yellow-50 dark:bg-yellow-950/20";
  return "";
}

interface NewQuoteForm {
  vendor_name: string;
  description: string;
  category: string;
  quote_amount: string;
  db_amount: string;
  scope: string;
}

const EMPTY_FORM: NewQuoteForm = {
  vendor_name: "",
  description: "",
  category: "",
  quote_amount: "",
  db_amount: "",
  scope: "",
};

export function QuotesTable({
  projectId,
  estimateId,
  initialQuotes,
}: {
  projectId: string;
  estimateId: string | null;
  initialQuotes: Quote[];
}) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<NewQuoteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const supabase = createClient();

  const markSaving = (id: string, on: boolean) =>
    setSaving((s) => {
      const next = new Set(s);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  // ── Toggle selected status ────────────────────────────────────────────────
  const toggleSelected = useCallback(
    async (quote: Quote) => {
      const nextStatus: QuoteStatus =
        quote.status === "selected" ? "received" : "selected";
      markSaving(quote.id, true);
      const { error } = await supabase
        .from("quotes")
        .update({ status: nextStatus })
        .eq("id", quote.id);
      if (!error) {
        setQuotes((prev) =>
          prev.map((q) =>
            q.id === quote.id ? { ...q, status: nextStatus } : q
          )
        );
      }
      markSaving(quote.id, false);
    },
    [supabase]
  );

  // ── Save field on blur ────────────────────────────────────────────────────
  const saveField = useCallback(
    async (id: string, field: string, value: string | number | null) => {
      markSaving(id, true);
      // Recompute delta if quote_amount or db_amount changed
      const quote = quotes.find((q) => q.id === id);
      const update: Record<string, unknown> = { [field]: value };
      if (quote && (field === "quote_amount" || field === "db_amount")) {
        const merged = { ...quote, [field]: value as number };
        update.delta =
          merged.db_amount != null && merged.quote_amount != null
            ? merged.db_amount - merged.quote_amount
            : null;
      }
      const { error } = await supabase
        .from("quotes")
        .update(update)
        .eq("id", id);
      if (!error) {
        setQuotes((prev) =>
          prev.map((q) =>
            q.id === id ? { ...q, [field]: value, delta: (update.delta as number | null) ?? q.delta } : q
          )
        );
      }
      markSaving(id, false);
    },
    [quotes, supabase]
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteQuote = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (!error) setQuotes((prev) => prev.filter((q) => q.id !== id));
    },
    [supabase]
  );

  // ── Submit new quote ──────────────────────────────────────────────────────
  const submitNew = useCallback(async () => {
    if (!estimateId) {
      alert("No base estimate found. Create an estimate first.");
      return;
    }
    const quoteAmt = form.quote_amount ? Number(form.quote_amount) : null;
    const dbAmt = form.db_amount ? Number(form.db_amount) : null;
    const delta =
      quoteAmt != null && dbAmt != null ? dbAmt - quoteAmt : null;

    const newQuote = {
      estimate_id: estimateId,
      vendor_name: form.vendor_name,
      description: form.description || null,
      scope: form.scope || null,
      category: form.category || null,
      quote_amount: quoteAmt,
      db_amount: dbAmt,
      delta,
      status: "received" as QuoteStatus,
      received_at: new Date().toISOString(),
      notes: null,
      sort_order: quotes.length,
    };

    const { data, error } = await supabase
      .from("quotes")
      .insert(newQuote)
      .select()
      .single();

    if (!error && data) {
      setQuotes((prev) => [...prev, data as Quote]);
      setForm(EMPTY_FORM);
      setAdding(false);
    }
  }, [estimateId, form, quotes.length, supabase]);

  const totalQuote = quotes.reduce((s, q) => s + (q.quote_amount ?? 0), 0);
  const totalDb = quotes.reduce((s, q) => s + (q.db_amount ?? 0), 0);
  const totalSavings = quotes.reduce((s, q) => s + (q.delta ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Vendor</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Category</th>
              <th className="text-left px-3 py-2.5 font-medium text-xs text-muted-foreground">Description / Scope</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Quote Amt</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">DB Price</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Savings $</th>
              <th className="text-right px-3 py-2.5 font-medium text-xs text-muted-foreground">Savings %</th>
              <th className="text-center px-3 py-2.5 font-medium text-xs text-muted-foreground">Status</th>
              <th className="text-center px-2 py-2.5 font-medium text-xs text-muted-foreground">Sel</th>
              <th className="px-2 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {quotes.length === 0 && !adding && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No quotes yet. Click "Add Quote" to begin.
                </td>
              </tr>
            )}
            {quotes.map((quote) => {
              const delta = getDelta(quote);
              const deltaPct = getDeltaPct(quote);
              return (
                <tr
                  key={quote.id}
                  className={`hover:opacity-90 transition-colors ${rowColorClass(quote)} ${saving.has(quote.id) ? "opacity-60" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-sm border-transparent hover:border-border focus:border-border min-w-[120px]"
                      defaultValue={quote.vendor_name}
                      onBlur={(e) => saveField(quote.id, "vendor_name", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-sm border-transparent hover:border-border focus:border-border w-28"
                      defaultValue={quote.category ?? ""}
                      placeholder="e.g. conduit"
                      onBlur={(e) => saveField(quote.id, "category", e.target.value || null)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-sm border-transparent hover:border-border focus:border-border min-w-[160px]"
                      defaultValue={quote.description ?? ""}
                      placeholder="Description"
                      onBlur={(e) => saveField(quote.id, "description", e.target.value || null)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28 ml-auto"
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={quote.quote_amount ?? ""}
                      onBlur={(e) =>
                        saveField(quote.id, "quote_amount", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 text-sm text-right border-transparent hover:border-border focus:border-border w-28 ml-auto"
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={quote.db_amount ?? ""}
                      onBlur={(e) =>
                        saveField(quote.id, "db_amount", e.target.value ? Number(e.target.value) : null)
                      }
                    />
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${delta != null && delta > 0 ? "text-green-700 dark:text-green-400" : delta != null && delta < 0 ? "text-red-600" : ""}`}>
                    {fmt(delta)}
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums text-xs ${deltaPct != null && deltaPct > 0 ? "text-green-700 dark:text-green-400" : ""}`}>
                    {fmtPct(deltaPct)}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Badge
                      variant={quote.status === "selected" ? "default" : "secondary"}
                      className="capitalize text-xs"
                    >
                      {quote.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => toggleSelected(quote)}
                      className={`w-6 h-6 rounded border flex items-center justify-center mx-auto transition-colors ${
                        quote.status === "selected"
                          ? "bg-green-600 border-green-600 text-white"
                          : "border-border text-muted-foreground hover:border-green-500"
                      }`}
                      title={quote.status === "selected" ? "Deselect" : "Select"}
                    >
                      {quote.status === "selected" && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => deleteQuote(quote.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete quote"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* ── Inline add form ─────────────────────────────────────── */}
            {adding && (
              <tr className="bg-muted/20 border-t-2">
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm min-w-[120px]"
                    placeholder="Vendor name *"
                    value={form.vendor_name}
                    onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
                    autoFocus
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm w-28"
                    placeholder="Category"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm min-w-[160px]"
                    placeholder="Description / scope"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right w-28 ml-auto"
                    type="number"
                    placeholder="Quote $"
                    value={form.quote_amount}
                    onChange={(e) => setForm((f) => ({ ...f, quote_amount: e.target.value }))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="h-8 text-sm text-right w-28 ml-auto"
                    type="number"
                    placeholder="DB price $"
                    value={form.db_amount}
                    onChange={(e) => setForm((f) => ({ ...f, db_amount: e.target.value }))}
                  />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground text-xs">
                  {form.quote_amount && form.db_amount
                    ? fmt(Number(form.db_amount) - Number(form.quote_amount))
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground text-xs">
                  {form.quote_amount && form.db_amount && Number(form.db_amount)
                    ? fmtPct((Number(form.db_amount) - Number(form.quote_amount)) / Number(form.db_amount))
                    : "—"}
                </td>
                <td />
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    <button
                      onClick={submitNew}
                      disabled={!form.vendor_name}
                      className="text-green-600 hover:text-green-700 disabled:opacity-40 transition-colors"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                <td />
              </tr>
            )}
          </tbody>
          {quotes.length > 0 && (
            <tfoot className="border-t-2 bg-muted/50">
              <tr className="font-semibold">
                <td colSpan={3} className="px-3 py-3 text-right text-sm">Grand Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(totalQuote)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmt(totalDb)}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${totalSavings > 0 ? "text-green-700 dark:text-green-400" : ""}`}>
                  {fmt(totalSavings)}
                </td>
                <td className={`px-3 py-3 text-right tabular-nums text-xs ${totalSavings > 0 && totalDb > 0 ? "text-green-700 dark:text-green-400" : ""}`}>
                  {totalDb > 0 ? fmtPct(totalSavings / totalDb) : "—"}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center gap-3 no-print">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAdding(true); setForm(EMPTY_FORM); }}
          disabled={adding}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Quote
        </Button>
        {quotes.filter((q) => q.status === "selected").length > 0 && (
          <span className="text-sm text-muted-foreground">
            {quotes.filter((q) => q.status === "selected").length} quote(s) selected ·{" "}
            {fmt(quotes.filter((q) => q.status === "selected").reduce((s, q) => s + (q.quote_amount ?? 0), 0))} total
          </span>
        )}
      </div>
    </div>
  );
}
