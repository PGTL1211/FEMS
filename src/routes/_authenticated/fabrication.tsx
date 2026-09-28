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
import {
  Plus, Trash2, Factory, AlertTriangle, CheckCircle2, Eye, Calendar, Building2,
  User, Layers, FileText, Search, MapPin, Filter, Scale, Camera, Upload, Image as ImageIcon,
  Sliders, ArrowUpRight, ArrowDownRight, Check, X, ShieldAlert, Sparkles, RefreshCw, ZoomIn, Percent
} from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { safeFormatDate } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import { useRole } from "@/hooks/useRole";
import { useLocationPlant } from "@/lib/location-context";

import { DEMO_MATERIALS, DEMO_PRODUCTS, DEMO_DEPARTMENTS, DEMO_FABRICATIONS } from "@/lib/demo-data";
import {
  STANDARD_PRODUCT_BOM_TEMPLATES,
  evaluateWeightTolerance,
  getSavedTolerancePct,
  saveTolerancePct,
  DEFAULT_TOLERANCE_PCT,
  DEMO_WEIGHING_SCALE_IMAGE,
  WeightAuditResult
} from "@/lib/fabrication-weights";
import { uploadFabricationWeighingImage } from "@/lib/fabrication-image.functions";

export const Route = createFileRoute("/_authenticated/fabrication")({
  head: () => ({ meta: [{ title: "Fabrication & Weight Verification — FEMS" }] }),
  component: FabricationPage,
});

type MatRow = {
  material_id: string;
  required: string;
  unit_weight_kg?: number;
};

const STORAGE_KEY_CUSTOM_FABS = "fems_custom_fabrications_v2";

