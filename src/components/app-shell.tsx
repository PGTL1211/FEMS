import type { ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Factory, ShoppingCart, Boxes, AlertTriangle,
  FileBarChart, Package, Wrench, Building2, Users, LogOut, Menu,
  Settings, Filter, RefreshCw, FileSpreadsheet, User, ShieldCheck, MapPin,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { useRole, roleLabel, type AppRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DEMO_MATERIALS, DEMO_PURCHASES, DEMO_FABRICATIONS } from "@/lib/demo-data";
import { useLocationPlant } from "@/lib/location-context";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: AppRole[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Operations",
    items: [
      { to: "/fabrication", label: "Fabrication Entry", icon: Factory },
      { to: "/purchase", label: "Purchase Entry", icon: ShoppingCart },
      { to: "/inventory", label: "Inventory Stock", icon: Boxes, roles: ["it_admin", "hod"] },
      { to: "/gap", label: "Gap Verification", icon: AlertTriangle, roles: ["it_admin", "hod"] },
    ],
  },
  {
    section: "Insights",
    items: [{ to: "/reports", label: "Reports & Exports", icon: FileBarChart, roles: ["it_admin", "hod"] }],
  },
  {
    section: "Masters & Admin",
    items: [
      { to: "/masters/locations", label: "Locations & Plants", icon: MapPin, roles: ["it_admin"] },
      { to: "/masters/products", label: "Products", icon: Package, roles: ["it_admin"] },
      { to: "/masters/materials", label: "Materials", icon: Wrench, roles: ["it_admin"] },
      { to: "/masters/departments", label: "Departments", icon: Building2, roles: ["it_admin"] },
      { to: "/users", label: "User Management", icon: Users, roles: ["it_admin"] },
    ],
  },
];

