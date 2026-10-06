import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "./index";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { Search, Download, Boxes, TrendingDown, ShoppingCart, AlertTriangle, Layers, Info, Scale } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

import { DEMO_MATERIALS } from "@/lib/demo-data";
import { getMaterialUnitWeight, formatSmartWeight } from "@/lib/material-weights";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — FEMS" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const [q, setQ] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "healthy" | "low" | "critical">("all");
  const [viewMode, setViewMode] = useState<"units" | "weight">("units");
  const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);

  const inv = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("inventory_view").select("*").order("name")).data ?? [],
  });

  const rawList = (inv.data && inv.data.length > 0) ? inv.data : DEMO_MATERIALS;

  const itemsWithWeight = useMemo(() => {
    return rawList.map((r) => {
      const unitWeight = getMaterialUnitWeight(r);
      const purchasedQty = Number(r.total_purchased ?? 0);
      const consumedQty = Number(r.total_consumed ?? 0);
      const stockQty = Number(r.current_stock ?? 0);
      const minQty = Number(r.minimum_stock ?? 0);

      const purchasedWeight = purchasedQty * unitWeight;
      const consumedWeight = consumedQty * unitWeight;
      const stockWeight = stockQty * unitWeight;
      const minStockWeight = minQty * unitWeight;

      return {
        ...r,
        unitWeight,
        purchasedQty,
        purchasedWeight,
        consumedQty,
        consumedWeight,
        stockQty,
        stockWeight,
        minQty,
        minStockWeight,
      };
    });
  }, [rawList]);

  // Summary Metrics
  const totalItems = itemsWithWeight.length;
  const totalPurchased = itemsWithWeight.reduce((s, r) => s + r.purchasedQty, 0);
  const totalConsumed = itemsWithWeight.reduce((s, r) => s + r.consumedQty, 0);
  const totalCurrentStock = itemsWithWeight.reduce((s, r) => s + r.stockQty, 0);

  const totalPurchasedWeight = itemsWithWeight.reduce((s, r) => s + r.purchasedWeight, 0);
  const totalConsumedWeight = itemsWithWeight.reduce((s, r) => s + r.consumedWeight, 0);
  const totalCurrentStockWeight = itemsWithWeight.reduce((s, r) => s + r.stockWeight, 0);

  const lowCount = itemsWithWeight.filter((r) => r.status === "low").length;
  const criticalCount = itemsWithWeight.filter((r) => r.status === "critical").length;
  const healthyCount = itemsWithWeight.filter((r) => r.status === "healthy").length;
  const totalLowStockWeight = itemsWithWeight
    .filter((r) => r.status === "low" || r.status === "critical")
    .reduce((s, r) => s + r.stockWeight, 0);

  const rows = useMemo(() => {
    return itemsWithWeight.filter((r) => {
      const matchQuery = (r.name ?? "").toLowerCase().includes(q.toLowerCase()) || (r.code ?? "").toLowerCase().includes(q.toLowerCase());
      if (!matchQuery) return false;
      if (filterTab === "healthy") return r.status === "healthy";
      if (filterTab === "low") return r.status === "low";
      if (filterTab === "critical") return r.status === "critical";
      return true;
    });
  }, [itemsWithWeight, q, filterTab]);

  const exportCSV = () => {
    if (rows.length === 0) return;
    const headers = [
      "Material Name",
      "Code",
      "UOM",
      "Unit Weight (kg)",
      "Purchased Qty",
      "Purchased Wt (kg)",
      "Consumed Qty",
      "Consumed Wt (kg)",
      "Current Stock Qty",
      "Current Stock Wt (kg)",
      "Minimum Stock Qty",
      "Minimum Stock Wt (kg)",
      "Status",
    ];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.name ?? ""}"`,
          `"${r.code ?? ""}"`,
          `"${r.uom ?? ""}"`,
          r.unitWeight.toFixed(2),
          r.purchasedQty,
          Math.round(r.purchasedWeight),
          r.consumedQty,
          Math.round(r.consumedWeight),
          r.stockQty,
          Math.round(r.stockWeight),
          r.minQty,
          Math.round(r.minStockWeight),
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
        description="Real-time stock ledger with automatic weight conversion. Automatically updated on every purchase invoice and fabrication entry."
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
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">
            {viewMode === "weight" ? "PURCHASE WEIGHT" : "PURCHASED"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalPurchasedWeight).value : totalPurchased.toLocaleString()}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-slate-800">
                {formatSmartWeight(totalPurchasedWeight).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-slate-700 font-medium truncate w-full">
            {viewMode === "weight" ? `${totalPurchased.toLocaleString()} Units Inward` : formatSmartWeight(totalPurchasedWeight).fullStr}
          </span>
        </div>

        {/* Card 3: CONSUMED */}
        <div className="bg-[#93ebec] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">
            {viewMode === "weight" ? "CONSUMED WEIGHT" : "CONSUMED"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalConsumedWeight).value : totalConsumed.toLocaleString()}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-slate-700">
                {formatSmartWeight(totalConsumedWeight).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">
            {viewMode === "weight" ? `${totalConsumed.toLocaleString()} Units Used` : formatSmartWeight(totalConsumedWeight).fullStr}
          </span>
        </div>

        {/* Card 4: FLOOR STOCK */}
        <div className="bg-[#d7b0ea] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">
            {viewMode === "weight" ? "STOCK WEIGHT" : "FLOOR STOCK"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 text-indigo-950 truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalCurrentStockWeight).value : totalCurrentStock.toLocaleString()}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-indigo-900">
                {formatSmartWeight(totalCurrentStockWeight).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-slate-700 font-semibold truncate w-full">
            {viewMode === "weight" ? `${totalCurrentStock.toLocaleString()} Net Units` : formatSmartWeight(totalCurrentStockWeight).fullStr}
          </span>
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
          <span className="text-[9px] text-red-100 font-semibold truncate w-full">
            {formatSmartWeight(totalLowStockWeight).fullStr} At Risk
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar with Weight View Switcher */}
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

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          {/* Dual Display Toggle: Weight View vs Unit View */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("weight")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
                viewMode === "weight"
                  ? "bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
              title="Show quantities in Weight (kg / Ton)"
            >
              <Scale className="h-3 w-3" />
              Weight View (kg/Ton)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("units")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 transition-all ${
                viewMode === "units"
                  ? "bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
              }`}
              title="Show quantities in Unit quantity (Qty)"
            >
              <Boxes className="h-3 w-3" />
              Unit View (Qty)
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md overflow-x-auto">
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
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <div>{r.name}</div>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Unit Weight: <span className="font-semibold text-indigo-600">{r.unitWeight.toFixed(2)} kg/{r.uom}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.code}</td>
                  <td className="px-4 py-3 text-slate-600 font-medium">{r.uom}</td>

                  {/* Total Purchased: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-bold text-emerald-700 text-xs sm:text-sm">
                          {formatSmartWeight(r.purchasedWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {r.purchasedQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-emerald-700">
                          {r.purchasedQty.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.purchasedWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Total Consumed: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-bold text-amber-700 text-xs sm:text-sm">
                          {formatSmartWeight(r.consumedWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {r.consumedQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium text-amber-700">
                          {r.consumedQty.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.consumedWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Current Stock: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-black text-slate-900 text-sm sm:text-base">
                          {formatSmartWeight(r.stockWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-600 font-bold">
                          {r.stockQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-black text-slate-900 text-base">
                          {r.stockQty.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.stockWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Min Threshold: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-medium text-slate-700 text-xs">
                          {formatSmartWeight(r.minStockWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.minQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-slate-500 font-medium">
                          {r.minQty.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {formatSmartWeight(r.minStockWeight).fullStr}
                        </div>
                      </>
                    )}
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

      {/* Stock Details Drawer with Weight Inspection */}
      <Sheet open={!!selectedMaterial} onOpenChange={(open) => !open && setSelectedMaterial(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold text-slate-900">{selectedMaterial?.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs text-indigo-600">
              Code: {selectedMaterial?.code} | UOM: {selectedMaterial?.uom} | Unit Weight: {selectedMaterial?.unitWeight?.toFixed(2)} kg
            </SheetDescription>
          </SheetHeader>

          {selectedMaterial && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <span className="text-xs text-slate-500 font-semibold block">Total Purchased</span>
                  <span className="text-lg font-bold text-emerald-600 block">
                    {Number(selectedMaterial.purchasedQty ?? 0).toLocaleString()} {selectedMaterial.uom}
                  </span>
                  <span className="text-xs text-slate-600 font-medium block">
                    ≈ {formatSmartWeight(selectedMaterial.purchasedWeight ?? 0).fullStr}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <span className="text-xs text-slate-500 font-semibold block">Total Consumed</span>
                  <span className="text-lg font-bold text-amber-600 block">
                    {Number(selectedMaterial.consumedQty ?? 0).toLocaleString()} {selectedMaterial.uom}
                  </span>
                  <span className="text-xs text-slate-600 font-medium block">
                    ≈ {formatSmartWeight(selectedMaterial.consumedWeight ?? 0).fullStr}
                  </span>
                </div>
              </div>

              <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-indigo-800 font-bold uppercase tracking-wider block">Current Stock</span>
                  <span className="text-2xl sm:text-3xl font-black text-indigo-950 block">
                    {Number(selectedMaterial.stockQty ?? 0).toLocaleString()} {selectedMaterial.uom}
                  </span>
                  <span className="text-xs font-bold text-indigo-700">
                    Total Weight: {formatSmartWeight(selectedMaterial.stockWeight ?? 0).fullStr}
                  </span>
                </div>
                <StatusBadge status={selectedMaterial.status} />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500 font-medium">Standard Unit Weight:</span>
                  <span className="font-bold text-slate-800">{selectedMaterial.unitWeight?.toFixed(2)} kg / {selectedMaterial.uom}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500 font-medium">Minimum Threshold:</span>
                  <span className="font-bold text-slate-800">
                    {Number(selectedMaterial.minQty ?? 0).toLocaleString()} {selectedMaterial.uom} ({formatSmartWeight(selectedMaterial.minStockWeight ?? 0).fullStr})
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-slate-500 font-medium">Reorder Recommendation:</span>
                  <span className="font-bold text-slate-800">
                    {Number(selectedMaterial.stockQty ?? 0) < Number(selectedMaterial.minQty ?? 0)
                      ? `${(Number(selectedMaterial.minQty ?? 0) * 2 - Number(selectedMaterial.stockQty ?? 0)).toLocaleString()} ${selectedMaterial.uom} Order Needed`
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


