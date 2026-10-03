import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Download, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DEMO_MATERIALS } from "@/lib/demo-data";
import { useSession } from "@/hooks/useSession";
import { useRole } from "@/hooks/useRole";
import { updateMaterial, deleteMaterial } from "@/lib/materials.functions";

export function getMaterialUnitWeight(m: any): number {
  if (m.unit_weight_kg != null && !isNaN(Number(m.unit_weight_kg)) && Number(m.unit_weight_kg) > 0) {
    return Number(m.unit_weight_kg);
  }
  if (m.description) {
    const match = String(m.description).match(/weight[:\s=]+([0-9]+(?:\.[0-9]+)?)/i);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  const mName = (m.name || "").trim().toLowerCase();
  const mCode = (m.code || "").trim().toLowerCase();
  const found = DEMO_MATERIALS.find(
    (dm) =>
      dm.id === m.id ||
      (mCode && dm.code?.toLowerCase() === mCode) ||
      (mName && dm.name?.toLowerCase() === mName)
  );
  if (found?.unit_weight_kg != null) {
    return Number(found.unit_weight_kg);
  }
  return 0.5;
}

export const Route = createFileRoute("/_authenticated/masters/materials")({
  head: () => ({ meta: [{ title: "Materials — FEMS" }] }),
  component: MaterialsPage,
});

function MaterialsPage() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { data: role } = useRole(user?.id, user?.email);

  // Super Admin Check (it_admin role or IT Admin email software.2040@pgel.in, or dev mode fallback)
  const isSuperAdmin = !user ? true : (role === "it_admin" || user?.email?.toLowerCase().trim() === "software.2040@pgel.in");

  const updateMaterialFn = useServerFn(updateMaterial);
  const deleteMaterialFn = useServerFn(deleteMaterial);

  const list = useQuery({
    queryKey: ["materials-all"],
    queryFn: async () => (await supabase.from("materials").select("*").order("name")).data ?? [],
  });
  const rawMaterials = (list.data && list.data.length > 0) ? list.data : DEMO_MATERIALS;

  // New material modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", uom: "PCS", unit_weight_kg: "0.50", minimum_stock: "0", description: "" });

  // Edit material modal state
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", uom: "PCS", unit_weight_kg: "0.50", minimum_stock: "0", description: "", active: true });
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete confirmation alert state
  const [materialToDelete, setMaterialToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const filteredMaterials = rawMaterials.filter((m: any) =>
    (m.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.uom || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    if (filteredMaterials.length === 0) {
      toast.error("No materials available to export");
      return;
    }

    const headers = ["Material Name", "Item Code", "UOM", "Unit Weight (kg)", "Minimum Stock", "Description"];
    const csvRows = filteredMaterials.map((m: any) => {
      const wt = getMaterialUnitWeight(m);
      return [
        `"${(m.name ?? "").replace(/"/g, '""')}"`,
        `"${(m.code ?? "").replace(/"/g, '""')}"`,
        `"${(m.uom ?? "").replace(/"/g, '""')}"`,
        Number(wt).toFixed(2),
        Number(m.minimum_stock || 0),
        `"${(m.description ?? "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "\ufeff" + [headers.join(","), ...csvRows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FEMS_Materials_Master_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredMaterials.length} materials to CSV!`);
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.code.trim() || !form.uom.trim()) throw new Error("Name, code, UOM required");
      const unitWt = Number(form.unit_weight_kg || 0.5);
      const desc = form.description
        ? `${form.description.trim()} | Weight: ${unitWt.toFixed(2)} kg`
        : `Weight: ${unitWt.toFixed(2)} kg`;
      const { error } = await supabase.from("materials").insert({
        name: form.name.trim(),
        code: form.code.trim(),
        uom: form.uom.trim(),
        minimum_stock: Number(form.minimum_stock) || 0,
        description: desc,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Material added to database!");
      qc.invalidateQueries({ queryKey: ["materials-all"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      setOpen(false);
      setForm({ name: "", code: "", uom: "PCS", unit_weight_kg: "0.50", minimum_stock: "0", description: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEditModal = (m: any) => {
    const wt = getMaterialUnitWeight(m);
    // Remove embedded Weight: ... from description input to keep it clean
    const cleanDesc = (m.description || "")
      .replace(/weight[:\s=]+[0-9]+(?:\.[0-9]+)?\s*(?:kg)?/i, "")
      .replace(/^[|\s]+|[|\s]+$/g, "");

    setEditingMaterial(m);
    setEditForm({
      name: m.name || "",
      code: m.code || "",
      uom: m.uom || "PCS",
      unit_weight_kg: String(wt),
      minimum_stock: String(m.minimum_stock ?? 0),
      description: cleanDesc,
      active: m.active ?? true,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMaterial) return;
    if (!editForm.name.trim() || !editForm.code.trim() || !editForm.uom.trim()) {
      toast.error("Name, Code, and UOM are required");
      return;
    }
    setIsUpdating(true);
    try {
      const unitWt = Math.max(0, Number(editForm.unit_weight_kg) || 0);
      const weightStr = `Weight: ${unitWt.toFixed(2)} kg`;
      let desc = (editForm.description || "").trim();
      if (desc.match(/weight[:\s=]+[0-9]+(?:\.[0-9]+)?\s*(?:kg)?/i)) {
        desc = desc.replace(/weight[:\s=]+[0-9]+(?:\.[0-9]+)?\s*(?:kg)?/i, weightStr);
      } else if (desc) {
        desc = `${desc} | ${weightStr}`;
      } else {
        desc = weightStr;
      }

      let serverOk = false;
      try {
        await updateMaterialFn({
          data: {
            id: editingMaterial.id,
            name: editForm.name.trim(),
            code: editForm.code.trim(),
            uom: editForm.uom.trim(),
            unit_weight_kg: unitWt,
            minimum_stock: Number(editForm.minimum_stock) || 0,
            description: desc,
            active: editForm.active,
          },
        });
        serverOk = true;
      } catch (err: any) {
        console.warn("ServerFn update failed, attempting direct client update:", err);
      }

      if (!serverOk) {
        const { error } = await supabase.from("materials").update({
          name: editForm.name.trim(),
          code: editForm.code.trim(),
          uom: editForm.uom.trim(),
          minimum_stock: Number(editForm.minimum_stock) || 0,
          description: desc,
          active: editForm.active,
        }).eq("id", editingMaterial.id);
        if (error) throw error;
      }

      // Also sync in-memory DEMO_MATERIALS if matching
      const dmIdx = DEMO_MATERIALS.findIndex(
        (dm) => dm.id === editingMaterial.id || dm.code?.toLowerCase() === editForm.code.toLowerCase()
      );
      if (dmIdx !== -1) {
        DEMO_MATERIALS[dmIdx].name = editForm.name.trim();
        DEMO_MATERIALS[dmIdx].code = editForm.code.trim();
        DEMO_MATERIALS[dmIdx].uom = editForm.uom.trim();
        DEMO_MATERIALS[dmIdx].unit_weight_kg = unitWt;
        DEMO_MATERIALS[dmIdx].minimum_stock = Number(editForm.minimum_stock) || 0;
      }

      toast.success(`"${editForm.name}" updated successfully in database!`);
      await qc.invalidateQueries({ queryKey: ["materials-all"] });
      await qc.invalidateQueries({ queryKey: ["materials"] });
      setEditingMaterial(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to update material");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!materialToDelete) return;
    setIsDeleting(true);
    try {
      let serverOk = false;
      try {
        await deleteMaterialFn({
          data: {
            id: materialToDelete.id,
            code: materialToDelete.code,
            name: materialToDelete.name,
          },
        });
        serverOk = true;
      } catch (err: any) {
        console.warn("ServerFn delete failed, attempting direct client delete:", err);
      }

      if (!serverOk) {
        const { error } = await supabase.from("materials").delete().eq("id", materialToDelete.id);
        if (error) {
          if (error.code === "23503") {
            throw new Error("Cannot delete: This material is linked to existing Purchase Orders or Invoices. Please remove those records first or deactivate the material.");
          }
          throw error;
        }
      }

      // Also remove from in-memory DEMO_MATERIALS
      const dmIdx = DEMO_MATERIALS.findIndex(
        (dm) => dm.id === materialToDelete.id || dm.code?.toLowerCase() === materialToDelete.code?.toLowerCase()
      );
      if (dmIdx !== -1) {
        DEMO_MATERIALS.splice(dmIdx, 1);
      }

      toast.success(`"${materialToDelete.name}" successfully deleted from database!`);
      await qc.invalidateQueries({ queryKey: ["materials-all"] });
      await qc.invalidateQueries({ queryKey: ["materials"] });
      setMaterialToDelete(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete material from database");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Master"
        description="Manage raw materials and standard unit weights (kg). Used for automatic BOM product weight calculation & handover verification."
        actions={
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <Badge variant="outline" className="hidden sm:inline-flex bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold gap-1.5 py-1 px-2.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Super Admin Access
              </Badge>
            ) : (
              <Badge variant="outline" className="hidden sm:inline-flex bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 font-medium gap-1.5 py-1 px-2.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                Read-only
              </Badge>
            )}

            <Button
              variant="outline"
              onClick={exportCSV}
              className="gap-2 font-bold text-slate-700 dark:text-slate-200 border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4 text-indigo-600" />
              Export Materials (CSV)
            </Button>

            {isSuperAdmin && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                    <Plus className="h-4 w-4 mr-2" />New Material
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Material &amp; Standard Weight</DialogTitle></DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Material Name *</Label>
                      <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SS PIPE 28mm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Item Code *</Label>
                      <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SS-PIPE-28" />
                    </div>
                    <div className="space-y-2">
                      <Label>UOM *</Label>
                      <Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder="MTR / PCS / SET / SQMTR" />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Weight (kg / UOM) *</Label>
                      <Input type="number" step="0.01" min={0} value={form.unit_weight_kg} onChange={(e) => setForm({ ...form, unit_weight_kg: e.target.value })} placeholder="e.g. 1.25" />
                      <p className="text-[11px] text-slate-500">Weight per piece/meter for BOM calculation</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Minimum Stock</Label>
                      <Input type="number" min={0} value={form.minimum_stock} onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Description</Label>
                      <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional specifications or notes" />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={() => add.mutate()} disabled={add.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                      {add.isPending ? "Adding..." : "Add Material"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
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

      {/* Materials Table */}
      <Card className="shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Material Name</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">UOM</th>
                <th className="text-right px-4 py-3">Unit Weight (kg)</th>
                <th className="text-right px-4 py-3">Min Stock</th>
                <th className="text-right px-4 py-3 w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMaterials.map((m: any) => {
                const wt = getMaterialUnitWeight(m);
                return (
                  <tr key={m.id || m.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>{m.name}</span>
                        {m.active === false && (
                          <Badge variant="secondary" className="text-[10px] bg-slate-200 text-slate-700">Inactive</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{m.code}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">{m.uom}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className="font-mono text-xs bg-indigo-50/60 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300">
                        ⚖️ {Number(wt).toFixed(2)} kg / {m.uom}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {Number(m.minimum_stock || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSuperAdmin ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                            title="Edit Material in Database (Super Admin)"
                            onClick={() => openEditModal(m)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            title="Delete Material from Database (Super Admin)"
                            onClick={() => setMaterialToDelete(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" /> View only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400 font-medium">
                    No matching materials found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Material Dialog (Super Admin) */}
      <Dialog open={!!editingMaterial} onOpenChange={(val) => { if (!val) setEditingMaterial(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Edit Material in Database
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Material Name *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g. MS Pipe 25mm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Item Code *</Label>
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                placeholder="e.g. MS-PIPE-25"
              />
            </div>
            <div className="space-y-1.5">
              <Label>UOM *</Label>
              <Input
                value={editForm.uom}
                onChange={(e) => setEditForm({ ...editForm, uom: e.target.value })}
                placeholder="MTR / PCS / SET / SQMTR"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Weight (kg / UOM) *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={editForm.unit_weight_kg}
                onChange={(e) => setEditForm({ ...editForm, unit_weight_kg: e.target.value })}
                placeholder="e.g. 1.75"
              />
              <p className="text-[11px] text-slate-500">Weight per unit for BOM verification</p>
            </div>
            <div className="space-y-1.5">
              <Label>Minimum Stock</Label>
              <Input
                type="number"
                min={0}
                value={editForm.minimum_stock}
                onChange={(e) => setEditForm({ ...editForm, minimum_stock: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Description / Specifications</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Optional notes or specifications"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="ghost" onClick={() => setEditingMaterial(null)}>Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isUpdating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isUpdating ? "Saving Changes..." : "Save Changes to Database"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanently Delete Confirmation Dialog (Super Admin) */}
      <AlertDialog open={!!materialToDelete} onOpenChange={(val) => { if (!val) setMaterialToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Permanently Delete Material from Database?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-300 pt-2 space-y-2">
              <p>
                Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-100">{materialToDelete?.name}</strong> (Code: <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{materialToDelete?.code}</code>)?
              </p>
              <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded border border-rose-200 dark:border-rose-900">
                ⚠️ <strong>Database Confirmation:</strong> Yeh material database (Supabase <code>materials</code> table) se permanently remove ho jayega.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMaterialToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              {isDeleting ? "Deleting from Database..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
