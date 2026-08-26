import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["it_admin", "hod", "operator"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "it_admin",
  });
  if (error) throw new Error("Authorization failed");
  if (!data) throw new Error("Forbidden: IT Admin only");
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, active, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw new Error(rErr.message);

    const roleMap = new Map<string, string>();
    (roles ?? []).forEach((r) => {
      const cur = roleMap.get(r.user_id);
      const pri = (x: string) => (x === "it_admin" ? 1 : x === "hod" ? 2 : 3);
      if (!cur || pri(r.role) < pri(cur)) roleMap.set(r.user_id, r.role);
    });
    return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? null }));
  });

export const createAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().trim().toLowerCase().email(),
      full_name: z.string().trim().min(1).max(120),
      role: roleEnum,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    // handle_new_user trigger creates profile + a default role. Overwrite role.
    const { error: delErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (insErr) throw new Error(insErr.message);
    await supabaseAdmin.from("profiles").update({ full_name: data.full_name, email: data.email, active: true }).eq("id", uid);
    return { id: uid };
  });

export const updateAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      full_name: z.string().trim().min(1).max(120).optional(),
      role: roleEnum.optional(),
      active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.full_name !== undefined || data.active !== undefined) {
      const patch: { full_name?: string; active?: boolean } = {};
      if (data.full_name !== undefined) patch.full_name = data.full_name;
      if (data.active !== undefined) patch.active = data.active;
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.id);
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.id, role: data.role });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.id === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
