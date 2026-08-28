import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PlantItem {
  id: string;
  name: string;
  code: string;
  type: string; // e.g. "Fabrication", "Assembly", "Injection Molding", "Tool Room", "Warehouse"
  description?: string;
  active?: boolean;
}

export interface LocationItem {
  id: string;
  name: string;
  code: string;
  state: string;
  address?: string;
  description?: string;
  active?: boolean;
  plants: PlantItem[];
}

export interface UserAssignment {
  isGlobal: boolean;
  locations: string[]; // Location IDs
  plants: string[];    // Plant IDs
}

export const DEFAULT_LOCATIONS: LocationItem[] = [
  {
    id: "loc-bhiwadi",
    name: "Bhiwadi",
    code: "BHI",
    state: "Rajasthan",
    address: "Bhiwadi Industrial Area, Alwar, Rajasthan",
    description: "PG Electroplast Major Manufacturing Hub",
    active: true,
    plants: [
      {
        id: "plant-bhi-ngm",
        name: "NGM Plant",
        code: "NGM",
        type: "Fabrication & Manufacturing",
        description: "NGM Sheet Metal & Fabrication Unit",
        active: true,
      },
      {
        id: "plant-bhi-pgtl",
        name: "PGTL Plant",
        code: "PGTL",
        type: "Assembly & Production",
        description: "PGTL High-Precision Production Unit",
        active: true,
      },
    ],
  },
];

interface LocationPlantContextType {
  locations: LocationItem[];
  userAssignments: Record<string, UserAssignment>;
  selectedLocationId: string; // "ALL" or specific location ID
  selectedPlantId: string;    // "ALL" or specific plant ID
  setSelectedLocationId: (id: string) => void;
  setSelectedPlantId: (id: string) => void;
  activeLocation: LocationItem | null;
  activePlant: PlantItem | null;
  availablePlants: PlantItem[];
  allPlants: (PlantItem & { locationId: string; locationName: string })[];
  addLocation: (loc: Omit<LocationItem, "id" | "plants">) => LocationItem;
  updateLocation: (id: string, updates: Partial<Omit<LocationItem, "id" | "plants">>) => void;
  deleteLocation: (id: string) => void;
  addPlant: (locationId: string, plant: Omit<PlantItem, "id">) => PlantItem;
  updatePlant: (locationId: string, plantId: string, updates: Partial<Omit<PlantItem, "id">>) => void;
  deletePlant: (locationId: string, plantId: string) => void;
  getUserLocations: (userEmailOrId?: string | null, role?: string | null) => LocationItem[];
  getUserPlants: (locationId: string, userEmailOrId?: string | null, role?: string | null) => PlantItem[];
  saveUserAssignments: (newAssignments: Record<string, UserAssignment>) => void;
  refreshFromDatabase: () => Promise<void>;
}

const LocationPlantContext = createContext<LocationPlantContextType | undefined>(undefined);

const STORAGE_KEY_LOCATIONS = "fems_locations_master_v2";
const STORAGE_KEY_SEL_LOC = "fems_active_location_id_v2";
const STORAGE_KEY_SEL_PLANT = "fems_active_plant_id_v2";
const STORAGE_KEY_ASSIGNMENTS = "fems_user_location_assignments_v2";

const DB_LOCATION_ROW_NAME = "__FEMS_LOCATIONS_MASTER__";
const DB_ASSIGNMENTS_ROW_NAME = "__FEMS_USER_ASSIGNMENTS__";

