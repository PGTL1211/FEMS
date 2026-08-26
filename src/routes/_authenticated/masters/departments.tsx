import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Building2, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { DEMO_DEPARTMENTS } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/masters/departments")({
  head: () => ({ meta: [{ title: "Departments Master — FEMS" }] }),
  component: DeptPage,
});

function DeptPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => (await supabase.from("departments").select("*").order("name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const rawDepts = (list.data && list.data.length > 0) ? list.data : DEMO_DEPARTMENTS;
  const departmentsList = rawDepts.filter((d: any) => !d.name?.startsWith("__FEMS_"));

  const filteredDepts = departmentsList.filter((d: any) =>
    (d.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const add = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Department name is required");
      const { error } = await supabase.from("departments").insert({ name, description: desc || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department added successfully");
      qc.invalidateQueries();
      setOpen(false);
      setName("");
      setDesc("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedAllManufacturingDepts = useMutation({
    mutationFn: async () => {
      for (const d of DEMO_DEPARTMENTS) {
        await supabase.from("departments").insert({
          name: d.name,
          description: d.description
        }).select();
      }
    },
    onSuccess: () => {
      toast.success("All 14 Manufacturing Departments populated!");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department removed");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Department Master"
        description="All plant & corporate manufacturing departments for production tracking & handover."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 font-bold dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
              onClick={() => seedAllManufacturingDepts.mutate()}
              disabled={seedAllManufacturingDepts.isPending}
            >
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              ⚡ Sync 14 Manufacturing Standard Departments
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1.5 font-bold">
                  <Plus className="h-4 w-4" /> New Department
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-indigo-600" />
                    Add Manufacturing Department
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="font-bold text-xs">Department Name</Label>
                    <Input
                      placeholder="e.g. Quality Assurance & Control (QA/QC)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-xs">Description & Scope</Label>
                    <Input
                      placeholder="e.g. Raw material inspection, in-process testing & PDI"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => add.mutate()} disabled={add.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                    Add Department
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search departments by name or scope..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Total {filteredDepts.length} Manufacturing Departments
            </Badge>
          </div>
        </div>
      </Card>

      <Card className="shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Department Name</th>
                <th className="text-left px-4 py-3">Functional Scope & Description</th>
                <th className="text-right px-4 py-3 w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDepts.map((d: any, idx: number) => (
                <tr key={d.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-400">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="font-bold text-slate-900 dark:text-slate-100">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                    {d.description ?? "Manufacturing Plant Operational Department"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      onClick={() => remove.mutate(d.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredDepts.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-400 font-medium">
                    No matching department found
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
