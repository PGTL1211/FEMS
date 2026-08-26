import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Search, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { safeFormatDate } from "@/lib/utils";

import { DEMO_PRODUCTS } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/masters/products")({
  head: () => ({ meta: [{ title: "Products — FEMS" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["products-all"], queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [] });
  const rawProducts = (list.data && list.data.length > 0) ? list.data : DEMO_PRODUCTS;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProducts = rawProducts.filter((p: any) =>
    (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Name required");
      const { error } = await supabase.from("products").insert({ name, description: desc || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Product added"); qc.invalidateQueries(); setOpen(false); setName(""); setDesc(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Master"
        description="New products appear in every Product dropdown automatically."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Product</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Product name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => add.mutate()} disabled={add.isPending}>Add</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Filter & Search Bar */}
      <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search products by name or description..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Total {filteredProducts.length} Products
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Description</th><th className="text-left px-4 py-3">Created</th><th className="w-16" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{p.description ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{safeFormatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}><Trash2 className="h-4 w-4 text-slate-400 hover:text-rose-600" /></Button></td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-400 font-medium">
                    No matching product found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
