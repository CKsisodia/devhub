"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Copy, Eye, EyeOff, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { LoginState, LoginStep, TotpSetup } from "@/lib/types";

type Step = "credentials" | Exclude<LoginStep, "done">;

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step | null>(null);
  const [account, setAccount] = useState<LoginState["user"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const next = params.get("next");
  const goIn = useCallback(() => router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"), [router, next]);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 250);
  };

  const apply = useCallback(
    (s: LoginState) => {
      setError(null);
      setAccount(s.user);
      if (s.step === "done") goIn();
      else setStep(s.step);
    },
    [goIn],
  );

  /** Errors that end the in-progress login (expired, locked, deactivated) send the user back to step 1. */
  const handle = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Something went wrong. Try again.";
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setStep("credentials");
    fail(msg);
  };

  useEffect(() => {
    api<LoginState>("/api/auth/state")
      .then(apply)
      .catch(() => setStep("credentials"));
  }, [apply]);

  async function restart() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setError(null);
    setAccount(null);
    setStep("credentials");
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(40rem 30rem at 15% 20%, rgba(124,58,237,0.16), transparent 60%), radial-gradient(36rem 28rem at 85% 80%, rgba(37,99,235,0.14), transparent 60%), radial-gradient(30rem 24rem at 60% 10%, rgba(79,70,229,0.10), transparent 60%)" }}
      />
      <div className={cn("glass relative w-full rounded-xl p-8 shadow-lg", step === "totp_setup" ? "max-w-[480px]" : "max-w-[420px]", shake && "animate-shake")}>
        <Logo />
        {step === null && <div className="mt-8 h-64 skeleton" />}
        {step === "credentials" && <Credentials error={error} onDone={apply} onError={handle} />}
        {step === "totp_setup" && account && <TotpSetupStep account={account} error={error} onDone={apply} onError={handle} onBack={restart} />}
        {step === "totp_verify" && account && <TotpVerifyStep account={account} error={error} onDone={apply} onError={handle} onBack={restart} />}
        {step === "set_password" && account && <SetPasswordStep account={account} error={error} onDone={apply} onError={handle} />}
      </div>
    </main>
  );
}

interface StepProps {
  error: string | null;
  onDone: (s: LoginState) => void;
  onError: (e: unknown) => void;
}

const Title = ({ children }: { children: ReactNode }) => <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.01em]">{children}</h1>;
const ErrorText = ({ error }: { error: string | null }) => (error ? <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p> : null);
const inputCls = (invalid: boolean) =>
  cn("focus-ring h-11 w-full rounded-md border bg-surface px-3 text-base shadow-xs placeholder:text-muted", invalid ? "border-red-600" : "border-line-strong");

function BackLink({ onBack, label = "Use a different account" }: { onBack: () => void; label?: string }) {
  return (
    <button type="button" onClick={onBack} className="focus-ring mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-600 hover:underline">
      <ArrowLeft className="size-3.5" /> {label}
    </button>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid, autoFocus, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid: boolean; autoFocus?: boolean; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls(invalid), "pr-11")}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="focus-ring absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-ink"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// ---------- Step 1: email + password ----------