export function FabricationPage() {
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

  // Tolerance Factor (default +/- 10%, configurable by Top Management)
  const [toleranceFactor, setToleranceFactor] = useState<number>(() => getSavedTolerancePct());
  const [toleranceDialogOpen, setToleranceDialogOpen] = useState(false);
  const [tempToleranceInput, setTempToleranceInput] = useState<string>(String(toleranceFactor));

  // Location & Plant Selection in Form
  const [fabLocationId, setFabLocationId] = useState<string>("");
  const [fabPlantId, setFabPlantId] = useState<string>("");

  const userLocations = useMemo(() => {
    return getUserLocations(user?.email, role);
  }, [getUserLocations, user?.email, role, locations]);

  const userPlants = useMemo(() => {
    return getUserPlants(fabLocationId, user?.email, role);
  }, [getUserPlants, fabLocationId, user?.email, role, locations]);

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").eq("active", true).order("name")).data ?? []
  });

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

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? []
  });

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

  const materialsById = useMemo(() => {
    const map: Record<string, any> = {};
    materialsList.forEach((m: any) => {
      const demoRef = DEMO_MATERIALS.find(dm => dm.id === m.id || dm.material_id === m.material_id || dm.name === m.name);
      const enriched = {
        ...m,
        unit_weight_kg: Number(m.unit_weight_kg ?? demoRef?.unit_weight_kg ?? 0.5),
      };
      const key = m.material_id || m.id;
      if (key) map[key] = enriched;
      if (m.material_id) map[m.material_id] = enriched;
      if (m.id) map[m.id] = enriched;
    });
    return map;
  }, [materialsList]);

  const dbFabList = (listQuery.data && listQuery.data.length > 0) ? listQuery.data : DEMO_FABRICATIONS;

  // Enrich raw fabrication records with BOM materials, weights, handover data, and tolerance audit
  const fabricationsList = useMemo(() => {
    const seenIds = new Set<string>();
    const seenSignatures = new Set<string>();
    const merged: any[] = [];

    const processItem = (item: any, isCustom: boolean) => {
      const id = String(item.id || '');
      const prodName = (item.products as any)?.name || 'Product';
      const deptName = (item.departments as any)?.name || '';
      const sig = `${item.fab_date}_${prodName}_${item.product_quantity}_${item.supervisor_name || ''}_${deptName}`;

      if (id && seenIds.has(id)) return;
      if (seenSignatures.has(sig)) return;

      if (id) seenIds.add(id);
      seenSignatures.add(sig);

      // 1. Resolve or compute BOM materials
      let fmList = item.fabrication_materials;
      if (!fmList || fmList.length === 0) {
        const recipe = STANDARD_PRODUCT_BOM_TEMPLATES[prodName] || STANDARD_PRODUCT_BOM_TEMPLATES["Trolley"];
        fmList = recipe.materials.map((m) => {
          const matObj = materialsById[m.material_id];
          return {
            id: `fm-${item.id}-${m.material_id}`,
            required_qty_per_product: m.required,
            total_quantity: m.required * item.product_quantity,
            materials: {
              name: matObj?.name || "Raw Material",
              uom: matObj?.uom || "PCS",
              unit_weight_kg: matObj?.unit_weight_kg || 0.5,
            },
          };
        });
      }

      // Compute Total BOM Expected Weight
      let totalExpectedWeight = Number(item.expected_bom_weight_kg || 0);
      if (totalExpectedWeight <= 0) {
        let perUnitBomWeight = 0;
        fmList.forEach((fm: any) => {
          const mObj = materialsById[fm.material_id] || fm.materials;
          const uWeight = Number(fm.unit_weight_kg ?? mObj?.unit_weight_kg ?? 0.5);
          const reqPerUnit = Number(fm.required_qty_per_product || 0);
          perUnitBomWeight += reqPerUnit * uWeight;
        });
        totalExpectedWeight = Number((perUnitBomWeight * item.product_quantity).toFixed(2));
      }

      // Extract metadata from remarks if present (from Supabase DB storage)
      const remarksStr = String(item.remarks || '');
      const photoMatch = remarksStr.match(/\[Photo:\s*([^\]]+)\]/);
      const weightMatch = remarksStr.match(/\[Weight:\s*BOM\s*([\d.]+)kg\s*\|\s*Actual\s*([\d.]+)kg/);
      const handoverMatch = remarksStr.match(/\[Handover:\s*(.*?)\s*->\s*(.*?)\]/);

      // 2. Resolve Actual Handover Measured Weight
      let actualWeight = Number(item.actual_weight_kg || 0);

      if (weightMatch) {
        if (!item.expected_bom_weight_kg) totalExpectedWeight = Number(weightMatch[1]);
        if (!item.actual_weight_kg) actualWeight = Number(weightMatch[2]);
      }

      if (actualWeight <= 0) {
        // Generate realistic variance for demo data: ~90% within +/- 4%, ~10% have alert variance (+13% or -12%)
        const hash = String(item.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hasAlert = (hash % 8) === 0; // ~12% have tolerance alerts
        const varianceFactor = hasAlert ? (hash % 2 === 0 ? 1.135 : 0.885) : (1 + ((hash % 7) - 3) * 0.015);
        actualWeight = Number((totalExpectedWeight * varianceFactor).toFixed(2));
      }

      // Handover Department & Receiver (extract from Supabase remarks or record)
      const handoverDept = item.handover_department || (handoverMatch ? handoverMatch[1].trim() : ((item.departments as any)?.name || "Surface Finishing & Paint Shop"));
      const handoverPerson = item.handover_person_name || (handoverMatch ? handoverMatch[2].trim() : (item.supervisor_name || "Plant Supervisor"));
      const handoverImg = item.handover_image || (photoMatch ? photoMatch[1].trim() : DEMO_WEIGHING_SCALE_IMAGE);

      // Audit calculation against active tolerance factor
      const audit = evaluateWeightTolerance(totalExpectedWeight, actualWeight, toleranceFactor);

      // Discrepancy reason if alert
      let discrepancyReason = item.discrepancy_reason || "";
      if (audit.isAlert && !discrepancyReason) {
        discrepancyReason = audit.status === "overweight"
          ? "Heavy gauge 2.0mm pipes used with reinforced corner gussets welded per customer load spec."
          : "Lightweight tubular structure specified; non-structural bracing optimized.";
      }

      merged.push({
        ...item,
        fabrication_materials: fmList,
        expected_bom_weight_kg: totalExpectedWeight,
        actual_weight_kg: actualWeight,
        weight_variance_kg: audit.varianceKg,
        weight_variance_pct: audit.variancePct,
        handover_department: handoverDept,
        handover_person_name: handoverPerson,
        handover_image: handoverImg,
        is_discrepancy_alert: audit.isAlert,
        discrepancy_reason: discrepancyReason,
        audit,
      });
    };

    // 1. First add DB records
    (dbFabList || []).forEach((item: any) => processItem(item, false));

    // 2. Add local custom fabrications
    (customFabrications || []).forEach((item: any) => processItem(item, true));

    return merged;
  }, [dbFabList, customFabrications, materialsById, toleranceFactor]);

  // Management Filter Tabs: 'all' | 'alerts' | 'passed'
  const [managementFilterTab, setManagementFilterTab] = useState<"all" | "alerts" | "passed">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [open, setOpen] = useState(false);
  const [selectedFabView, setSelectedFabView] = useState<any | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Form State
  const [fabDate, setFabDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [productId, setProductId] = useState("");
  const [productQty, setProductQty] = useState("1");
  const [departmentId, setDepartmentId] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<MatRow[]>([{ material_id: "", required: "" }]);

  // Handover & Weighing Form State
  const [handoverDept, setHandoverDept] = useState("Surface Finishing & Paint Shop");
  const [handoverPerson, setHandoverPerson] = useState("");
  const [weighingMode, setWeighingMode] = useState<"batch" | "individual">("batch");
  const [actualMeasuredWeightInput, setActualMeasuredWeightInput] = useState<string>("");
  const [individualWeights, setIndividualWeights] = useState<string[]>([]);
  const [handoverImage, setHandoverImage] = useState<string>("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep location and plant state in sync
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

  // Adjust individual weight fields count when productQty changes
  useEffect(() => {
    const qty = Math.max(1, parseInt(productQty || "1", 10) || 1);
    setIndividualWeights((prev) => {
      const next = [...prev];
      if (next.length < qty) {
        while (next.length < qty) next.push("");
      } else if (next.length > qty) {
        next.length = qty;
      }
      return next;
    });
  }, [productQty]);

  // Auto-populate standard BOM when a product is selected
  const handleProductSelect = (selectedId: string) => {
    setProductId(selectedId);
    const prodObj = productsList.find((p: any) => p.id === selectedId);
    if (prodObj?.name && STANDARD_PRODUCT_BOM_TEMPLATES[prodObj.name]) {
      const tpl = STANDARD_PRODUCT_BOM_TEMPLATES[prodObj.name];
      setRows(tpl.materials.map((m) => {
        const mat = materialsById[m.material_id];
        return {
          material_id: m.material_id,
          required: String(m.required),
          unit_weight_kg: mat?.unit_weight_kg || 0.5,
        };
      }));
      toast.info(`Standard BOM loaded for ${prodObj.name} (${tpl.materials.length} raw materials)`);
    }
  };

  const loadStandardBomForProduct = () => {
    const prodObj = productsList.find((p: any) => p.id === productId);
    const name = prodObj?.name || "Trolley";
    const tpl = STANDARD_PRODUCT_BOM_TEMPLATES[name] || STANDARD_PRODUCT_BOM_TEMPLATES["Trolley"];
    setRows(tpl.materials.map((m) => {
      const mat = materialsById[m.material_id];
      return {
        material_id: m.material_id,
        required: String(m.required),
        unit_weight_kg: mat?.unit_weight_kg || 0.5,
      };
    }));
    toast.success(`Standard BOM applied: approx ${(tpl.approxUnitWeightKg).toFixed(2)} kg per unit`);
  };

  const resetForm = () => {
    setFabDate(format(new Date(), "yyyy-MM-dd"));
    setProductId("");
    setProductQty("1");
    setDepartmentId("");
    setSupervisor("");
    setRemarks("");
    setRows([{ material_id: "", required: "" }]);
    setHandoverDept("Surface Finishing & Paint Shop");
    setHandoverPerson("");
    setWeighingMode("batch");
    setActualMeasuredWeightInput("");
    setIndividualWeights([]);
    setHandoverImage("");
    setDiscrepancyReason("");
  };

  // Live BOM Weight Calculations
  const bomCalculations = useMemo(() => {
    const qty = Number(productQty || 0);
    let approxPerUnitWeight = 0;

    const rowDetails = rows.map((r) => {
      const mat = materialsById[r.material_id];
      const req = Number(r.required || 0);
      const unitWeight = Number(r.unit_weight_kg ?? mat?.unit_weight_kg ?? 0);
      const itemWeightPerProduct = req * unitWeight;
      const totalWeightForBatch = itemWeightPerProduct * qty;
      approxPerUnitWeight += itemWeightPerProduct;

      return {
        material: mat,
        req,
        unitWeight,
        itemWeightPerProduct,
        totalWeightForBatch,
      };
    });

    const totalBatchExpectedWeight = Number((approxPerUnitWeight * qty).toFixed(2));

    return {
      approxPerUnitWeight: Number(approxPerUnitWeight.toFixed(2)),
      totalBatchExpectedWeight,
      rowDetails,
    };
  }, [rows, productQty, materialsById]);

  // Actual measured weight calculation (single input or individual pieces sum)
  const currentActualWeight = useMemo(() => {
    if (weighingMode === "batch") {
      return Number(actualMeasuredWeightInput || 0);
    }
    const sum = individualWeights.reduce((acc, val) => acc + (Number(val) || 0), 0);
    return Number(sum.toFixed(2));
  }, [weighingMode, actualMeasuredWeightInput, individualWeights]);

  // Live tolerance verification for the form
  const formWeightAudit = useMemo(() => {
    return evaluateWeightTolerance(bomCalculations.totalBatchExpectedWeight, currentActualWeight, toleranceFactor);
  }, [bomCalculations.totalBatchExpectedWeight, currentActualWeight, toleranceFactor]);

  // Stock deficit check
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

  // Handle image upload from camera / file picker
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file (JPG, PNG, WebP)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setHandoverImage(result);
      toast.success("Weighing scale photo attached successfully!");
    };
    reader.readAsDataURL(file);
  };

  const useSamplePhoto = () => {
    setHandoverImage(DEMO_WEIGHING_SCALE_IMAGE);
    toast.success("Loaded sample digital platform scale photo!");
  };

  // Save new fabrication with BOM weight, handover department, receiver, photo & tolerance audit
  const save = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Select a product");
      const qty = Number(productQty);
      if (!(qty > 0)) throw new Error("Product quantity must be greater than zero");
      const valid = rows.filter((r) => r.material_id && Number(r.required) > 0);
      if (valid.length === 0) throw new Error("Add at least one material to BOM consumption");

      // Weight and Handover validations
      if (!handoverDept.trim()) throw new Error("Select or enter Handover Department");
      if (!handoverPerson.trim()) throw new Error("Enter name of person whom goods are handed over to");
      if (!(currentActualWeight > 0)) throw new Error("Enter actual physical scale weight measured at handover");

      // Mandatory Image Validation
      if (!handoverImage) {
        throw new Error("Weighing Scale Photo is MANDATORY! Please upload or capture photo of the product on scale.");
      }

      // If discrepancy alert triggered, explanation is mandatory!
      if (formWeightAudit.isAlert && !discrepancyReason.trim()) {
        throw new Error(
          `Weight Discrepancy Alert (${formWeightAudit.variancePct > 0 ? '+' : ''}${formWeightAudit.variancePct}% vs ±${toleranceFactor}% limit)! Please provide a reason / justification.`
        );
      }

      // Check duplicates
      const selectedMatIds = valid.map((r) => r.material_id);
      if (new Set(selectedMatIds).size < selectedMatIds.length) {
        throw new Error("Duplicate material detected! Each raw material can only be added once.");
      }

      // Check stock deficit
      for (const r of valid) {
        const m = materialsById[r.material_id];
        const req = Number(r.required || 0);
        const total = req * qty;
        const avail = Number(m?.current_stock ?? 0);
        if (total > avail) {
          throw new Error(`Insufficient Stock for "${m?.name}"! In hand: ${avail}, required: ${total}.`);
        }
      }

      const chosenLoc = locations.find((l) => l.id === fabLocationId);
      const chosenPlant = chosenLoc?.plants.find((p) => p.id === fabPlantId);
      const locPrefix = chosenLoc ? `[${chosenLoc.name} - ${chosenPlant?.name || 'Plant'}] ` : '';

      // 1. Upload weighing scale photo to Supabase Storage bucket 'fabrication_images'
      let uploadedPhotoUrl = handoverImage;
      try {
        const uploadResult = await uploadFabricationWeighingImage({
          data: { base64Data: handoverImage }
        });
        if (uploadResult?.publicUrl) {
          uploadedPhotoUrl = uploadResult.publicUrl;
        }
      } catch (uploadErr) {
        console.warn("Supabase Storage upload error, falling back to data URL:", uploadErr);
      }

      const photoTag = `[Photo: ${uploadedPhotoUrl}]`;
      const weightSummaryNote = `[Weight: BOM ${bomCalculations.totalBatchExpectedWeight}kg | Actual ${currentActualWeight}kg (${formWeightAudit.variancePct > 0 ? '+' : ''}${formWeightAudit.variancePct}%)] [Handover: ${handoverDept} -> ${handoverPerson}]`;
      const fullRemarks = `${locPrefix}${photoTag} ${weightSummaryNote} ${remarks || ""}`.trim();

      let fabId = `fab-${Date.now()}`;
      try {
        const { data: fab, error } = await supabase.from("fabrications").insert({
          fab_date: fabDate,
          product_id: productId,
          product_quantity: qty,
          department_id: departmentId || null,
          supervisor_name: supervisor || null,
          remarks: fullRemarks,
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
        location_name: chosenLoc?.name || "Bhiwadi",
        plant_id: fabPlantId,
        plant_name: chosenPlant?.name || "NGM Plant",
        products: { name: prodObj?.name || "Fabricated Product" },
        departments: { name: deptObj?.name || "Fabrication" },
        fabrication_materials: valid.map((r) => {
          const m = materialsById[r.material_id];
          return {
            id: `fm-${Date.now()}-${r.material_id}`,
            material_id: r.material_id,
            required_qty_per_product: Number(r.required),
            total_quantity: Number(r.required) * qty,
            materials: {
              name: m?.name || "Raw Material",
              uom: m?.uom || "PCS",
              unit_weight_kg: Number(r.unit_weight_kg ?? m?.unit_weight_kg ?? 0.5),
            },
          };
        }),
        // Weight & Handover Details
        expected_bom_weight_kg: bomCalculations.totalBatchExpectedWeight,
        actual_weight_kg: currentActualWeight,
        weight_variance_kg: formWeightAudit.varianceKg,
        weight_variance_pct: formWeightAudit.variancePct,
        tolerance_factor_pct: toleranceFactor,
        is_discrepancy_alert: formWeightAudit.isAlert,
        discrepancy_reason: discrepancyReason || null,
        handover_department: handoverDept,
        handover_person_name: handoverPerson,
        handover_image: uploadedPhotoUrl,
        individual_weights: weighingMode === "individual" ? individualWeights.map((w) => Number(w || 0)) : [],
      };

      saveCustomFabs([newFabRecord, ...customFabrications]);
    },
    onSuccess: () => {
      toast.success("Fabrication entry and weight handover saved successfully!");
      qc.invalidateQueries();
      setOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Top Management Summary Metrics
  const managementMetrics = useMemo(() => {
    let totalOutputWeightKg = 0;
    let totalExpectedWeightKg = 0;
    let discrepancyCount = 0;
    let totalEntries = fabricationsList.length;

    fabricationsList.forEach((f: any) => {
      totalOutputWeightKg += Number(f.actual_weight_kg || 0);
      totalExpectedWeightKg += Number(f.expected_bom_weight_kg || 0);
      if (f.audit?.isAlert || f.is_discrepancy_alert) {
        discrepancyCount++;
      }
    });

    const netVarianceKg = totalOutputWeightKg - totalExpectedWeightKg;
    const netVariancePct = totalExpectedWeightKg > 0 ? (netVarianceKg / totalExpectedWeightKg) * 100 : 0;
    const alertRatePct = totalEntries > 0 ? (discrepancyCount / totalEntries) * 100 : 0;

    return {
      totalOutputWeightKg: Math.round(totalOutputWeightKg),
      totalExpectedWeightKg: Math.round(totalExpectedWeightKg),
      netVarianceKg: Number(netVarianceKg.toFixed(1)),
      netVariancePct: Number(netVariancePct.toFixed(1)),
      discrepancyCount,
      alertRatePct: Number(alertRatePct.toFixed(1)),
      totalEntries,
    };
  }, [fabricationsList]);

  // Apply Search, Location, and Management Tab Filters
  const filteredFabrications = useMemo(() => {
    return fabricationsList.filter((f: any) => {
      // Location and Plant filter
      if (selectedLocationId !== "ALL" && f.location_id && f.location_id !== selectedLocationId) return false;
      if (selectedPlantId !== "ALL" && f.plant_id && f.plant_id !== selectedPlantId) return false;

      // Management Filter Tab
      const isAlert = Boolean(f.audit?.isAlert || f.is_discrepancy_alert);
      if (managementFilterTab === "alerts" && !isAlert) return false;
      if (managementFilterTab === "passed" && isAlert) return false;

      // Search Filter
      const prodName = (f.products as { name?: string } | null)?.name || "";
      const deptName = (f.departments as { name?: string } | null)?.name || "";
      const supervisor = f.supervisor_name || "";
      const handoverDept = f.handover_department || "";
      const handoverPerson = f.handover_person_name || "";
      const fabDate = f.fab_date || "";
      const locStr = (f.location_name || "") + " " + (f.plant_name || "");
      const q = searchTerm.toLowerCase();

      return (
        prodName.toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q) ||
        supervisor.toLowerCase().includes(q) ||
        handoverDept.toLowerCase().includes(q) ||
        handoverPerson.toLowerCase().includes(q) ||
        fabDate.toLowerCase().includes(q) ||
        locStr.toLowerCase().includes(q)
      );
    });
  }, [fabricationsList, selectedLocationId, selectedPlantId, managementFilterTab, searchTerm]);

  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProdName, setNewProdName] = useState("");

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

  return (
    <div className="space-y-4 flex flex-col min-h-[calc(100vh-5rem)] pb-6">
      <PageHeader
        title="Fabrication & Weight Verification"
        description="Automatic BOM product weight calculation, physical scale handover verification, photo proof & tolerance discrepancy tracking."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Top Management Tolerance Config Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempToleranceInput(String(toleranceFactor));
                setToleranceDialogOpen(true);
              }}
              className="gap-1.5 text-xs font-bold border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60"
            >
              <Sliders className="h-3.5 w-3.5 text-indigo-600" />
              Tolerance: <span className="font-mono text-indigo-600">±{toleranceFactor}%</span>
            </Button>

            {canWrite && (
              <>
                <Dialog open={newProdOpen} onOpenChange={setNewProdOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Quick Add Product</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                      <Label>Product Name</Label>
                      <Input
                        placeholder="e.g. Heavy Duty Trolley / ESD Assembly Bench"
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

                {/* NEW FABRICATION MODAL WITH BOM & WEIGHT VERIFICATION */}
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-1.5 font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                      <Plus className="h-4 w-4" /> New Fabrication &amp; Handover
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader className="border-b pb-3">
                      <DialogTitle className="flex items-center gap-2 text-lg">
                        <Scale className="h-5 w-5 text-indigo-600" />
                        Fabrication Entry, BOM Weight &amp; Department Handover
                      </DialogTitle>
                    </DialogHeader>

                    {/* Step 1: Location & Plant */}
                    <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                        <MapPin className="h-4 w-4 text-indigo-600" /> Target Manufacturing Plant
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Location *</Label>
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
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Plant / Unit *</Label>
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
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Basic Fabrication Details */}
                    <div className="grid gap-3 sm:grid-cols-3 mt-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">Fabrication Date *</Label>
                        <Input type="date" value={fabDate} onChange={(e) => setFabDate(e.target.value)} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold">Product *</Label>
                          <button
                            type="button"
                            onClick={() => setNewProdOpen(true)}
                            className="text-[11px] text-indigo-600 hover:underline font-bold"
                          >
                            + Quick Add
                          </button>
                        </div>
                        <Select value={productId} onValueChange={handleProductSelect}>
                          <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
                          <SelectContent>
                            {productsList.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-bold">Output Qty (Units) *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={productQty}
                          onChange={(e) => setProductQty(e.target.value)}
                          className="font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* SECTION 1: BOM MATERIAL CONSUMPTION & AUTOMATIC WEIGHT CALCULATION */}
                    <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <Label className="text-sm font-bold flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                            <Layers className="h-4 w-4 text-indigo-600" />
                            Step 1: Bill of Materials (BOM) &amp; Calculated Product Weight
                          </Label>
                          <p className="text-xs text-slate-500">
                            Each raw material includes its unit weight (kg). Approx total weight is calculated automatically.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={loadStandardBomForProduct}
                            className="h-8 text-xs font-bold gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                          >
                            <Sparkles className="h-3 w-3" /> Load Standard Recipe
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRows([...rows, { material_id: "", required: "" }])}
                            disabled={rows.length >= materialsList.length}
                            className="h-8 text-xs font-bold gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Material
                          </Button>
                        </div>
                      </div>

                      {hasDuplicateMaterials && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded font-bold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" /> Duplicate materials detected!
                        </div>
                      )}

                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold">
                            <tr>
                              <th className="text-left px-3 py-2.5">Material</th>
                              <th className="text-left px-2 py-2.5 w-24">Avail Stock</th>
                              <th className="text-right px-2 py-2.5 w-24">Unit Wt (kg)</th>
                              <th className="text-right px-2 py-2.5 w-24">Req / Unit</th>
                              <th className="text-right px-2 py-2.5 w-24">Total Req</th>
                              <th className="text-right px-3 py-2.5 w-28">Total Wt (kg)</th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map((row, i) => {
                              const m = materialsById[row.material_id];
                              const req = Number(row.required || 0);
                              const qty = Number(productQty || 1);
                              const totalQty = req * qty;
                              const unitWeight = Number(row.unit_weight_kg ?? m?.unit_weight_kg ?? 0);
                              const totalRowWeight = totalQty * unitWeight;
                              const availStock = Number(m?.current_stock ?? 0);
                              const isDeficit = row.material_id && totalQty > availStock;

                              return (
                                <tr key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isDeficit ? 'bg-rose-50/70 dark:bg-rose-950/20' : ''}`}>
                                  <td className="px-3 py-2">
                                    <Select
                                      value={row.material_id}
                                      onValueChange={(v) => {
                                        const picked = materialsById[v];
                                        setRows(rows.map((r, idx) => idx === i ? {
                                          ...r,
                                          material_id: v,
                                          unit_weight_kg: picked?.unit_weight_kg || 0.5
                                        } : r));
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs font-semibold">
                                        <SelectValue placeholder="Select raw material" />
                                      </SelectTrigger>
                                      <SelectContent className="max-h-60">
                                        {materialsList.map((mm: any) => {
                                          const key = mm.material_id || mm.id;
                                          const isAlreadySelected = rows.some((r, idx) => idx !== i && r.material_id === key);
                                          const stockVal = Number(mm.current_stock ?? 0);
                                          const wt = mm.unit_weight_kg ?? 0.5;
                                          return (
                                            <SelectItem key={key} value={key} disabled={isAlreadySelected}>
                                              <div className="flex items-center justify-between gap-3 w-full text-xs">
                                                <span className="font-semibold">{mm.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                  ⚖️ {wt} kg/{mm.uom} | Stock: {stockVal}
                                                </span>
                                              </div>
                                            </SelectItem>
                                          );
                                        })}
                                      </SelectContent>
                                    </Select>
                                  </td>

                                  <td className="px-2 py-2">
                                    {m ? (
                                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isDeficit ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
                                        {availStock} {m.uom}
                                      </span>
                                    ) : <span className="text-slate-400">—</span>}
                                  </td>

                                  <td className="px-2 py-2 text-right">
                                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                                      {unitWeight.toFixed(2)}
                                    </span>
                                  </td>

                                  <td className="px-2 py-2">
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={row.required}
                                      onChange={(e) => setRows(rows.map((r, idx) => idx === i ? { ...r, required: e.target.value } : r))}
                                      className="h-8 text-right font-medium font-mono text-xs"
                                      placeholder="0"
                                    />
                                  </td>

                                  <td className="px-2 py-2 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                    {totalQty.toLocaleString()}
                                  </td>

                                  <td className="px-3 py-2 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                                    {totalRowWeight.toFixed(2)} kg
                                  </td>

                                  <td className="px-2 py-2 text-center">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                                      disabled={rows.length === 1}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-rose-600" />
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* LIVE BOM WEIGHT SUMMARY BANNER */}
                      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Scale className="h-5 w-5 text-indigo-600" />
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
                              Calculated Product BOM Weight
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              Sum of all raw materials required per unit
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Per Unit Approx</span>
                            <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100">
                              {bomCalculations.approxPerUnitWeight.toFixed(2)} <span className="text-xs font-semibold">kg/unit</span>
                            </span>
                          </div>

                          <div className="text-right border-l pl-4 border-indigo-200 dark:border-indigo-700">
                            <span className="text-[10px] text-indigo-600 font-bold block uppercase">Total Expected Batch ({productQty} pcs)</span>
                            <span className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                              {bomCalculations.totalBatchExpectedWeight.toFixed(2)} <span className="text-xs font-semibold">kg</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: DEPARTMENT HANDOVER & ACTUAL PHYSICAL SCALE WEIGHING */}
                    <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                      <div>
                        <Label className="text-sm font-bold flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                          <Building2 className="h-4 w-4 text-emerald-600" />
                          Step 2: Department Handover, Actual Scale Weighing &amp; Photo Proof
                        </Label>
                        <p className="text-xs text-slate-500">
                          Record physical measured scale weight. Verification scale photo is mandatory.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Handover Department *</Label>
                          <Select value={handoverDept} onValueChange={setHandoverDept}>
                            <SelectTrigger className="bg-white dark:bg-slate-900 font-semibold">
                              <SelectValue placeholder="Select Department" />
                            </SelectTrigger>
                            <SelectContent>
                              {departmentsList.map((d: any) => (
                                <SelectItem key={d.id} value={d.name} className="font-medium">
                                  🏢 {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold">Whom to Handover (Receiver Name) *</Label>
                          <Input
                            placeholder="e.g. Ramesh Verma (Paint Shop Lead)"
                            value={handoverPerson}
                            onChange={(e) => setHandoverPerson(e.target.value)}
                            className="bg-white dark:bg-slate-900 font-semibold"
                          />
                        </div>
                      </div>

                      {/* Physical Weighing Entry Mode */}
                      <div className="p-3 bg-white dark:bg-slate-900 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Scale className="h-4 w-4 text-indigo-600" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              Physical Weighing Scale Measurement (kg) *
                            </span>
                          </div>

                          {Number(productQty) > 1 && (
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-md text-xs font-semibold">
                              <button
                                type="button"
                                onClick={() => setWeighingMode("batch")}
                                className={`px-2.5 py-1 rounded transition-all ${weighingMode === "batch" ? "bg-white dark:bg-slate-900 shadow-xs font-bold text-indigo-600" : "text-slate-600"}`}
                              >
                                Total Batch Weight
                              </button>
                              <button
                                type="button"
                                onClick={() => setWeighingMode("individual")}
                                className={`px-2.5 py-1 rounded transition-all ${weighingMode === "individual" ? "bg-white dark:bg-slate-900 shadow-xs font-bold text-indigo-600" : "text-slate-600"}`}
                              >
                                Individual Piece Weights ({productQty})
                              </button>
                            </div>
                          )}
                        </div>

                        {weighingMode === "batch" ? (
                          <div className="space-y-1">
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="e.g. 128.50"
                                value={actualMeasuredWeightInput}
                                onChange={(e) => setActualMeasuredWeightInput(e.target.value)}
                                className="font-mono text-base font-black pr-14 text-indigo-600"
                              />
                              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">KG</span>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Total weight of all {productQty} units as measured on the platform scale.
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="text-[11px] text-slate-500 block">
                              Enter scale reading for each individual unit separately. Total sum will be calculated automatically:
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1">
                              {individualWeights.map((val, idx) => (
                                <div key={idx} className="space-y-1">
                                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Unit #{idx + 1}</Label>
                                  <div className="relative">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      value={val}
                                      onChange={(e) => {
                                        const next = [...individualWeights];
                                        next[idx] = e.target.value;
                                        setIndividualWeights(next);
                                      }}
                                      className="font-mono font-bold text-xs h-8 pr-7"
                                      placeholder="0.00"
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-slate-400">kg</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded text-xs font-bold">
                              <span>Total Actual Measured Weight:</span>
                              <span className="font-mono font-black text-indigo-600 text-sm">{currentActualWeight.toFixed(2)} kg</span>
                            </div>
                          </div>
                        )}

                        {/* LIVE TOLERANCE VERIFICATION & ALERT BANNER */}
                        {currentActualWeight > 0 && bomCalculations.totalBatchExpectedWeight > 0 && (
                          <div className={`p-3 rounded-lg border text-xs space-y-2 transition-all ${
                            formWeightAudit.isAlert
                              ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200"
                              : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                          }`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 font-bold text-sm">
                                {formWeightAudit.isAlert ? (
                                  <>
                                    <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 animate-pulse" />
                                    <span>🚨 WEIGHT DISCREPANCY ALERT! Exceeds ±{toleranceFactor}% tolerance</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                    <span>✅ Physical Weight Verified Within ±{toleranceFactor}% Tolerance</span>
                                  </>
                                )}
                              </div>
                              <Badge className={`font-mono text-xs ${formWeightAudit.isAlert ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                                Variance: {formWeightAudit.varianceKg > 0 ? `+${formWeightAudit.varianceKg}` : formWeightAudit.varianceKg} kg ({formWeightAudit.variancePct > 0 ? `+${formWeightAudit.variancePct}` : formWeightAudit.variancePct}%)
                              </Badge>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-current/10">
                              <div>
                                <span className="opacity-75 block">BOM Expected:</span>
                                <strong className="font-mono">{bomCalculations.totalBatchExpectedWeight.toFixed(2)} kg</strong>
                              </div>
                              <div>
                                <span className="opacity-75 block">Actual Scale:</span>
                                <strong className="font-mono">{currentActualWeight.toFixed(2)} kg</strong>
                              </div>
                              <div>
                                <span className="opacity-75 block">Allowed Limit (±{toleranceFactor}%):</span>
                                <strong className="font-mono">{formWeightAudit.minAllowedKg} — {formWeightAudit.maxAllowedKg} kg</strong>
                              </div>
                            </div>

                            {formWeightAudit.isAlert && (
                              <div className="space-y-1.5 pt-2">
                                <Label className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                                  <span>⚠️ Discrepancy Reason / Justification Required *</span>
                                </Label>
                                <Input
                                  placeholder="e.g. Heavier gauge 2.0mm pipes used; reinforced gusset plates welded"
                                  value={discrepancyReason}
                                  onChange={(e) => setDiscrepancyReason(e.target.value)}
                                  className="bg-white dark:bg-slate-900 border-rose-400 font-medium text-xs"
                                />
                                <p className="text-[10px] text-rose-600">
                                  This variance alert will be highlighted to Top Management for quality &amp; material consumption audit.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* MANDATORY WEIGHING SCALE PHOTO UPLOAD */}
                      <div className="p-3 bg-white dark:bg-slate-900 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                            <Camera className="h-4 w-4 text-indigo-600" />
                            Weighing Scale / Product Verification Photo (Mandatory) *
                          </Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={useSamplePhoto}
                            className="h-6 text-[11px] text-indigo-600 font-bold hover:underline"
                          >
                            + Use Sample Scale Photo
                          </Button>
                        </div>

                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleImageFileChange}
                          className="hidden"
                        />

                        {handoverImage ? (
                          <div className="relative group border rounded-lg p-2 bg-slate-50 dark:bg-slate-800/40 flex items-center gap-3">
                            <img
                              src={handoverImage}
                              alt="Scale photo"
                              className="h-16 w-20 object-cover rounded border shadow-xs cursor-pointer hover:opacity-90"
                              onClick={() => setZoomImage(handoverImage)}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Photo Attached Successfully
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate">
                                Click photo to inspect full digital scale readout
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setZoomImage(handoverImage)}
                                className="h-8 text-xs font-semibold"
                              >
                                <ZoomIn className="h-3.5 w-3.5 mr-1" /> View
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setHandoverImage("")}
                                className="h-8 text-xs text-rose-600 hover:text-rose-700"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 rounded-lg p-4 text-center cursor-pointer bg-indigo-50/30 hover:bg-indigo-50/60 dark:bg-indigo-950/20 transition-all"
                          >
                            <Camera className="h-7 w-7 text-indigo-500 mx-auto mb-1.5" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              Click to capture or upload weighing scale photo
                            </span>
                            <span className="text-[11px] text-slate-500">
                              Supports Camera Capture, PNG, JPG, or WebP. Photo proof is strictly verified by Top Management.
                            </span>
                          </div>
                        )}
                      </div>

                      {/* General Remarks */}
                      <div className="space-y-1">
                        <Label className="text-xs font-bold">Additional Notes / Remarks</Label>
                        <Textarea
                          rows={2}
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          placeholder="Batch notes, welding specs, or inspection observations..."
                        />
                      </div>
                    </div>

                    {/* Stock Deficit Warning */}
                    {stockValidation.hasDeficit && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs space-y-1">
                        <div className="flex items-center gap-2 font-bold text-rose-700">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Stock Shortage Detected - Cannot Proceed!</span>
                        </div>
                        <ul className="list-disc list-inside pl-1 space-y-0.5">
                          {stockValidation.issues.map((iss, idx) => (
                            <li key={idx}>
                              <strong>{iss.materialName}</strong>: In stock: {iss.available}, Required: {iss.required} (Shortage: {iss.required - iss.available})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
                      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                      <Button
                        onClick={() => save.mutate()}
                        disabled={save.isPending || stockValidation.hasDeficit}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                      >
                        {save.isPending ? "Saving Entry…" : "Confirm Fabrication & Handover"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        }
      />

      {/* TOP MANAGEMENT AUDIT & TRACKING KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 border border-slate-200 shadow-xs bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-extrabold uppercase">Total Output Weight</span>
            <Scale className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            {managementMetrics.totalOutputWeightKg.toLocaleString()} <span className="text-xs font-semibold text-slate-500">kg</span>
          </div>
          <span className="text-[10px] text-slate-500">
            BOM Planned: {managementMetrics.totalExpectedWeightKg.toLocaleString()} kg
          </span>
        </Card>

        <Card className="p-3 border border-slate-200 shadow-xs bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-extrabold uppercase">Net BOM Variance</span>
            <Percent className="h-4 w-4 text-blue-600" />
          </div>
          <div className={`text-xl font-black font-mono flex items-center gap-1 ${managementMetrics.netVariancePct > 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>
            {managementMetrics.netVariancePct > 0 ? `+${managementMetrics.netVariancePct}%` : `${managementMetrics.netVariancePct}%`}
            {managementMetrics.netVariancePct > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          </div>
          <span className="text-[10px] text-slate-500">
            {managementMetrics.netVarianceKg > 0 ? `+${managementMetrics.netVarianceKg}` : managementMetrics.netVarianceKg} kg net deviation
          </span>
        </Card>

        <Card className={`p-3 border shadow-xs transition-all ${
          managementMetrics.discrepancyCount > 0
            ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900"
            : "bg-white dark:bg-slate-900 border-slate-200"
        }`}>
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-extrabold uppercase text-rose-700 dark:text-rose-400">
              Discrepancy Alerts
            </span>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
            {managementMetrics.discrepancyCount} <span className="text-xs font-semibold text-slate-500">Entries ({managementMetrics.alertRatePct}%)</span>
          </div>
          <span className="text-[10px] text-slate-500">
            Outside ±{toleranceFactor}% weight limit
          </span>
        </Card>

        <Card className="p-3 border border-slate-200 shadow-xs bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-extrabold uppercase">Tolerance Config</span>
            <Sliders className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>±{toleranceFactor}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempToleranceInput(String(toleranceFactor));
                setToleranceDialogOpen(true);
              }}
              className="h-6 text-[10px] font-bold px-2"
            >
              Change
            </Button>
          </div>
          <span className="text-[10px] text-slate-500">
            Management tracking threshold
          </span>
        </Card>
      </div>

      {/* FILTER & AUDIT TABS BAR */}
      <Card className="p-3 shadow-xs border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Management Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setManagementFilterTab("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                managementFilterTab === "all"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Fabrications ({fabricationsList.length})
            </button>
            <button
              onClick={() => setManagementFilterTab("alerts")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                managementFilterTab === "alerts"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-rose-600 hover:bg-rose-50"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Weight Alerts ({managementMetrics.discrepancyCount})
            </button>
            <button
              onClick={() => setManagementFilterTab("passed")}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
                managementFilterTab === "passed"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Within Tolerance ({fabricationsList.length - managementMetrics.discrepancyCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by product, location, department, handover person..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {activeLocation && (
            <Badge variant="outline" className="px-2.5 py-1 text-xs font-bold border-indigo-300 bg-indigo-50 text-indigo-700">
              <MapPin className="h-3 w-3 mr-1 inline" />
              {activeLocation.name} {activePlant ? `› ${activePlant.name}` : ''}
            </Badge>
          )}
        </div>
      </Card>

      {/* FABRICATIONS AUDIT TABLE */}
      <Card className="shadow-xs overflow-hidden border border-slate-200 flex-1 flex flex-col min-h-[calc(100vh-16rem)] mb-2">
        <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-17rem)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-xs backdrop-blur">
              <tr>
                <th className="text-left px-3.5 py-3">Date</th>
                <th className="text-left px-3.5 py-3">Location &amp; Plant</th>
                <th className="text-left px-3.5 py-3">Product</th>
                <th className="text-right px-3 py-3">Qty</th>
                <th className="text-right px-3 py-3">BOM Weight</th>
                <th className="text-right px-3 py-3">Actual Weight</th>
                <th className="text-center px-3 py-3">Tolerance Status</th>
                <th className="text-left px-3.5 py-3">Handover Dept &amp; To</th>
                <th className="text-center px-2 py-3 w-16">Photo</th>
                <th className="text-right px-3.5 py-3 w-20">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredFabrications.map((f: any) => {
                const locPlantMatch = (f.remarks || "").match(/^\[(.*?)\s*-\s*(.*?)\]/);
                const locName = f.location_name || (locPlantMatch ? locPlantMatch[1] : (activeLocation ? activeLocation.name : "Bhiwadi"));
                const plantName = f.plant_name || (locPlantMatch ? locPlantMatch[2] : (activePlant ? activePlant.name : "NGM Plant"));
                const cleanRemarks = f.remarks ? f.remarks.replace(/^\[.*?\]\s*/, "") : "";

                const isAlert = Boolean(f.audit?.isAlert || f.is_discrepancy_alert);
                const variancePct = Number(f.weight_variance_pct || f.audit?.variancePct || 0);
                const expectedKg = Number(f.expected_bom_weight_kg || 0);
                const actualKg = Number(f.actual_weight_kg || 0);

                return (
                  <tr
                    key={f.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                      isAlert ? "bg-rose-50/40 dark:bg-rose-950/10" : ""
                    }`}
                  >
                    <td className="px-3.5 py-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {safeFormatDate(f.fab_date)}
                    </td>

                    <td className="px-3.5 py-3">
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="w-fit text-[10px] font-bold bg-slate-50 text-indigo-700 border-indigo-200">
                          📍 {locName}
                        </Badge>
                        <span className="text-[10px] text-slate-600 font-semibold pl-0.5">
                          🏭 {plantName}
                        </span>
                      </div>
                    </td>

                    <td className="px-3.5 py-3 font-bold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Factory className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span>{(f.products as { name?: string } | null)?.name ?? "Fabricated Product"}</span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right font-black font-mono text-slate-800 dark:text-slate-200">
                      {f.product_quantity}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-slate-300 font-semibold">
                      {expectedKg.toFixed(1)} <span className="text-[10px] text-slate-400">kg</span>
                    </td>

                    <td className="px-3 py-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                      {actualKg.toFixed(1)} <span className="text-[10px] font-semibold text-slate-400">kg</span>
                    </td>

                    <td className="px-3 py-3 text-center">
                      {isAlert ? (
                        <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-2 py-0.5 gap-1 shadow-xs">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          {variancePct > 0 ? `+${variancePct}%` : `${variancePct}%`} ALERT
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 text-[10px] font-bold px-2 py-0.5 gap-1">
                          <Check className="h-3 w-3" />
                          {variancePct > 0 ? `+${variancePct}%` : `${variancePct}%`} OK
                        </Badge>
                      )}
                    </td>

                    <td className="px-3.5 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {f.handover_department || "Assembly"}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-medium">
                          👤 {f.handover_person_name || f.supervisor_name || "Supervisor"}
                        </span>
                      </div>
                    </td>

                    <td className="px-2 py-3 text-center">
                      {f.handover_image ? (
                        <button
                          type="button"
                          onClick={() => setZoomImage(f.handover_image)}
                          className="relative group inline-block rounded overflow-hidden border border-slate-300 hover:border-indigo-500 shadow-2xs"
                        >
                          <img
                            src={f.handover_image}
                            alt="Scale"
                            className="h-8 w-10 object-cover group-hover:scale-105 transition-transform"
                          />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[10px]">—</span>
                      )}
                    </td>

                    <td className="px-3.5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 gap-1 px-2.5"
                        onClick={() => setSelectedFabView({
                          ...f,
                          _locName: locName,
                          _plantName: plantName,
                          _cleanRemarks: cleanRemarks,
                        })}
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {filteredFabrications.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 font-medium">
                    No matching fabrication entries found for the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* TOP MANAGEMENT TOLERANCE CONFIG MODAL */}
      <Dialog open={toleranceDialogOpen} onOpenChange={setToleranceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-indigo-600" />
              Weight Tolerance Limit Setting
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              Configure the allowable percentage tolerance between <strong>BOM Expected Weight</strong> and <strong>Physical Handover Scale Weight</strong>.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Tolerance Factor (±%)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  value={tempToleranceInput}
                  onChange={(e) => setTempToleranceInput(e.target.value)}
                  className="font-mono text-base font-bold pr-10 text-indigo-600"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {[5, 8, 10, 12, 15].map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTempToleranceInput(String(preset))}
                  className={`text-xs font-bold h-7 flex-1 ${Number(tempToleranceInput) === preset ? "border-indigo-600 bg-indigo-50 text-indigo-700" : ""}`}
                >
                  ±{preset}%
                </Button>
              ))}
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded border text-[11px] space-y-1">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">How Tolerance Works:</span>
              <p>For a product with BOM weight <strong>25.0 kg</strong> at <strong>±{tempToleranceInput || 10}%</strong>:</p>
              <p className="font-mono text-indigo-600">
                Allowed Scale Weight: {(25 * (1 - (Number(tempToleranceInput) || 10) / 100)).toFixed(2)} kg — {(25 * (1 + (Number(tempToleranceInput) || 10) / 100)).toFixed(2)} kg
              </p>
              <p className="text-slate-500">Any measured weight outside this range will immediately trigger Top Management Alert.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setToleranceDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={() => {
                const val = Number(tempToleranceInput);
                if (val > 0 && val <= 50) {
                  setToleranceFactor(val);
                  saveTolerancePct(val);
                  setToleranceDialogOpen(false);
                  toast.success(`Factory weight tolerance factor updated to ±${val}%!`);
                } else {
                  toast.error("Please enter a valid percentage between 1% and 50%");
                }
              }}
            >
              Apply &amp; Recalculate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FULL FABRICATION ENTRY & WEIGHT VERIFICATION AUDIT MODAL */}
      <Dialog open={!!selectedFabView} onOpenChange={(o) => !o && setSelectedFabView(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
              <Scale className="h-5 w-5 text-indigo-600" />
              Fabrication Entry &amp; Weight Verification Audit
            </DialogTitle>
          </DialogHeader>

          {selectedFabView && (
            <div className="space-y-4 pt-2">
              {/* Product Header Card */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-white text-indigo-700 border-indigo-200 text-[10px] font-bold">
                      📍 {selectedFabView._locName || selectedFabView.location_name || "Bhiwadi"}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      🏭 {selectedFabView._plantName || selectedFabView.plant_name || "NGM Plant"}
                    </Badge>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
                    {(selectedFabView.products as { name?: string } | null)?.name ?? "Fabricated Product"}
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    Fabricated on {safeFormatDate(selectedFabView.fab_date)} • Supervisor: {selectedFabView.supervisor_name || "—"}
                  </span>
                </div>

                <div className="text-right bg-white dark:bg-slate-900 px-4 py-2 rounded-lg border border-indigo-100 shadow-xs">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Batch Output Qty</span>
                  <div className="text-2xl font-black text-indigo-600 font-mono">
                    {selectedFabView.product_quantity} <span className="text-xs font-semibold text-slate-500">Units</span>
                  </div>
                </div>
              </div>

              {/* WEIGHT AUDIT COMPARISON CARD */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                selectedFabView.audit?.isAlert || selectedFabView.is_discrepancy_alert
                  ? "bg-rose-50/60 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900"
                  : "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900"
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-black text-base">
                    {(selectedFabView.audit?.isAlert || selectedFabView.is_discrepancy_alert) ? (
                      <>
                        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                        <span className="text-rose-900 dark:text-rose-200">
                          🚨 Weight Discrepancy Alert: {(selectedFabView.audit?.variancePct || selectedFabView.weight_variance_pct) > 0 ? '+' : ''}{selectedFabView.audit?.variancePct || selectedFabView.weight_variance_pct}%
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span className="text-emerald-900 dark:text-emerald-200">
                          ✅ Physical Weight Verified Within ±{toleranceFactor}% Limit
                        </span>
                      </>
                    )}
                  </div>
                  <Badge className={`font-mono text-xs font-bold ${
                    (selectedFabView.audit?.isAlert || selectedFabView.is_discrepancy_alert) ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
                  }`}>
                    Variance: {(selectedFabView.audit?.varianceKg || selectedFabView.weight_variance_kg) > 0 ? `+${selectedFabView.audit?.varianceKg || selectedFabView.weight_variance_kg}` : (selectedFabView.audit?.varianceKg || selectedFabView.weight_variance_kg)} kg
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-current/15 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">BOM Planned Weight</span>
                    <span className="font-mono text-base font-black text-slate-800 dark:text-slate-200">
                      {Number(selectedFabView.expected_bom_weight_kg || 0).toFixed(2)} kg
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({(Number(selectedFabView.expected_bom_weight_kg || 0) / selectedFabView.product_quantity).toFixed(2)} kg/u)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Actual Scale Weight</span>
                    <span className="font-mono text-base font-black text-indigo-600">
                      {Number(selectedFabView.actual_weight_kg || 0).toFixed(2)} kg
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({(Number(selectedFabView.actual_weight_kg || 0) / selectedFabView.product_quantity).toFixed(2)} kg/u)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Allowed Range (±{toleranceFactor}%)</span>
                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 block mt-1">
                      {selectedFabView.audit?.minAllowedKg || (Number(selectedFabView.expected_bom_weight_kg || 0) * (1 - toleranceFactor / 100)).toFixed(1)} — {selectedFabView.audit?.maxAllowedKg || (Number(selectedFabView.expected_bom_weight_kg || 0) * (1 + toleranceFactor / 100)).toFixed(1)} kg
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Audit Verdict</span>
                    <span className={`font-bold text-xs inline-block mt-1 ${
                      (selectedFabView.audit?.isAlert || selectedFabView.is_discrepancy_alert) ? "text-rose-600" : "text-emerald-600"
                    }`}>
                      {(selectedFabView.audit?.isAlert || selectedFabView.is_discrepancy_alert) ? "⚠️ Out of Tolerance" : "✅ Passed Tolerance"}
                    </span>
                  </div>
                </div>

                {selectedFabView.discrepancy_reason && (
                  <div className="bg-rose-100/60 dark:bg-rose-950/60 p-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs">
                    <span className="font-bold text-rose-800 dark:text-rose-300 uppercase text-[10px] block mb-0.5">
                      Supervisor Discrepancy Justification:
                    </span>
                    <p className="text-rose-900 dark:text-rose-200 font-medium">
                      {selectedFabView.discrepancy_reason}
                    </p>
                  </div>
                )}
              </div>

              {/* HANDOVER DETAILS & WEIGHING SCALE PHOTO */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border text-xs space-y-2">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-indigo-600" /> Handover Chain of Custody
                  </span>
                  <div>
                    <span className="text-slate-500 block">Handed Over To Department:</span>
                    <strong className="text-slate-800 dark:text-slate-200 text-sm">
                      {selectedFabView.handover_department || "Surface Finishing & Paint Shop"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Receiver Person:</span>
                    <strong className="text-indigo-600 text-sm">
                      👤 {selectedFabView.handover_person_name || selectedFabView.supervisor_name || "Factory Receiver"}
                    </strong>
                  </div>
                  {(selectedFabView._cleanRemarks || selectedFabView.remarks) && (
                    <div className="pt-1 border-t">
                      <span className="text-slate-500 block">Production Remarks:</span>
                      <p className="text-slate-700 font-medium">{selectedFabView._cleanRemarks || selectedFabView.remarks}</p>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border text-xs space-y-2">
                  <span className="text-[10px] uppercase font-extrabold text-slate-500 flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5 text-indigo-600" /> Weighing Scale Photo Proof
                  </span>
                  {selectedFabView.handover_image ? (
                    <div className="relative group cursor-pointer" onClick={() => setZoomImage(selectedFabView.handover_image)}>
                      <img
                        src={selectedFabView.handover_image}
                        alt="Weighing scale photo"
                        className="w-full h-32 object-cover rounded-md border shadow-xs"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md text-white font-bold text-xs gap-1">
                        <ZoomIn className="h-4 w-4" /> Click to Zoom Photo
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 bg-slate-200 rounded flex items-center justify-center text-slate-400">
                      No Photo Attached
                    </div>
                  )}
                </div>
              </div>

              {/* RAW MATERIALS BREAKDOWN WITH WEIGHTS */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    BOM Raw Materials Breakdown &amp; Weights ({(selectedFabView.fabrication_materials ?? []).length})
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    Planned BOM: {Number(selectedFabView.expected_bom_weight_kg || 0).toFixed(2)} kg
                  </Badge>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-right px-2 py-2 w-24">Unit Wt (kg)</th>
                        <th className="text-right px-2 py-2 w-24">Req / Unit</th>
                        <th className="text-right px-2 py-2 w-24">Total Consumed</th>
                        <th className="text-right px-3 py-2 w-28">Total Wt (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(selectedFabView.fabrication_materials ?? []).map((fm: any, idx: number) => {
                        const mObj = materialsById[fm.material_id] || fm.materials;
                        const uom = (fm.materials as any)?.uom || mObj?.uom || "PCS";
                        const mName = (fm.materials as any)?.name || mObj?.name || "Raw Material";
                        const unitWt = Number(fm.unit_weight_kg ?? mObj?.unit_weight_kg ?? 0.5);
                        const reqPerUnit = Number(fm.required_qty_per_product || 0);
                        const totalConsumed = fm.total_quantity ?? (reqPerUnit * selectedFabView.product_quantity);
                        const totalRowWeight = totalConsumed * unitWt;

                        return (
                          <tr key={fm.id ?? idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">
                              {mName}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-600">
                              {unitWt.toFixed(2)} kg/{uom}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-600">
                              {reqPerUnit}
                            </td>
                            <td className="px-2 py-2 text-right font-mono font-bold text-rose-600">
                              -{totalConsumed} {uom}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-black text-indigo-600">
                              {totalRowWeight.toFixed(2)} kg
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* FULL SCREEN PHOTO ZOOM MODAL */}
      <Dialog open={!!zoomImage} onOpenChange={(o) => !o && setZoomImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-slate-950 border-slate-800">
          <div className="relative">
            <button
              onClick={() => setZoomImage(null)}
              className="absolute right-2 top-2 bg-black/60 hover:bg-black text-white p-1.5 rounded-full z-10"
            >
              <X className="h-5 w-5" />
            </button>
            {zoomImage && (
              <img
                src={zoomImage}
                alt="Weighing scale verification proof"
                className="w-full max-h-[85vh] object-contain rounded"
              />
            )}
            <div className="p-3 text-center text-xs font-semibold text-slate-300">
              🔍 Digital Weighing Scale &amp; Product Handover Physical Verification Photo Proof
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
