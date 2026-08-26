import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AlertTriangle, CheckCircle2, Search, Download, Edit2, Layers, ShieldCheck, TrendingDown, RefreshCw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import { DEMO_MATERIALS } from "@/lib/demo-data";

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
      const systemExpected = Number(r.total_purchased ?? 0) - Number(r.total_consumed ?? 0);
      const key = r.material_id || r.code || r.id;
      const auditData = auditCounts[key] || auditCounts[r.code];
      const actual = auditData !== undefined ? auditData.count : Number(r.current_stock ?? 0);
      const remark = auditData?.remark ?? "";

      const gap = actual - systemExpected;
      const gapPct = systemExpected !== 0 ? (gap / systemExpected) * 100 : 0;

      let status: "matched" | "shortage" | "overstock" = "matched";
      if (gap < 0) status = "shortage";
      else if (gap > 0) status = "overstock";

      return {
        ...r,
        key,
        systemExpected,
        actual,
        gap,
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
    const headers = ["Material Name", "Code", "UOM", "Purchased", "Consumed", "System Expected", "Actual Counted", "Variance Gap", "Gap %", "Status", "Audit Remarks"];
    const csvLines = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          `"${r.name ?? ""}"`,
          `"${r.code ?? ""}"`,
          `"${r.uom ?? ""}"`,
          r.total_purchased ?? 0,
          r.total_consumed ?? 0,
          r.systemExpected,
          r.actual,
          r.gap,
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

      {/* Dashboard-Styled Colored KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: TRACKED */}
        <div className="bg-[#a1e4fa] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">TRACKED MATERIALS</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{totalCounted}</span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">Ledger Items</span>
        </div>

        {/* Card 2: DISCREPANCIES */}
        <div className="bg-[#fcd199] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-800 truncate w-full">DISCREPANCIES</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{withGap.length}</span>
          <span className="text-[9px] text-slate-700 font-semibold truncate w-full">Variance Count</span>
        </div>

        {/* Card 3: SHORTAGE */}
        <div className="bg-[#ff5252] text-white rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-100 truncate w-full">SHORTAGE COUNT</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 text-white truncate max-w-full block">{shortageItems.length}</span>
          <span className="text-[9px] text-red-100 font-semibold truncate w-full">Below System Log</span>
        </div>

        {/* Card 4: AUDIT ACCURACY */}
        <div className="bg-[#93ebec] text-slate-900 rounded-xl p-2.5 shadow-sm flex flex-col justify-between items-center text-center overflow-hidden">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 truncate w-full">AUDIT ACCURACY</span>
          <span className="text-xl sm:text-2xl font-black my-0.5 truncate max-w-full block">{accuracyPct}%</span>
          <span className="text-[9px] text-slate-600 font-semibold truncate w-full">Physical Accuracy</span>
        </div>
      </div>

      {/* Toolbar & Filters */}
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

        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md w-full sm:w-auto overflow-x-auto">
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
                    {r.name}
                    <span className="block font-mono text-[10px] text-slate-500 font-normal">{r.code} ({r.uom})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{Number(r.total_purchased ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{Number(r.total_consumed ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">{r.systemExpected.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900 bg-slate-50/50">{r.actual.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right font-bold ${r.gap < 0 ? "text-rose-600" : r.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {r.gap > 0 ? `+${r.gap.toLocaleString()}` : r.gap.toLocaleString()}
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

      {/* Edit Physical Audit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Record Physical Count — {editItem?.name}</DialogTitle>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>System Expected Stock:</span>
                  <span className="font-bold text-indigo-700">{editItem.systemExpected.toLocaleString()} {editItem.uom}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Item Code:</span>
                  <span className="font-mono text-slate-800">{editItem.code}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Actual Physical Counted Quantity ({editItem.uom})</Label>
                <Input
                  type="number"
                  min={0}
                  value={editCount}
                  onChange={(e) => setEditCount(e.target.value)}
                  className="font-bold text-lg"
                />
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

