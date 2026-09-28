import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { precheckLoginEmail } from "@/lib/login.functions";
import { requestOtpEmail, verifyOtpEmail } from "@/lib/smtp-otp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Factory, Mail, KeyRound, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — FEMS" },
      { name: "description", content: "Secure OTP sign-in for authorized IDMS users." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

type Step = "email" | "otp";

function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendOtpSmtp = useServerFn(requestOtpEmail);
  const verifyOtpFn = useServerFn(verifyOtpEmail);

  useEffect(() => {
    return () => { if (resendTimer.current) clearInterval(resendTimer.current); };
  }, []);

  const startResendTimer = () => {
    setResendIn(60);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) { if (resendTimer.current) clearInterval(resendTimer.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const sendOtp = async (isResend = false) => {
    if (!email) return toast.error("Enter your email or user ID");
    setLoading(true);
    try {
      const check: any = await precheckLoginEmail({ data: { email } });
      if (!check.allowed) {
        toast.error("Access Denied. Please contact the IT Administrator.");
        return;
      }
      const targetEmail = check.resolvedEmail || email;
      const res: any = await sendOtpSmtp({ data: { email: targetEmail } });
      if (!res.ok) {
        toast.error(res.message || "Failed to dispatch OTP via Nodemailer SMTP");
        return;
      }
      setEmail(targetEmail);
      toast.success(isResend ? "A new 6-digit OTP code has been sent." : `6-digit OTP sent to ${targetEmail}.`);
      setStep("otp");
      setAttemptsLeft(3);
      startResendTimer();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || otp.length > 8) return toast.error("Enter the verification code from your email (6–8 digits)");
    setLoading(true);
    try {
      const res: any = await verifyOtpFn({ data: { email, token: otp } });
      if (!res.ok) {
        const left = attemptsLeft - 1;
        setAttemptsLeft(left);
        if (left <= 0) {
          toast.error("Too many invalid attempts. Please request a new OTP.");
          setStep("email");
          setOtp("");
        } else {
          toast.error(res.message || `Invalid code. ${left} attempt${left === 1 ? "" : "s"} left.`);
        }
        return;
      }

      const { error: sessionErr } = await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });

      if (sessionErr) {
        toast.error(sessionErr.message);
        return;
      }

      toast.success("Signed in successfully");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-[oklch(0.98_0.005_250)]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-[oklch(0.32_0.13_255)] via-[oklch(0.38_0.15_255)] to-[oklch(0.28_0.12_260)] text-white">
        <div aria-hidden className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/5 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 px-3 items-center justify-center rounded-md bg-white/10 backdrop-blur ring-1 ring-white/20">
            <img src="/pg-logo.png" alt="PG" className="h-7 w-auto object-contain" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">FEMS</div>
            <div className="text-xs opacity-80">Fabrication Entry Management System</div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur ring-1 ring-white/15">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secured by Nodemailer OTP • verify.software2040@pgel.in
          </div>
          <h1 className="text-4xl font-bold leading-tight">Manufacturing intelligence, secured end-to-end.</h1>
          <p className="text-base opacity-90">
            Track fabrication entries, purchases, inventory and material gaps with real-time
            dashboards designed for the plant floor.
          </p>
          <ul className="text-sm opacity-90 space-y-2">
            <li className="flex gap-2"><span className="text-white/60">•</span> Automatic inventory deduction on every fabrication entry</li>
            <li className="flex gap-2"><span className="text-white/60">•</span> Multi-invoice purchase orders with pending-quantity tracking</li>
            <li className="flex gap-2"><span className="text-white/60">•</span> Live gap verification and low-stock alerts</li>
          </ul>
        </div>

        <div className="relative text-xs opacity-70">© {new Date().getFullYear()} FEMS · Fabrication Entry Management System.</div>
      </div>

      {/* Right auth card */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-8 shadow-[var(--shadow-elevated)] border-border/60 bg-white/80 backdrop-blur">
          <div className="flex items-center gap-3 lg:hidden mb-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Factory className="h-5 w-5" />
            </div>
            <div className="font-bold">FEMS</div>
          </div>

          {step === "email" ? (
            <>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary mb-4">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your Corporate Email, Email Prefix (e.g. software.2040), Username, or Employee ID.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); sendOtp(false); }} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email / User ID / Employee Code</Label>
                  <Input
                    id="email" type="text" required autoFocus autoComplete="username"
                    placeholder="software.2040, admin, PG-001, or you@pgel.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send OTP"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  The system automatically resolves your identifier and dispatches the OTP to your registered @pgel.in inbox.
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary mb-4">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Verify OTP</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a verification code to <span className="font-medium text-foreground">{email}</span>.
              </p>
              <form onSubmit={verifyOtp} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="otp">One-time code</Label>
                  <Input
                    id="otp" inputMode="numeric" pattern="[0-9]*" maxLength={8} required autoFocus
                    placeholder="••••••••"
                    className="text-center text-2xl tracking-[0.4em] font-mono"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  />
                  <div className="text-xs text-muted-foreground">
                    {attemptsLeft} of 3 attempts remaining
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading || otp.length < 6 || otp.length > 8}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Sign in"}
                </Button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => { setStep("email"); setOtp(""); }}
                  >
                    <ArrowLeft className="h-3 w-3" /> Change email
                  </button>
                  <button
                    type="button"
                    className="text-primary font-medium disabled:text-muted-foreground disabled:cursor-not-allowed"
                    disabled={resendIn > 0 || loading}
                    onClick={() => sendOtp(true)}
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                  </button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