function DrawerNav({
  role,
  userEmail,
  onNav,
  onSignOut,
}: {
  role: string | null | undefined;
  userEmail: string | undefined;
  onNav: () => void;
  onSignOut: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-full flex-col bg-white text-slate-900">
      <div className="flex items-center gap-3 border-b border-slate-200 p-4 bg-slate-50">
        <div className="flex h-9 px-2.5 items-center justify-center rounded-md bg-white shadow-xs border border-slate-200 shrink-0">
          <img src="/pg-logo.png" alt="PG Logo" className="h-6 w-auto object-contain" />
        </div>
        <div>
          <div className="text-base font-black tracking-tight text-slate-900">FEMS</div>
          <div className="text-xs font-semibold text-slate-500">Fabrication Entry Management</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {NAV.map((sec) => {
          const items = sec.items.filter((it) => !it.roles || (role && it.roles.includes(role)));
          if (items.length === 0) return null;
          return (
            <div key={sec.section}>
              <div className="pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {sec.section}
              </div>
              <div className="space-y-1">
                {items.map((it) => {
                  const active = it.to === "/" ? path === "/" : path === it.to || path.startsWith(it.to + "/");
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={onNav}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        active
                          ? "bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-200"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <it.icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-slate-500")} />
                      <span>{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-700">
          <span className="truncate max-w-[160px] font-semibold">{userEmail}</span>
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 font-semibold">{roleLabel(role as AppRole)}</Badge>
        </div>
        <Button variant="destructive" size="sm" onClick={onSignOut} className="w-full gap-2 font-semibold">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { data: role } = useRole(user?.id, user?.email);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    locations,
    selectedLocationId,
    selectedPlantId,
    setSelectedLocationId,
    setSelectedPlantId,
    activeLocation,
    activePlant,
    availablePlants,
    getUserLocations,
    getUserPlants,
  } = useLocationPlant();

  const userHeaderLocations = useMemo(() => {
    return getUserLocations(user?.email, role);
  }, [getUserLocations, user?.email, role, locations]);

  const userHeaderPlants = useMemo(() => {
    if (selectedLocationId === "ALL") {
      return userHeaderLocations.flatMap((l) => getUserPlants(l.id, user?.email, role));
    }
    return getUserPlants(selectedLocationId, user?.email, role);
  }, [userHeaderLocations, selectedLocationId, getUserPlants, user?.email, role]);

  // Real-time synchronization with Supabase Database
  useEffect(() => {
    const channel = supabase
      .channel("db-realtime-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
        },
        () => {
          queryClient.invalidateQueries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleExportExcel = async () => {
    toast.loading("Generating Excel report...", { id: "excel-export" });
    try {
      const [invRes, poRes, fabRes] = await Promise.all([
        supabase.from("inventory_view").select("*").order("name"),
        supabase.from("po_summary_view").select("*").order("po_date", { ascending: false }),
        supabase.from("fabrications").select("id, fab_date, product_quantity, supervisor_name, remarks, products(name), departments(name)").order("fab_date", { ascending: false }),
      ]);

      const inventoryList = (invRes.data && invRes.data.length > 0) ? invRes.data : DEMO_MATERIALS;
      const purchaseList = (poRes.data && poRes.data.length > 0) ? poRes.data : DEMO_PURCHASES;
      const fabList = (fabRes.data && fabRes.data.length > 0) ? fabRes.data : DEMO_FABRICATIONS;

      const dateStr = format(new Date(), "yyyy-MM-dd HH:mm");
      const locLabel = activeLocation ? activeLocation.name : "All Locations";
      const plantLabel = activePlant ? activePlant.name : "All Plants";
      const lines: string[] = [];

      // Header Banner
      lines.push(`"PG ELECTROPLAST LIMITED — INNOVATION DEPARTMENT (IDMS)"`);
      lines.push(`"EXECUTIVE INVENTORY & PRODUCTION SUMMARY REPORT"`);
      lines.push(`"Location: ${locLabel}","Plant: ${plantLabel}","Report Date: ${dateStr}","Generated By: ${user?.email || "System User"}"`);
      lines.push(`""`);

      // SECTION 1: INVENTORY STOCK LEDGER
      lines.push(`"=== SECTION 1: LIVE INVENTORY STOCK LEDGER ==="`);
      lines.push([
        `"Material Name"`,
        `"Item Code"`,
        `"UOM"`,
        `"Min Threshold"`,
        `"Total Purchased"`,
        `"Total Consumed"`,
        `"Current Net Stock"`,
        `"Stock Status"`
      ].join(","));

      inventoryList.forEach((r: any) => {
        lines.push([
          `"${r.name || ""}"`,
          `"${r.code || ""}"`,
          `"${r.uom || ""}"`,
          r.minimum_stock ?? 0,
          r.total_purchased ?? 0,
          r.total_consumed ?? 0,
          r.current_stock ?? 0,
          `"${String(r.status || "healthy").toUpperCase()}"`
        ].join(","));
      });

      lines.push(`""`);
      lines.push(`""`);

      // SECTION 2: PURCHASE ORDERS & INFLOWS
      lines.push(`"=== SECTION 2: PURCHASE ORDERS & MATERIAL RECEIPTS ==="`);
      lines.push([
        `"PO Date"`,
        `"PO Number"`,
        `"Supplier Name"`,
        `"Material Name"`,
        `"Ordered Qty"`,
        `"Received Qty"`,
        `"Pending Qty"`
      ].join(","));

      purchaseList.forEach((p: any) => {
        lines.push([
          `"${p.po_date || ""}"`,
          `"${p.po_number || ""}"`,
          `"${p.supplier_name || ""}"`,
          `"${p.material_name || ""}"`,
          p.po_quantity ?? 0,
          p.received_quantity ?? 0,
          p.pending_quantity ?? 0
        ].join(","));
      });

      lines.push(`""`);
      lines.push(`""`);

      // SECTION 3: FABRICATION PRODUCTION ENTRIES
      lines.push(`"=== SECTION 3: FABRICATION PRODUCTION LOGS ==="`);
      lines.push([
        `"Fabrication Date"`,
        `"Product Name"`,
        `"Quantity Fabricated"`,
        `"Department"`,
        `"Handover To"`,
        `"Remarks"`
      ].join(","));

      fabList.forEach((f: any) => {
        lines.push([
          `"${f.fab_date || ""}"`,
          `"${(f.products as any)?.name || "Rack"}"`,
          f.product_quantity ?? 0,
          `"${(f.departments as any)?.name || "Fabrication"}"`,
          `"${f.supervisor_name || ""}"`,
          `"${(f.remarks || "").replace(/"/g, '""')}"`
        ].join(","));
      });

      const csvContent = lines.join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeLocStr = locLabel.replace(/[^a-zA-Z0-9]/g, "_");
      link.download = `IDMS_${safeLocStr}_Executive_Report_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("Excel report downloaded successfully!", { id: "excel-export" });
    } catch (err: any) {
      toast.error("Failed to generate report: " + (err?.message || "Unknown error"), { id: "excel-export" });
    }
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Top Header Navbar - Indigo/Purple Banner matching user image */}
      <header className="sticky top-0 z-40 bg-[#5b60d4] text-white shadow-md">
        <div className="flex h-14 xl:h-16 items-center justify-between px-3 md:px-6 gap-2">
          {/* Left: Hamburger menu + Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDrawerOpen(true)}
              className="text-white hover:bg-white/15 h-9 w-9 rounded-lg"
              title="Open Navigation Menu"
            >
              <Menu className="h-6 w-6" />
            </Button>

            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 px-2.5 items-center justify-center rounded-md bg-white p-1 shadow-xs shrink-0 border border-white/20">
                <img src="/pg-logo.png" alt="PG Logo" className="h-6 w-auto object-contain" />
              </div>
              <span className="font-bold text-base md:text-lg tracking-tight text-white hidden sm:inline">
                FEMS — Fabrication Entry Management System
              </span>
              <span className="font-bold text-base text-white sm:hidden">
                FEMS
              </span>
            </Link>
          </div>

          {/* Right Header Action Pills (Dynamic Linked Location & Plant Selectors) */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap sm:flex-nowrap">
            {/* Live indicator */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 text-xs font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>

            {/* Dynamic Location Selector */}
            <div className="relative">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-white/15 hover:bg-white/20 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer max-w-[150px] sm:max-w-[180px] truncate"
                title="Select Active Location"
              >
                <option value="ALL" className="text-slate-900 font-bold">📍 All Locations</option>
                {userHeaderLocations.map((loc) => (
                  <option key={loc.id} value={loc.id} className="text-slate-900">
                    📍 {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dynamic Plant Selector (Linked to Active Location) */}
            <div className="relative">
              <select
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className="bg-white/15 hover:bg-white/20 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer max-w-[160px] sm:max-w-[210px] truncate"
                title="Select Active Plant within Location"
              >
                <option value="ALL" className="text-slate-900 font-bold">🏭 All Plants</option>
                {userHeaderPlants.map((plant) => (
                  <option key={plant.id} value={plant.id} className="text-slate-900">
                    🏭 {plant.name} ({plant.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <Button
              size="sm"
              className="bg-[#2ea052] hover:bg-[#278d47] text-white text-xs font-semibold h-8 px-2.5 gap-1 shadow-sm hidden md:inline-flex"
              onClick={handleExportExcel}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel ▾
            </Button>

            <Button
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold h-8 px-2.5 gap-1 shadow-sm"
              onClick={() => { queryClient.invalidateQueries(); toast.success("Refreshed dashboard"); }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>

            {/* Account pill */}
            <div className="flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1 text-xs font-semibold text-white">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline truncate max-w-[120px]">{user?.email?.split("@")[0]}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Side Navigation Sheet Drawer (Automatic Hidden by Default, opens only when three bar clicked) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="p-0 border-r border-slate-200 w-72 bg-white">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <DrawerNav
            role={role}
            userEmail={user?.email}
            onNav={() => setDrawerOpen(false)}
            onSignOut={signOut}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <main className="flex-1 p-3 md:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
    </div>
  );
}

