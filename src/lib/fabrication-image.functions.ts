import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const uploadFabricationWeighingImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      base64Data: z.string().min(10),
      fileName: z.string().optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Extract mime type and raw base64 buffer
      let mimeType = "image/jpeg";
      let base64Content = data.base64Data;

      if (data.base64Data.startsWith("data:")) {
        const matches = data.base64Data.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Content = matches[2];
        } else if (data.base64Data.includes("image/svg+xml")) {
          // SVG data URL
          mimeType = "image/svg+xml";
          const rawSvg = decodeURIComponent(data.base64Data.split(",")[1] || "");
          const ext = "svg";
          const uniqueName = `scale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
          
          const { error: uploadError } = await supabaseAdmin.storage
            .from("fabrication_images")
            .upload(uniqueName, Buffer.from(rawSvg, "utf-8"), {
              contentType: mimeType,
              upsert: true,
            });

          if (!uploadError) {
            const { data: pubData } = supabaseAdmin.storage
              .from("fabrication_images")
              .getPublicUrl(uniqueName);
            return {
              success: true,
              publicUrl: pubData.publicUrl,
              storagePath: uniqueName,
            };
          }
        }
      }

      const buffer = Buffer.from(base64Content, "base64");
      const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
      const uniqueName = `scale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

      // Upload to Supabase Storage bucket 'fabrication_images'
      const { data: uploadResult, error: uploadError } = await supabaseAdmin.storage
        .from("fabrication_images")
        .upload(uniqueName, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.warn("[Supabase Storage] Upload error, falling back to base64:", uploadError.message);
        return {
          success: false,
          publicUrl: data.base64Data,
          error: uploadError.message,
        };
      }

      // Retrieve permanent public Supabase URL
      const { data: pubData } = supabaseAdmin.storage
        .from("fabrication_images")
        .getPublicUrl(uniqueName);

      return {
        success: true,
        publicUrl: pubData.publicUrl,
        storagePath: uploadResult.path,
      };
    } catch (e: any) {
      console.error("[Supabase Storage] Upload exception:", e);
      return {
        success: false,
        publicUrl: data.base64Data,
        error: e.message,
      };
    }
  });
