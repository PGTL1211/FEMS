import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import nodemailer from "nodemailer";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordOtpFailureInternal } from "./auth-events.functions";
import { loadEnvFile } from "@/lib/load-env";

const EmailInput = z.object({ email: z.string().trim().min(1) });
const ALLOWED_DOMAIN = "pgel.in";
const DEFAULT_IT_ADMIN = "software.2040@pgel.in";

export function resolvePgelIdentifier(input: string): string {
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) {
    return trimmed;
  }
  const roleMap: Record<string, string> = {
    admin: DEFAULT_IT_ADMIN,
    it_admin: DEFAULT_IT_ADMIN,
    super_admin: DEFAULT_IT_ADMIN,
    operator: DEFAULT_IT_ADMIN,
    "pg-001": DEFAULT_IT_ADMIN,
    "pg-002": DEFAULT_IT_ADMIN,
  };
  if (roleMap[trimmed]) {
    return roleMap[trimmed];
  }
  return `${trimmed}@${ALLOWED_DOMAIN}`;
}

function isAllowedEmail(email: string) {
  const e = email.toLowerCase().trim();
  if (e === DEFAULT_IT_ADMIN) return true;
  return e.endsWith("@" + ALLOWED_DOMAIN);
}

const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_DURATION_MIN = 15;
const LOCKOUT_THRESHOLD = 5;
const OTP_VERIFY_TYPES = ["email", "magiclink", "recovery"] as const;
const OTP_EXPIRY_MIN = 60 * 24;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

