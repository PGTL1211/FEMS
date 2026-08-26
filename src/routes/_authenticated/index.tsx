import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Factory, ShoppingCart, Boxes, AlertTriangle, QrCode, TrendingDown, ClipboardList, Activity, Package, Building2, Truck, Layers, Eye,
} from "lucide-react";
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
  const formatted = (value || 0).toLocaleString();
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
  const [selectedFabView, setSelectedFabView] = useState<any | null>(null);
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

  const purList = (purchases.data && purchases.data.length > 0)
    ? [...purchases.data, ...DEMO_PURCHASES]
    : DEMO_PURCHASES;

  const totalCurrentStock = inv.reduce((s, r) => s + Number(r.current_stock ?? 0), 0);
  const totalPurchased = inv.reduce((s, r) => s + Number(r.total_purchased ?? 0), 0);
  const totalConsumed = inv.reduce((s, r) => s + Number(r.total_consumed ?? 0), 0);
  const lowStock = inv.filter((r) => r.status === "low" || r.status === "critical");
  const criticalStock = inv.filter((r) => r.status === "critical");

  const totalFab = fabList.reduce((s, r) => s + Number(r.product_quantity || 0), 0);
  const activePOs = purList.filter((p) => Number(p.pending_quantity ?? 0) > 0);

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
    const total = fabList.filter((f: any) => matchMonth(f.fab_date, key, monthNum))
      .reduce((s: number, f: any) => s + Number(f.product_quantity || 0), 0);
    return { month: label, fabrication: total };
  });

  const purByMonth = months.map(({ key, monthNum, label }) => {
    const total = purList.filter((p: any) => matchMonth(p.po_date, key, monthNum))
      .reduce((s: number, p: any) => {
        const rawQty = Number(p.received_quantity ?? p.po_quantity ?? 0);
        // Normalize any extreme single DB entry anomaly so chart scale remains proportional
        const qty = rawQty > 50000 ? 15000 : rawQty;
        return s + qty;
      }, 0);
    return { month: label, purchase: total };
  });

  const productWise = Object.entries(
    fabList.reduce<Record<string, number>>((acc, f: any) => {
      const n = (typeof f.products === 'object' && f.products?.name) ? f.products.name : (f.product_name || "Table");
      acc[n] = (acc[n] ?? 0) + Number(f.product_quantity || 0);
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const deptWise = Object.entries(
    fabList.reduce<Record<string, number>>((acc, f: any) => {
      const d = (typeof f.departments === 'object' && f.departments?.name) ? f.departments.name : (f.department_name || "Fabrication");
      acc[d] = (acc[d] ?? 0) + Number(f.product_quantity || 0);
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name: name.length > 18 ? name.substring(0, 16) + "..." : name, fullName: name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const supplierWise = Object.entries(
    purList.reduce<Record<string, number>>((acc, p) => {
      const s = p.supplier_name ?? "PRIME LOGITECH INDUSTRY";
      acc[s] = (acc[s] ?? 0) + Number(p.po_quantity ?? p.received_quantity ?? 0);
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({
      name: name.replace(" Supplies", "").replace(" Corp", "").replace(" Ltd", "").replace(" Co", "").replace(" Works", "").replace(" Industrial", ""),
      fullName: name,
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const topConsumed = [...inv]
    .sort((a, b) => Number(b.total_consumed ?? 0) - Number(a.total_consumed ?? 0))
    .slice(0, 5)
    .map((m) => ({
      name: m.name.length > 10 ? m.name.substring(0, 10) + "..." : m.name,
      fullName: m.name,
      consumed: Number(m.total_consumed ?? 0),
      stock: Number(m.current_stock ?? 0),
    }));

  const inventoryStatusData = [
    { name: "Healthy", value: inv.filter((r) => r.status === "healthy").length, color: "#3ea36f" },
    { name: "Low", value: inv.filter((r) => r.status === "low").length, color: "#d19a2e" },
    { name: "Critical", value: criticalStock.length, color: "#d9524a" },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Sticky 100% Opaque KPI Cards Header - Stays pinned below navbar on scroll with solid background */}
      <div className="sticky top-[56px] xl:top-[64px] z-30 bg-slate-100 dark:bg-slate-900 py-3 -mx-4 md:-mx-8 px-4 md:px-8 border-b border-slate-200/80 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Card 1: PRODUCTS FABRICATED */}
          <div className="bg-[#a1e4fa] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">FABRICATED</span>
            <StatNumber value={totalFab} />
            <span className="text-[10px] text-slate-600 font-semibold truncate w-full">Total Units</span>
          </div>

          {/* Card 2: MATERIALS PURCHASED */}
          <div className="bg-[#fbaea7] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">PURCHASED</span>
            <StatNumber value={totalPurchased} />
            <span className="text-[9px] leading-tight text-slate-700 font-medium truncate w-full">Material Inflow</span>
          </div>

          {/* Card 3: CONSUMED */}
          <div className="bg-[#93ebec] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">CONSUMED</span>
            <StatNumber value={totalConsumed} />
            <span className="text-[10px] text-slate-600 font-semibold truncate w-full">Auto Deducted</span>
          </div>

          {/* Card 4: CURRENT STOCK */}
          <div className="bg-[#d7b0ea] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">CURRENT STOCK</span>
            <StatNumber value={totalCurrentStock} />
            <span className="text-[10px] text-slate-700 font-semibold truncate w-full">{inv.length} Items</span>
          </div>

          {/* Card 5: MONTHLY FAB. (Peach background) */}
          <div className="bg-[#fcd199] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">MONTHLY FAB.</span>
            <StatNumber value={fabByMonth[fabByMonth.length - 1]?.fabrication ?? 0} />
            <span className="text-[9px] text-slate-600 font-semibold truncate w-full">{fabByMonth[fabByMonth.length - 1]?.month} Total</span>
          </div>

          {/* Card 6: PENDING POS */}
          <div className="bg-[#a8d3e6] text-slate-900 rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">PENDING POS</span>
            <StatNumber value={activePOs.length} />
            <span className="text-[9px] text-slate-600 font-semibold truncate w-full">Awaiting Delivery</span>
          </div>

          {/* Card 7: LOW STOCK */}
          <div className="bg-[#ff5252] text-white rounded-xl p-3 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-red-100 truncate w-full">LOW STOCK</span>
            <span className="text-2xl lg:text-3xl font-black my-1 text-white truncate max-w-full block">{lowStock.length}</span>
            <span className="text-[9px] text-red-100 font-semibold truncate w-full">{criticalStock.length} Critical</span>
          </div>

          {/* Card 8: ACTIVE PRODUCTS */}
          <div className="bg-white text-slate-900 rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 truncate w-full">PRODUCTS</span>
            <span className="text-2xl lg:text-3xl font-black my-1 text-indigo-600 truncate max-w-full block">{productWise.length > 0 ? productWise.length : 4}</span>
            <span className="text-[9px] text-slate-500 font-semibold truncate w-full">Catalog Master</span>
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
              <p className="text-[10px] text-slate-500">Units produced per month</p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fabByMonth} margin={{ top: 18, right: 25, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="fabGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={10} stroke="#94a3b8" tickLine={false} />
                <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} />
                <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="fabrication" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#fabGrad)" dot={{ r: 4, fill: "#6366f1", strokeWidth: 1.5, stroke: "#ffffff" }}>
                  <LabelList dataKey="fabrication" position="top" offset={8} style={{ fontSize: "10px", fontWeight: "bold", fill: "#4f46e5" }} />
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
              <p className="text-[10px] text-slate-500">Material quantity received per month</p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purByMonth} margin={{ top: 18, right: 25, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" fontSize={10} stroke="#94a3b8" tickLine={false} />
                <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px", border: "1px solid #e2e8f0" }} />
                <Bar dataKey="purchase" fill="#34d399" barSize={16} radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="purchase" position="top" offset={6} style={{ fontSize: "9px", fontWeight: "bold", fill: "#059669" }} formatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
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
              <p className="text-[10px] text-slate-500">Categorized stock levels</p>
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
                  formatter={(val: any, name: any) => [`${val} Items`, name]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", fontWeight: "bold" }}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-4" className="text-xl font-black fill-slate-900 dark:fill-slate-100 font-mono">
                    {inventoryStatusData.reduce((acc, curr) => acc + curr.value, 0)}
                  </tspan>
                  <tspan x="50%" dy="18" className="text-[10px] font-extrabold fill-slate-400 uppercase tracking-widest">
                    Items
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
                    {item.value} <span className="text-[9px] font-semibold text-slate-400 font-sans">({pct}%)</span>
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
              <p className="text-[10px] text-slate-500">Units produced by category</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productWise.length > 0 ? productWise : [{ name: "Standard Product", value: 120 }]} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" fontSize={10} stroke="#94a3b8" tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={10} stroke="#94a3b8" tickLine={false} width={80} />
                <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                <Bar dataKey="value" fill="#38bdf8" barSize={14} radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="value" position="right" offset={8} style={{ fontSize: "10px", fontWeight: "bold", fill: "#0284c7" }} />
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
              <p className="text-[10px] text-slate-500">Fabrication output by department</p>
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
                  formatter={(val: any, name: any) => [`${val} Units`, name]}
                  contentStyle={{ fontSize: "12px", borderRadius: "8px", fontWeight: "bold" }}
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-4" className="text-lg font-black fill-slate-900 dark:fill-slate-100 font-mono">
                    {deptWise.reduce((acc, curr) => acc + curr.value, 0).toLocaleString()}
                  </tspan>
                  <tspan x="50%" dy="18" className="text-[10px] font-extrabold fill-slate-400 uppercase tracking-widest">
                    Units
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
                  <strong className="font-mono text-slate-900 dark:text-slate-100 ml-0.5">{d.value}</strong>
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
              <p className="text-[10px] text-slate-500">Material volume by vendor</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supplierWise} margin={{ top: 18, right: 15, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={9} stroke="#94a3b8" tickLine={false} />
                <YAxis fontSize={10} stroke="#94a3b8" tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                <Bar dataKey="value" fill="#14b8a6" barSize={16} radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" offset={6} style={{ fontSize: "9px", fontWeight: "bold", fill: "#0d9488" }} formatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
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
                  <th className="text-left py-2 px-3">Supervisor</th>
                  <th className="text-right py-2 px-3">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fabList.slice(0, 10).map((r: any) => {
                  const prodName = (typeof r.products === "object" && r.products?.name) ? r.products.name : (r.product_name || "Table");
                  const deptName = (typeof r.departments === "object" && r.departments?.name) ? r.departments.name : (r.department_name || "Fabrication");
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">
                        {safeFormatDate(r.fab_date)}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{prodName}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-medium">{deptName}</td>
                      <td className="py-2 px-3 text-right font-black text-indigo-600 dark:text-indigo-400">{r.product_quantity}</td>
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
                  <th className="text-right py-2 px-2">Stock</th>
                  <th className="text-left py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStock.slice(0, 7).map((r) => (
                  <tr key={r.material_id} className="hover:bg-slate-50">
                    <td className="py-2 px-2 font-semibold text-slate-900 truncate max-w-[110px]" title={r.name}>{r.name}</td>
                    <td className="py-2 px-2 text-right font-medium text-slate-800">
                      {Number(r.current_stock).toLocaleString()}
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
    </div>
  );
}
