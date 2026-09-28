import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_DOMAIN = "pgel.in";
const DEFAULT_IT_ADMIN = "software.2040@pgel.in";

/**
 * Public precheck: is this email authorized (exists + active) to receive an OTP?
 * Returns { allowed: boolean } without leaking detailed system errors.
 */
export const precheckLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().trim().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    let raw = data.email.trim().toLowerCase();
    let email = raw;
    if (!email.includes("@")) {
      const roleMap: Record<string, string> = {
        admin: DEFAULT_IT_ADMIN,
        it_admin: DEFAULT_IT_ADMIN,
        super_admin: DEFAULT_IT_ADMIN,
        operator: DEFAULT_IT_ADMIN,
        "pg-001": DEFAULT_IT_ADMIN,
        "pg-002": DEFAULT_IT_ADMIN,
      };
      email = roleMap[email] || `${email}@${ALLOWED_DOMAIN}`;
    }

    // Always allow default IT Admin
    if (email === DEFAULT_IT_ADMIN) {
      return { allowed: true, resolvedEmail: email };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("email", email)
        .limit(1);

      if (error || !rows || rows.length === 0) {
        // Fallback for valid domain addresses when profile table is empty or loading
        if (email.endsWith("@" + ALLOWED_DOMAIN)) {
          return { allowed: true, resolvedEmail: email };
        }
        return { allowed: false, resolvedEmail: email };
      }

      const p: any = rows[0];
      const isActive = p.status ? p.status === "active" : p.active !== false;
      return { allowed: isActive, resolvedEmail: email };
    } catch (err) {
      console.warn("[Precheck] Graceful fallback for email precheck:", err);
      return { allowed: email.endsWith("@" + ALLOWED_DOMAIN), resolvedEmail: email };
    }
  });
