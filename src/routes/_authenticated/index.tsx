import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Factory, ShoppingCart, Boxes, AlertTriangle, QrCode, TrendingDown, ClipboardList, Activity, Package, Building2, Truck, Layers, Eye,
  CheckCircle2, ArrowRight, ExternalLink, PackageCheck, AlertCircle, Clock, Check, Scale
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import { safeFormatDate } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";

import { DEMO_MATERIALS, DEMO_FABRICATIONS, DEMO_PURCHASES } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — FEMS" }] }),
  component: Dashboard,
});

const RAW_COLORS = ["#3b6ef0", "#20a4b8", "#3ea36f", "#d19a2e", "#d9524a"];
const DEPT_COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];

export function StatusBadge({ status }: { status: "healthy" | "low" | "critical" }) {
  const map = {
    healthy: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    low: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    critical: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
  };
  const label = { healthy: "HEALTHY", low: "LOW", critical: "CRITICAL" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${map[status] || map.healthy}`}>
      {label[status] || status}
    </span>
  );
}

// Smart KPI Card Stat Number Renderer to Prevent Text Overflow
function StatNumber({ value }: { value: number }) {
  const rounded = Math.round(Number(value) || 0);
  const formatted = rounded.toLocaleString();
  let sizeClass = "text-2xl lg:text-3xl font-black";
  if (formatted.length > 8) {
    sizeClass = "text-base lg:text-lg font-black tracking-tight";
  } else if (formatted.length > 6) {
    sizeClass = "text-lg lg:text-xl font-black tracking-tight";
  }
  return (
    <span className={`${sizeClass} my-1 truncate max-w-full inline-block px-0.5`} title={formatted}>
      {formatted}
    </span>
  );
}

// Dynamic Standard Weight Formatter:
// - Small quantities (< 1000 kg): displays in kg (e.g. 850 kg)
// - Medium & large quantities (>= 1000 kg): displays in Ton (e.g. 24.5 Ton, 150 Ton)
// - Very large quantities (>= 1,000,000 kg): displays in k Ton (e.g. 1.25 k Ton)
export function formatDynamicWeight(weightKg: number): {
  value: string;
  unit: string;
  fullStr: string;
  exactKgStr: string;
} {
  const w = Number(weightKg) || 0;
  const absW = Math.abs(w);

  if (absW < 1000) {
    const val = Math.round(w).toLocaleString();
    return {
      value: val,
      unit: "kg",
      fullStr: `${val} kg`,
      exactKgStr: `${val} kg`,
    };
  }

  if (absW < 1000000) {
    const tons = w / 1000;
    const rounded1 = Math.round(tons * 10) / 10;
    const rounded2 = Math.round(tons * 100) / 100;
    const formatted = Number.isInteger(rounded1)
      ? rounded1.toLocaleString()
      : rounded2.toLocaleString();

    return {
      value: formatted,
      unit: "Ton",
      fullStr: `${formatted} Ton`,
      exactKgStr: `${Math.round(w).toLocaleString()} kg`,
    };
  }

  const kTon = w / 1000000;
  const roundedKTon1 = Math.round(kTon * 10) / 10;
  const roundedKTon2 = Math.round(kTon * 100) / 100;
  const formattedKTon = Number.isInteger(roundedKTon1)
    ? roundedKTon1.toLocaleString()
    : roundedKTon2.toLocaleString();

  return {
    value: formattedKTon,
    unit: "k Ton",
    fullStr: `${formattedKTon} k Ton`,
    exactKgStr: `${Math.round(w).toLocaleString()} kg`,
  };
}

// Dual Display Component: Weight View (Dynamic kg / Ton) vs Unit View (Pieces / Qty)
function StatDisplay({
  mode,
  qtyValue,
  weightKg,
  unitLabel,
}: {
  mode: "weight" | "units";
  qtyValue: number;
  weightKg: number;
  unitLabel: string;
}) {
  const roundedQty = Math.round(Number(qtyValue) || 0);
  const dynWeight = formatDynamicWeight(weightKg);

  if (mode === "weight") {
    return (
      <div className="flex flex-col items-center justify-center my-0.5 w-full">
        <div className="flex items-baseline justify-center gap-1 max-w-full px-0.5">
          <span
            className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight truncate"
            title={`${dynWeight.fullStr} (${dynWeight.exactKgStr})`}
          >
            {dynWeight.value}
          </span>
          <span className="text-[10px] sm:text-[11px] font-black uppercase text-slate-700 dark:text-slate-300 shrink-0">
            {dynWeight.unit}
          </span>
        </div>
        <span className="text-[9px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-full" title={dynWeight.exactKgStr}>
          {roundedQty.toLocaleString()} {unitLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center my-0.5 w-full">
      <StatNumber value={roundedQty} />
      <span className="text-[9px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-full" title={dynWeight.exactKgStr}>
        {dynWeight.fullStr}
      </span>
    </div>
  );
}

// Anti-Collision Staggered Leader Line Label Renderer for Pie & Donut Charts
const renderCalloutLabel = (props: any) => {
  const { cx, cy, midAngle, outerRadius, value, index, fill } = props;
  if (!value || value === 0) return null;

  const RADIAN = Math.PI / 180;
  const cos = Math.cos(-midAngle * RADIAN);
  const sin = Math.sin(-midAngle * RADIAN);

  // Stagger leader line distance alternately (10px vs 24px) so adjacent slice labels are separated and never collide
  const staggerOffset = index % 2 === 0 ? 10 : 24;
  const sx = cx + (outerRadius + 2) * cos;
  const sy = cy + (outerRadius + 2) * sin;

  const mx = cx + (outerRadius + staggerOffset) * cos;
  const my = cy + (outerRadius + staggerOffset) * sin;

  const dir = cos >= 0 ? 1 : -1;
  const ex = mx + dir * 12;
  const ey = my;
  const textAnchor = dir === 1 ? "start" : "end";
  const lineColor = fill || "#64748b";

  return (
    <g className="select-none pointer-events-none">
      {/* Sleek Connected Leader Line */}
      <path
        d={`M${sx},${sy} L${mx},${my} L${ex},${ey}`}
        stroke={lineColor}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {/* Outer Anchor Dot */}
      <circle cx={ex} cy={ey} r={2.5} fill={lineColor} />

      {/* Connected Value with Enhanced Visibility */}
      <text
        x={ex + dir * 5}
        y={ey}
        textAnchor={textAnchor}
        fill="#0f172a"
        fontSize={12}
        fontWeight="900"
        dominantBaseline="central"
        className="font-mono tracking-tight dark:fill-slate-100 drop-shadow-sm"
      >
        {value}
      </text>
    </g>
  );
};

function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedFabView, setSelectedFabView] = useState<any | null>(null);
  const [pendingPOsModalOpen, setPendingPOsModalOpen] = useState(false);
  const [fulfillingPoNumber, setFulfillingPoNumber] = useState<string | null>(null);

  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_view").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const fabrications = useQuery({
    queryKey: ["fabrications-recent"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fabrications")
        .select("id, fab_date, product_quantity, supervisor_name, remarks, products(name), departments(name), fabrication_materials(id, required_qty_per_product, total_quantity, materials(name, uom))")
        .order("fab_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [customFabs, setCustomFabs] = useState<any[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("fems_custom_fabrications_v2");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customPurchases, setCustomPurchases] = useState<any[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("fems_custom_purchases_v2");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [poOverrides, setPoOverrides] = useState<Record<string, any>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("fems_po_overrides_v2");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const purchases = useQuery({
    queryKey: ["po-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("po_summary_view").select("*").order("po_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const inv = (inventory.data && inventory.data.length > 0)
    ? [...inventory.data, ...DEMO_MATERIALS.filter(m => !inventory.data?.some((d: any) => (d.material_id || d.id) === (m.material_id || m.id)))]
    : DEMO_MATERIALS;

  const fabList = useMemo(() => {
    const dbList = (fabrications.data && fabrications.data.length > 0) ? fabrications.data : DEMO_FABRICATIONS;
    const seenIds = new Set<string>();
    const seenSigs = new Set<string>();
    const merged: any[] = [];

    [...dbList, ...customFabs].forEach((item: any) => {
      const id = String(item.id || "");
      const prodName = (item.products as any)?.name || item.product_name || "";
      const deptName = (item.departments as any)?.name || item.department_name || "";
      const supervisor = item.supervisor_name || "";
      const sig = `${item.fab_date}_${prodName}_${item.product_quantity}_${supervisor}_${deptName}`;

      if (id && seenIds.has(id)) return;
      if (seenSigs.has(sig)) return;

      if (id) seenIds.add(id);
      seenSigs.add(sig);
      merged.push(item);
    });

    return merged;
  }, [fabrications.data, customFabs]);

  const purList = useMemo(() => {
    const dbData = (purchases.data && purchases.data.length > 0) ? purchases.data : [];
    return dbData.length > 0
      ? [...dbData, ...customPurchases]
      : [...customPurchases, ...DEMO_PURCHASES];
  }, [purchases.data, customPurchases]);

  // Group all purchase orders cleanly by PO Number to accurately evaluate pending POs
  const groupedPurchases = useMemo(() => {
    const map = new Map<string, any>();
    purList.forEach((p: any) => {
      const cleanPo = (p.po_number || p.po_id || p.id || "").replace(/#\d+$/, "");
      if (!cleanPo) return;

      if (!map.has(cleanPo)) {
        map.set(cleanPo, {
          id: p.id || p.po_id,
          po_number: cleanPo,
          po_date: p.po_date,
          supplier_name: p.supplier_name || "PRIME LOGITECH INDUSTRY",
          location_name: p.location_name || "Factory Location",
          plant_name: p.plant_name || "Receiving Unit",
          items: [],
          totalOrderedQty: 0,
          totalReceivedQty: 0,
          totalPendingQty: 0,
        });
      }

      const g = map.get(cleanPo);
      const isOverridden = !!poOverrides[cleanPo]?.fulfilled;
      const ordered = Number(p.po_quantity || 0);
      const rawRec = isOverridden ? ordered : Number(p.received_quantity || 0);
      const received = Math.min(ordered, Math.max(0, rawRec));
      const pending = isOverridden ? 0 : Math.max(0, ordered - received);

      g.items.push({
        id: p.id || p.po_id,
        material_name: p.material_name || "Material Item",
        uom: p.uom || "PCS",
        po_quantity: ordered,
        received_quantity: received,
        pending_quantity: pending,
      });

      g.totalOrderedQty += ordered;
      g.totalReceivedQty += received;
      g.totalPendingQty += pending;
    });

    return Array.from(map.values());
  }, [purList, poOverrides]);

  const pendingPOsList = useMemo(() => {
    return groupedPurchases.filter((g) => g.totalPendingQty > 0);
  }, [groupedPurchases]);

  const totalCurrentStock = inv.reduce((s, r) => s + Number(r.current_stock ?? 0), 0);
  const totalPurchased = inv.reduce((s, r) => s + Number(r.total_purchased ?? 0), 0);
  const totalConsumed = inv.reduce((s, r) => s + Number(r.total_consumed ?? 0), 0);
  const lowStock = inv.filter((r) => r.status === "low" || r.status === "critical");
  const criticalStock = inv.filter((r) => r.status === "critical");

  const totalFab = fabList.reduce((s, r) => s + Number(r.product_quantity || 0), 0);
  const activePOs = pendingPOsList;

  // KPI Display Mode: Default to "weight" (Kg / Tons) as requested by production management
  const [kpiMode, setKpiMode] = useState<"weight" | "units">(() => {
    if (typeof window === "undefined") return "weight";
    return (localStorage.getItem("fems_kpi_display_mode") as "weight" | "units") || "weight";
  });

  const toggleKpiMode = (mode: "weight" | "units") => {
    setKpiMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("fems_kpi_display_mode", mode);
    }
  };

  // Material weight map for fast lookup
  const materialWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    DEMO_MATERIALS.forEach((m) => {
      const w = Number(m.unit_weight_kg || 0.5);
      map.set(String(m.material_id || m.id).toLowerCase(), w);
      if (m.code) map.set(m.code.toLowerCase(), w);
      if (m.name) map.set(m.name.toLowerCase(), w);
    });
    return map;
  }, []);

  const getMatWeight = (m: any): number => {
    if (m?.unit_weight_kg && Number(m.unit_weight_kg) > 0) return Number(m.unit_weight_kg);
    const keyId = String(m?.material_id || m?.id || "").toLowerCase();
    const keyName = String(m?.name || m?.material_name || "").toLowerCase();
    const keyCode = String(m?.code || "").toLowerCase();
    return materialWeightMap.get(keyId) || materialWeightMap.get(keyName) || materialWeightMap.get(keyCode) || 0.5;
  };

  // Product approx unit weight lookup (Trolley: 25.54kg, Table: 25.08kg, Rack: 42.68kg, Stand: 15.84kg)
  const getProductUnitWeightKg = (pName: string): number => {
    const lower = (pName || "").toLowerCase();
    if (lower.includes("trolley")) return 25.54;
    if (lower.includes("table") || lower.includes("bench")) return 25.08;
    if (lower.includes("rack")) return 42.68;
    if (lower.includes("stand")) return 15.84;
    return 25.0; // fallback standard unit weight
  };

  // Total fabricated weight in Kg (using actual scale weight if available, or BOM approx weight)
  const totalFabWeightKg = useMemo(() => {
    return fabList.reduce((acc, f: any) => {
      if (f.actual_scale_weight_kg && Number(f.actual_scale_weight_kg) > 0) {
        return acc + Number(f.actual_scale_weight_kg);
      }
      if (f.expected_bom_weight_kg && Number(f.expected_bom_weight_kg) > 0) {
        return acc + Number(f.expected_bom_weight_kg);
      }
      const prodName = (typeof f.products === "object" && f.products?.name) ? f.products.name : (f.product_name || "Trolley");
      const unitW = getProductUnitWeightKg(prodName);
      return acc + (Number(f.product_quantity || 0) * unitW);
    }, 0);
  }, [fabList]);

  // Total purchased raw material weight in Kg
  const totalPurchasedWeightKg = useMemo(() => {
    return inv.reduce((s, r) => s + (Number(r.total_purchased ?? 0) * getMatWeight(r)), 0);
  }, [inv, materialWeightMap]);

  // Total consumed raw material weight in Kg
  const totalConsumedWeightKg = useMemo(() => {
    return inv.reduce((s, r) => s + (Number(r.total_consumed ?? 0) * getMatWeight(r)), 0);
  }, [inv, materialWeightMap]);

  // Total current stock raw material weight in Kg
  const totalCurrentStockWeightKg = useMemo(() => {
    return inv.reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0);
  }, [inv, materialWeightMap]);

  // Total low stock materials weight in Kg
  const totalLowStockWeightKg = useMemo(() => {
    return lowStock.reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0);
  }, [lowStock, materialWeightMap]);

  // Total pending purchase orders weight in Kg
  const totalPendingWeightKg = useMemo(() => {
    return pendingPOsList.reduce((acc, poGroup) => {
      const groupWeight = poGroup.items.reduce((iAcc: number, it: any) => {
        return iAcc + (Number(it.pending_quantity || 0) * getMatWeight(it));
      }, 0);
      return acc + groupWeight;
    }, 0);
  }, [pendingPOsList, materialWeightMap]);

  // Single PO quick fulfillment handler
  const handleFulfillSinglePO = async (poGroup: any) => {
    setFulfillingPoNumber(poGroup.po_number);
    try {
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const invNum = `REC-${format(new Date(), "yyyyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. If line items have Supabase UUIDs, record invoice receipt
      for (const item of poGroup.items) {
        if (item.pending_quantity > 0) {
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);
          if (isUUID) {
            try {
              await supabase.from("purchase_invoices").insert({
                po_id: item.id,
                invoice_date: nowStr,
                invoice_number: invNum,
                received_quantity: item.pending_quantity,
                remarks: "Quick Fulfillment from Dashboard KPI Card",
              });
            } catch (e) {
              console.warn("DB quick invoice insert error:", e);
            }
          }
        }
      }

      // 2. Update custom local purchases if present
      const updatedCustom = customPurchases.map((p: any) => {
        const cleanPo = (p.po_number || p.po_id || p.id || "").replace(/#\d+$/, "");
        if (cleanPo === poGroup.po_number) {
          return {
            ...p,
            received_quantity: p.po_quantity,
            pending_quantity: 0,
          };
        }
        return p;
      });
      setCustomPurchases(updatedCustom);
      if (typeof window !== "undefined") {
        localStorage.setItem("fems_custom_purchases_v2", JSON.stringify(updatedCustom));
      }

      // 3. Save fulfillment override in localStorage
      const newOverrides = { ...poOverrides, [poGroup.po_number]: { fulfilled: true, date: nowStr } };
      setPoOverrides(newOverrides);
      if (typeof window !== "undefined") {
        localStorage.setItem("fems_po_overrides_v2", JSON.stringify(newOverrides));
      }

      toast.success(`PO #${poGroup.po_number} marked as fully received! Stock updated in inventory.`);
      queryClient.invalidateQueries({ queryKey: ["po-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to fulfill PO");
    } finally {
      setFulfillingPoNumber(null);
    }
  };

  // Bulk fulfillment handler
  const handleFulfillAllPending = async () => {
    if (pendingPOsList.length === 0) return;
    setFulfillingPoNumber("ALL");
    try {
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const newOverrides = { ...poOverrides };

      for (const poGroup of pendingPOsList) {
        newOverrides[poGroup.po_number] = { fulfilled: true, date: nowStr };
        for (const item of poGroup.items) {
          if (item.pending_quantity > 0) {
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id);
            if (isUUID) {
              try {
                await supabase.from("purchase_invoices").insert({
                  po_id: item.id,
                  invoice_date: nowStr,
                  invoice_number: `REC-${format(new Date(), "yyyyMMdd")}-${Math.floor(1000 + Math.random() * 9000)}`,
                  received_quantity: item.pending_quantity,
                  remarks: "Bulk Fulfillment from Dashboard",
                });
              } catch (e) {}
            }
          }
        }
      }

      const updatedCustom = customPurchases.map((p: any) => ({
        ...p,
        received_quantity: p.po_quantity,
        pending_quantity: 0,
      }));
      setCustomPurchases(updatedCustom);
      if (typeof window !== "undefined") {
        localStorage.setItem("fems_custom_purchases_v2", JSON.stringify(updatedCustom));
        localStorage.setItem("fems_po_overrides_v2", JSON.stringify(newOverrides));
      }
      setPoOverrides(newOverrides);

      toast.success(`All ${pendingPOsList.length} pending purchase orders marked as fulfilled!`);
      queryClient.invalidateQueries({ queryKey: ["po-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setPendingPOsModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to fulfill all orders");
    } finally {
      setFulfillingPoNumber(null);
    }
  };

  // Monthly trends (last 6 months)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), 5 - i));
    return { key: format(d, "yyyy-MM"), monthNum: format(d, "MM"), label: format(d, "MMM yy") };
  });

  const matchMonth = (dateStr: any, targetKey: string, monthNum: string) => {
    if (!dateStr) return false;
    const str = String(dateStr);
    if (str.startsWith(targetKey)) return true;
    try {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return format(parsed, "yyyy-MM") === targetKey;
      }
    } catch (e) {}
    return str.includes(`-${monthNum}-`) || str.startsWith(`${monthNum}/`) || str.includes(`/${monthNum}/`);
  };

  const fabByMonth = months.map(({ key, monthNum, label }) => {
    const monthFabs = fabList.filter((f: any) => matchMonth(f.fab_date, key, monthNum));
    const totalUnits = monthFabs.reduce((s: number, f: any) => s + Number(f.product_quantity || 0), 0);
    const totalWeightKg = monthFabs.reduce((s: number, f: any) => {
      const qty = Number(f.product_quantity || 0);
      const prodName = (typeof f.products === 'object' && f.products?.name) ? f.products.name : (f.product_name || "Trolley");
      const unitW = (f.actual_scale_weight_kg && Number(f.actual_scale_weight_kg) > 0)
        ? Number(f.actual_scale_weight_kg) / (qty || 1)
        : (f.expected_bom_weight_kg && Number(f.expected_bom_weight_kg) > 0)
        ? Number(f.expected_bom_weight_kg) / (qty || 1)
        : getProductUnitWeightKg(prodName);
      return s + (qty * unitW);
    }, 0);
    return {
      month: label,
      fabrication: kpiMode === "weight" ? Math.round(totalWeightKg) : totalUnits,
      weightKg: totalWeightKg,
      units: totalUnits,
    };
  });

  const purByMonth = months.map(({ key, monthNum, label }) => {
    const monthPurs = purList.filter((p: any) => matchMonth(p.po_date, key, monthNum));
    const totalUnits = monthPurs.reduce((s: number, p: any) => {
      const rawQty = Number(p.received_quantity ?? p.po_quantity ?? 0);
      const qty = rawQty > 50000 ? 15000 : rawQty;
      return s + qty;
    }, 0);
    const totalWeightKg = monthPurs.reduce((s: number, p: any) => {
      const rawQty = Number(p.received_quantity ?? p.po_quantity ?? 0);
      const qty = rawQty > 50000 ? 15000 : rawQty;
      return s + (qty * getMatWeight(p));
    }, 0);
    return {
      month: label,
      purchase: kpiMode === "weight" ? Math.round(totalWeightKg) : totalUnits,
      weightKg: totalWeightKg,
      units: totalUnits,
    };
  });

  const productWise = Object.entries(
    fabList.reduce<Record<string, { units: number; weightKg: number }>>((acc, f: any) => {
      const n = (typeof f.products === 'object' && f.products?.name) ? f.products.name : (f.product_name || "Trolley");
      const qty = Number(f.product_quantity || 0);
      const unitW = (f.actual_scale_weight_kg && Number(f.actual_scale_weight_kg) > 0)
        ? Number(f.actual_scale_weight_kg) / (qty || 1)
        : (f.expected_bom_weight_kg && Number(f.expected_bom_weight_kg) > 0)
        ? Number(f.expected_bom_weight_kg) / (qty || 1)
        : getProductUnitWeightKg(n);
      const cur = acc[n] || { units: 0, weightKg: 0 };
      cur.units += qty;
      cur.weightKg += qty * unitW;
      acc[n] = cur;
      return acc;
    }, {}),
  )
    .map(([name, data]) => ({
      name,
      value: kpiMode === "weight" ? Math.round(data.weightKg) : data.units,
      weightKg: data.weightKg,
      units: data.units,
    }))
    .sort((a, b) => b.value - a.value);

  const deptWise = Object.entries(
    fabList.reduce<Record<string, { units: number; weightKg: number }>>((acc, f: any) => {
      const d = (typeof f.departments === 'object' && f.departments?.name) ? f.departments.name : (f.department_name || "Fabrication");
      const prodName = (typeof f.products === 'object' && f.products?.name) ? f.products.name : (f.product_name || "Trolley");
      const qty = Number(f.product_quantity || 0);
      const unitW = (f.actual_scale_weight_kg && Number(f.actual_scale_weight_kg) > 0)
        ? Number(f.actual_scale_weight_kg) / (qty || 1)
        : (f.expected_bom_weight_kg && Number(f.expected_bom_weight_kg) > 0)
        ? Number(f.expected_bom_weight_kg) / (qty || 1)
        : getProductUnitWeightKg(prodName);
      const cur = acc[d] || { units: 0, weightKg: 0 };
      cur.units += qty;
      cur.weightKg += qty * unitW;
      acc[d] = cur;
      return acc;
    }, {}),
  )
    .map(([name, data]) => ({
      name: name.length > 18 ? name.substring(0, 16) + "..." : name,
      fullName: name,
      value: kpiMode === "weight" ? Math.round(data.weightKg) : data.units,
      weightKg: data.weightKg,
      units: data.units,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const supplierWise = Object.entries(
    purList.reduce<Record<string, { units: number; weightKg: number }>>((acc, p: any) => {
      const s = p.supplier_name ?? "PRIME LOGITECH INDUSTRY";
      const rawQty = Number(p.po_quantity ?? p.received_quantity ?? 0);
      const qty = rawQty > 50000 ? 15000 : rawQty;
      const cur = acc[s] || { units: 0, weightKg: 0 };
      cur.units += qty;
      cur.weightKg += qty * getMatWeight(p);
      acc[s] = cur;
      return acc;
    }, {}),
  )
    .map(([name, data]) => ({
      name: name.replace(" Supplies", "").replace(" Corp", "").replace(" Ltd", "").replace(" Co", "").replace(" Works", "").replace(" Industrial", ""),
      fullName: name,
      value: kpiMode === "weight" ? Math.round(data.weightKg) : data.units,
      weightKg: data.weightKg,
      units: data.units,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topConsumed = [...inv]
    .sort((a, b) => {
      const valA = kpiMode === "weight" ? Number(a.total_consumed ?? 0) * getMatWeight(a) : Number(a.total_consumed ?? 0);
      const valB = kpiMode === "weight" ? Number(b.total_consumed ?? 0) * getMatWeight(b) : Number(b.total_consumed ?? 0);
      return valB - valA;
    })
    .slice(0, 5)
    .map((m) => ({
      name: m.name.length > 10 ? m.name.substring(0, 10) + "..." : m.name,
      fullName: m.name,
      consumed: kpiMode === "weight" ? Math.round(Number(m.total_consumed ?? 0) * getMatWeight(m)) : Number(m.total_consumed ?? 0),
      stock: kpiMode === "weight" ? Math.round(Number(m.current_stock ?? 0) * getMatWeight(m)) : Number(m.current_stock ?? 0),
    }));

  const inventoryStatusData = [
    {
      name: "Healthy",
      value: kpiMode === "weight"
        ? Math.round(inv.filter((r) => r.status === "healthy").reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0))
        : inv.filter((r) => r.status === "healthy").length,
      color: "#3ea36f",
      itemCount: inv.filter((r) => r.status === "healthy").length,
      weightKg: inv.filter((r) => r.status === "healthy").reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0),
    },
    {
      name: "Low",
      value: kpiMode === "weight"
        ? Math.round(inv.filter((r) => r.status === "low").reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0))
        : inv.filter((r) => r.status === "low").length,
      color: "#d19a2e",
      itemCount: inv.filter((r) => r.status === "low").length,
      weightKg: inv.filter((r) => r.status === "low").reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0),
    },
    {
      name: "Critical",
      value: kpiMode === "weight"
        ? Math.round(criticalStock.reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0))
        : criticalStock.length,
      color: "#d9524a",
      itemCount: criticalStock.length,
      weightKg: criticalStock.reduce((s, r) => s + (Number(r.current_stock ?? 0) * getMatWeight(r)), 0),
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Sticky 100% Opaque KPI Cards Header with Weight vs Unit Toggle */}
      <div className="sticky top-[56px] xl:top-[64px] z-30 bg-slate-100 dark:bg-slate-900 py-2.5 -mx-4 md:-mx-8 px-4 md:px-8 border-b border-slate-200/80 shadow-sm">
        {/* Toggle Mode Bar */}
        <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Scale className="h-4 w-4 text-indigo-600" />
            <span className="tracking-wide">PRODUCTION & INVENTORY KPI</span>
            <span className="hidden sm:inline text-[10px] text-slate-500 font-semibold">
              {kpiMode === "weight" ? "• Showing Physical Scale / BOM Weight (Dynamic kg / Ton)" : "• Showing Piece Count & Unit Quantity"}
            </span>
          </div>

          <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-300/60 shadow-2xs">
            <button
              type="button"
              onClick={() => toggleKpiMode("weight")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
                kpiMode === "weight"
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
              title="Show fabricated products & materials in Weight (Dynamic kg / Ton)"
            >
              <Scale className="h-3 w-3" />
              Weight View (Dynamic kg/Ton)
            </button>
            <button
              type="button"
              onClick={() => toggleKpiMode("units")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
                kpiMode === "units"
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
              title="Show count of fabricated units & pieces"
            >
              <Boxes className="h-3 w-3" />
              Unit View (Qty)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Card 1: PRODUCTS FABRICATED */}
          <div className="bg-[#a1e4fa] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden border border-sky-300/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">
              {kpiMode === "weight" ? "FAB. WEIGHT" : "FABRICATED"}
            </span>
            <StatDisplay
              mode={kpiMode}
              qtyValue={totalFab}
              weightKg={totalFabWeightKg}
              unitLabel="Units"
            />
            <span className="text-[9px] text-slate-600 font-bold truncate w-full">
              {kpiMode === "weight" ? `${Math.round(totalFab).toLocaleString()} Units Total` : formatDynamicWeight(totalFabWeightKg).fullStr}
            </span>
          </div>

          {/* Card 2: MATERIALS PURCHASED */}
          <div className="bg-[#fbaea7] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden border border-rose-300/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">
              {kpiMode === "weight" ? "PUR. WEIGHT" : "PURCHASED"}
            </span>
            <StatDisplay
              mode={kpiMode}
              qtyValue={totalPurchased}
              weightKg={totalPurchasedWeightKg}
              unitLabel="Units"
            />
            <span className="text-[9px] leading-tight text-slate-700 font-semibold truncate w-full">
              {kpiMode === "weight" ? "Material Inflow" : "Total Raw Material"}
            </span>
          </div>

          {/* Card 3: CONSUMED */}
          <div className="bg-[#93ebec] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden border border-cyan-300/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">
              {kpiMode === "weight" ? "CONS. WEIGHT" : "CONSUMED"}
            </span>
            <StatDisplay
              mode={kpiMode}
              qtyValue={totalConsumed}
              weightKg={totalConsumedWeightKg}
              unitLabel="Units"
            />
            <span className="text-[9px] text-slate-600 font-semibold truncate w-full">
              {kpiMode === "weight" ? "BOM Deducted" : "Auto Deducted"}
            </span>
          </div>

          {/* Card 4: CURRENT STOCK */}
          <div className="bg-[#d7b0ea] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden border border-purple-300/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">
              {kpiMode === "weight" ? "STOCK WEIGHT" : "CURRENT STOCK"}
            </span>
            <StatDisplay
              mode={kpiMode}
              qtyValue={totalCurrentStock}
              weightKg={totalCurrentStockWeightKg}
              unitLabel="Units"
            />
            <span className="text-[9px] text-slate-700 font-bold truncate w-full">{inv.length} Catalog Items</span>
          </div>

          {/* Card 5: MONTHLY FAB. */}
          <div className="bg-[#fcd199] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden border border-amber-300/40">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">MONTHLY FAB.</span>
            <StatDisplay
              mode={kpiMode}
              qtyValue={fabByMonth[fabByMonth.length - 1]?.fabrication ?? 0}
              weightKg={
                (fabByMonth[fabByMonth.length - 1]?.fabrication ?? 0) * 25.5
              }
              unitLabel="Units"
            />
            <span className="text-[9px] text-slate-600 font-semibold truncate w-full">{fabByMonth[fabByMonth.length - 1]?.month} Production</span>
          </div>

          {/* Card 6: PENDING POS (Interactive with Review Modal & Quick Fulfill) */}
          <div
            onClick={() => setPendingPOsModalOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPendingPOsModalOpen(true); }}
            className="bg-[#a8d3e6] hover:bg-[#97c5da] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden cursor-pointer transition-all duration-200 transform hover:-translate-y-0.5 border border-sky-300/60 hover:shadow-md group"
            title="Click to view & fulfill Pending Purchase Orders"
          >
            <div className="flex items-center justify-center gap-1 w-full">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate">
                {kpiMode === "weight" ? "PENDING WT." : "PENDING POS"}
              </span>
              <ExternalLink className="h-3 w-3 text-slate-600 opacity-60 group-hover:opacity-100 group-hover:text-indigo-700 transition-all shrink-0" />
            </div>
            {kpiMode === "weight" ? (
              <StatDisplay
                mode="weight"
                qtyValue={pendingPOsList.length}
                weightKg={totalPendingWeightKg}
                unitLabel="Orders"
              />
            ) : (
              <StatNumber value={pendingPOsList.length} />
            )}
            <span className="text-[9px] text-slate-700 font-semibold truncate w-full flex items-center justify-center gap-1">
              {pendingPOsList.length === 0 ? (
                <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                  <Check className="h-2.5 w-2.5" /> All Fulfilled
                </span>
              ) : (
                <span className="text-amber-950 font-bold underline decoration-amber-600/50">
                  {pendingPOsList.length} Awaiting (Click)
                </span>
              )}
            </span>
          </div>

          {/* Card 7: LOW STOCK */}
          <div className="bg-[#ff5252] text-white rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-100 truncate w-full">LOW STOCK</span>
            <span className="text-2xl lg:text-3xl font-black my-0.5 text-white truncate max-w-full block">{lowStock.length}</span>
            <span className="text-[9px] text-red-100 font-semibold truncate w-full">
              {criticalStock.length} Critical ({formatDynamicWeight(totalLowStockWeightKg).fullStr})
            </span>
          </div>

          {/* Card 8: ACTIVE PRODUCTS */}
          <div className="bg-white text-slate-900 rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 truncate w-full">PRODUCTS</span>
            <span className="text-2xl lg:text-3xl font-black my-0.5 text-indigo-600 truncate max-w-full block">{productWise.length > 0 ? productWise.length : 4}</span>
            <span className="text-[9px] text-slate-500 font-semibold truncate w-full">BOM Avg ~27kg</span>
          </div>
        </div>
      </div>

      {/* Row 1: 3 Charts in 1 Single Row (Fabrication Trend, Purchase Trends, Inventory Health Donut) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1: Fabrication Trend Curve */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Factory className="h-4 w-4 text-indigo-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Fabrication Trend</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Output weight (kg / tons) per month" : "Units produced per month"}
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fabByMonth} margin={{ top: 18, right: 25, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="fabGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={10} stroke="#94a3b8" tickLine={false} />
                <YAxis
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  tickFormatter={(v) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(0)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))}
                />
                <Tooltip
                  formatter={(v: any) => [
                    kpiMode === "weight"
                      ? (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} Tons (${Number(v).toLocaleString()} kg)` : `${Number(v).toLocaleString()} kg`)
                      : `${v} Units`,
                    "Fabrication",
                  ]}
                  contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                />
                <Area type="monotone" dataKey="fabrication" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#fabGrad)" dot={{ r: 4, fill: "#6366f1", strokeWidth: 1.5, stroke: "#ffffff" }}>
                  <LabelList
                    dataKey="fabrication"
                    position="top"
                    offset={8}
                    style={{ fontSize: "10px", fontWeight: "bold", fill: "#4f46e5" }}
                    formatter={(v: number) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v))}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 2: Purchase Trends Bar Chart */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="h-4 w-4 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Purchase Trends</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Material weight received per month" : "Material quantity received per month"}
              </p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purByMonth} margin={{ top: 18, right: 25, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={10} stroke="#94a3b8" tickLine={false} />
                <YAxis
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  tickFormatter={(v) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(0)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))}
                />
                <Tooltip
                  formatter={(v: any) => [
                    kpiMode === "weight"
                      ? (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} Tons (${Number(v).toLocaleString()} kg)` : `${Number(v).toLocaleString()} kg`)
                      : `${v} Units`,
                    "Received",
                  ]}
                  contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e2e8f0" }}
                />
                <Bar dataKey="purchase" fill="#34d399" barSize={16} radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="purchase"
                    position="top"
                    offset={6}
                    style={{ fontSize: "9px", fontWeight: "bold", fill: "#059669" }}
                    formatter={(v: number) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 3: Inventory Health Breakdown Donut Chart */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Boxes className="h-4 w-4 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Inventory Health Status</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Stock weight categorized by status" : "Categorized stock levels"}
              </p>
            </div>
          </div>
          
          {/* Donut with Center KPI Total + Staggered Connected Leader Lines */}
          <div className="h-48 w-full flex items-center justify-center my-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={inventoryStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={4}
                  cornerRadius={4}
                  label={renderCalloutLabel}
                  labelLine={false}
                >
                  {inventoryStatusData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [
                    kpiMode === "weight"
                      ? (Number(val) >= 1000 ? `${(Number(val) / 1000).toFixed(2)} Tons (${Number(val).toLocaleString()} kg)` : `${Number(val).toLocaleString()} kg`)
                      : `${val} Items`,
                    name,
                  ]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", fontWeight: "bold" }}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-4" className="text-lg font-black fill-slate-900 dark:fill-slate-100 font-mono">
                    {kpiMode === "weight"
                      ? (inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0) >= 1000
                        ? `${(inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0) / 1000).toFixed(1)}t`
                        : `${inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}kg`)
                      : inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0)}
                  </tspan>
                  <tspan x="50%" dy="18" className="text-[10px] font-extrabold fill-slate-400 uppercase tracking-widest">
                    {kpiMode === "weight" ? "Weight" : "Items"}
                  </tspan>
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Clean Metric Pills Grid */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {inventoryStatusData.map((item, idx) => {
              const total = inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0);
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={idx} className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-1.5 text-center border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{item.name}</span>
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
                    {kpiMode === "weight"
                      ? (item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}t` : `${item.value}kg`)
                      : item.value} <span className="text-[9px] font-semibold text-slate-400 font-sans">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Row 2: 3 Charts Row (Product Output, Department Breakdown, Supplier PO Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 4: Product-wise Production Horizontal Bar */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-sky-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Product-wise Output</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Fabricated weight (kg) by category" : "Units produced by category"}
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productWise.length > 0 ? productWise : [{ name: "Standard Product", value: 120 }]} layout="vertical" margin={{ top: 5, right: 35, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  tickFormatter={(v) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(0)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))}
                />
                <YAxis dataKey="name" type="category" fontSize={10} stroke="#94a3b8" tickLine={false} width={80} />
                <Tooltip
                  formatter={(v: any) => [
                    kpiMode === "weight"
                      ? (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} Tons (${Number(v).toLocaleString()} kg)` : `${Number(v).toLocaleString()} kg`)
                      : `${v} Units`,
                    "Output",
                  ]}
                  contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                />
                <Bar dataKey="value" fill="#38bdf8" barSize={14} radius={[0, 6, 6, 0]}>
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={8}
                    style={{ fontSize: "10px", fontWeight: "bold", fill: "#0284c7" }}
                    formatter={(v: number) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}kg`) : v)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Chart 5: Department Fabrication Breakdown Donut Chart */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-4 w-4 text-violet-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Department Breakdown</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Fabrication weight (kg) by department" : "Fabrication output by department"}
              </p>
            </div>
          </div>

          {/* Donut with Center KPI Total + Staggered Connected Leader Lines */}
          <div className="h-48 w-full flex items-center justify-center my-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptWise}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={4}
                  cornerRadius={4}
                  label={renderCalloutLabel}
                  labelLine={false}
                >
                  {deptWise.map((entry, idx) => (
                    <Cell key={idx} fill={DEPT_COLORS[idx % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [
                    kpiMode === "weight"
                      ? (Number(val) >= 1000 ? `${(Number(val) / 1000).toFixed(2)} Tons (${Number(val).toLocaleString()} kg)` : `${Number(val).toLocaleString()} kg`)
                      : `${val} Units`,
                    name,
                  ]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", fontWeight: "bold" }}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-4" className="text-lg font-black fill-slate-900 dark:fill-slate-100 font-mono">
                    {kpiMode === "weight"
                      ? (deptWise.reduce((acc, curr) => acc + curr.value, 0) >= 1000
                        ? `${(deptWise.reduce((acc, curr) => acc + curr.value, 0) / 1000).toFixed(1)}t`
                        : `${deptWise.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}kg`)
                      : deptWise.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}
                  </tspan>
                  <tspan x="50%" dy="18" className="text-[10px] font-extrabold fill-slate-400 uppercase tracking-widest">
                    {kpiMode === "weight" ? "Weight" : "Units"}
                  </tspan>
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Clean Metric Pills Grid */}
          <div className="flex flex-wrap gap-1.5 justify-center pt-2 border-t border-slate-100 dark:border-slate-800 max-h-[76px] overflow-y-auto">
            {deptWise.map((d, idx) => {
              const color = DEPT_COLORS[idx % DEPT_COLORS.length];
              const total = deptWise.reduce((acc, curr) => acc + curr.value, 0);
              const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
              return (
                <div key={idx} className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-800 text-[10px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[100px]" title={d.name}>{d.name}</span>
                  <strong className="font-mono text-slate-900 dark:text-slate-100 ml-0.5">
                    {kpiMode === "weight" ? (d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}t` : `${d.value}kg`) : d.value}
                  </strong>
                  <span className="text-[9px] text-slate-400">({pct}%)</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Chart 6: Supplier Purchase Orders Distribution */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="h-4 w-4 text-teal-600 shrink-0" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 leading-tight">Top Suppliers Distribution</h3>
              <p className="text-[10px] text-slate-500">
                {kpiMode === "weight" ? "Material weight (kg) supplied by vendor" : "Material volume by vendor"}
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierWise} margin={{ top: 18, right: 15, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={9} stroke="#94a3b8" tickLine={false} />
                <YAxis
                  fontSize={10}
                  stroke="#94a3b8"
                  tickLine={false}
                  tickFormatter={(v) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(0)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))}
                />
                <Tooltip
                  formatter={(v: any) => [
                    kpiMode === "weight"
                      ? (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} Tons (${Number(v).toLocaleString()} kg)` : `${Number(v).toLocaleString()} kg`)
                      : `${v} Units`,
                    "Supplied",
                  ]}
                  contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                />
                <Bar dataKey="value" fill="#14b8a6" barSize={16} radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={6}
                    style={{ fontSize: "9px", fontWeight: "bold", fill: "#0d9488" }}
                    formatter={(v: number) => (kpiMode === "weight" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${v}kg`) : (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3: Bottom Tables (Recent Fabrication Entries + Low Stock Alerts) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fabrication Log Table */}
        <Card className="lg:col-span-2 p-4 shadow-sm border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-800">Recent Fabrication Logs</h3>
            </div>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              {fabList.length} Total Entries
            </span>
          </div>
          <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold uppercase border-b text-[10px] shadow-sm backdrop-blur">
                <tr>
                  <th className="text-left py-2 px-3">Date</th>
                  <th className="text-left py-2 px-3">Product</th>
                  <th className="text-left py-2 px-3">Department</th>
                  <th className="text-right py-2 px-3">Qty</th>
                  <th className="text-right py-2 px-3">Weight</th>
                  <th className="text-left py-2 px-3">Supervisor</th>
                  <th className="text-right py-2 px-3">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fabList.slice(0, 10).map((r: any) => {
                  const prodName = (typeof r.products === "object" && r.products?.name) ? r.products.name : (r.product_name || "Table");
                  const deptName = (typeof r.departments === "object" && r.departments?.name) ? r.departments.name : (r.department_name || "Fabrication");
                  const rowWeight = (r.actual_scale_weight_kg && Number(r.actual_scale_weight_kg) > 0)
                    ? Number(r.actual_scale_weight_kg)
                    : (r.expected_bom_weight_kg && Number(r.expected_bom_weight_kg) > 0)
                    ? Number(r.expected_bom_weight_kg)
                    : Number(r.product_quantity || 1) * getProductUnitWeightKg(prodName);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">
                        {safeFormatDate(r.fab_date)}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{prodName}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-medium">{deptName}</td>
                      <td className="py-2 px-3 text-right font-black text-indigo-600 dark:text-indigo-400">{r.product_quantity}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {rowWeight >= 1000 ? `${(rowWeight / 1000).toFixed(2)} t` : `${rowWeight.toFixed(1)} kg`}
                      </td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">{r.supervisor_name || "—"}</td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600"
                          onClick={() => setSelectedFabView(r)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Low Stock Table */}
        <Card className="p-4 shadow-sm border border-slate-200 rounded-xl bg-white overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <h3 className="font-bold text-sm text-slate-800">Low Stock Alerts</h3>
            </div>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
              {lowStock.length} Items
            </span>
          </div>
          <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold uppercase border-b text-[10px] shadow-sm backdrop-blur">
                <tr>
                  <th className="text-left py-2 px-2">Material</th>
                  <th className="text-right py-2 px-2">Stock ({kpiMode === "weight" ? "Weight" : "Qty"})</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStock.slice(0, 7).map((r) => (
                  <tr key={r.material_id} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-semibold text-slate-900 truncate max-w-[110px]" title={r.name}>{r.name}</td>
                    <td className="py-2 px-2 text-right font-medium text-slate-800">
                      {kpiMode === "weight"
                        ? `${(Number(r.current_stock) * getMatWeight(r)).toFixed(1)} kg`
                        : Number(r.current_stock).toLocaleString()}
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'critical' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* VIEW FABRICATION LOG MODAL */}
      <Dialog open={!!selectedFabView} onOpenChange={(o) => !o && setSelectedFabView(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Factory className="h-5 w-5 text-indigo-600" />
              Fabrication Entry Details
            </DialogTitle>
          </DialogHeader>

          {selectedFabView && (() => {
            const pName = (typeof selectedFabView.products === "object" && selectedFabView.products?.name) ? selectedFabView.products.name : (selectedFabView.product_name || "Table");
            const dName = (typeof selectedFabView.departments === "object" && selectedFabView.departments?.name) ? selectedFabView.departments.name : (selectedFabView.department_name || "Fabrication");
            return (
              <div className="space-y-4 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border">
                  <div>
                    <span className="text-slate-500 font-bold block">Fabrication Date</span>
                    <span className="font-bold text-slate-800">{safeFormatDate(selectedFabView.fab_date, "dd MMMM yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">Product Manufactured</span>
                    <span className="font-black text-indigo-600">{pName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">Quantity Produced</span>
                    <span className="font-extrabold text-slate-900">{selectedFabView.product_quantity} Units</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block">Target Department</span>
                    <span className="font-bold text-slate-800">{dName}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-bold block mb-1">Supervisor Name</span>
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-1 rounded inline-block">{selectedFabView.supervisor_name || "—"}</span>
                </div>

                <div>
                  <span className="text-slate-500 font-bold block mb-1">Remarks / Production Notes</span>
                  <p className="text-slate-700 bg-slate-50 p-2 rounded border">{selectedFabView.remarks || "No remarks recorded."}</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* PENDING PURCHASE ORDERS AUDIT & RESOLUTION DIALOG */}
      <Dialog open={pendingPOsModalOpen} onOpenChange={setPendingPOsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap pr-6">
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Truck className="h-5 w-5 text-indigo-600" />
                Pending Purchase Orders ({pendingPOsList.length})
              </DialogTitle>
              {pendingPOsList.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleFulfillAllPending}
                  disabled={fulfillingPoNumber !== null}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1.5 shadow-xs"
                >
                  <PackageCheck className="h-4 w-4" />
                  {fulfillingPoNumber === "ALL" ? "Fulfilling All..." : "Fulfill All Pending Orders"}
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Purchase orders with materials awaiting delivery. Click <strong>Quick Receive</strong> to record delivery into factory stock, or manage in Purchase page.
            </p>
          </DialogHeader>

          {pendingPOsList.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-sm text-slate-800">All Purchase Orders Are Fully Received!</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No materials are currently pending shipment. New purchase orders can be created in the Purchase section.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-semibold"
                onClick={() => { setPendingPOsModalOpen(false); navigate({ to: "/purchase" }); }}
              >
                Go to Purchase Page <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {pendingPOsList.map((poGroup: any) => {
                const isFulfilling = fulfillingPoNumber === poGroup.po_number || fulfillingPoNumber === "ALL";
                return (
                  <div key={poGroup.po_number} className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-xs hover:border-indigo-200 transition-all space-y-2.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-indigo-700">{poGroup.po_number}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            {poGroup.totalPendingQty.toLocaleString()} Units Pending
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 font-semibold mt-0.5">
                          🏭 {poGroup.supplier_name}
                          <span className="text-slate-400 font-normal ml-2">📅 {safeFormatDate(poGroup.po_date, "dd MMM yyyy")}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleFulfillSinglePO(poGroup)}
                          disabled={isFulfilling}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-7 gap-1 shadow-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isFulfilling ? "Receiving..." : "Quick Receive"}
                        </Button>
                      </div>
                    </div>

                    {/* Pending Material Line Items */}
                    <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs">
                      <span className="font-bold text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5">
                        Materials Awaiting Delivery ({poGroup.items.length} items):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {poGroup.items.map((it: any, iIdx: number) => (
                          <div key={iIdx} className="bg-white p-2 rounded border border-slate-200 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800 truncate pr-2">📦 {it.material_name}</span>
                            <div className="text-right shrink-0">
                              <span className="font-bold text-amber-700 font-mono">{it.pending_quantity.toLocaleString()} {it.uom}</span>
                              <span className="text-[10px] text-slate-400 block font-normal">of {it.po_quantity.toLocaleString()} {it.uom}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-between items-center pt-2 border-t text-xs">
                <span className="text-slate-500">
                  Showing {pendingPOsList.length} orders with pending balance.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold text-indigo-600 border-indigo-200"
                  onClick={() => {
                    setPendingPOsModalOpen(false);
                    navigate({ to: "/purchase" });
                  }}
                >
                  Manage in Purchase Table <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