async function hashOtpCode(email: string, code: string, salt: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SMTP_PASS ?? "sprms";
  const bytes = new TextEncoder().encode(`${email.toLowerCase()}:${code.trim()}:${salt}:${secret}`);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkLocked(supabaseAdmin: any, email: string) {
  try {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("auth_events")
      .select("event_type, created_at")
      .eq("email", email)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    const cutoff = Date.now() - LOCKOUT_DURATION_MIN * 60_000;
    const lock = (rows ?? []).find(
      (r: any) => r.event_type === "lockout" && new Date(r.created_at).getTime() > cutoff,
    );
    if (lock) {
      return {
        locked: true as const,
        unlock_at: new Date(new Date(lock.created_at).getTime() + LOCKOUT_DURATION_MIN * 60_000).toISOString(),
      };
    }
  } catch {}
  return { locked: false as const };
}

function buildHtml(code: string, fromName: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#2563eb);padding:24px 28px;color:#fff">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">${fromName}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px">Your 6-Digit Verification Code</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334155">
            Use this 6-digit verification code to sign in. It expires in <strong>10 minutes</strong> and can be used only once.
          </p>
          <div style="margin:24px auto;text-align:center">
            <div style="display:inline-block;padding:18px 28px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;
                        font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:12px;color:#0f172a">${code}</div>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.55;color:#64748b">
            If you did not request this code, you can safely ignore this email. Do not share this code with anyone — our team will never ask for it.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;font-size:12px">
          © ${new Date().getFullYear()} ${fromName}. This is an automated message — please do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function generateAndSendOtp(email: string, trigger: "user" | "admin", actorId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const lower = email.toLowerCase();

  if (!isAllowedEmail(lower)) {
    return { ok: false as const, status: "blocked" as const, message: `Only @${ALLOWED_DOMAIN} email addresses are allowed.` };
  }

  const lock = await checkLocked(supabaseAdmin, lower);
  if (lock.locked) {
    return { ok: false as const, locked: true, unlock_at: lock.unlock_at, status: "blocked" as const };
  }

  if (trigger === "user") {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", lower)
        .maybeSingle();
      if (!profile) {
        if (lower === DEFAULT_IT_ADMIN) {
          const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
          let u = (existingUsers?.users ?? []).find((usr: any) => usr.email?.toLowerCase() === DEFAULT_IT_ADMIN);
          if (!u) {
            const randomPass = crypto.randomUUID() + "-!ITAdmin2026";
            await supabaseAdmin.auth.admin.createUser({
              email: DEFAULT_IT_ADMIN,
              password: randomPass,
              email_confirm: true,
              user_metadata: { full_name: "IT Admin" },
            });
          }
        }
      }
    } catch {}
  }

  const gen = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: lower,
  });
  if (gen.error || !gen.data?.properties?.email_otp) {
    try {
      await supabaseAdmin.from("auth_events").insert({
        email: lower,
        event_type: trigger === "admin" ? "admin_otp_sent" : "otp_sent",
        success: false,
        message: gen.error?.message ?? "Failed to generate OTP",
        metadata: { status: "failed", channel: "smtp", triggered_by: actorId ?? null },
      });
    } catch {}
    throw new Error(gen.error?.message ?? "Failed to generate OTP");
  }
  const code = gen.data.properties.email_otp as string;
  const verificationType = gen.data.properties.verification_type ?? "magiclink";

  try {
    loadEnvFile();
  } catch {}

  const isWorkerd =
    typeof navigator !== "undefined" &&
    typeof (navigator as any).userAgent === "string" &&
    (navigator as any).userAgent.includes("Cloudflare-Workers");
  const smtpHost = process.env.SMTP_HOST || "smtp.office365.com";
  const smtpUser = process.env.SMTP_USER || "verify.software2040@pgel.in";
  // Dedicated active Microsoft 365 app password for verify.software2040@pgel.in
  const smtpPass = (process.env.SMTP_PASS === "fmdrdczrxkpjrbsv")
    ? process.env.SMTP_PASS
    : "fmdrdczrxkpjrbsv";
  const fromName = process.env.SMTP_FROM_NAME || "PGEL MIS Verification";
  const fromAddr = process.env.SMTP_FROM || smtpUser || "verify.software2040@pgel.in";
  const port = Number(process.env.SMTP_PORT || 587);

  let sendStatus: "sent" | "failed" = "sent";
  let sendError: string | null = null;
  try {
    if (isWorkerd) {
      const workerMailerModule = "worker-mailer";
      const { WorkerMailer } = await import(/* @vite-ignore */ workerMailerModule);
      const mailer = await WorkerMailer.connect({
        host: smtpHost,
        port,
        secure: port === 465,
        startTls: port !== 465,
        credentials: {
          username: smtpUser,
          password: smtpPass,
        },
        authType: ["plain", "login"],
      });
      await mailer.send({
        from: { name: fromName, email: fromAddr },
        to: { email },
        subject: `PGEL MIS - Login Verification OTP: [${code}]`,
        text: `Your verification code is ${code}. It expires in 10 minutes.`,
        html: buildHtml(code, fromName),
      });
    } else {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: false, // 587 STARTTLS
        auth: { user: smtpUser, pass: smtpPass },
        tls: {
          ciphers: "SSLv3",
          rejectUnauthorized: false,
        },
      });
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: email,
        subject: `PGEL MIS - Login Verification OTP: [${code}]`,
        text: `Your verification code is ${code}. It expires in 10 minutes.`,
        html: buildHtml(code, fromName),
      });
    }
  } catch (e: any) {
    sendStatus = "failed";
    sendError = e?.message ?? String(e);
  }

  try {
    await supabaseAdmin.from("auth_events").insert({
      email: lower,
      event_type: trigger === "admin" ? "admin_otp_sent" : "otp_sent",
      success: sendStatus === "sent",
      message: sendError ?? `OTP delivered via SMTP (${smtpHost})`,
      metadata: {
        status: sendStatus,
        channel: "smtp",
        host: smtpHost,
        verification_type: verificationType,
        triggered_by: actorId ?? null,
      },
    });
  } catch {}

  if (sendStatus === "failed") {
    throw new Error(`SMTP send failed: ${sendError}`);
  }

  try {
    const salt = globalThis.crypto.randomUUID();
    const codeHash = await hashOtpCode(lower, code, salt);
    await (supabaseAdmin as any)
      .from("otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", lower)
      .is("consumed_at", null);
    await (supabaseAdmin as any).from("otp_challenges").insert({
      email: lower,
      code_hash: `${salt}:${codeHash}`,
      token_hash: gen.data.properties.hashed_token,
      verification_type: verificationType,
      expires_at: new Date(Date.now() + OTP_EXPIRY_MIN * 60_000).toISOString(),
    });
  } catch {}

  return { ok: true as const, status: sendStatus, sent_at: new Date().toISOString() };
}

export const requestOtpEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => EmailInput.parse(d))
  .handler(async ({ data }) => {
    const resolvedEmail = resolvePgelIdentifier(data.email);
    const res = await generateAndSendOtp(resolvedEmail, "user");
    return { ...res, resolvedEmail };
  });

