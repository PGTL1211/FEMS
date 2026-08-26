import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function useRole(userId: string | undefined, userEmail?: string | null) {
  return useQuery({
    queryKey: ["role", userId, userEmail],
    enabled: !!userId || !!userEmail,
    queryFn: async (): Promise<AppRole | null> => {
      if (userEmail && userEmail.toLowerCase().trim() === "software.2040@pgel.in") {
        return "it_admin";
      }
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .order("role", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        if (userEmail && userEmail.toLowerCase().trim() === "software.2040@pgel.in") {
          return "it_admin";
        }
        return null;
      }
      const roles = data.map((r) => r.role);
      if (roles.includes("it_admin") || roles.includes("super_admin")) return "it_admin";
      if (roles.includes("hod")) return "hod";
      return "operator";
    },
    staleTime: 60_000,
  });
}

export function roleLabel(role: AppRole | null | undefined) {
  switch (role) {
    case "it_admin": return "IT Admin";
    case "hod": return "HOD";
    case "operator": return "Operator";
    default: return "—";
  }
}
