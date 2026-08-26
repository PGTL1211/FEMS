import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MIN = 15;

const LogInput = z.object({
  email: z.string().email(),
  event_type: z.enum(["otp_verified", "resend_otp"]),
  success: z.boolean().default(true),
  message: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const logAuthEvent = createServerFn({ method: "POST" })
  .inputValidator((d) => LogInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("auth_events").insert({
        email: data.email.toLowerCase(),
        event_type: data.event_type,
        success: data.success,
        message: data.message ?? null,
        metadata: data.metadata ?? {},
      });
    } catch {}
    return { ok: true };
  });

const EmailInput = z.object({ email: z.string().email() });

export const checkLockout = createServerFn({ method: "POST" })
  .inputValidator((d) => EmailInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
      const { data: rows } = await supabaseAdmin
        .from("auth_events")
        .select("event_type, created_at")
        .eq("email", data.email.toLowerCase())
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);

      const cutoff = Date.now() - LOCKOUT_DURATION_MIN * 60_000;
      const activeLock = (rows ?? []).find(
        (r: any) => r.event_type === "lockout" && new Date(r.created_at).getTime() > cutoff
      );
      if (activeLock) {
        const unlockAt = new Date(new Date(activeLock.created_at).getTime() + LOCKOUT_DURATION_MIN * 60_000);
        return { locked: true, unlock_at: unlockAt.toISOString(), reason: "Too many failed attempts" };
      }

      const failedCount = (rows ?? []).filter((r: any) => r.event_type === "otp_failed").length;
      return { locked: false, failed_count: failedCount, threshold: LOCKOUT_THRESHOLD };
    } catch {
      return { locked: false, failed_count: 0, threshold: LOCKOUT_THRESHOLD };
    }
  });

export async function recordOtpFailureInternal(email: string, message?: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const lower = email.toLowerCase();
    await supabaseAdmin.from("auth_events").insert({
      email: lower, event_type: "otp_failed", success: false, message: message ?? "Invalid OTP",
    });
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from("auth_events")
      .select("*", { count: "exact", head: true })
      .eq("email", lower)
      .eq("event_type", "otp_failed")
      .gte("created_at", since);
    if ((count ?? 0) >= LOCKOUT_THRESHOLD) {
      await supabaseAdmin.from("auth_events").insert({
        email: lower, event_type: "lockout", success: false,
        message: `Locked for ${LOCKOUT_DURATION_MIN} min after ${count} failed attempts`,
        metadata: { lockout_minutes: LOCKOUT_DURATION_MIN },
      });
      return { locked: true as const, failed_count: count ?? 0, lockout_minutes: LOCKOUT_DURATION_MIN };
    }
    return { locked: false as const, failed_count: count ?? 0, threshold: LOCKOUT_THRESHOLD };
  } catch {
    return { locked: false as const, failed_count: 0, threshold: LOCKOUT_THRESHOLD };
  }
}
