"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, FolderKanban, GraduationCap, LayoutDashboard, ListTodo, LogOut, Sparkles, Users, ArrowUp } from "lucide-react";
import { api } from "@/lib/api";
import { Logo } from "./Logo";
import { Avatar, Menu, Modal, cn } from "./ui";
import { useMe } from "@/lib/hooks";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/backlog", label: "Backlog", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/docs", label: "Docs", icon: FileText },
];

function useAskAi() {
  const router = useRouter();
  return (prompt: string) => {
    const p = prompt.trim();
    if (p) router.push(`/backlog?ai=${encodeURIComponent(p)}`);
  };
}

function AskAiInput() {
  const ask = useAskAi();
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        ask(value);
        setValue("");
        ref.current?.blur();
      }}
      className="ai-border group flex h-10 w-full max-w-[480px] items-center gap-2 rounded-xl px-3 transition focus-within:shadow-ai-glow"
    >
      <Sparkles className="size-4 shrink-0 text-accent-500" strokeWidth={1.75} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Ask AI to add or update backlog items"
        placeholder="Ask AI to add or update backlog items…"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
      <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline">⌘K</kbd>
    </form>
  );
}

function MobileAskAi() {
  const ask = useAskAi();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  return (
    <>
      <button type="button" aria-label="Ask AI" onClick={() => setOpen(true)} className="bg-ai focus-ring fixed bottom-20 right-4 z-30 inline-flex size-12 items-center justify-center rounded-full text-white shadow-ai-glow md:hidden">
        <Sparkles className="size-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ask AI">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(value);
            setValue("");
            setOpen(false);
          }}
          className="ai-border mb-3 flex items-end gap-2 rounded-xl p-2"
        >
          <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={3} placeholder="Ask AI to add or update backlog items…" className="flex-1 resize-none bg-transparent p-1 text-sm outline-none" />
          <button type="submit" aria-label="Send" className="bg-ai inline-flex size-8 items-center justify-center rounded-md text-white">
            <ArrowUp className="size-4" />
          </button>
        </form>
      </Modal>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = me.user.role === "admin";
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = [...NAV, { href: "/users", label: "Users" }].find((n) => active(n.href));

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const navItem = (n: { href: string; label: string; icon: typeof LayoutDashboard }) => (
    <Link
      key={n.href}
      href={n.href}
      title={n.label}
      className={cn(
        "focus-ring group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition md:justify-center lg:justify-start",
        active(n.href) ? "bg-accent-50 text-ink" : "text-secondary hover:bg-subtle hover:text-ink",
      )}
    >
      <n.icon className={cn("size-5 shrink-0", active(n.href) ? "text-accent-600" : "text-muted group-hover:text-secondary")} strokeWidth={1.5} />
      <span className="md:hidden lg:inline">{n.label}</span>
    </Link>
  );

  return (
    <div className="min-h-dvh">
      {/* Sidebar: 64px icon rail on tablet, 240px on laptop+ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface px-3 py-4 md:flex md:w-16 lg:w-60">
        <Link href="/dashboard" className="focus-ring mb-6 flex h-8 items-center rounded-md px-1.5 md:justify-center lg:justify-start">
          <span className="lg:hidden">
            <Logo compact />
          </span>
          <span className="hidden lg:inline">
            <Logo />
          </span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(navItem)}
          {isAdmin && (
            <>
              <div className="my-3 h-px bg-line" />
              {navItem({ href: "/users", label: "Users", icon: Users })}
            </>
          )}
        </nav>
      </aside>

      <div className="md:pl-16 lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
          <div className="md:hidden">
            <Logo compact />
          </div>
          <div className={cn("min-w-0 text-sm text-muted", isAdmin ? "hidden xl:block xl:w-48" : "flex-1")}>{current?.label}</div>
          {isAdmin && (
            <div className="hidden flex-1 justify-center md:flex">
              <AskAiInput />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            {isAdmin ? (
              <span className="ai-border inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium">
                <span className="text-ai">Admin</span>
              </span>
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-secondary">Viewer</span>
            )}
            <Menu
              trigger={(p) => (
                <button type="button" aria-label="Account menu" className="focus-ring rounded-full" {...p}>
                  <Avatar name={me.user.name} size={32} />
                </button>
              )}
              items={[
                ...(isAdmin ? [{ label: "Users", icon: Users, onClick: () => router.push("/users") }] : []),
                { label: "Sign out", icon: LogOut, onClick: signOut },
              ]}
            />
          </div>
        </header>
        <div className="border-b border-line bg-surface px-4 py-2 text-xs text-muted md:hidden">
          <span className="font-medium text-ink">{me.user.name}</span> · {me.user.email}
        </div>
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>
      </div>

      {/* Desktop account details live in the avatar title; mobile gets a bottom nav */}
      <nav aria-label="Main mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active(n.href) ? "text-accent-600" : "text-muted")}>
            <n.icon className="size-5" strokeWidth={1.5} />
            {n.label}
          </Link>
        ))}
      </nav>
      {isAdmin && <MobileAskAi />}
    </div>
  );
}
