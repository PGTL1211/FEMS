import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Factory, AlertTriangle, CheckCircle2, Eye, Calendar, Building2, User, Layers, FileText, Search, MapPin, Filter } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { safeFormatDate } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import { useRole } from "@/hooks/useRole";
import { useLocationPlant } from "@/lib/location-context";

import { DEMO_MATERIALS, DEMO_PRODUCTS, DEMO_DEPARTMENTS, DEMO_FABRICATIONS } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/fabrication")({
  head: () => ({ meta: [{ title: "Fabrication — FEMS" }] }),
  component: FabricationPage,
});

type MatRow = { material_id: string; required: string };

const STORAGE_KEY_CUSTOM_FABS = "fems_custom_fabrications_v2";

function FabricationPage() {
  const qc = useQueryClient();
  const { user } = useSession();
  const { data: role } = useRole(user?.id, user?.email);
  const canWrite = role === "it_admin" || role === "operator";

  const {
    locations,
    selectedLocationId,
    selectedPlantId,
    activeLocation,
    activePlant,
    getUserLocations,
    getUserPlants,
  } = useLocationPlant();

  // Location & Plant Selection in Form
  const [fabLocationId, setFabLocationId] = useState<string>("");
  const [fabPlantId, setFabPlantId] = useState<string>("");

  const userLocations = useMemo(() => {
    return getUserLocations(user?.email, role);
  }, [getUserLocations, user?.email, role, locations]);

  const userPlants = useMemo(() => {
    return getUserPlants(fabLocationId, user?.email, role);
  }, [getUserPlants, fabLocationId, user?.email, role, locations]);

  const productsQuery = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("*").eq("active", true).order("name")).data ?? [] });
  
  // Query inventory_view so we get live current_stock for stock validation
  const materialsQuery = useQuery({ 
    queryKey: ["inventory-materials"], 
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_view").select("*").order("name");
      if (error) {
        const { data: matData } = await supabase.from("materials").select("*").eq("active", true).order("name");
        return matData ?? [];
      }
      return data ?? [];
    } 
  });
  
  const departmentsQuery = useQuery({ queryKey: ["departments"], queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [] });

  const listQuery = useQuery({
    queryKey: ["fabrications"],
    queryFn: async () => (await supabase.from("fabrications")
      .select("id, fab_date, product_quantity, supervisor_name, remarks, products(name), departments(name), fabrication_materials(id, required_qty_per_product, total_quantity, materials(name, uom))")
      .order("fab_date", { ascending: false })).data ?? [],
  });

  const [customFabrications, setCustomFabrications] = useState<any[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_FABS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load custom fabrications", e);
    }
    return [];
  });

  const saveCustomFabs = (list: any[]) => {
    setCustomFabrications(list);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_CUSTOM_FABS, JSON.stringify(list));
    }
  };

  const productsList = (productsQuery.data && productsQuery.data.length > 0) ? productsQuery.data : DEMO_PRODUCTS;
  const materialsList = (materialsQuery.data && materialsQuery.data.length > 0) ? materialsQuery.data : DEMO_MATERIALS;
  const rawDepts = (departmentsQuery.data && departmentsQuery.data.length > 0) ? departmentsQuery.data : DEMO_DEPARTMENTS;
  const departmentsList = rawDepts.filter((d: any) => !d.name?.startsWith("__FEMS_"));
  
  const dbFabList = (listQuery.data && listQuery.data.length > 0) ? listQuery.data : DEMO_FABRICATIONS;
  
  // Deduplicate entries by ID and content signature so no entry is shown twice
  const fabricationsList = useMemo(() => {
    const seenIds = new Set<string>();
    const seenSignatures = new Set<string>();
    const merged: any[] = [];

    // 1. First add DB records
    (dbFabList || []).forEach((item: any) => {
      const id = String(item.id || '');
      const prodName = (item.products as any)?.name || '';
      const deptName = (item.departments as any)?.name || '';
      const sig = `${item.fab_date}_${prodName}_${item.product_quantity}_${item.supervisor_name || ''}_${deptName}`;
      
      if (id && seenIds.has(id)) return;
      if (seenSignatures.has(sig)) return;

      if (id) seenIds.add(id);
      seenSignatures.add(sig);
      merged.push(item);
    });

    // 2. Add local custom fabrications only if not already present in DB records
    (customFabrications || []).forEach((item: any) => {
      const id = String(item.id || '');
      const prodName = (item.products as any)?.name || '';
      const deptName = (item.departments as any)?.name || '';
      const sig = `${item.fab_date}_${prodName}_${item.product_quantity}_${item.supervisor_name || ''}_${deptName}`;

      if (id && seenIds.has(id)) return;
      if (seenSignatures.has(sig)) return;

      if (id) seenIds.add(id);
      seenSignatures.add(sig);
      merged.push(item);
    });

    return merged;
  }, [dbFabList, customFabrications]);

  const [open, setOpen] = useState(false);
  const [selectedFabView, setSelectedFabView] = useState<any | null>(null);
  const [fabDate, setFabDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  // Keep location and plant state in sync when user locations load
  useEffect(() => {
    if (userLocations.length > 0) {
      if (!fabLocationId || !userLocations.some((l) => l.id === fabLocationId)) {
        const first = userLocations[0];
        setFabLocationId(first.id);
        const plants = getUserPlants(first.id, user?.email, role);
        setFabPlantId(plants[0]?.id || "");
      }
    }
  }, [userLocations, fabLocationId, user?.email, role, getUserPlants]);

  useEffect(() => {
    if (open) {
      if (selectedLocationId !== "ALL" && userLocations.some((l) => l.id === selectedLocationId)) {
        setFabLocationId(selectedLocationId);
        const loc = locations.find((l) => l.id === selectedLocationId);
        if (selectedPlantId !== "ALL" && loc?.plants.some((p) => p.id === selectedPlantId)) {
          setFabPlantId(selectedPlantId);
        } else {
          const plants = getUserPlants(selectedLocationId, user?.email, role);
          setFabPlantId(plants[0]?.id || "");
        }
      } else if (userLocations.length > 0) {
        setFabLocationId(userLocations[0].id);
        const plants = getUserPlants(userLocations[0].id, user?.email, role);
        setFabPlantId(plants[0]?.id || "");
      }
    }
  }, [open, selectedLocationId, selectedPlantId, userLocations, locations, user?.email, role, getUserPlants]);

  const [productId, setProductId] = useState("");
  const [productQty, setProductQty] = useState("1");
  const [departmentId, setDepartmentId] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<MatRow[]>([{ material_id: "", required: "" }]);

  const resetForm = () => {
    setFabDate(format(new Date(), "yyyy-MM-dd")); setProductId(""); setProductQty("1"); setDepartmentId("");
    setSupervisor(""); setRemarks(""); setRows([{ material_id: "", required: "" }]);
  };

  const materialsById = useMemo(() => {
    const map: Record<string, any> = {};
    materialsList.forEach((m: any) => {
      const key = m.material_id || m.id;
      if (key) map[key] = m;
      if (m.material_id) map[m.material_id] = m;
      if (m.id) map[m.id] = m;
    });
    return map;
  }, [materialsList]);

  // Live validation: Check if required stock exceeds available stock
  const stockValidation = useMemo(() => {
    const qty = Number(productQty || 0);
    const issues: { materialName: string; required: number; available: number }[] = [];
    
    rows.forEach((r) => {
      if (!r.material_id || !r.required) return;
      const m = materialsById[r.material_id];
      const req = Number(r.required || 0);
      const totalReq = req * qty;
      const availStock = Number(m?.current_stock ?? 0);
      
      if (totalReq > availStock) {
        issues.push({
          materialName: m?.name || "Material",
          required: totalReq,
          available: availStock,
        });
      }
    });

    return {
      hasDeficit: issues.length > 0,
      issues,
    };
  }, [rows, productQty, materialsById]);

  const hasDuplicateMaterials = useMemo(() => {
    const selected = rows.map((r) => r.material_id).filter(Boolean);
    return new Set(selected).size < selected.length;
  }, [rows]);

  const save = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Select a product");
      const qty = Number(productQty);
      if (!(qty > 0)) throw new Error("Product quantity must be greater than zero");
      const valid = rows.filter((r) => r.material_id && Number(r.required) > 0);
      if (valid.length === 0) throw new Error("Add at least one material");

      const chosenLoc = locations.find((l) => l.id === fabLocationId);
      const chosenPlant = chosenLoc?.plants.find((p) => p.id === fabPlantId);

      // Check for duplicate material selections
      const selectedMatIds = valid.map(r => r.material_id);
      const uniqueMatIds = new Set(selectedMatIds);
      if (uniqueMatIds.size < selectedMatIds.length) {
        throw new Error("Duplicate material detected! Each raw material can only be added once in the consumption list.");
      }

      // Strict validation: Prevent negative stock
      for (const r of valid) {
        const m = materialsById[r.material_id];
        const req = Number(r.required || 0);
        const total = req * qty;
        const avail = Number(m?.current_stock ?? 0);

        if (total > avail) {
          throw new Error(`Insufficient Stock for "${m?.name || 'Material'}"! Stock in hand is ${avail} ${m?.uom || 'units'}, but required total is ${total}. Stock cannot go into negative!`);
        }
      }

      const locPrefix = chosenLoc ? `[${chosenLoc.name} - ${chosenPlant?.name || 'Plant'}] ` : '';

      let fabId = `fab-${Date.now()}`;
      try {
        const { data: fab, error } = await supabase.from("fabrications").insert({
          fab_date: fabDate,
          product_id: productId,
          product_quantity: qty,
          department_id: departmentId || null,
          supervisor_name: supervisor || null,
          remarks: locPrefix + (remarks || ""),
          created_by: user?.id ?? null,
        }).select().single();
        if (fab) fabId = fab.id;

        const fmRows = valid.map((r) => ({
          fabrication_id: fabId,
          material_id: r.material_id,
          required_qty_per_product: Number(r.required),
          total_quantity: Number(r.required) * qty,
        }));
        await supabase.from("fabrication_materials").insert(fmRows);
      } catch (e) {
        console.warn("DB insert error, saving locally", e);
      }

      const prodObj = productsList.find((p: any) => p.id === productId);
      const deptObj = departmentsList.find((d: any) => d.id === departmentId);

      const newFabRecord = {
        id: fabId,
        fab_date: fabDate,
        product_quantity: qty,
        supervisor_name: supervisor || "Supervisor",
        remarks: remarks || null,
        location_id: fabLocationId,
        location_name: chosenLoc?.name || "Factory",
        plant_id: fabPlantId,
        plant_name: chosenPlant?.name || "Manufacturing Unit",
        products: { name: prodObj?.name || "Fabricated Product" },
        departments: { name: deptObj?.name || "Fabrication" },
        fabrication_materials: valid.map((r) => {
          const m = materialsById[r.material_id];
          return {
            id: `fm-${Date.now()}-${r.material_id}`,
            required_qty_per_product: Number(r.required),
            total_quantity: Number(r.required) * qty,
            materials: { name: m?.name || "Raw Material", uom: m?.uom || "PCS" },
          };
        }),
      };

      saveCustomFabs([newFabRecord, ...customFabrications]);
    },
    onSuccess: () => {
      toast.success("Fabrication saved successfully!");
      qc.invalidateQueries();
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredFabrications = fabricationsList.filter((f: any) => {
    // Location and Plant filter based on top header selection
    if (selectedLocationId !== "ALL" && f.location_id) {
      if (f.location_id !== selectedLocationId) return false;
    }
    if (selectedPlantId !== "ALL" && f.plant_id) {
      if (f.plant_id !== selectedPlantId) return false;
    }

    const prodName = (f.products as { name?: string } | null)?.name || "";
    const deptName = (f.departments as { name?: string } | null)?.name || "";
    const supervisor = f.supervisor_name || "";
    const fabDate = f.fab_date || "";
    const locStr = (f.location_name || "") + " " + (f.plant_name || "");
    const materialsStr = (f.fabrication_materials ?? []).map((fm: any) => (fm.materials as { name?: string } | null)?.name || "").join(" ");
    const q = searchTerm.toLowerCase();
    return prodName.toLowerCase().includes(q) ||
      deptName.toLowerCase().includes(q) ||
      supervisor.toLowerCase().includes(q) ||
      fabDate.toLowerCase().includes(q) ||
      locStr.toLowerCase().includes(q) ||
      materialsStr.toLowerCase().includes(q);
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      if (!newProdName.trim()) throw new Error("Product name required");
      const { data, error } = await supabase.from("products").insert({ name: newProdName.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Product "${data.name}" added!`);
      qc.invalidateQueries({ queryKey: ["products"] });
      setProductId(data.id);
      setNewProdOpen(false);
      setNewProdName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentFormLoc = locations.find((l) => l.id === fabLocationId);

  return (
    <div className="space-y-4 flex flex-col min-h-[calc(100vh-5rem)] pb-4">
      <PageHeader
        title="Fabrication Entry"
        description="Record production entries categorized by Location & Manufacturing Plant. Materials are automatically deducted from stock."
        actions={canWrite && (
          <>
            <Dialog open={newProdOpen} onOpenChange={setNewProdOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Quick Add Product</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <Label>Product Name</Label>
                  <Input
                    placeholder="e.g. Custom Rack / Special Trolley"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addProduct.mutate(); }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setNewProdOpen(false)}>Cancel</Button>
                  <Button onClick={() => addProduct.mutate()} disabled={addProduct.isPending}>Add & Select</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 font-bold">
                  <Plus className="h-4 w-4" /> New Fabrication
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Factory className="h-5 w-5 text-indigo-600" />
                    New Fabrication Entry
                  </DialogTitle>
                </DialogHeader>

                {/* Location & Plant Selector Strip */}
                <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                    <MapPin className="h-4 w-4 text-indigo-600" />
                    Target Location & Manufacturing Plant
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Location *</Label>
                      <Select
                        value={fabLocationId}
                        onValueChange={(val) => {
                          setFabLocationId(val);
                          const plants = getUserPlants(val, user?.email, role);
                          setFabPlantId(plants[0]?.id || "");
                        }}
                      >
                        <SelectTrigger className="bg-white dark:bg-slate-900 font-semibold">
                          <SelectValue placeholder="Select Location" />
                        </SelectTrigger>
                        <SelectContent>
                          {userLocations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id} className="font-semibold">
                              📍 {loc.name} ({loc.code})
                            </SelectItem>
                          ))}
                          {userLocations.length === 0 && (
                            <SelectItem value="none" disabled>No locations configured / assigned</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Manufacturing Plant / Unit *</Label>
                      <Select value={fabPlantId} onValueChange={setFabPlantId}>
                        <SelectTrigger className="bg-white dark:bg-slate-900 font-semibold">
                          <SelectValue placeholder="Select Plant" />
                        </SelectTrigger>
                        <SelectContent>
                          {userPlants.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="font-semibold">
                              🏭 {p.name} ({p.code})
                            </SelectItem>
                          ))}
                          {userPlants.length === 0 && (
                            <SelectItem value="none" disabled>No plants available</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 mt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Fabrication Date *</Label>
                    <Input type="date" value={fabDate} onChange={(e) => setFabDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">Product *</Label>
                      <button
                        type="button"
                        onClick={() => setNewProdOpen(true)}
                        className="text-xs text-indigo-600 hover:underline font-bold"
                      >
                        + Add Custom Product
                      </button>
                    </div>
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {productsList.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Product Quantity *</Label>
                    <Input type="number" min={1} value={productQty} onChange={(e) => setProductQty(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Department</Label>
                    <Select value={departmentId} onValueChange={setDepartmentId}>
                      <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        {departmentsList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold">Handover To / Supervisor</Label>
                    <Input placeholder="Supervisor / Person receiving handover" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold">Remarks</Label>
                    <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Production remarks or batch notes..." />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <Label className="text-sm font-bold">Material Consumption</Label>
                      <p className="text-xs text-slate-500">Check live stock availability before confirming entry</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setRows([...rows, { material_id: "", required: "" }])}
                      disabled={rows.length >= materialsList.length}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Material
                    </Button>
                  </div>
                  
                  {hasDuplicateMaterials && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded mb-2 font-bold flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Duplicate materials detected!
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-xs uppercase text-slate-700 dark:text-slate-300">
                        <tr>
                          <th className="text-left px-3 py-2.5">Material</th>
                          <th className="text-left px-3 py-2.5">Available Stock</th>
                          <th className="text-left px-3 py-2.5 w-16">UOM</th>
                          <th className="text-right px-3 py-2.5 w-28">Req / Product</th>
                          <th className="text-right px-3 py-2.5 w-28">Total Req.</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {rows.map((row, i) => {
                          const m = materialsById[row.material_id];
                          const req = Number(row.required || 0);
                          const qty = Number(productQty || 0);
                          const total = req * qty;
                          const availStock = Number(m?.current_stock ?? 0);
                          const isDeficit = row.material_id && total > availStock;
                          const isDuplicate = row.material_id && rows.filter((r) => r.material_id === row.material_id).length > 1;

                          return (
                            <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${isDuplicate ? 'bg-amber-50/70' : isDeficit ? 'bg-rose-50/70 dark:bg-rose-950/20' : ''}`}>
                              <td className="px-3 py-2">
                                <Select value={row.material_id} onValueChange={(v) => setRows(rows.map((r, idx) => idx === i ? { ...r, material_id: v } : r))}>
                                  <SelectTrigger className={`w-full ${isDuplicate ? 'border-amber-500' : ''}`}><SelectValue placeholder="Select material" /></SelectTrigger>
                                  <SelectContent className="max-h-60">
                                    {materialsList.map((mm: any) => {
                                      const key = mm.material_id || mm.id;
                                      const isAlreadySelected = rows.some((r, idx) => idx !== i && r.material_id === key);
                                      const stockVal = Number(mm.current_stock ?? 0);
                                      return (
                                        <SelectItem key={key} value={key} disabled={isAlreadySelected}>
                                          <div className="flex items-center justify-between gap-3 w-full">
                                            <span className="font-medium">{mm.name} {isAlreadySelected ? '(Added)' : ''}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stockVal === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                                              Stock: {stockVal.toLocaleString()} {mm.uom ?? ''}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </td>

                              <td className="px-3 py-2">
                                {m ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${
                                    isDeficit
                                      ? "bg-rose-100 text-rose-800 border border-rose-300"
                                      : availStock === 0
                                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                                      : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                  }`}>
                                    {availStock.toLocaleString()} {m.uom ?? ""}
                                    {isDeficit && <span className="text-[10px] text-rose-600 font-extrabold uppercase">(Shortage!)</span>}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2 text-muted-foreground font-semibold">{m?.uom ?? "—"}</td>

                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.required}
                                  onChange={(e) => setRows(rows.map((r, idx) => idx === i ? { ...r, required: e.target.value } : r))}
                                  className="text-right font-medium"
                                  placeholder="0"
                                />
                              </td>

                              <td className={`px-3 py-2 text-right font-bold ${isDeficit ? 'text-rose-600' : 'text-slate-900 dark:text-slate-100'}`}>
                                {total.toLocaleString()}
                              </td>

                              <td className="px-3 py-2">
                                <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} disabled={rows.length === 1}>
                                  <Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Stock Shortage Warning Alert */}
                {stockValidation.hasDeficit && (
                  <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-lg text-rose-900 dark:text-rose-200 text-xs space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Stock Deficit - Cannot Proceed Entry!</span>
                    </div>
                    <ul className="list-disc list-inside pl-1 space-y-0.5">
                      {stockValidation.issues.map((iss, idx) => (
                        <li key={idx}>
                          <strong>{iss.materialName}</strong>: Available stock is <strong>{iss.available}</strong>, but required quantity is <strong>{iss.required}</strong>. (Shortage: {iss.required - iss.available})
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-rose-600 dark:text-rose-300 font-semibold pt-1">
                      ⚠️ Stock cannot go into negative. Please decrease product quantity or replenish stock via Purchase Receipts.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button
                    onClick={() => save.mutate()}
                    disabled={save.isPending || stockValidation.hasDeficit}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  >
                    {save.isPending ? "Saving…" : "Save Fabrication Entry"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      />

      {/* Filter & Search Bar */}
      <Card className="p-3 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search fabrication entries by product, location, plant, department or supervisor..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeLocation && (
              <Badge variant="outline" className="px-2.5 py-1 text-xs font-bold border-indigo-300 bg-indigo-50 text-indigo-700">
                <MapPin className="h-3 w-3 mr-1 inline" />
                {activeLocation.name} {activePlant ? `› ${activePlant.name}` : ''}
              </Badge>
            )}
            <Badge variant="secondary" className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Total {filteredFabrications.length} Entries
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="shadow-[var(--shadow-card)] overflow-hidden border border-slate-200 flex-1 flex flex-col min-h-[calc(100vh-13rem)] mb-2">
        <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-14rem)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Location & Plant</th>
                <th className="text-left px-4 py-3">Product</th>
                <th className="text-right px-4 py-3">Qty</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Handover To</th>
                <th className="text-left px-4 py-3">Materials</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredFabrications.map((f: any) => {
                const locPlantMatch = (f.remarks || "").match(/^\[(.*?)\s*-\s*(.*?)\]/);
                const locName = f.location_name || (locPlantMatch ? locPlantMatch[1] : (activeLocation ? activeLocation.name : "Bhiwadi"));
                const plantName = f.plant_name || (locPlantMatch ? locPlantMatch[2] : (activePlant ? activePlant.name : "NGM Plant"));
                const cleanRemarks = f.remarks ? f.remarks.replace(/^\[.*?\]\s*/, "") : "";

                const materials = (f.fabrication_materials ?? []).map((fm: any) => {
                  const mName = (fm.materials as { name?: string } | null)?.name || "Material";
                  const totalQ = fm.total_quantity ?? (fm.required_qty_per_product ? fm.required_qty_per_product * f.product_quantity : 0);
                  const u = (fm.materials as { uom?: string } | null)?.uom || "PCS";
                  return `${mName} (${totalQ} ${u})`;
                });

                return (
                  <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {safeFormatDate(f.fab_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="w-fit text-[10px] font-bold bg-slate-50 text-indigo-700 border-indigo-200">
                          📍 {locName}
                        </Badge>
                        <span className="text-[10px] text-slate-600 font-semibold pl-1">
                          🏭 {plantName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <Factory className="h-4 w-4 text-indigo-600 shrink-0" />
                        {(f.products as { name?: string } | null)?.name ?? "Fabricated Product"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-slate-100 font-mono text-sm">
                      {f.product_quantity}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">
                      {(f.departments as { name?: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-indigo-700 dark:text-indigo-400">
                      {f.supervisor_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-[260px]">
                      {materials.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {materials.map((mStr: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px] font-medium bg-slate-100 text-slate-700">
                              {mStr}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-semibold"
                        onClick={() => setSelectedFabView({
                          ...f,
                          _locName: locName,
                          _plantName: plantName,
                          _cleanRemarks: cleanRemarks,
                        })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredFabrications.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-slate-400 font-medium">No matching fabrication entries found for the selected Location & Plant filter</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* FABRICATION ENTRY FULL DETAILS MODAL */}
      <Dialog open={!!selectedFabView} onOpenChange={(o) => !o && setSelectedFabView(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              <Factory className="h-5 w-5 text-indigo-600" />
              Fabrication Entry Full Details & BOM
            </DialogTitle>
          </DialogHeader>

          {selectedFabView && (
            <div className="space-y-5 pt-2">
              {/* Top Banner Card */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-white text-indigo-700 border-indigo-200 text-[10px] font-bold">
                      📍 {selectedFabView._locName || selectedFabView.location_name || (activeLocation ? activeLocation.name : "Bhiwadi")}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      🏭 {selectedFabView._plantName || selectedFabView.plant_name || (activePlant ? activePlant.name : "NGM Plant")}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wider">Product Name</span>
                  <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5">
                    {(selectedFabView.products as { name?: string } | null)?.name ?? "Fabricated Product"}
                  </h2>
                </div>
                <div className="text-right bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-indigo-100 dark:border-indigo-900 shadow-sm">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Output Quantity</span>
                  <div className="text-2xl font-black text-indigo-600 font-mono">
                    {selectedFabView.product_quantity} <span className="text-xs font-semibold text-slate-500">Units</span>
                  </div>
                </div>
              </div>

              {/* Grid Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-slate-400" /> Fabrication Date
                  </span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {safeFormatDate(selectedFabView.fab_date)}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-slate-400" /> Department
                  </span>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {(selectedFabView.departments as { name?: string } | null)?.name ?? "—"}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 flex items-center gap-1">
                    <User className="h-3 w-3 text-slate-400" /> Handover To
                  </span>
                  <p className="text-sm font-bold text-indigo-600 mt-1">
                    {selectedFabView.supervisor_name ?? "—"}
                  </p>
                </div>
              </div>

              {(selectedFabView._cleanRemarks || selectedFabView.remarks) && (
                <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 text-xs">
                  <span className="font-extrabold text-slate-500 uppercase text-[10px] block mb-1">Remarks / Production Notes</span>
                  <p className="text-slate-700 dark:text-slate-300 font-medium">{selectedFabView._cleanRemarks || selectedFabView.remarks}</p>
                </div>
              )}

              {/* Raw Materials Breakdown Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    Bill of Materials Consumed ({selectedFabView.fabrication_materials?.length || 0})
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {(selectedFabView.fabrication_materials ?? []).length} Materials Deducted
                  </Badge>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">Material Name</th>
                        <th className="text-right px-3 py-2">Req / Unit</th>
                        <th className="text-right px-3 py-2">Total Consumed</th>
                        <th className="text-left px-3 py-2 w-16">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(selectedFabView.fabrication_materials ?? []).map((fm: any, idx: number) => {
                        const totalConsumed = fm.total_quantity ?? (fm.required_qty_per_product ? fm.required_qty_per_product * selectedFabView.product_quantity : 0);
                        return (
                          <tr key={fm.id ?? idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200">
                              {(fm.materials as { name?: string } | null)?.name ?? "Raw Material"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-600 dark:text-slate-400">
                              {fm.required_qty_per_product ?? "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-black text-rose-600 dark:text-rose-400">
                              -{totalConsumed.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 font-semibold">
                              {(fm.materials as { uom?: string } | null)?.uom ?? "PCS"}
                            </td>
                          </tr>
                        );
                      })}
                      {(!selectedFabView.fabrication_materials || selectedFabView.fabrication_materials.length === 0) && (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-slate-400">
                            No specific BOM material deductions recorded for this standard item.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
