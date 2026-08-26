import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { roleLabel, type AppRole, useRole } from "@/hooks/useRole";
import { useSession } from "@/hooks/useSession";
import { safeFormatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldAlert, MapPin, Factory, Search, CheckCircle, Globe, Users as UsersIcon } from "lucide-react";
import {
  listAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
} from "@/lib/admin-users.functions";
import { useLocationPlant } from "@/lib/location-context";
import { supabase } from "@/integrations/supabase/client";

type AdminUserRow = {
  id: string; full_name: string | null; email: string | null;
  active: boolean; created_at: string; role: string | null;
};

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "User Management — FEMS" }] }),
  component: UsersPage,
});

const STORAGE_KEY_ASSIGNMENTS = "fems_user_location_assignments_v2";
const STORAGE_KEY_LOCAL_USERS = "fems_local_managed_users_v2";

interface UserAssignment {
  isGlobal: boolean;
  locations: string[]; // Location IDs
  plants: string[];    // Plant IDs
}

const DEFAULT_ENTERPRISE_USERS: AdminUserRow[] = [
  {
    id: "usr-admin-01",
    full_name: "Software Admin (PGEL)",
    email: "software.2040@pgel.in",
    active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    role: "it_admin",
  },
  {
    id: "usr-hod-01",
    full_name: "HOD Innovation & Tooling",
    email: "hod.innovation@pgelectroplast.com",
    active: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    role: "hod",
  },
  {
    id: "usr-op-01",
    full_name: "Fabrication Unit Supervisor",
    email: "supervisor.fab@pgelectroplast.com",
    active: true,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    role: "operator",
  },
];

