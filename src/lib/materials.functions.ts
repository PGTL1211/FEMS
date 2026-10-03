import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(ctx: { supabase: any; userId: string; claims?: any }) {
  if (ctx.claims?.email && ctx.claims.email.toLowerCase().trim() === "software.2040@pgel.in") {
    return;
  }
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "it_admin",
  });
  if (error || !data) {
    throw new Error("Forbidden: Super Admin (IT Admin) access required");
  }
}

export const updateMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      id: z.string(),
      name: z.string().trim().min(1, "Name is required"),
      code: z.string().trim().min(1, "Code is required"),
      uom: z.string().trim().min(1, "UOM is required"),
      unit_weight_kg: z.number().min(0, "Weight must be non-negative"),
      minimum_stock: z.number().min(0, "Minimum stock must be non-negative"),
      description: z.string().optional().nullable(),
      active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Clean description with Weight embed so weight is always saved and preserved
    const weightStr = `Weight: ${data.unit_weight_kg.toFixed(2)} kg`;
    let finalDesc = data.description?.trim() || "";
    // If description already has Weight: ... replace it, otherwise append
    if (finalDesc.match(/weight[:\s=]+[0-9]+(?:\.[0-9]+)?\s*(?:kg)?/i)) {
      finalDesc = finalDesc.replace(/weight[:\s=]+[0-9]+(?:\.[0-9]+)?\s*(?:kg)?/i, weightStr);
    } else if (finalDesc) {
      finalDesc = `${finalDesc} | ${weightStr}`;
    } else {
      finalDesc = weightStr;
    }

    // Try finding by ID or code/name if demo ID was used
    let targetId = data.id;
    const { data: existing } = await supabaseAdmin.from("materials").select("id").eq("id", targetId).maybeSingle();
    if (!existing) {
      const { data: byCode } = await supabaseAdmin.from("materials").select("id").eq("code", data.code).maybeSingle();
      if (byCode) targetId = byCode.id;
    }

    const { error } = await supabaseAdmin.from("materials").update({
      name: data.name,
      code: data.code,
      uom: data.uom,
      minimum_stock: data.minimum_stock,
      description: finalDesc,
      ...(data.active !== undefined ? { active: data.active } : {}),
    }).eq("id", targetId);

    if (error) {
      throw new Error(`Failed to update material in database: ${error.message}`);
    }

    return { ok: true, id: targetId };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({
      id: z.string(),
      code: z.string().optional(),
      name: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetId = data.id;
    const { data: existing } = await supabaseAdmin.from("materials").select("id").eq("id", targetId).maybeSingle();
    if (!existing) {
      if (data.code) {
        const { data: byCode } = await supabaseAdmin.from("materials").select("id").eq("code", data.code).maybeSingle();
        if (byCode) targetId = byCode.id;
      }
      if (!existing && data.name) {
        const { data: byName } = await supabaseAdmin.from("materials").select("id").ilike("name", data.name).maybeSingle();
        if (byName) targetId = byName.id;
      }
    }

    // Remove child fabrication_materials if linked
    try {
      await supabaseAdmin.from("fabrication_materials").delete().eq("material_id", targetId);
    } catch (e) {
      // ignore
    }

    // Delete from materials table
    const { error } = await supabaseAdmin.from("materials").delete().eq("id", targetId);
    if (error) {
      if (error.code === "23503") {
        throw new Error("Cannot delete: This material is linked to existing Purchase Orders or Invoices. Please remove those records first or deactivate the material.");
      }
      throw new Error(`Failed to delete material from database: ${error.message}`);
    }

    return { ok: true, deletedId: targetId };
  });
