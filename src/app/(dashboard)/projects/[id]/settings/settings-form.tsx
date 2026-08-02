"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@/types";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "draft",     label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "awarded",   label: "Awarded" },
  { value: "lost",      label: "Lost" },
];

export function SettingsForm({ project }: { project: Project }) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const [info, setInfo] = useState({
    name:            project.name,
    contractor_name: project.contractor_name ?? "",
    customer_name:   project.customer_name ?? "",
    owner_name:      project.owner_name ?? "",
    architect:       project.architect ?? "",
    engineer:        project.engineer ?? "",
    bid_date:        project.bid_date ?? "",
    start_date:      project.start_date ?? "",
    completion_date: project.completion_date ?? "",
    drawings_dated:  project.drawings_dated ?? "",
    notes:           project.notes ?? "",
    status:          project.status as ProjectStatus,
    // Budget Summary document
    address:         project.address ?? "",
    job_number:      project.job_number ?? "",
    drawings_label:  project.drawings_label ?? "",
    clarifications:  project.clarifications ?? "",
  });

  const [params, setParams] = useState({
    base_labor:      project.base_labor,
    ti_factor:       project.ti_factor,
    foreman_base:    project.foreman_base,
    foreman_ti:      project.foreman_ti,
    hours_per_week:  project.hours_per_week,
    tax_rate:        project.tax_rate,
    job_exp_pct:     project.job_exp_pct,
    job_exp_cow_pct: project.job_exp_cow_pct,
    overhead_pct:    project.overhead_pct,
    profit_pct:      project.profit_pct,
    sub_markup_pct:  project.sub_markup_pct,
    sales_tax_rate:  project.sales_tax_rate,
    equipment_mult:          project.equipment_mult,
    materials_mult:          project.materials_mult,
    mhrs_mult:               project.mhrs_mult,
    excavation_mult:         project.excavation_mult,
    lighting_markup_factor:  project.lighting_markup_factor,
    inefficiency_pct:        project.inefficiency_pct ?? 0,
    ot_labor_rate:           project.ot_labor_rate ?? 0,
    square_feet:             project.square_feet ?? 0,
  });

  function setInfoField(field: string, value: string) {
    setInfo((p) => ({ ...p, [field]: value }));
  }

  function setParam(field: string, value: string) {
    setParams((p) => ({ ...p, [field]: parseFloat(value) || 0 }));
  }

  async function handleSave() {
    if (!info.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...info,
        ...params,
        contractor_name: info.contractor_name || null,
        customer_name:   info.customer_name || null,
        owner_name:      info.owner_name || null,
        architect:       info.architect || null,
        engineer:        info.engineer || null,
        bid_date:        info.bid_date || null,
        start_date:      info.start_date || null,
        completion_date: info.completion_date || null,
        drawings_dated:  info.drawings_dated || null,
        notes:           info.notes || null,
        address:         info.address || null,
        job_number:      info.job_number || null,
        drawings_label:  info.drawings_label || null,
        clarifications:  info.clarifications || null,
        // 0 means "not set" for these two — store null so the summary falls back
        ot_labor_rate:   params.ot_labor_rate > 0 ? params.ot_labor_rate : null,
        square_feet:     params.square_feet   > 0 ? params.square_feet   : null,
      };

      const { error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", project.id);

      if (error) throw error;
      toast.success("Project settings saved");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (confirmName.trim() !== project.name.trim()) {
      toast.error("Project name doesn't match");
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from("projects").delete().eq("id", project.id);
      if (error) throw error;
      toast.success("Project deleted");
      router.push("/projects");
    } catch (e: unknown) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  const laborRate   = params.base_labor  * params.ti_factor;
  const foremanRate = params.foreman_base * params.foreman_ti;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/projects/${project.id}`}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Project Settings</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Project Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Project Name *</Label>
              <Input
                value={info.name}
                onChange={(e) => setInfoField("name", e.target.value)}
                placeholder="e.g. AWS Data Center Fit-Out"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={info.status}
                onValueChange={(value) => setInfoField("status", value ?? "draft")}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Contractor</Label>
              <Input
                value={info.contractor_name}
                onChange={(e) => setInfoField("contractor_name", e.target.value)}
                placeholder="Your company name"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Customer / GC</Label>
              <Input
                value={info.customer_name}
                onChange={(e) => setInfoField("customer_name", e.target.value)}
                placeholder="General contractor or owner"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Owner</Label>
              <Input
                value={info.owner_name}
                onChange={(e) => setInfoField("owner_name", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Architect</Label>
              <Input
                value={info.architect}
                onChange={(e) => setInfoField("architect", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Engineer</Label>
              <Input
                value={info.engineer}
                onChange={(e) => setInfoField("engineer", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Drawings Dated</Label>
              <Input
                type="date"
                value={info.drawings_dated}
                onChange={(e) => setInfoField("drawings_dated", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Bid Date</Label>
              <Input
                type="date"
                value={info.bid_date}
                onChange={(e) => setInfoField("bid_date", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={info.start_date}
                onChange={(e) => setInfoField("start_date", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Completion Date</Label>
              <Input
                type="date"
                value={info.completion_date}
                onChange={(e) => setInfoField("completion_date", e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label>Notes</Label>
              <textarea
                value={info.notes}
                onChange={(e) => setInfoField("notes", e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Project notes, special conditions, scope qualifications…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Budget Summary document */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget Summary Document</CardTitle>
            <CardDescription>
              Header and footer text for the printed Budget Summary. Duration, manload and
              OT hours are computed from the dates, hours/week and takeoff.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Address</Label>
              <Input
                value={info.address}
                onChange={(e) => setInfoField("address", e.target.value)}
                className="mt-1"
                placeholder="881 Miller Road"
              />
            </div>

            <div>
              <Label>Job #</Label>
              <Input
                value={info.job_number}
                onChange={(e) => setInfoField("job_number", e.target.value)}
                className="mt-1"
                placeholder="MM26-0199"
              />
            </div>

            <div>
              <Label>Drawings Label</Label>
              <Input
                value={info.drawings_label}
                onChange={(e) => setInfoField("drawings_label", e.target.value)}
                className="mt-1"
                placeholder="90% Review Drwgs Dated 03/09/2026"
              />
            </div>

            <div>
              <Label>Square Feet</Label>
              <Input
                type="number"
                step="1"
                value={params.square_feet}
                onChange={(e) => setParam("square_feet", e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="col-span-2">
              <Label>Clarifications &amp; Assumptions</Label>
              <textarea
                value={info.clarifications}
                onChange={(e) => setInfoField("clarifications", e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={"One per line — each becomes a bullet on the printed summary.\nOur understanding is that ALL switchgear, panelboards, bus duct… are to be OFCI.\nExterior building supports for cable bus systems are by others."}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                One assumption per line.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Labor Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Labor Parameters</CardTitle>
            <CardDescription>
              Base labor rates for this project. Labor Rate = Base Labor &times; T&amp;I.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {[
              { label: "Base Labor ($/hr)",       field: "base_labor",    prefix: "$" },
              { label: "T&I Factor",               field: "ti_factor" },
              { label: "Labor Rate (computed)",    field: "_labor_rate",   prefix: "$", readOnly: true, value: laborRate.toFixed(2) },
              { label: "Foreman Base ($/hr)",      field: "foreman_base",  prefix: "$" },
              { label: "Foreman T&I",              field: "foreman_ti" },
              { label: "Foreman Rate (computed)",  field: "_foreman_rate", prefix: "$", readOnly: true, value: foremanRate.toFixed(2) },
              { label: "Hours/Week",               field: "hours_per_week" },
              { label: "OT Labor Rate ($/hr)",     field: "ot_labor_rate", prefix: "$" },
            ].map(({ label, field, prefix, readOnly, value }) => (
              <div key={field}>
                <Label className="text-xs">{label}</Label>
                <div className="relative mt-1">
                  {prefix && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {prefix}
                    </span>
                  )}
                  <Input
                    type="number"
                    step="0.01"
                    className={prefix ? "pl-6" : ""}
                    value={value ?? (params as Record<string, number>)[field]}
                    readOnly={readOnly}
                    disabled={readOnly}
                    onChange={(e) => !readOnly && setParam(field, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cost Factors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Factors &amp; Markup</CardTitle>
            <CardDescription>Applied to all line items in this project.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {[
              { label: "Inefficiency %",       field: "inefficiency_pct", hint: "e.g. 0.47 = 47% of man-hours" },
              { label: "Sales Tax (material)", field: "tax_rate",        hint: "e.g. 1.0825 = 8.25%" },
              { label: "Job Expense %",        field: "job_exp_pct",     hint: "e.g. 0.25 = 25%" },
              { label: "Job Exp COW %",        field: "job_exp_cow_pct", hint: "e.g. 0.10 = 10%" },
              { label: "Overhead %",           field: "overhead_pct",    hint: "e.g. 0.05 = 5%" },
              { label: "Profit %",             field: "profit_pct",      hint: "e.g. 0.15 = 15%" },
              { label: "Sub Markup %",         field: "sub_markup_pct",  hint: "e.g. 0.10 = 10%" },
              { label: "Sales Tax Rate %",     field: "sales_tax_rate",  hint: "e.g. 0.0825 = 8.25%" },
            ].map(({ label, field, hint }) => (
              <div key={field}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  className="mt-1"
                  value={(params as Record<string, number>)[field]}
                  onChange={(e) => setParam(field, e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Cost Multipliers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost Multipliers</CardTitle>
            <CardDescription>
              Applied per cost type. Default excavation of 5.0 = 400% adder for site work difficulty.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-4">
            {[
              { label: "Equipment",               field: "equipment_mult" },
              { label: "Materials",               field: "materials_mult" },
              { label: "Man Hours",               field: "mhrs_mult",             hint: "1.10 = 10% inefficiency" },
              { label: "Excavation",              field: "excavation_mult",        hint: "5.0 = 400% adder" },
              { label: "Lighting Markup Factor",  field: "lighting_markup_factor", hint: "1.2262 = 22.62% markup on fixture costs" },
            ].map(({ label, field, hint }) => (
              <div key={field}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="mt-1"
                  value={(params as Record<string, number>)[field]}
                  onChange={(e) => setParam(field, e.target.value)}
                />
                {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
        {/* Danger Zone */}
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete this project and all its data — estimates, line items, phases, BOM, everything. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Type the project name to confirm: <span className="font-semibold text-foreground">{project.name}</span></Label>
              <Input
                className="mt-1 border-destructive/40 focus-visible:ring-destructive/40"
                placeholder={project.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmName.trim() !== project.name.trim()}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleting ? "Deleting…" : "Delete Project"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