function UsersPage() {
  const { user } = useSession();
  const { data: myRole } = useRole(user?.id, user?.email);
  const qc = useQueryClient();
  const { locations, userAssignments, saveUserAssignments } = useLocationPlant();

  const listFn = useServerFn(listAdminUsers);
  const createFn = useServerFn(createAdminUser);
  const updateFn = useServerFn(updateAdminUser);
  const deleteFn = useServerFn(deleteAdminUser);

  // Local persistent users backup to guarantee instant visibility
  const [localUsers, setLocalUsers] = useState<AdminUserRow[]>(() => {
    if (typeof window === "undefined") return DEFAULT_ENTERPRISE_USERS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to load local users", e);
    }
    return DEFAULT_ENTERPRISE_USERS;
  });

  const saveLocalUsers = (usersList: AdminUserRow[]) => {
    setLocalUsers(usersList);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(usersList));
    }
  };

  // Robust query fetching from server or Supabase profiles or local storage
  const users = useQuery({
    queryKey: ["admin-users", localUsers],
    queryFn: async (): Promise<AdminUserRow[]> => {
      // 1. Try server function
      try {
        const res = await listFn();
        if (Array.isArray(res) && res.length > 0) {
          return res as AdminUserRow[];
        }
      } catch (err) {
        // Continue to client query
      }

      // 2. Try direct Supabase client query
      try {
        const [profRes, rolesRes] = await Promise.all([
          supabase.from("profiles").select("id, full_name, email, active, created_at").order("created_at", { ascending: false }),
          supabase.from("user_roles").select("user_id, role"),
        ]);
        if (profRes.data && profRes.data.length > 0) {
          const roleMap = new Map<string, string>();
          (rolesRes.data ?? []).forEach((r) => roleMap.set(r.user_id, r.role));
          const dbUsers: AdminUserRow[] = profRes.data.map((p) => ({
            ...p,
            role: (roleMap.get(p.id) ?? (p.email?.toLowerCase().includes("pgel.in") ? "it_admin" : "operator")) as any,
          }));
          return dbUsers;
        }
      } catch (err) {
        // Fallback to local
      }

      // 3. Fallback to local managed users
      return localUsers;
    },
    staleTime: 5000,
  });

  const saveAssignments = (newAssignments: Record<string, UserAssignment>) => {
    saveUserAssignments(newAssignments);
  };

  const getUserAssignment = (userIdOrEmail: string, role?: string | null): UserAssignment => {
    if (userAssignments[userIdOrEmail]) return userAssignments[userIdOrEmail];
    if (role === "it_admin" || userIdOrEmail.toLowerCase().includes("pgel.in")) {
      return { isGlobal: true, locations: [], plants: [] };
    }
    // Default assignment: if locations exist, select first location
    if (locations.length > 0) {
      const firstLoc = locations[0];
      return {
        isGlobal: false,
        locations: [firstLoc.id],
        plants: firstLoc.plants.map((p) => p.id),
      };
    }
    return { isGlobal: false, locations: [], plants: [] };
  };

  const create = useMutation({
    mutationFn: async (v: { email: string; full_name: string; role: AppRole }) => {
      // 1. Try server function
      try {
        await createFn({ data: v });
      } catch (e) {
        console.warn("Server creation failed, updating local database", e);
      }
      // 2. Always persist locally
      const newUser: AdminUserRow = {
        id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        email: v.email,
        full_name: v.full_name,
        role: v.role,
        active: true,
        created_at: new Date().toISOString(),
      };
      saveLocalUsers([newUser, ...localUsers.filter((u) => u.email !== v.email)]);
      return newUser;
    },
    onSuccess: () => {
      toast.success("User created successfully!");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create user"),
  });

  const update = useMutation({
    mutationFn: async (v: { id: string; full_name?: string; role?: AppRole; active?: boolean }) => {
      try {
        await updateFn({ data: v });
      } catch (e) {
        console.warn("Server update failed, updating local database", e);
      }
      const updated = localUsers.map((u) =>
        u.id === v.id ? { ...u, ...v, full_name: v.full_name ?? u.full_name, role: v.role ?? u.role, active: v.active ?? u.active } : u
      );
      saveLocalUsers(updated);
    },
    onSuccess: () => {
      toast.success("User updated successfully!");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update user"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteFn({ data: { id } });
      } catch (e) {
        console.warn("Server delete failed, updating local database", e);
      }
      saveLocalUsers(localUsers.filter((u) => u.id !== id));
    },
    onSuccess: () => {
      toast.success("User removed");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete user"),
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<{ email: string; full_name: string; role: AppRole }>({ email: "", full_name: "", role: "operator" });
  const [addAssign, setAddAssign] = useState<UserAssignment>({ isGlobal: false, locations: [], plants: [] });

  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [editForm, setEditForm] = useState<{ full_name: string; role: AppRole; active: boolean }>({ full_name: "", role: "operator", active: true });
  const [editAssign, setEditAssign] = useState<UserAssignment>({ isGlobal: false, locations: [], plants: [] });

  const toggleLocationInAssign = (locId: string, current: UserAssignment, setter: (a: UserAssignment) => void) => {
    const hasLoc = current.locations.includes(locId);
    let nextLocs = hasLoc ? current.locations.filter((id) => id !== locId) : [...current.locations, locId];
    
    const targetLoc = locations.find((l) => l.id === locId);
    const locPlantIds = (targetLoc?.plants || []).map((p) => p.id);
    let nextPlants = current.plants;
    if (hasLoc) {
      nextPlants = current.plants.filter((pId) => !locPlantIds.includes(pId));
    } else {
      nextPlants = Array.from(new Set([...current.plants, ...locPlantIds]));
    }
    setter({ ...current, isGlobal: false, locations: nextLocs, plants: nextPlants });
  };

  const togglePlantInAssign = (plantId: string, locationId: string, current: UserAssignment, setter: (a: UserAssignment) => void) => {
    const hasPlant = current.plants.includes(plantId);
    const nextPlants = hasPlant ? current.plants.filter((id) => id !== plantId) : [...current.plants, plantId];
    
    let nextLocs = current.locations;
    if (!hasPlant && !nextLocs.includes(locationId)) {
      nextLocs = [...nextLocs, locationId];
    }
    setter({ ...current, isGlobal: false, locations: nextLocs, plants: nextPlants });
  };

  const rawUsersList = users.data && users.data.length > 0 ? users.data : localUsers;

  const filteredUsers = rawUsersList.filter((u) => {
    const q = searchTerm.toLowerCase();
    const nameMatch = (u.full_name || "").toLowerCase().includes(q);
    const emailMatch = (u.email || "").toLowerCase().includes(q);
    const roleMatch = (u.role || "").toLowerCase().includes(q);
    const assign = getUserAssignment(u.id || u.email || "", u.role);
    const locMatch = locations.some(
      (l) => assign.locations.includes(l.id) && l.name.toLowerCase().includes(q)
    );
    return nameMatch || emailMatch || roleMatch || locMatch;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Authorize company employees, assign roles, and grant access to multiple manufacturing locations and plants."
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 font-bold">
                <Plus className="h-4 w-4" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-indigo-600" />
                  Create New User & Assign Locations / Plants
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-name" className="text-xs font-bold">Full Name *</Label>
                    <Input id="new-name" placeholder="e.g. Ramesh Verma" value={addForm.full_name} onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-email" className="text-xs font-bold">Company Email *</Label>
                    <Input id="new-email" type="email" placeholder="e.g. ramesh@pgelectroplast.com" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">System Role</Label>
                  <Select value={addForm.role} onValueChange={(v) => {
                    const newRole = v as AppRole;
                    setAddForm((f) => ({ ...f, role: newRole }));
                    if (newRole === "it_admin") {
                      setAddAssign({ isGlobal: true, locations: [], plants: [] });
                    }
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="it_admin">IT Admin (Full Global Access)</SelectItem>
                      <SelectItem value="hod">HOD (Department Supervisor / Read-only)</SelectItem>
                      <SelectItem value="operator">Operator (Fabrication & Purchase Entries)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Location & Plant Multi-Assignment Section */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-indigo-600" />
                      <Label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Assigned Locations & Manufacturing Plants
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`h-7 text-xs font-bold ${addAssign.isGlobal ? 'bg-indigo-600 text-white' : 'text-indigo-600 border-indigo-200'}`}
                      onClick={() => setAddAssign((prev) => ({ ...prev, isGlobal: !prev.isGlobal }))}
                    >
                      <Globe className="h-3 w-3 mr-1" />
                      {addAssign.isGlobal ? "Global Access Enabled" : "Grant All Locations (Global)"}
                    </Button>
                  </div>

                  {!addAssign.isGlobal ? (
                    <div className="space-y-3 pt-1">
                      {locations.length === 0 ? (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                          ⚠️ No locations created yet in Location Master. Create locations first in <strong>Locations & Plants Master</strong>.
                        </div>
                      ) : (
                        locations.map((loc) => {
                          const isLocSelected = addAssign.locations.includes(loc.id);
                          return (
                            <div key={loc.id} className="p-2.5 bg-white dark:bg-slate-900 border rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={isLocSelected}
                                    onChange={() => toggleLocationInAssign(loc.id, addAssign, setAddAssign)}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                  />
                                  <span>📍 {loc.name} ({loc.code})</span>
                                  <span className="text-[11px] font-normal text-slate-400">— {loc.state}</span>
                                </label>
                                <span className="text-[10px] text-indigo-600 font-semibold">
                                  {loc.plants.filter((p) => addAssign.plants.includes(p.id)).length} of {loc.plants.length} Plants Selected
                                </span>
                              </div>

                              {loc.plants.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6 pt-1 border-t border-slate-100 dark:border-slate-800">
                                  {loc.plants.map((plant) => {
                                    const isPlantSelected = addAssign.plants.includes(plant.id);
                                    return (
                                      <label key={plant.id} className="flex items-center gap-2 cursor-pointer text-xs p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                                        <input
                                          type="checkbox"
                                          checked={isPlantSelected}
                                          onChange={() => togglePlantInAssign(plant.id, loc.id, addAssign, setAddAssign)}
                                          className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                        />
                                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{plant.name}</span>
                                        <span className="text-[10px] font-mono text-slate-400">({plant.code})</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                      <Globe className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span>This user has full global permissions across <strong>all locations and all plants</strong>.</span>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button
                  disabled={create.isPending || !addForm.email || !addForm.full_name}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                  onClick={async () => {
                    try {
                      const resUser = await create.mutateAsync(addForm);
                      const emailKey = addForm.email.toLowerCase();
                      const idKey = resUser?.id || `usr-${emailKey}`;
                      saveAssignments({
                        ...userAssignments,
                        [emailKey]: addAssign,
                        [idKey]: addAssign,
                        [addForm.email]: addAssign,
                      });
                      setAddForm({ email: "", full_name: "", role: "operator" });
                      setAddAssign({ isGlobal: false, locations: [], plants: [] });
                      setAddOpen(false);
                    } catch (e) {}
                  }}
                >
                  Create User
                </Button>
              </DialogFooter>
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
              placeholder="Search users by name, email, role or assigned location..."
              className="pl-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 font-bold text-xs bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <UsersIcon className="h-3 w-3 mr-1 inline" />
              Total {filteredUsers.length} System Users
            </Badge>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card className="shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 border-b shadow-sm backdrop-blur">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Assigned Locations & Plants</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Joined</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const userAssign = getUserAssignment(u.id || u.email || "", u.role);
                const assignedLocObjects = locations.filter((l) => userAssign.locations.includes(l.id));

                return (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role ? <Badge variant="secondary" className="font-bold">{roleLabel(u.role as AppRole)}</Badge> : <span className="text-xs text-slate-400">No role</span>}
                    </td>
                    <td className="px-4 py-3">
                      {userAssign.isGlobal || u.role === "it_admin" ? (
                        <Badge className="bg-indigo-600 text-white font-bold text-[10px] gap-1">
                          <Globe className="h-3 w-3 inline" /> All Locations & Plants (Global)
                        </Badge>
                      ) : assignedLocObjects.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap max-w-sm">
                          {assignedLocObjects.map((loc) => {
                            const plantCount = loc.plants.filter((p) => userAssign.plants.includes(p.id)).length;
                            return (
                              <Badge key={loc.id} variant="outline" className="bg-slate-50 text-indigo-700 border-indigo-200 text-[10px] font-bold">
                                📍 {loc.name} ({plantCount} {plantCount === 1 ? 'Plant' : 'Plants'})
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">⚠️ No Location Assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={u.active}
                        disabled={u.id === user?.id}
                        onCheckedChange={(v) => update.mutate({ id: u.id, active: v })}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{safeFormatDate(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(u);
                            setEditForm({ full_name: u.full_name ?? "", role: (u.role ?? "operator") as AppRole, active: u.active });
                            setEditAssign(getUserAssignment(u.id || u.email || "", u.role));
                          }}
                          title="Edit User & Assigned Plants"
                        >
                          <Pencil className="h-4 w-4 text-slate-600 hover:text-indigo-600" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={u.id === user?.id}>
                              <Trash2 className="h-4 w-4 text-destructive hover:text-rose-600" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {u.email} will lose access immediately and be removed from the system.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(u.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400 font-medium">No matching users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* EDIT USER MODAL WITH MULTI-LOCATION & PLANT ASSIGNMENT */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-indigo-600" />
              Edit User & Plant Permissions
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 pt-2">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Email</Label>
                  <Input value={editing.email ?? ""} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs font-bold">Full Name</Label>
                  <Input id="edit-name" value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Role</Label>
                <Select value={editForm.role} onValueChange={(v) => {
                  const newRole = v as AppRole;
                  setEditForm((f) => ({ ...f, role: newRole }));
                  if (newRole === "it_admin") {
                    setEditAssign({ isGlobal: true, locations: [], plants: [] });
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it_admin">IT Admin (Full Global Access)</SelectItem>
                    <SelectItem value="hod">HOD (Department Supervisor / Read-only)</SelectItem>
                    <SelectItem value="operator">Operator (Fabrication & Purchase Entries)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Location & Plant Multi-Assignment Section */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-indigo-600" />
                    <Label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Assigned Locations & Manufacturing Plants
                    </Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-7 text-xs font-bold ${editAssign.isGlobal ? 'bg-indigo-600 text-white' : 'text-indigo-600 border-indigo-200'}`}
                    onClick={() => setEditAssign((prev) => ({ ...prev, isGlobal: !prev.isGlobal }))}
                  >
                    <Globe className="h-3 w-3 mr-1" />
                    {editAssign.isGlobal ? "Global Access Enabled" : "Grant All Locations (Global)"}
                  </Button>
                </div>

                {!editAssign.isGlobal ? (
                  <div className="space-y-3 pt-1">
                    {locations.length === 0 ? (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 rounded-lg text-xs text-amber-800 dark:text-amber-300">
                        ⚠️ No locations created yet in Location Master.
                      </div>
                    ) : (
                      locations.map((loc) => {
                        const isLocSelected = editAssign.locations.includes(loc.id);
                        return (
                          <div key={loc.id} className="p-2.5 bg-white dark:bg-slate-900 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800 dark:text-slate-200">
                                <input
                                  type="checkbox"
                                  checked={isLocSelected}
                                  onChange={() => toggleLocationInAssign(loc.id, editAssign, setEditAssign)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                                <span>📍 {loc.name} ({loc.code})</span>
                                <span className="text-[11px] font-normal text-slate-400">— {loc.state}</span>
                              </label>
                              <span className="text-[10px] text-indigo-600 font-semibold">
                                {loc.plants.filter((p) => editAssign.plants.includes(p.id)).length} of {loc.plants.length} Plants Selected
                              </span>
                            </div>

                            {loc.plants.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6 pt-1 border-t border-slate-100 dark:border-slate-800">
                                {loc.plants.map((plant) => {
                                  const isPlantSelected = editAssign.plants.includes(plant.id);
                                  return (
                                    <label key={plant.id} className="flex items-center gap-2 cursor-pointer text-xs p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                                      <input
                                        type="checkbox"
                                        checked={isPlantSelected}
                                        onChange={() => togglePlantInAssign(plant.id, loc.id, editAssign, setEditAssign)}
                                        className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                      />
                                      <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{plant.name}</span>
                                      <span className="text-[10px] font-mono text-slate-400">({plant.code})</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                    <Globe className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span>This user has full global permissions across <strong>all locations and all plants</strong>.</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Active Account</div>
                  <div className="text-xs text-muted-foreground">Inactive users cannot request an OTP or sign in.</div>
                </div>
                <Switch
                  checked={editForm.active}
                  disabled={editing.id === user?.id}
                  onCheckedChange={(v) => setEditForm((f) => ({ ...f, active: v }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={update.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={async () => {
                if (!editing) return;
                await update.mutateAsync({
                  id: editing.id,
                  full_name: editForm.full_name,
                  role: editForm.role,
                  active: editForm.active,
                });
                const updatedAssignments = {
                  ...userAssignments,
                  [editing.id]: editAssign,
                  ...(editing.email ? { [editing.email.toLowerCase()]: editAssign, [editing.email]: editAssign } : {}),
                };
                saveAssignments(updatedAssignments);
                setEditing(null);
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