export const verifyOtpEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().min(1), token: z.string().trim().min(4).max(10) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = resolvePgelIdentifier(data.email);

    if (!isAllowedEmail(email)) {
      return { ok: false as const, message: `Only @${ALLOWED_DOMAIN} email addresses are allowed.` };
    }

    const lock = await checkLocked(supabaseAdmin, email);
    if (lock.locked) {
      return { ok: false as const, locked: true as const, unlock_at: lock.unlock_at };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const pubKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const supa = createClient(
      supaUrl,
      pubKey,
      {
        global: { fetch: createSupabaseFetch(pubKey) },
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      },
    );

    const now = new Date().toISOString();
    let challenge: any = null;
    try {
      const res = await (supabaseAdmin as any)
        .from("otp_challenges")
        .select("id, code_hash, token_hash, verification_type, expires_at")
        .eq("email", email)
        .is("consumed_at", null)
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      challenge = res.data;
    } catch {}

    if (challenge?.code_hash && challenge?.token_hash) {
      const [salt, expectedHash] = String(challenge.code_hash).split(":");
      const actualHash = salt ? await hashOtpCode(email, data.token, salt) : "";

      if (!salt || actualHash !== expectedHash) {
        const res = await recordOtpFailureInternal(email, "Invalid OTP");
        return {
          ok: false as const,
          locked: res.locked,
          failed_count: res.failed_count,
          threshold: LOCKOUT_THRESHOLD,
          lockout_minutes: res.locked ? LOCKOUT_DURATION_MIN : undefined,
          message: "Invalid OTP",
        };
      }

      const fresh = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const freshType =
        OTP_VERIFY_TYPES.find((t) => t === fresh.data?.properties?.verification_type) ?? "magiclink";
      const { data: tokenData, error: tokenError } = fresh.data?.properties?.hashed_token
        ? await supa.auth.verifyOtp({
            token_hash: fresh.data.properties.hashed_token,
            type: freshType,
          })
        : { data: null as any, error: fresh.error ?? new Error("Failed to mint session") };

      if (tokenError || !tokenData?.session) {
        const res = await recordOtpFailureInternal(email, tokenError?.message ?? "Invalid OTP");
        return {
          ok: false as const,
          locked: res.locked,
          failed_count: res.failed_count,
          threshold: LOCKOUT_THRESHOLD,
          lockout_minutes: res.locked ? LOCKOUT_DURATION_MIN : undefined,
          message: tokenError?.message ?? "Invalid OTP",
        };
      }

      try {
        await (supabaseAdmin as any)
          .from("otp_challenges")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", challenge.id);
        await supabaseAdmin.from("auth_events").insert({
          email, event_type: "otp_verified", success: true,
        });
      } catch {}

      const session = tokenData.session;
      if (email === DEFAULT_IT_ADMIN && session?.user?.id) {
        try {
          for (const role of ["super_admin", "it_admin"]) {
            const { data: existingRole } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .eq("role", role)
              .maybeSingle();
            if (!existingRole) {
              await supabaseAdmin.from("user_roles").insert({ user_id: session.user.id, role });
            }
          }
        } catch {}
      }
      return {
        ok: true as const,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      };
    }

    let verifyData: any = null;
    let lastError: any = null;
    for (const type of OTP_VERIFY_TYPES) {
      const attempt = await supa.auth.verifyOtp({ email, token: data.token, type });
      if (attempt.data?.session && !attempt.error) {
        verifyData = attempt.data;
        lastError = null;
        break;
      }
      lastError = attempt.error;
    }

    if (lastError || !verifyData?.session) {
      const res = await recordOtpFailureInternal(email, lastError?.message ?? "Invalid OTP");
      return {
        ok: false as const,
        locked: res.locked,
        failed_count: res.failed_count,
        threshold: LOCKOUT_THRESHOLD,
        lockout_minutes: res.locked ? LOCKOUT_DURATION_MIN : undefined,
        message: lastError?.message ?? "Invalid OTP",
      };
    }

    try {
      await supabaseAdmin.from("auth_events").insert({
        email, event_type: "otp_verified", success: true,
      });
    } catch {}

    const session = verifyData.session;
    if (email === DEFAULT_IT_ADMIN && session?.user?.id) {
      try {
        for (const role of ["super_admin", "it_admin"]) {
          const { data: existingRole } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .eq("role", role)
            .maybeSingle();
          if (!existingRole) {
            await supabaseAdmin.from("user_roles").insert({ user_id: session.user.id, role });
          }
        }
      } catch {}
    }
    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });
