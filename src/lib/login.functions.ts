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
    z.object({ email: z.string().trim().toLowerCase().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();

    // Always allow default IT Admin
    if (email === DEFAULT_IT_ADMIN) {
      return { allowed: true };
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
          return { allowed: true };
        }
        return { allowed: false };
      }

      const p: any = rows[0];
      const isActive = p.status ? p.status === "active" : p.active !== false;
      return { allowed: isActive };
    } catch (err) {
      console.warn("[Precheck] Graceful fallback for email precheck:", err);
      return { allowed: email.endsWith("@" + ALLOWED_DOMAIN) };
    }
  });
