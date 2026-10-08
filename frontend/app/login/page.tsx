"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import Session from "supertokens-web-js/recipe/session";
import Passwordless from "supertokens-web-js/recipe/passwordless";
import STGeneralError from "supertokens-web-js/utils/error";
import { Logo } from "@/components/Logo";
import { Button, Select, cn } from "@/components/ui";

const COUNTRIES = [
  { code: "+91", label: "+91" },
  { code: "+1", label: "+1" },
  { code: "+44", label: "+44" },
  { code: "+971", label: "+971" },
  { code: "+65", label: "+65" },
];
const RESEND_SECONDS = 30;

function maskForDisplay(country: string, full: string) {
  const local = full.slice(country.length);
  return `${country} ${local.slice(0, 5)} xxx${local.slice(-2)}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [country, setCountry] = useState("+91");
  const [number, setNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    Session.doesSessionExist().then((exists) => exists && router.replace("/dashboard"));
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 250);
  };

  async function sendCode() {
    setError(null);
    const digits = number.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 14 || (country === "+91" && digits.length !== 10)) {
      return fail(country === "+91" ? "Enter a valid 10-digit mobile number." : "Enter a valid mobile number.");
    }
    const full = `${country}${digits}`;
    setBusy(true);
    try {
      const res = await Passwordless.createCode({ phoneNumber: full });
      if (res.status === "SIGN_IN_UP_NOT_ALLOWED") return fail(res.reason);
      setPhone(full);
      setOtp(Array(6).fill(""));
      setStep("code");
      setCooldown(RESEND_SECONDS);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (e) {
      fail(STGeneralError.isThisError(e) ? e.message : "Couldn't send SMS. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code = otp.join("")) {
    if (code.length !== 6) return fail("Enter the 6-digit code.");
    setError(null);
    setBusy(true);
    try {
      const res = await Passwordless.consumeCode({ userInputCode: code });
      if (res.status === "OK") {
        await Passwordless.clearLoginAttemptInfo();
        router.replace("/dashboard");
        return;
      }
      if (res.status === "INCORRECT_USER_INPUT_CODE_ERROR" || res.status === "EXPIRED_USER_INPUT_CODE_ERROR") {
        if (res.status === "EXPIRED_USER_INPUT_CODE_ERROR") {
          fail("Code expired. Send a new one.");
        } else {
          const left = res.maximumCodeInputAttempts - res.failedCodeInputAttemptCount;
          fail(`Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`);
          setOtp(Array(6).fill(""));
          boxes.current[0]?.focus();
        }
      } else if (res.status === "RESTART_FLOW_ERROR") {
        await Passwordless.clearLoginAttemptInfo();
        setStep("phone");
        fail("Too many attempts or the code expired. Send a new code.");
      } else {
        await Passwordless.clearLoginAttemptInfo();
        setStep("phone");
        fail("reason" in res ? res.reason : "Sign-in isn't allowed for this number.");
      }
    } catch (e) {
      fail(STGeneralError.isThisError(e) ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      const res = await Passwordless.resendCode();
      if (res.status === "RESTART_FLOW_ERROR") {
        setStep("phone");
        return fail("Your sign-in expired. Send a new code.");
      }
      setCooldown(RESEND_SECONDS);
    } catch {
      fail("Couldn't send SMS. Try again.");
    }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = d;
    setOtp(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (d && i === 5 && next.every(Boolean)) verify(next.join(""));
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
    if (e.key === "Enter") verify();
  }

  function onPaste(e: ClipboardEvent) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => digits[i] ?? "");
    setOtp(next);
    boxes.current[Math.min(digits.length, 5)]?.focus();
    if (digits.length === 6) verify(digits);
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(40rem 30rem at 15% 20%, rgba(124,58,237,0.16), transparent 60%), radial-gradient(36rem 28rem at 85% 80%, rgba(37,99,235,0.14), transparent 60%), radial-gradient(30rem 24rem at 60% 10%, rgba(79,70,229,0.10), transparent 60%)" }} />
      <div className={cn("glass relative w-full max-w-[420px] rounded-xl p-8 shadow-lg", shake && "animate-shake")}>
        <Logo />
        {step === "phone" ? (
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.01em]">Sign in</h1>
            <p className="mt-1 text-sm text-muted">Enter your mobile number. We&apos;ll text you a 6-digit code.</p>
            <label htmlFor="phone" className="mt-6 block text-[13px] font-medium text-secondary">
              Mobile number
            </label>
            <div className="mt-1.5 flex gap-2">
              <Select aria-label="Country code" value={country} onChange={(e) => setCountry(e.target.value)} className="w-24">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <input
                id="phone"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                placeholder="98765 43210"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className={cn("focus-ring h-11 flex-1 rounded-md border bg-surface px-3 text-base shadow-xs placeholder:text-muted", error ? "border-red-600" : "border-line-strong")}
              />
            </div>
            {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}
            <Button type="submit" variant="primary" size="l" className="mt-6 w-full" loading={busy}>
              Send code
            </Button>
            <p className="mt-4 text-center text-xs text-muted">No account? Ask your admin to add your number.</p>
          </form>
        ) : (
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.01em]">Enter the 6-digit code</h1>
            <p className="mt-1 text-sm text-muted">
              Sent to <span className="tabular font-medium text-ink">{maskForDisplay(country, phone)}</span>{" "}
              <button
                type="button"
                className="focus-ring inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                onClick={async () => {
                  await Passwordless.clearLoginAttemptInfo();
                  setStep("phone");
                  setError(null);
                }}
              >
                <ArrowLeft className="size-3" /> Change number
              </button>
            </p>
            <div role="group" aria-label="One-time code" className="mt-6 flex justify-between gap-2" onPaste={onPaste}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  aria-label={`Digit ${i + 1}`}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  className={cn(
                    "focus-ring h-14 w-12 rounded-md border bg-surface text-center font-mono text-2xl shadow-xs transition",
                    error ? "border-red-600" : d ? "border-accent-500" : "border-line-strong",
                  )}
                />
              ))}
            </div>
            {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}
            <Button type="submit" variant="primary" size="l" className="mt-6 w-full" loading={busy}>
              Verify
            </Button>
            <p className="mt-4 text-center text-sm text-muted">
              {cooldown > 0 ? (
                <span className="tabular">Resend code in 0:{String(cooldown).padStart(2, "0")}</span>
              ) : (
                <button type="button" onClick={resend} className="focus-ring font-medium text-accent-600 hover:underline">
                  Resend code
                </button>
              )}
            </p>
            {process.env.NEXT_PUBLIC_DEV_OTP_HINT === "true" && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">Local dev: the code is printed in the backend console.</p>
            )}
          </form>
        )}
        {busy && <Loader2 className="sr-only" aria-label="Loading" />}
      </div>
    </main>
  );
}