function Credentials({ error, onDone, onError }: StepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  async function submit() {
    setLocal(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setLocal("Enter your email address.");
    if (!password) return setLocal("Enter your password.");
    setBusy(true);
    try {
      onDone(await api<LoginState>("/api/auth/login", { body: { email: email.trim(), password } }));
    } catch (e) {
      setPassword("");
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const shown = local ?? error;
  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <Title>Sign in</Title>
      <p className="mt-1 text-sm text-muted">Use the email and password your admin gave you.</p>
      <label htmlFor="email" className="mt-6 block text-[13px] font-medium text-secondary">
        Email
      </label>
      <input id="email" type="email" autoComplete="username" autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={cn(inputCls(Boolean(shown)), "mt-1.5")} />
      <label htmlFor="password" className="mt-4 block text-[13px] font-medium text-secondary">
        Password
      </label>
      <div className="mt-1.5">
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" invalid={Boolean(shown)} />
      </div>
      <ErrorText error={shown} />
      <Button type="submit" variant="primary" size="l" className="mt-6 w-full" loading={busy}>
        Continue
      </Button>
      <p className="mt-4 text-center text-xs text-muted">No account or forgot your password? Ask your admin.</p>
    </form>
  );
}

// ---------- 6-box code input ----------

/** Re-mount with a new `key` to clear it (e.g. after a wrong code); the first box auto-focuses. */
function CodeInput({ onComplete, invalid, disabled }: { onComplete: (code: string) => void; invalid: boolean; disabled?: boolean }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  function set(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    if (d && i < 5) boxes.current[i + 1]?.focus();
    if (d && next.every(Boolean)) onComplete(next.join(""));
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => pasted[i] ?? "");
    setDigits(next);
    boxes.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) onComplete(pasted);
  }

  return (
    <div role="group" aria-label="6-digit code" className="flex justify-between gap-2" onPaste={onPaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          aria-label={`Digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          maxLength={1}
          disabled={disabled}
          value={d}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          className={cn(
            "focus-ring h-14 w-12 rounded-md border bg-surface text-center font-mono text-2xl shadow-xs transition disabled:opacity-60",
            invalid ? "border-red-600" : d ? "border-accent-500" : "border-line-strong",
          )}
        />
      ))}
    </div>
  );
}

function useCodeSubmit(path: string, { onDone, onError }: Pick<StepProps, "onDone" | "onError">) {
  const [busy, setBusy] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [code, setCode] = useState("");
  const submit = async (c = code) => {
    if (c.length !== 6) return onError(new Error("Enter the 6-digit code."));
    setBusy(true);
    try {
      onDone(await api<LoginState>(path, { body: { code: c } }));
    } catch (e) {
      setResetKey((k) => k + 1);
      setCode("");
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, resetKey, submit, onComplete: (c: string) => (setCode(c), submit(c)) };
}

// ---------- Step 2a: first sign-in, enrol an authenticator ----------

function TotpSetupStep({ account, error, onDone, onError, onBack }: StepProps & { account: LoginState["user"]; onBack: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [copied, setCopied] = useState(false);
  const code = useCodeSubmit("/api/auth/totp/enable", { onDone, onError });

  useEffect(() => {
    api<TotpSetup>("/api/auth/totp/setup", { method: "POST" })
      .then(setSetup)
      .catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return (
    <div className="mt-8">
      <Title>Set up two-factor sign-in</Title>
      <p className="mt-1 text-sm text-muted">
        First sign-in for <span className="font-medium text-ink">{account.email}</span>. This takes a minute and protects your account.
      </p>

      <ol className="mt-6 space-y-5">
        <li className="flex gap-3">
          <StepNo n={1} />
          <div className="text-sm">
            <p className="font-medium text-ink">Install an authenticator app</p>
            <p className="mt-0.5 text-muted">Google Authenticator, Microsoft Authenticator, Authy or 1Password all work.</p>
          </div>
        </li>
        <li className="flex gap-3">
          <StepNo n={2} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-ink">Scan this QR code with the app</p>
            <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="flex size-[168px] shrink-0 items-center justify-center rounded-lg border border-line bg-white p-2 shadow-xs">
                {setup ? <img src={setup.qrDataUrl} alt={`QR code to add ${setup.issuer} (${setup.account}) to your authenticator app`} width={152} height={152} /> : <div className="skeleton size-[152px]" />}
              </div>
              <div className="min-w-0 text-[13px] text-muted">
                <p className="flex items-center gap-1.5">
                  <KeyRound className="size-3.5" /> Can&apos;t scan? Enter this key:
                </p>
                <p data-testid="totp-secret" className="mt-1.5 break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-[13px] tracking-wide text-ink">
                  {grouped || "…"}
                </p>
                <button
                  type="button"
                  disabled={!setup}
                  onClick={() => {
                    if (!setup) return;
                    navigator.clipboard?.writeText(setup.secret).catch(() => undefined);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="focus-ring mt-1.5 inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy key"}
                </button>
                <p className="mt-2">Account: {setup?.issuer ?? "FE Panel"} · time-based, 6 digits</p>
              </div>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <StepNo n={3} />
          <form
            className="min-w-0 flex-1 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              code.submit();
            }}
          >
            <p className="font-medium text-ink">Enter the 6-digit code it shows</p>
            <div className="mt-3">
              <CodeInput key={code.resetKey} onComplete={code.onComplete} invalid={Boolean(error)} disabled={code.busy || !setup} />
            </div>
            <ErrorText error={error} />
            <Button type="submit" variant="primary" size="l" className="mt-5 w-full" loading={code.busy} disabled={!setup}>
              <ShieldCheck className="size-4" /> Verify and turn on
            </Button>
          </form>
        </li>
      </ol>
      <BackLink onBack={onBack} label="Cancel and sign out" />
    </div>
  );
}

const StepNo = ({ n }: { n: number }) => (
  <span className="bg-ai flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" aria-hidden>
    {n}
  </span>
);

// ---------- Step 2b: every later sign-in ----------

function TotpVerifyStep({ account, error, onDone, onError, onBack }: StepProps & { account: LoginState["user"]; onBack: () => void }) {
  const code = useCodeSubmit("/api/auth/totp/verify", { onDone, onError });
  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        code.submit();
      }}
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-accent-50">
        <Smartphone className="size-5 text-accent-600" />
      </div>
      <Title>Enter your code</Title>
      <p className="mt-1 text-sm text-muted">
        Open your authenticator app and enter the 6-digit code for <span className="font-medium text-ink">{account.email}</span>.
      </p>
      <div className="mt-6">
        <CodeInput key={code.resetKey} onComplete={code.onComplete} invalid={Boolean(error)} disabled={code.busy} />
      </div>
      <ErrorText error={error} />
      <Button type="submit" variant="primary" size="l" className="mt-6 w-full" loading={code.busy}>
        Verify
      </Button>
      <p className="mt-4 text-center text-xs text-muted">Lost your phone? Ask your admin to reset two-factor for your account.</p>
      <div className="text-center">
        <BackLink onBack={onBack} />
      </div>
    </form>
  );
}

// ---------- Step 3 (only after an admin-set temporary password) ----------

function SetPasswordStep({ account, error, onDone, onError }: StepProps & { account: LoginState["user"] }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);

  async function submit() {
    setLocal(null);
    if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return setLocal("Use at least 10 characters with a letter and a number.");
    if (pw !== confirm) return setLocal("The passwords don't match.");
    setBusy(true);
    try {
      onDone(await api<LoginState>("/api/auth/password", { body: { newPassword: pw } }));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  const shown = local ?? error;
  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <Title>Choose your password</Title>
      <p className="mt-1 text-sm text-muted">
        You signed in with a temporary password for <span className="font-medium text-ink">{account.email}</span>. Pick your own to finish.
      </p>
      <input type="email" autoComplete="username" value={account.email} readOnly hidden />
      <label htmlFor="new-password" className="mt-6 block text-[13px] font-medium text-secondary">
        New password
      </label>
      <div className="mt-1.5">
        <PasswordInput id="new-password" value={pw} onChange={setPw} autoComplete="new-password" invalid={Boolean(shown)} autoFocus />
      </div>
      <p className="mt-1 text-xs text-muted">At least 10 characters, with a letter and a number.</p>
      <label htmlFor="confirm-password" className="mt-4 block text-[13px] font-medium text-secondary">
        Confirm password
      </label>
      <div className="mt-1.5">
        <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(shown)} />
      </div>
      <ErrorText error={shown} />
      <Button type="submit" variant="primary" size="l" className="mt-6 w-full" loading={busy}>
        Save and continue
      </Button>
    </form>
  );
}
