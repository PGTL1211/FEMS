import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Search, Boxes } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DEMO_MATERIALS } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/masters/materials")({
  head: () => ({ meta: [{ title: "Materials — FEMS" }] }),
  component: MaterialsPage,
});

function MaterialsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["materials-all"], queryFn: async () => (await supabase.from("materials").select("*").order("name")).data ?? [] });
  const rawMaterials = (list.data && list.data.length > 0) ? list.data : DEMO_MATERIALS;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", uom: "PCS", unit_weight_kg: "0.50", minimum_stock: "0", description: "" });
  const [searchTerm, setSearchTerm] = useState("");

  const filteredMaterials = rawMaterials.filter((m: any) =>
    (m.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.uom || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.code || !form.uom) throw new Error("Name, code, UOM required");
      const { error } = await supabase.from("materials").insert({
        name: form.name, code: form.code, uom: form.uom,
        minimum_stock: Number(form.minimum_stock) || 0, description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Material added"); qc.invalidateQueries(); setOpen(false); setForm({ name: "", code: "", uom: "PCS", unit_weight_kg: "0.50", minimum_stock: "0", description: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("materials").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Master"
        description="Manage raw materials and standard unit weights (kg). Used for automatic BOM product weight calculation & handover verification."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Material</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Material &amp; Weight</DialogTitle></DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SS PIPE 28mm" /></div>
                <div className="space-y-2"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SS-PIPE-28" /></div>
                <div className="space-y-2"><Label>UOM</Label><Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder="MTR / PCS / SET" /></div>
                <div className="space-y-2">
                  <Label>Unit Weight (kg / UOM)</Label>
                  <Input type="number" step="0.01" min={0} value={form.unit_weight_kg} onChange={(e) => setForm({ ...form, unit_weight_kg: e.target.value })} placeholder="e.g. 1.25" />
                  <p className="text-[11px] text-slate-500">Weight per piece/meter for BOM calculation</p>
                </div>
                <div className="space-y-2"><Label>Minimum Stock</Label><Input type="number" min={0} value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} /></div>
                <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => add.mutate()} disabled={add.isPending}>Add Material</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filter & Search Bar */}
      <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search materials by name, code or UOM..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Total {filteredMaterials.length} Raw Materials
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">UOM</th>
                <th className="text-right px-4 py-3">Unit Weight (kg)</th>
                <th className="text-right px-4 py-3">Min Stock</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMaterials.map((m: any) => {
                const wt = m.unit_weight_kg ?? (DEMO_MATERIALS.find(dm => dm.id === m.id || dm.name === m.name)?.unit_weight_kg ?? 0.5);
                return (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{m.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{m.code}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{m.uom}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className="font-mono text-xs bg-indigo-50/60 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300">
                        ⚖️ {Number(wt).toFixed(2)} kg / {m.uom}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{Number(m.minimum_stock).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove.mutate(m.id)}><Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" /></Button></td>
                  </tr>
                );
              })}
              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 font-medium">
                    No matching material found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