export function LocationPlantProvider({ children }: { children: ReactNode }) {
  const defaultAssignment: UserAssignment = {
    isGlobal: false,
    locations: ["loc-bhiwadi"],
    plants: ["plant-bhi-ngm", "plant-bhi-pgtl"],
  };
  const defaultSeed: Record<string, UserAssignment> = {
    "verify.software2040@pgel.in": defaultAssignment,
  };

  // SSR-safe state initializers to eliminate React Hydration error #418
  const [locations, setLocations] = useState<LocationItem[]>(DEFAULT_LOCATIONS);
  const [userAssignments, setUserAssignments] = useState<Record<string, UserAssignment>>(defaultSeed);
  const [selectedLocationId, setSelectedLocationIdState] = useState<string>("ALL");
  const [selectedPlantId, setSelectedPlantIdState] = useState<string>("ALL");

  // Client-side hydration sync to guarantee SSR HTML matches initial render
  useEffect(() => {
    try {
      const savedLoc = localStorage.getItem(STORAGE_KEY_LOCATIONS);
      if (savedLoc) {
        const parsed = JSON.parse(savedLoc);
        if (Array.isArray(parsed) && parsed.length > 0) setLocations(parsed);
      }
      const savedAssign = localStorage.getItem(STORAGE_KEY_ASSIGNMENTS);
      if (savedAssign) {
        const parsed = JSON.parse(savedAssign);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          setUserAssignments((prev) => ({ ...prev, ...parsed }));
        }
      }
      const savedSelLoc = localStorage.getItem(STORAGE_KEY_SEL_LOC);
      if (savedSelLoc) setSelectedLocationIdState(savedSelLoc);
      const savedSelPlant = localStorage.getItem(STORAGE_KEY_SEL_PLANT);
      if (savedSelPlant) setSelectedPlantIdState(savedSelPlant);
    } catch (e) {
      console.warn("Failed to restore locations from localStorage", e);
    }
  }, []);

  // Fetch latest Locations & User Assignments directly from Supabase Database (Auth-guarded to prevent 401)
  const fetchFromSupabase = useCallback(async () => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData?.session) {
        return; // Avoid unauthenticated 401 error
      }

      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .in("name", [DB_LOCATION_ROW_NAME, DB_ASSIGNMENTS_ROW_NAME]);

      if (error) {
        return;
      }

      if (data && data.length > 0) {
        const locRow = data.find((r) => r.name === DB_LOCATION_ROW_NAME);
        const assignRow = data.find((r) => r.name === DB_ASSIGNMENTS_ROW_NAME);

        if (locRow && locRow.description) {
          try {
            const parsedLocs = JSON.parse(locRow.description);
            if (Array.isArray(parsedLocs) && parsedLocs.length > 0) {
              setLocations(parsedLocs);
              if (typeof window !== "undefined") {
                localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(parsedLocs));
              }
            } else {
              setLocations(DEFAULT_LOCATIONS);
              syncLocationsToSupabase(DEFAULT_LOCATIONS);
            }
          } catch (e) {
            console.error("Error parsing locations from Supabase", e);
            setLocations(DEFAULT_LOCATIONS);
            syncLocationsToSupabase(DEFAULT_LOCATIONS);
          }
        } else {
          syncLocationsToSupabase(DEFAULT_LOCATIONS);
        }

        if (assignRow && assignRow.description) {
          try {
            const parsedAssign = JSON.parse(assignRow.description);
            if (parsedAssign && typeof parsedAssign === "object") {
              setUserAssignments((prev) => ({ ...prev, ...parsedAssign }));
              if (typeof window !== "undefined") {
                localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(parsedAssign));
              }
            }
          } catch (e) {
            console.error("Error parsing assignments from Supabase", e);
          }
        } else if (Object.keys(userAssignments).length > 0) {
          syncAssignmentsToSupabase(userAssignments);
        }
      } else {
        // First time initialization in Supabase
        syncLocationsToSupabase(DEFAULT_LOCATIONS);
        if (Object.keys(userAssignments).length > 0) syncAssignmentsToSupabase(userAssignments);
      }
    } catch (err) {
      console.warn("Could not fetch locations & assignments from Supabase", err);
    }
  }, [userAssignments]);

  // Sync Locations to Supabase (Auth-guarded)
  const syncLocationsToSupabase = async (updatedLocations: LocationItem[]) => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData?.session) return;

      const { data: existing } = await supabase
        .from("departments")
        .select("id")
        .eq("name", DB_LOCATION_ROW_NAME)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("departments")
          .update({ description: JSON.stringify(updatedLocations) })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("departments")
          .insert({
            name: DB_LOCATION_ROW_NAME,
            description: JSON.stringify(updatedLocations),
          });
      }
    } catch (err) {
      console.warn("Error saving locations to Supabase", err);
    }
  };

  // Sync User Assignments to Supabase (Auth-guarded)
  const syncAssignmentsToSupabase = async (updatedAssignments: Record<string, UserAssignment>) => {
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (!sessData?.session) return;

      const { data: existing } = await supabase
        .from("departments")
        .select("id")
        .eq("name", DB_ASSIGNMENTS_ROW_NAME)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("departments")
          .update({ description: JSON.stringify(updatedAssignments) })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("departments")
          .insert({
            name: DB_ASSIGNMENTS_ROW_NAME,
            description: JSON.stringify(updatedAssignments),
          });
      }
    } catch (err) {
      console.warn("Error saving assignments to Supabase", err);
    }
  };

  // Initial load & real-time listener for database changes
  useEffect(() => {
    fetchFromSupabase();

    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        fetchFromSupabase();
      }
    });

    const channel = supabase
      .channel("locations-and-assignments-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "departments",
        },
        (payload: any) => {
          if (payload.new) {
            if (payload.new.name === DB_LOCATION_ROW_NAME && payload.new.description) {
              try {
                const parsed = JSON.parse(payload.new.description);
                if (Array.isArray(parsed)) {
                  setLocations(parsed);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(parsed));
                  }
                }
              } catch (e) {
                console.warn("Error parsing realtime location update", e);
              }
            } else if (payload.new.name === DB_ASSIGNMENTS_ROW_NAME && payload.new.description) {
              try {
                const parsed = JSON.parse(payload.new.description);
                if (parsed && typeof parsed === "object") {
                  setUserAssignments(parsed);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(parsed));
                  }
                }
              } catch (e) {
                console.warn("Error parsing realtime assignment update", e);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      authSub.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [fetchFromSupabase]);

  // Save locations to localStorage as client cache
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(locations));
      } catch (e) {
        console.warn("Failed to persist locations", e);
      }
    }
  }, [locations]);

  // Save user assignments
  const saveUserAssignments = (newAssignments: Record<string, UserAssignment>) => {
    setUserAssignments(newAssignments);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_ASSIGNMENTS, JSON.stringify(newAssignments));
    }
    syncAssignmentsToSupabase(newAssignments);
  };

  // Helper to get allowed locations for a given user (Strict Enforcement)
  const getUserLocations = useCallback(
    (userEmailOrId?: string | null, role?: string | null): LocationItem[] => {
      if (locations.length === 0) return [];
      if (!userEmailOrId || role === "it_admin" || userEmailOrId.toLowerCase().includes("software.2040")) {
        return locations;
      }

      // Check assignment by email or id
      const assign =
        userAssignments[userEmailOrId] ||
        userAssignments[userEmailOrId.toLowerCase()] ||
        Object.entries(userAssignments).find(([k]) => k.toLowerCase() === userEmailOrId.toLowerCase())?.[1];

      if (assign) {
        if (assign.isGlobal) return locations;
        if (assign.locations && assign.locations.length > 0) {
          return locations.filter((loc) => assign.locations.includes(loc.id));
        }
        // User is configured with 0 locations
        return [];
      }

      // If user has no assignment config at all and is operator, return empty or first location
      return locations;
    },
    [locations, userAssignments]
  );

  // Helper to get allowed plants for a given location and user (Strict Enforcement)
  const getUserPlants = useCallback(
    (locationId: string, userEmailOrId?: string | null, role?: string | null): PlantItem[] => {
      const loc = locations.find((l) => l.id === locationId);
      if (!loc || !loc.plants || loc.plants.length === 0) return [];
      if (!userEmailOrId || role === "it_admin" || userEmailOrId.toLowerCase().includes("software.2040")) {
        return loc.plants;
      }

      const assign =
        userAssignments[userEmailOrId] ||
        userAssignments[userEmailOrId.toLowerCase()] ||
        Object.entries(userAssignments).find(([k]) => k.toLowerCase() === userEmailOrId.toLowerCase())?.[1];

      if (assign) {
        if (assign.isGlobal) return loc.plants;
        if (assign.plants && assign.plants.length > 0) {
          // STRICT FILTER: Only return plants explicitly present in user's assigned plant list
          return loc.plants.filter((p) => assign.plants.includes(p.id));
        }
        // User has no plants assigned for this location
        return [];
      }

      return loc.plants;
    },
    [locations, userAssignments]
  );

  // Setters with persistent storage
  const setSelectedLocationId = (id: string) => {
    setSelectedLocationIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SEL_LOC, id);
    }
    // Auto-adjust selected plant if necessary
    if (id === "ALL") {
      setSelectedPlantIdState("ALL");
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_SEL_PLANT, "ALL");
    } else {
      const targetLoc = locations.find((l) => l.id === id);
      if (targetLoc && targetLoc.plants.length > 0) {
        const hasPlant = targetLoc.plants.some((p) => p.id === selectedPlantId);
        if (!hasPlant) {
          const firstPlantId = targetLoc.plants[0].id;
          setSelectedPlantIdState(firstPlantId);
          if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_SEL_PLANT, firstPlantId);
        }
      } else {
        setSelectedPlantIdState("ALL");
        if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_SEL_PLANT, "ALL");
      }
    }
  };

  const setSelectedPlantId = (id: string) => {
    setSelectedPlantIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_SEL_PLANT, id);
    }
  };

  const activeLocation = useMemo(() => {
    if (selectedLocationId === "ALL") return null;
    return locations.find((l) => l.id === selectedLocationId) || null;
  }, [locations, selectedLocationId]);

  const availablePlants = useMemo(() => {
    if (!activeLocation) {
      return locations.flatMap((l) => l.plants);
    }
    return activeLocation.plants;
  }, [locations, activeLocation]);

  const activePlant = useMemo(() => {
    if (selectedPlantId === "ALL") return null;
    for (const loc of locations) {
      const found = loc.plants.find((p) => p.id === selectedPlantId);
      if (found) return found;
    }
    return null;
  }, [locations, selectedPlantId]);

  const allPlants = useMemo(() => {
    return locations.flatMap((l) =>
      l.plants.map((p) => ({
        ...p,
        locationId: l.id,
        locationName: l.name,
      }))
    );
  }, [locations]);

  // CRUD for Location
  const addLocation = (locData: Omit<LocationItem, "id" | "plants">) => {
    const newLoc: LocationItem = {
      ...locData,
      id: `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      plants: [],
      active: locData.active ?? true,
    };
    const updated = [...locations, newLoc];
    setLocations(updated);
    syncToSupabase(updated);
    if (locations.length === 0) {
      setSelectedLocationId(newLoc.id);
    }
    return newLoc;
  };

  const updateLocation = (id: string, updates: Partial<Omit<LocationItem, "id" | "plants">>) => {
    const updated = locations.map((loc) => (loc.id === id ? { ...loc, ...updates } : loc));
    setLocations(updated);
    syncToSupabase(updated);
  };

  const deleteLocation = (id: string) => {
    const updated = locations.filter((loc) => loc.id !== id);
    setLocations(updated);
    syncToSupabase(updated);
    if (selectedLocationId === id) {
      setSelectedLocationId("ALL");
    }
  };

  // CRUD for Plants inside Location
  const addPlant = (locationId: string, plantData: Omit<PlantItem, "id">) => {
    const newPlant: PlantItem = {
      ...plantData,
      id: `plant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      active: plantData.active ?? true,
    };
    const updated = locations.map((loc) =>
      loc.id === locationId ? { ...loc, plants: [...loc.plants, newPlant] } : loc
    );
    setLocations(updated);
    syncToSupabase(updated);
    if (selectedPlantId === "ALL") {
      setSelectedPlantId(newPlant.id);
    }
    return newPlant;
  };

  const updatePlant = (locationId: string, plantId: string, updates: Partial<Omit<PlantItem, "id">>) => {
    const updated = locations.map((loc) =>
      loc.id === locationId
        ? {
            ...loc,
            plants: loc.plants.map((p) => (p.id === plantId ? { ...p, ...updates } : p)),
          }
        : loc
    );
    setLocations(updated);
    syncToSupabase(updated);
  };

  const deletePlant = (locationId: string, plantId: string) => {
    const updated = locations.map((loc) =>
      loc.id === locationId
        ? { ...loc, plants: loc.plants.filter((p) => p.id !== plantId) }
        : loc
    );
    setLocations(updated);
    syncToSupabase(updated);
    if (selectedPlantId === plantId) {
      setSelectedPlantId("ALL");
    }
  };

  return (
    <LocationPlantContext.Provider
      value={{
        locations,
        userAssignments,
        selectedLocationId,
        selectedPlantId,
        setSelectedLocationId,
        setSelectedPlantId,
        activeLocation,
        activePlant,
        availablePlants,
        allPlants,
        addLocation,
        updateLocation,
        deleteLocation,
        addPlant,
        updatePlant,
        deletePlant,
        getUserLocations,
        getUserPlants,
        saveUserAssignments,
        refreshFromDatabase: fetchFromSupabase,
      }}
    >
      {children}
    </LocationPlantContext.Provider>
  );
}

export function useLocationPlant() {
  const context = useContext(LocationPlantContext);
  if (!context) {
    throw new Error("useLocationPlant must be used within a LocationPlantProvider");
  }
  return context;
}
