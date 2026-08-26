import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { safeFormatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — FEMS" }] }),
  component: ReportsPage,
});

function downloadCSV(name: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${format(new Date(), "yyyyMMdd")}.csv`;
  a.click();
}

function ReportsPage() {
  const fabrications = useQuery({
    queryKey: ["fabrications-report"],
    queryFn: async () => (await supabase.from("fabrications")
      .select("fab_date, product_quantity, supervisor_name, products(name), departments(name)")
      .order("fab_date", { ascending: false })).data ?? [],
  });
  const purchases = useQuery({
    queryKey: ["po-summary"],
    queryFn: async () => (await supabase.from("po_summary_view").select("*").order("po_date", { ascending: false })).data ?? [],
  });
  const inv = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => (await supabase.from("inventory_view").select("*").order("name")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Export production, purchasing, and inventory data." />

      <Tabs defaultValue="fabrication">
        <TabsList>
          <TabsTrigger value="fabrication">Fabrication</TabsTrigger>
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="fabrication">
          <Card className="p-4 shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => downloadCSV("fabrication-report",
                ["Date", "Product", "Quantity", "Department", "Handover To"],
                (fabrications.data ?? []).map((r) => [r.fab_date, (r.products as { name?: string } | null)?.name ?? "", r.product_quantity, (r.departments as { name?: string } | null)?.name ?? "", r.supervisor_name ?? ""])
              )}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            </div>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
                  <tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Product</th><th className="text-right px-4 py-3">Qty</th><th className="text-left px-4 py-3">Dept.</th><th className="text-left px-4 py-3">Handover To</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(fabrications.data ?? []).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{safeFormatDate(r.fab_date)}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{(r.products as { name?: string } | null)?.name}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{r.product_quantity}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{(r.departments as { name?: string } | null)?.name ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{r.supervisor_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="purchase">
          <Card className="p-4 shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => downloadCSV("purchase-report",
                ["Date", "PO Number", "Supplier", "Material", "Ordered", "Received", "Pending"],
                (purchases.data ?? []).map((r) => [r.po_date ?? "", r.po_number ?? "", r.supplier_name ?? "", r.material_name ?? "", r.po_quantity ?? 0, r.received_quantity ?? 0, r.pending_quantity ?? 0])
              )}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            </div>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
                  <tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">PO #</th><th className="text-left px-4 py-3">Supplier</th><th className="text-left px-4 py-3">Material</th><th className="text-right px-4 py-3">Ordered</th><th className="text-right px-4 py-3">Received</th><th className="text-right px-4 py-3">Pending</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(purchases.data ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{safeFormatDate(r.po_date)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{r.po_number}</td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.supplier_name}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{r.material_name}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{r.po_quantity}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{r.received_quantity}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-amber-600">{r.pending_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <Card className="p-4 shadow-[var(--shadow-card)] overflow-hidden">
            <div className="flex justify-end mb-3">
              <Button variant="outline" size="sm" onClick={() => downloadCSV("inventory-report",
                ["Material", "Code", "UOM", "Purchased", "Consumed", "Current", "Minimum", "Status"],
                (inv.data ?? []).map((r) => [r.name ?? "", r.code ?? "", r.uom ?? "", r.total_purchased ?? 0, r.total_consumed ?? 0, r.current_stock ?? 0, r.minimum_stock ?? 0, r.status ?? ""])
              )}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            </div>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
                  <tr><th className="text-left px-4 py-3">Material</th><th className="text-left px-4 py-3">Code</th><th className="text-right px-4 py-3">Purchased</th><th className="text-right px-4 py-3">Consumed</th><th className="text-right px-4 py-3">Stock</th><th className="text-left px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(inv.data ?? []).map((r) => (
                    <tr key={r.material_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{r.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">{r.code}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{r.total_purchased}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-amber-600">{r.total_consumed}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{r.current_stock}</td>
                      <td className="px-4 py-2.5">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
