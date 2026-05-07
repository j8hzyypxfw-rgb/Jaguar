"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const DEFAULT_PARAMS = {
  base_labor: 45.00,
  ti_factor: 1.45,
  foreman_base: 57.00,
  foreman_ti: 1.45,
  tax_rate: 1.0825,
  rental_tax_rate: 1.0825,
  job_exp_pct: 0.25,
  job_exp_cow_pct: 0.10,
  overhead_pct: 0.00,
  profit_pct: 0.15,
  sub_markup_pct: 0.00,
  equipment_mult: 1.00,
  materials_mult: 1.00,
  mhrs_mult: 1.10,
  excavation_mult: 5.00,
  hours_per_week: 40,
  sales_tax_rate: 0.0825,
};

export default function NewProjectPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const [info, setInfo] = useState({
    name: "",
    contractor_name: "",
    customer_name: "",
    owner_name: "",
    architect: "",
    engineer: "",
    bid_date: "",
    start_date: "",
    completion_date: "",
    drawings_dated: "",
    notes: "",
  });

  const [params, setParams] = useState(DEFAULT_PARAMS);

  function setInfoField(field: string, value: string) {
    setInfo((p) => ({ ...p, [field]: value }));
  }

  function setParam(field: string, value: string) {
    setParams((p) => ({ ...p, [field]: parseFloat(value) || 0 }));
  }

  async function handleSave() {
    if (!info.name.trim()) { toast.error("Project name is required"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...info, ...params, workspace_id: null })
        .select("id")
        .single();

      if (error) throw error;

      // Create default estimate
      await supabase.from("estimates").insert({
        project_id: data.id,
        name: "Base Bid",
        estimate_type: "base",
      });

      toast.success("Project created");
      router.push(`/projects/${data.id}`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/projects" className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">New Project</h1>
          <p className="text-sm text-muted-foreground">Set up project info and pricing parameters</p>
        </div>
        <Button className="ml-auto" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Creating…" : "Create Project"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Project Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Project Name *</Label>
              <Input value={info.name} onChange={(e) => setInfoField("name", e.target.value)}
                placeholder="e.g. AWS Data Center Fit-Out" className="mt-1" />
            </div>
            <div>
              <Label>Contractor</Label>
              <Input value={info.contractor_name} onChange={(e) => setInfoField("contractor_name", e.target.value)}
                placeholder="Your company name" className="mt-1" />
            </div>
            <div>
              <Label>Customer / GC</Label>
              <Input value={info.customer_name} onChange={(e) => setInfoField("customer_name", e.target.value)}
                placeholder="General contractor or owner" className="mt-1" />
            </div>
            <div>
              <Label>Owner</Label>
              <Input value={info.owner_name} onChange={(e) => setInfoField("owner_name", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Architect</Label>
              <Input value={info.architect} onChange={(e) => setInfoField("architect", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Engineer</Label>
              <Input value={info.engineer} onChange={(e) => setInfoField("engineer", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Drawings Dated</Label>
              <Input type="date" value={info.drawings_dated} onChange={(e) => setInfoField("drawings_dated", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Bid Date</Label>
              <Input type="date" value={info.bid_date} onChange={(e) => setInfoField("bid_date", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={info.start_date} onChange={(e) => setInfoField("start_date", e.target.value)}
                className="mt-1" />
            </div>
            <div>
              <Label>Completion Date</Label>
              <Input type="date" value={info.completion_date} onChange={(e) => setInfoField("completion_date", e.target.value)}
                className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* Labor Parameters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Labor Parameters</CardTitle>
            <CardDescription>Base labor rates for this project. Labor Rate = Base Labor × T&amp;I.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {[
              { label: "Base Labor ($/hr)", field: "base_labor", prefix: "$" },
              { label: "T&I Factor", field: "ti_factor" },
              { label: "Labor Rate (computed)", field: "_labor_rate", readOnly: true,
                value: (params.base_labor * params.ti_factor).toFixed(2), prefix: "$" },
              { label: "Foreman Base ($/hr)", field: "foreman_base", prefix: "$" },
              { label: "Foreman T&I", field: "foreman_ti" },
              { label: "Foreman Rate (computed)", field: "_foreman_rate", readOnly: true,
                value: (params.foreman_base * params.foreman_ti).toFixed(2), prefix: "$" },
              { label: "Hours/Week", field: "hours_per_week" },
            ].map(({ label, field, prefix, readOnly, value }) => (
              <div key={field}>
                <Label className="text-xs">{label}</Label>
                <div className="relative mt-1">
                  {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
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
              { label: "Sales Tax (material)", field: "tax_rate", hint: "e.g. 1.0825 = 8.25%" },
              { label: "Job Expense %", field: "job_exp_pct", hint: "e.g. 0.25 = 25%" },
              { label: "Job Exp COW %", field: "job_exp_cow_pct", hint: "e.g. 0.10 = 10%" },
              { label: "Overhead %", field: "overhead_pct", hint: "e.g. 0.05 = 5%" },
              { label: "Profit %", field: "profit_pct", hint: "e.g. 0.15 = 15%" },
              { label: "Sub Markup %", field: "sub_markup_pct", hint: "e.g. 0.10 = 10%" },
              { label: "Sales Tax Rate %", field: "sales_tax_rate", hint: "e.g. 0.0825 = 8.25%" },
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
            <CardDescription>Applied per cost type. Default excavation of 5.0 = 400% adder for site work difficulty.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-4">
            {[
              { label: "Equipment", field: "equipment_mult" },
              { label: "Materials", field: "materials_mult" },
              { label: "Man Hours", field: "mhrs_mult", hint: "1.10 = 10% inefficiency" },
              { label: "Excavation", field: "excavation_mult", hint: "5.0 = 400% adder" },
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
      </div>
    </div>
  );
}
