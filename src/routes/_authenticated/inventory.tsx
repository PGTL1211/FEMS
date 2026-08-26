import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "./index";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { Search, Download, Boxes, TrendingDown, ShoppingCart, AlertTriangle, Layers, Info } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

import { DEMO_MATERIALS } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — FEMS" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const [q, setQ] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "healthy" | "low" | "critical">("all");
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  const inv = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("inventory_view").select("*").order("name")).data ?? [],
  });

  const rawList = (inv.data && inv.data.length > 0) ? inv.data : DEMO_MATERIALS;

  // Metrics
  const totalItems = rawList.length;
  const totalPurchased = rawList.reduce((s, r) => s + Number(r.total_purchased ?? 0), 0);
  const totalConsumed = rawList.reduce((s, r) => s + Number(r.total_consumed ?? 0), 0);
  const totalCurrentStock = rawList.reduce((s, r) => s + Number(r.current_stock ?? 0), 0);
  const lowCount = rawList.filter((r) => r.status === "low").length;
  const criticalCount = rawList.filter((r) => r.status === "critical").length;
  const healthyCount = rawList.filter((r) => r.status === "healthy").length;

  const rows = useMemo(() => {
    return rawList.filter((r) => {
      const matchQuery = (r.name ?? "").toLowerCase().includes(q.toLowerCase()) || (r.code ?? "").toLowerCase().includes(q.toLowerCase());
      if (!matchQuery) return false;
      if (filterTab === "healthy") return r.status === "healthy";
      if (filterTab === "low") return r.status === "low";
      if (filterTab === "critical") return r.status === "critical";
      return true;
    });
  }, [rawList, q, filterTab]);

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = ["Material Name", "Code", "UOM", "Purchased", "Consumed", "Current Stock", "Minimum Stock", "Status"];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.name ?? ""}"`,
          `"${r.code ?? ""}"`,
          `"${r.uom ?? ""}"`,
          r.total_purchased ?? 0,
          r.total_consumed ?? 0,
          r.current_stock ?? 0,
          r.minimum_stock ?? 0,
          `"${r.status ?? ""}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `IDMS_Inventory_Stock_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2.5 flex flex-col min-h-[calc(100vh-4.75rem)] pb-3">
      <PageHeader
        title="Inventory Stock Master"
        description="Real-time stock ledger. Automatically updated on every purchase invoice and fabrication entry."
        actions={
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0} className="h-8 text-xs font-semibold">
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        }
      />

      {/* Dashboard-Styled Colored KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* Card 1: CATALOG */}
        <div className="bg-[#a1e4fa] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">CATALOG</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{totalItems}</span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">Materials Tracked</span>
        </div>

        {/* Card 2: PURCHASED */}
        <div className="bg-[#fbaea7] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">PURCHASED</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{totalPurchased.toLocaleString()}</span>
          <span className="text-[9px] text-slate-700 font-medium truncate w-full">Material Inward</span>
        </div>

        {/* Card 3: CONSUMED */}
        <div className="bg-[#93ebec] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">CONSUMED</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{totalConsumed.toLocaleString()}</span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">Used in Production</span>
        </div>

        {/* Card 4: FLOOR STOCK */}
        <div className="bg-[#d7b0ea] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">FLOOR STOCK</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 text-indigo-900 truncate max-w-full block">{totalCurrentStock.toLocaleString()}</span>
          <span className="text-[9px] text-slate-700 font-semibold truncate w-full">Net Balance</span>
        </div>

        {/* Card 5: LOW ALERT */}
        <div className="bg-[#fcd199] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">LOW ALERT</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{lowCount}</span>
          <span className="text-[9px] text-slate-700 font-semibold truncate w-full">Below Minimum</span>
        </div>

        {/* Card 6: CRITICAL */}
        <div className="bg-[#ff5252] text-white rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-100 truncate w-full">CRITICAL</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 text-white truncate max-w-full block">{criticalCount}</span>
          <span className="text-[9px] text-red-100 font-semibold truncate w-full">&lt; 50% Threshold</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-2 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2 shadow-2xs">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search material name or code…"
            className="pl-8 h-8 bg-slate-50 border-slate-200 text-xs"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
              filterTab === "all" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({totalItems})
          </button>
          <button
            onClick={() => setFilterTab("healthy")}
            className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
              filterTab === "healthy" ? "bg-white text-emerald-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Healthy ({healthyCount})
          </button>
          <button
            onClick={() => setFilterTab("low")}
            className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
              filterTab === "low" ? "bg-white text-amber-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Low Alert ({lowCount})
          </button>
          <button
            onClick={() => setFilterTab("critical")}
            className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
              filterTab === "critical" ? "bg-white text-rose-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Critical ({criticalCount})
          </button>
        </div>
      </div>

      {/* Stock Table */}
      <Card className="shadow-xs border border-slate-200 bg-white dark:bg-slate-900 overflow-hidden rounded-lg flex-1 flex flex-col min-h-[calc(100vh-14.5rem)] mb-1">
        <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-15.5rem)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold uppercase text-xs border-b shadow-2xs backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Material Name</th>
                <th className="text-left px-4 py-3">Item Code</th>
                <th className="text-left px-4 py-3">UOM</th>
                <th className="text-right px-4 py-3">Total Purchased</th>
                <th className="text-right px-4 py-3">Total Consumed</th>
                <th className="text-right px-4 py-3">Current Stock</th>
                <th className="text-right px-4 py-3">Min Threshold</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.material_id}
                  onClick={() => setSelectedMaterial(r)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.code}</td>
                  <td className="px-4 py-3 text-slate-600 font-medium">{r.uom}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-700">
                    {Number(r.total_purchased ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700">
                    {Number(r.total_consumed ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-slate-900 text-base">
                    {Number(r.current_stock ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 font-medium">
                    {Number(r.minimum_stock ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <Info className="h-4 w-4 hover:text-indigo-600" />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400 font-medium">
                    No matching materials found in stock ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stock Details Drawer */}
      <Sheet open={!!selectedMaterial} onOpenChange={(open) => !open && setSelectedMaterial(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-900">{selectedMaterial?.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs text-indigo-600">
              Code: {selectedMaterial?.code} | UOM: {selectedMaterial?.uom}
            </SheetDescription>
          </SheetHeader>

          {selectedMaterial && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <span className="text-xs text-slate-500 font-semibold block">Total Purchased</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {Number(selectedMaterial.total_purchased ?? 0).toLocaleString()} {selectedMaterial.uom}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <span className="text-xs text-slate-500 font-semibold block">Total Consumed</span>
                  <span className="text-xl font-bold text-amber-600">
                    {Number(selectedMaterial.total_consumed ?? 0).toLocaleString()} {selectedMaterial.uom}
                  </span>
                </div>
              </div>

              <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-800 font-bold uppercase tracking-wider block">Current Stock</span>
                  <span className="text-3xl font-black text-indigo-950">
                    {Number(selectedMaterial.current_stock ?? 0).toLocaleString()}
                  </span>
                </div>
                <StatusBadge status={selectedMaterial.status} />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500 font-medium">Minimum Threshold:</span>
                  <span className="font-bold text-slate-800">{Number(selectedMaterial.minimum_stock ?? 0).toLocaleString()} {selectedMaterial.uom}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500 font-medium">Reorder Recommendation:</span>
                  <span className="font-bold text-slate-800">
                    {Number(selectedMaterial.current_stock ?? 0) < Number(selectedMaterial.minimum_stock ?? 0)
                      ? `${(Number(selectedMaterial.minimum_stock ?? 0) * 2 - Number(selectedMaterial.current_stock ?? 0)).toLocaleString()} ${selectedMaterial.uom} Order Needed`
                      : "Stock Level OK"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

