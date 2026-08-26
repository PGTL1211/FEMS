import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin,
  Building2,
  Factory,
  Plus,
  Trash2,
  Pencil,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useLocationPlant, LocationItem, PlantItem } from "@/lib/location-context";

export const Route = createFileRoute("/_authenticated/masters/locations")({
  head: () => ({ meta: [{ title: "Locations & Plants Master — FEMS" }] }),
  component: LocationsPage,
});

const PLANT_TYPES = [
  "Fabrication",
  "Assembly",
  "Injection Molding",
  "Tool Room",
  "Finishing",
  "Warehouse",
  "R&D Lab",
  "Quality Control",
  "Other",
];

export function getTypeBadgeColor(type: string) {
  switch (type.toLowerCase()) {
    case "fabrication":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300";
    case "assembly":
      return "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300";
    case "injection molding":
      return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300";
    case "tool room":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300";
    case "warehouse":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "finishing":
      return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300";
  }
}

function LocationsPage() {
  const {
    locations,
    addLocation,
    updateLocation,
    deleteLocation,
    addPlant,
    updatePlant,
    deletePlant,
  } = useLocationPlant();

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLocs, setExpandedLocs] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    locations.forEach((l) => {
      initial[l.id] = true;
    });
    return initial;
  });

  // Location Dialog State
  const [locDialogOpen, setLocDialogOpen] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({
    name: "",
    code: "",
    state: "",
    address: "",
    description: "",
  });

  // Plant Dialog State
  const [plantDialogOpen, setPlantDialogOpen] = useState(false);
  const [targetLocationId, setTargetLocationId] = useState<string>("");
  const [editingPlantId, setEditingPlantId] = useState<string | null>(null);
  const [plantForm, setPlantForm] = useState({
    name: "",
    code: "",
    type: "Fabrication",
    description: "",
  });

  const toggleExpand = (locId: string) => {
    setExpandedLocs((prev) => ({ ...prev, [locId]: !prev[locId] }));
  };

  const handleOpenAddLoc = () => {
    setEditingLocId(null);
    setLocForm({ name: "", code: "", state: "", address: "", description: "" });
    setLocDialogOpen(true);
  };

  const handleOpenEditLoc = (loc: LocationItem) => {
    setEditingLocId(loc.id);
    setLocForm({
      name: loc.name,
      code: loc.code,
      state: loc.state,
      address: loc.address || "",
      description: loc.description || "",
    });
    setLocDialogOpen(true);
  };

  const handleSaveLocation = () => {
    if (!locForm.name.trim() || !locForm.code.trim()) {
      toast.error("Location name and code are required");
      return;
    }
    if (editingLocId) {
      updateLocation(editingLocId, {
        name: locForm.name.trim(),
        code: locForm.code.trim().toUpperCase(),
        state: locForm.state.trim() || "India",
        address: locForm.address.trim() || undefined,
        description: locForm.description.trim() || undefined,
      });
      toast.success("Location updated successfully");
    } else {
      addLocation({
        name: locForm.name.trim(),
        code: locForm.code.trim().toUpperCase(),
        state: locForm.state.trim() || "India",
        address: locForm.address.trim() || undefined,
        description: locForm.description.trim() || undefined,
      });
      toast.success("New Location created successfully");
    }
    setLocDialogOpen(false);
  };

  const handleOpenAddPlant = (locationId?: string) => {
    setEditingPlantId(null);
    setTargetLocationId(locationId || (locations[0]?.id ?? ""));
    setPlantForm({ name: "", code: "", type: "Fabrication", description: "" });
    setPlantDialogOpen(true);
  };

  const handleOpenEditPlant = (locationId: string, plant: PlantItem) => {
    setEditingPlantId(plant.id);
    setTargetLocationId(locationId);
    setPlantForm({
      name: plant.name,
      code: plant.code,
      type: plant.type || "Fabrication",
      description: plant.description || "",
    });
    setPlantDialogOpen(true);
  };

  const handleSavePlant = () => {
    if (!targetLocationId) {
      toast.error("Please select a parent location");
      return;
    }
    if (!plantForm.name.trim() || !plantForm.code.trim()) {
      toast.error("Plant name and code are required");
      return;
    }
    if (editingPlantId) {
      updatePlant(targetLocationId, editingPlantId, {
        name: plantForm.name.trim(),
        code: plantForm.code.trim().toUpperCase(),
        type: plantForm.type,
        description: plantForm.description.trim() || undefined,
      });
      toast.success("Plant details updated");
    } else {
      addPlant(targetLocationId, {
        name: plantForm.name.trim(),
        code: plantForm.code.trim().toUpperCase(),
        type: plantForm.type,
        description: plantForm.description.trim() || undefined,
      });
      toast.success("New Plant added to Location");
    }
    setPlantDialogOpen(false);
  };

  const totalPlantsCount = locations.reduce((sum, l) => sum + (l.plants?.length || 0), 0);

  // Search Filter
  const filteredLocations = locations.filter((loc) => {
    const q = searchTerm.toLowerCase();
    const locMatch =
      loc.name.toLowerCase().includes(q) ||
      loc.code.toLowerCase().includes(q) ||
      loc.state.toLowerCase().includes(q) ||
      (loc.description || "").toLowerCase().includes(q);
    const plantMatch = loc.plants.some(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
    );
    return locMatch || plantMatch;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Location & Plant Master"
        description="Manage multi-location manufacturing hierarchy. Configure plants within each physical location and assign them to operators."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={handleOpenAddLoc} className="gap-1.5 font-bold">
              <MapPin className="h-4 w-4" /> + New Location
            </Button>

            <Button
              onClick={() => handleOpenAddPlant()}
              disabled={locations.length === 0}
              variant="secondary"
              className="gap-1.5 font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> + New Plant
            </Button>
          </div>
        }
      />

      {/* Filter & Search Bar */}
      <Card className="p-4 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search locations by city, code, or plant facility name/type..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <MapPin className="h-3 w-3 mr-1 inline" />
              {locations.length} Locations
            </Badge>
            <Badge
              variant="secondary"
              className="px-3 py-1 font-bold text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            >
              <Factory className="h-3 w-3 mr-1 inline" />
              {totalPlantsCount} Manufacturing Plants
            </Badge>
          </div>
        </div>
      </Card>

      {/* Empty State when no locations created yet */}
      {locations.length === 0 && (
        <Card className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl">
          <div className="mx-auto w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
            <MapPin className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Locations Created Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Get started by adding your physical factory locations (e.g. Pune, Bhiwadi) and configuring manufacturing plants inside each.
          </p>
          <Button onClick={handleOpenAddLoc} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
            <Plus className="h-4 w-4" /> Add First Location
          </Button>
        </Card>
      )}

      {/* Locations Accordion / List */}
      <div className="space-y-4">
        {filteredLocations.map((loc) => {
          const isExpanded = expandedLocs[loc.id] ?? true;
          const plantCount = loc.plants?.length || 0;

          return (
            <Card
              key={loc.id}
              className="shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Location Card Header Banner */}
              <div className="p-4 bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-600 hover:bg-slate-200/60"
                    onClick={() => toggleExpand(loc.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>

                  <div className="h-9 w-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                        {loc.name}
                      </h3>
                      <Badge variant="outline" className="font-mono text-[11px] font-bold">
                        {loc.code}
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium">({loc.state})</span>
                      <Badge
                        variant="secondary"
                        className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold"
                      >
                        {plantCount} {plantCount === 1 ? "Plant" : "Plants"}
                      </Badge>
                    </div>
                    {loc.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
                        {loc.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Location Actions */}
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    onClick={() => handleOpenAddPlant(loc.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Plant to {loc.name}
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-500 hover:text-indigo-600"
                    onClick={() => handleOpenEditLoc(loc)}
                    title="Edit Location"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-rose-600"
                    onClick={() => {
                      if (confirm(`Delete location "${loc.name}" and all its plants?`)) {
                        deleteLocation(loc.id);
                        toast.success(`Location "${loc.name}" deleted`);
                      }
                    }}
                    title="Delete Location"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Plants Table under this location */}
              {isExpanded && (
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100/70 dark:bg-slate-800/60 text-xs uppercase font-bold text-slate-600 dark:text-slate-400 border-b">
                      <tr>
                        <th className="text-left px-4 py-2.5 w-12">#</th>
                        <th className="text-left px-4 py-2.5">Plant Name</th>
                        <th className="text-left px-4 py-2.5">Plant Code</th>
                        <th className="text-left px-4 py-2.5">Facility / Operations Type</th>
                        <th className="text-left px-4 py-2.5">Scope & Description</th>
                        <th className="text-right px-4 py-2.5 w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {loc.plants.map((plant, idx) => (
                        <tr key={plant.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-mono text-xs text-slate-400 font-bold">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-2">
                              <Factory className="h-4 w-4 text-indigo-600 shrink-0" />
                              <span>{plant.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300">
                            {plant.code}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getTypeBadgeColor(
                                plant.type
                              )}`}
                            >
                              {plant.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                            {plant.description || "Manufacturing facility"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-indigo-600"
                                onClick={() => handleOpenEditPlant(loc.id, plant)}
                                title="Edit Plant"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-slate-400 hover:text-rose-600"
                                onClick={() => {
                                  if (confirm(`Remove plant "${plant.name}"?`)) {
                                    deletePlant(loc.id, plant.id);
                                    toast.success(`Plant "${plant.name}" removed`);
                                  }
                                }}
                                title="Delete Plant"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {loc.plants.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-slate-400 text-xs">
                            No plants configured for {loc.name} yet. Click{" "}
                            <strong
                              onClick={() => handleOpenAddPlant(loc.id)}
                              className="text-indigo-600 cursor-pointer hover:underline"
                            >
                              + Add Plant
                            </strong>{" "}
                            to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}

        {filteredLocations.length === 0 && locations.length > 0 && (
          <Card className="p-12 text-center text-slate-400 border border-slate-200">
            <Building2 className="h-10 w-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">No matching location or plant found</p>
            <p className="text-xs text-slate-400 mt-1">Try another search term or create a new location.</p>
          </Card>
        )}
      </div>

      {/* ADD / EDIT LOCATION DIALOG */}
      <Dialog open={locDialogOpen} onOpenChange={setLocDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-indigo-600" />
              {editingLocId ? "Edit Location" : "Add New Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Location Name *</Label>
                <Input
                  placeholder="e.g. Pune / Bhiwadi / Supa"
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Location Code *</Label>
                <Input
                  placeholder="e.g. PUN / BHW / GND"
                  value={locForm.code}
                  onChange={(e) => setLocForm({ ...locForm, code: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">State / Region</Label>
              <Input
                placeholder="e.g. Maharashtra / Rajasthan / Uttar Pradesh"
                value={locForm.state}
                onChange={(e) => setLocForm({ ...locForm, state: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Industrial Address</Label>
              <Input
                placeholder="e.g. MIDC Chakan Phase 2"
                value={locForm.address}
                onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Description</Label>
              <Textarea
                rows={2}
                placeholder="Operational purpose of this location..."
                value={locForm.description}
                onChange={(e) => setLocForm({ ...locForm, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setLocDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLocation} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {editingLocId ? "Save Changes" : "Create Location"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ADD / EDIT PLANT DIALOG */}
      <Dialog open={plantDialogOpen} onOpenChange={setPlantDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-indigo-600" />
              {editingPlantId ? "Edit Manufacturing Plant" : "Add Plant to Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Parent Location *</Label>
              <Select value={targetLocationId} onValueChange={setTargetLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Parent Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      📍 {loc.name} ({loc.code}) — {loc.state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Plant Name *</Label>
                <Input
                  placeholder="e.g. Plant-1 (Fabrication Unit)"
                  value={plantForm.name}
                  onChange={(e) => setPlantForm({ ...plantForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Plant Code *</Label>
                <Input
                  placeholder="e.g. PUN-01 / BHW-02"
                  value={plantForm.code}
                  onChange={(e) => setPlantForm({ ...plantForm, code: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Operations / Facility Type</Label>
              <Select
                value={plantForm.type}
                onValueChange={(v) => setPlantForm({ ...plantForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Type" />
                </SelectTrigger>
                <SelectContent>
                  {PLANT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Scope & Description</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Sheet metal punching, bending, structural fabrication and welding"
                value={plantForm.description}
                onChange={(e) => setPlantForm({ ...plantForm, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setPlantDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlant} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {editingPlantId ? "Save Plant" : "Add Plant"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
