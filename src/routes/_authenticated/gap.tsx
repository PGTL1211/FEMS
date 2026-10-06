import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AlertTriangle, CheckCircle2, Search, Download, Edit2, Layers, ShieldCheck, TrendingDown, RefreshCw, Scale, Boxes } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { DEMO_MATERIALS } from "@/lib/demo-data";
import { getMaterialUnitWeight, formatSmartWeight } from "@/lib/material-weights";

export const Route = createFileRoute("/_authenticated/gap")({
  head: () => ({ meta: [{ title: "Gap Verification — FEMS" }] }),
  component: GapPage,
});

const INITIAL_DEMO_AUDIT_COUNTS: Record<string, { count: number; remark: string }> = {
  "PLC-80": { count: 70, remark: "Unrecorded line scrap (-10 MTR)" },
  "A1-40": { count: 410, remark: "Supplier bonus extra (+10 PCS)" },
  "A1-80": { count: 45, remark: "Assembly floor damage (-5 PCS)" },
  "P100": { count: 35, remark: "Physical audit deficit (-5 SET)" },
  "PJ5": { count: 25, remark: "Handling loss (-5 SET)" },
  "SS-PIPE": { count: 1350, remark: "Damage during transport (-50 MTR)" },
};

function GapPage() {
  const [q, setQ] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "gap" | "matched" | "shortage">("all");
  const [viewMode, setViewMode] = useState<"units" | "weight">("units");
  
  // Custom Physical Counts stored locally for audit adjustments
  const [auditCounts, setAuditCounts] = useState<Record<string, { count: number; remark: string }>>(() => {
    try {
      const saved = localStorage.getItem("idms_physical_audit_counts");
      return saved ? JSON.parse(saved) : INITIAL_DEMO_AUDIT_COUNTS;
    } catch {
      return INITIAL_DEMO_AUDIT_COUNTS;
    }
  });

  const [editItem, setEditItem] = useState<any | null>(null);
  const [editCount, setEditCount] = useState<string>("");
  const [editRemark, setEditRemark] = useState<string>("");

  useEffect(() => {
    try {
      localStorage.setItem("idms_physical_audit_counts", JSON.stringify(auditCounts));
    } catch {}
  }, [auditCounts]);

  const inv = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("inventory_view").select("*").order("name")).data ?? [],
  });

  const rawList = (inv.data && inv.data.length > 0) ? inv.data : DEMO_MATERIALS;

  const rows = useMemo(() => {
    return rawList.map((r) => {
      const unitWeight = getMaterialUnitWeight(r);
      const purchasedQty = Number(r.total_purchased ?? 0);
      const consumedQty = Number(r.total_consumed ?? 0);
      const systemExpected = purchasedQty - consumedQty;
      const key = r.material_id || r.code || r.id;
      const auditData = auditCounts[key] || auditCounts[r.code];
      const actual = auditData !== undefined ? auditData.count : Number(r.current_stock ?? 0);
      const remark = auditData?.remark ?? "";

      const gap = actual - systemExpected;
      const gapPct = systemExpected !== 0 ? (gap / systemExpected) * 100 : 0;

      let status: "matched" | "shortage" | "overstock" = "matched";
      if (gap < 0) status = "shortage";
      else if (gap > 0) status = "overstock";

      const purchasedWeight = purchasedQty * unitWeight;
      const consumedWeight = consumedQty * unitWeight;
      const systemExpectedWeight = systemExpected * unitWeight;
      const actualWeight = actual * unitWeight;
      const gapWeight = gap * unitWeight;

      return {
        ...r,
        key,
        unitWeight,
        purchasedQty,
        purchasedWeight,
        consumedQty,
        consumedWeight,
        systemExpected,
        systemExpectedWeight,
        actual,
        actualWeight,
        gap,
        gapWeight,
        gapPct,
        status,
        remark,
      };
    });
  }, [rawList, auditCounts]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchQ = (r.name ?? "").toLowerCase().includes(q.toLowerCase()) || (r.code ?? "").toLowerCase().includes(q.toLowerCase());
      if (!matchQ) return false;
      if (filterTab === "gap") return r.gap !== 0;
      if (filterTab === "matched") return r.gap === 0;
      if (filterTab === "shortage") return r.gap < 0;
      return true;
    });
  }, [rows, q, filterTab]);

  // Summary KPI Metrics
  const totalCounted = rows.length;
  const withGap = rows.filter((r) => r.gap !== 0);
  const shortageItems = rows.filter((r) => r.gap < 0);
  const matchedItems = rows.filter((r) => r.gap === 0);
  const accuracyPct = totalCounted > 0 ? (((totalCounted - withGap.length) / totalCounted) * 100).toFixed(1) : "100";

  const totalStockWeightKg = rows.reduce((s, r) => s + r.actualWeight, 0);
  const totalDiscrepancyWeightKg = withGap.reduce((s, r) => s + Math.abs(r.gapWeight), 0);
  const totalShortageWeightKg = shortageItems.reduce((s, r) => s + Math.abs(r.gapWeight), 0);

  const handleOpenEdit = (item: any) => {
    setEditItem(item);
    setEditCount(item.actual.toString());
    setEditRemark(item.remark || "");
  };

  const handleSaveAudit = () => {
    if (!editItem) return;
    const num = Number(editCount);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid non-negative count");
      return;
    }

    const itemKey = editItem.key || editItem.material_id || editItem.code;
    setAuditCounts((prev) => ({
      ...prev,
      [itemKey]: { count: num, remark: editRemark },
      [editItem.code]: { count: num, remark: editRemark },
    }));

    toast.success(`Audit count for "${editItem.name}" saved!`);
    setEditItem(null);
  };

  const handleResetAudits = () => {
    setAuditCounts(INITIAL_DEMO_AUDIT_COUNTS);
    localStorage.removeItem("idms_physical_audit_counts");
    toast.success("Reset audit counts to standard demo benchmark");
  };

  const exportCSV = () => {
    if (filteredRows.length === 0) return;
    const headers = [
      "Material Name",
      "Code",
      "UOM",
      "Unit Weight (kg)",
      "Purchased Qty",
      "Purchased Wt (kg)",
      "Consumed Qty",
      "Consumed Wt (kg)",
      "System Expected Qty",
      "System Expected Wt (kg)",
      "Actual Counted Qty",
      "Actual Counted Wt (kg)",
      "Variance Gap Qty",
      "Variance Gap Wt (kg)",
      "Gap %",
      "Status",
      "Audit Remarks",
    ];
    const csvLines = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.name ?? ""}"`,
          `"${r.code ?? ""}"`,
          `"${r.uom ?? ""}"`,
          r.unitWeight.toFixed(2),
          r.purchasedQty,
          Math.round(r.purchasedWeight),
          r.consumedQty,
          Math.round(r.consumedWeight),
          r.systemExpected,
          Math.round(r.systemExpectedWeight),
          r.actual,
          Math.round(r.actualWeight),
          r.gap,
          Math.round(r.gapWeight),
          `${r.gapPct.toFixed(1)}%`,
          `"${r.status.toUpperCase()}"`,
          `"${r.remark.replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `IDMS_Gap_Verification_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2.5 flex flex-col min-h-[calc(100vh-4.75rem)] pb-3">
      <PageHeader
        title="Material Gap Verification & Audit"
        description="Physical stock reconciliation. Compares theoretical ledger stock (Purchased − Consumed) with actual counted stock."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleResetAudits} title="Reset custom audit inputs" className="h-8 text-xs font-semibold">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset Audit
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredRows.length === 0} className="h-8 text-xs font-semibold">
              <Download className="h-3.5 w-3.5 mr-1" /> Export Audit CSV
            </Button>
          </div>
        }
      />

      {/* Dashboard-Styled Colored KPI Cards with Weights */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: TRACKED */}
        <div className="bg-[#a1e4fa] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">
            {viewMode === "weight" ? "TOTAL STOCK WEIGHT" : "TRACKED MATERIALS"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalStockWeightKg).value : totalCounted}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-slate-700">
                {formatSmartWeight(totalStockWeightKg).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">
            {viewMode === "weight" ? `${totalCounted} Materials Tracked` : `${formatSmartWeight(totalStockWeightKg).fullStr} Floor Stock`}
          </span>
        </div>

        {/* Card 2: DISCREPANCIES */}
        <div className="bg-[#fcd199] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">
            {viewMode === "weight" ? "DISCREPANCY WEIGHT" : "DISCREPANCIES"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalDiscrepancyWeightKg).value : withGap.length}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-slate-800">
                {formatSmartWeight(totalDiscrepancyWeightKg).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-slate-700 font-semibold truncate w-full">
            {viewMode === "weight" ? `${withGap.length} Items with Gap` : `${formatSmartWeight(totalDiscrepancyWeightKg).fullStr} Variance`}
          </span>
        </div>

        {/* Card 3: SHORTAGE */}
        <div className="bg-[#ff5252] text-white rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-100 truncate w-full">
            {viewMode === "weight" ? "SHORTAGE WEIGHT" : "SHORTAGE COUNT"}
          </span>
          <span className="text-xl sm:text-2xl font-black my-0.5 text-white truncate max-w-full block">
            {viewMode === "weight" ? formatSmartWeight(totalShortageWeightKg).value : shortageItems.length}
            {viewMode === "weight" && (
              <span className="text-xs font-bold uppercase ml-1 text-red-100">
                {formatSmartWeight(totalShortageWeightKg).unit}
              </span>
            )}
          </span>
          <span className="text-[9px] text-red-100 font-semibold truncate w-full">
            {viewMode === "weight" ? `${shortageItems.length} Deficit Materials` : `${formatSmartWeight(totalShortageWeightKg).fullStr} Deficit`}
          </span>
        </div>

        {/* Card 4: AUDIT ACCURACY */}
        <div className="bg-[#93ebec] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">AUDIT ACCURACY</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{accuracyPct}%</span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">
            {matchedItems.length} of {totalCounted} 100% Matched
          </span>
        </div>
      </div>

      {/* Toolbar & Filters with Weight View Switcher */}
      <div className="p-2 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2 shadow-2xs">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search material or item code…"
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
              title="Show quantities as primary Weight (kg / Ton)"
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
              title="Show quantities as primary Unit count (PCS/MTR/SET)"
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
              All ({totalCounted})
            </button>
            <button
              onClick={() => setFilterTab("gap")}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
                filterTab === "gap" ? "bg-white text-amber-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              With Gap ({withGap.length})
            </button>
            <button
              onClick={() => setFilterTab("matched")}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
                filterTab === "matched" ? "bg-white text-emerald-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Matched ({matchedItems.length})
            </button>
            <button
              onClick={() => setFilterTab("shortage")}
              className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
                filterTab === "shortage" ? "bg-white text-rose-600 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Shortage ({shortageItems.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Reconciliation Table */}
      <Card className="shadow-xs border border-slate-200 bg-white overflow-hidden rounded-lg flex-1 flex flex-col min-h-[calc(100vh-14.5rem)] mb-1">
        <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[calc(100vh-15.5rem)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-700 font-bold uppercase text-xs border-b shadow-2xs backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Material Name</th>
                <th className="text-right px-4 py-3">Purchased</th>
                <th className="text-right px-4 py-3">Consumed</th>
                <th className="text-right px-4 py-3">System Expected</th>
                <th className="text-right px-4 py-3">Actual Counted</th>
                <th className="text-right px-4 py-3">Variance Gap</th>
                <th className="text-right px-4 py-3">Gap %</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Audit Remarks</th>
                <th className="w-12 text-center px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r) => (
                <tr key={r.material_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span>{r.name}</span>
                    </div>
                    <span className="block font-mono text-[10px] text-slate-500 font-normal">
                      {r.code} ({r.uom}) • <span className="font-semibold text-indigo-600">{r.unitWeight.toFixed(2)} kg/{r.uom}</span>
                    </span>
                  </td>

                  {/* Purchased: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {formatSmartWeight(r.purchasedWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {r.purchasedQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-700">
                          {r.purchasedQty.toLocaleString()} {r.uom}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.purchasedWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Consumed: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {formatSmartWeight(r.consumedWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {r.consumedQty.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-700">
                          {r.consumedQty.toLocaleString()} {r.uom}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.consumedWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* System Expected: Dual View */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-bold text-indigo-700 text-xs sm:text-sm">
                          {formatSmartWeight(r.systemExpectedWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-indigo-500 font-semibold">
                          {r.systemExpected.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold text-indigo-700">
                          {r.systemExpected.toLocaleString()} {r.uom}
                        </div>
                        <div className="text-[10px] text-indigo-500 font-medium">
                          {formatSmartWeight(r.systemExpectedWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Actual Counted: Dual View */}
                  <td className="px-4 py-3 text-right bg-slate-50/50">
                    {viewMode === "weight" ? (
                      <>
                        <div className="font-black text-slate-900 text-xs sm:text-sm">
                          {formatSmartWeight(r.actualWeight).fullStr}
                        </div>
                        <div className="text-[10px] text-slate-600 font-semibold">
                          {r.actual.toLocaleString()} {r.uom}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-black text-slate-900">
                          {r.actual.toLocaleString()} {r.uom}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {formatSmartWeight(r.actualWeight).fullStr}
                        </div>
                      </>
                    )}
                  </td>

                  {/* Variance Gap: Dual View with Weight */}
                  <td className="px-4 py-3 text-right">
                    {viewMode === "weight" ? (
                      <>
                        <div className={`font-black text-xs sm:text-sm ${r.gap < 0 ? "text-rose-600" : r.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {r.gapWeight > 0
                            ? `+${formatSmartWeight(r.gapWeight).fullStr}`
                            : r.gapWeight < 0
                            ? `-${formatSmartWeight(Math.abs(r.gapWeight)).fullStr}`
                            : "0 kg"}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500">
                          {r.gap > 0 ? `+${r.gap.toLocaleString()} ${r.uom}` : `${r.gap.toLocaleString()} ${r.uom}`}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`font-bold ${r.gap < 0 ? "text-rose-600" : r.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {r.gap > 0 ? `+${r.gap.toLocaleString()} ${r.uom}` : `${r.gap.toLocaleString()} ${r.uom}`}
                        </div>
                        <div className={`text-[10px] font-semibold ${r.gap < 0 ? "text-rose-500" : r.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                          {r.gapWeight > 0
                            ? `+${formatSmartWeight(r.gapWeight).fullStr}`
                            : r.gapWeight < 0
                            ? `-${formatSmartWeight(Math.abs(r.gapWeight)).fullStr}`
                            : "0 kg"}
                        </div>
                      </>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right">
                    {r.gap < 0 && (
                      <span className="inline-block font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">
                        {r.gapPct.toFixed(1)}%
                      </span>
                    )}
                    {r.gap > 0 && (
                      <span className="inline-block font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                        +{r.gapPct.toFixed(1)}%
                      </span>
                    )}
                    {r.gap === 0 && (
                      <span className="font-semibold text-slate-400 text-xs">0.0%</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "matched" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Matched
                      </span>
                    )}
                    {r.status === "shortage" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                        <AlertTriangle className="h-3 w-3" /> Shortage
                      </span>
                    )}
                    {r.status === "overstock" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                        Overstock
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate" title={r.remark}>
                    {r.remark || <span className="text-slate-300 italic">No notes</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:bg-indigo-50" onClick={() => handleOpenEdit(r)} title="Audit Physical Count">
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400 font-medium">
                    No items match the reconciliation filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Physical Audit Dialog with Weight Reflection */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Record Physical Count — {editItem?.name}</DialogTitle>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>System Expected Stock:</span>
                  <span className="font-bold text-indigo-700">
                    {editItem.systemExpected.toLocaleString()} {editItem.uom} ({formatSmartWeight(editItem.systemExpectedWeight).fullStr})
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Standard Unit Weight:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {editItem.unitWeight.toFixed(2)} kg / {editItem.uom}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Item Code:</span>
                  <span className="font-mono text-slate-800">{editItem.code}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Actual Physical Counted Quantity ({editItem.uom})</Label>
                  <span className="text-xs font-bold text-indigo-600">
                    ≈ {formatSmartWeight((Number(editCount) || 0) * editItem.unitWeight).fullStr}
                  </span>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={editCount}
                  onChange={(e) => setEditCount(e.target.value)}
                  className="font-bold text-lg"
                />
                {editCount !== "" && !isNaN(Number(editCount)) && (
                  <div className="text-[11px] flex justify-between font-semibold pt-0.5">
                    <span className="text-slate-500">Resulting Variance Gap:</span>
                    <span className={Number(editCount) - editItem.systemExpected < 0 ? "text-rose-600" : Number(editCount) - editItem.systemExpected > 0 ? "text-amber-600" : "text-emerald-600"}>
                      {(Number(editCount) - editItem.systemExpected > 0 ? "+" : "")}
                      {(Number(editCount) - editItem.systemExpected).toLocaleString()} {editItem.uom} (
                      {formatSmartWeight((Number(editCount) - editItem.systemExpected) * editItem.unitWeight).fullStr}
                      )
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Audit Remarks / Discrepancy Reason</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. Damage during handling / Unrecorded scrap"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button onClick={handleSaveAudit}>Save Physical Audit</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


