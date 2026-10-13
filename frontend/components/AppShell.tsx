"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { ADMIN_NAV, NAV, type NavItem } from "@/lib/nav";
import { Logo } from "./Logo";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "./ThemeToggle";
import { EASE } from "./motion";
import { Avatar, Menu, cn } from "./ui";

function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora-blob aurora-a left-[-10%] top-[-20%] size-[60vw]" />
      <div className="aurora-blob aurora-b right-[-15%] top-[10%] size-[50vw]" />
      <div className="aurora-blob aurora-c bottom-[-25%] left-[30%] size-[55vw]" />
      <div className="aurora-grid absolute inset-0" />
    </div>
  );
}

function NavLinks({ items, active, collapsed, layoutId, onNavigate }: { items: NavItem[]; active: (h: string) => boolean; collapsed: boolean; layoutId: string; onNavigate?: () => void }) {
  return (
    <>
      {items.map((n) => {
        const on = active(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            title={collapsed ? n.label : undefined}
            aria-current={on ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "focus-ring group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center",
              on ? "text-ink" : "text-secondary hover:bg-surface/60 hover:text-ink",
            )}
          >
            {on && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg border border-accent-100 bg-accent-50/90 shadow-xs" transition={{ type: "spring", stiffness: 420, damping: 34 }}>
                <span className="bg-ai absolute inset-y-1.5 left-0 w-[3px] rounded-full" />
              </motion.span>
            )}
            <n.icon className={cn("relative size-[18px] shrink-0 transition-transform group-hover:scale-110", on ? "text-accent-600" : "text-muted group-hover:text-secondary")} strokeWidth={1.6} />
            {!collapsed && <span className="relative truncate">{n.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = me.user.role === "admin";
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = [...NAV, ...ADMIN_NAV].find((n) => active(n.href));
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && localStorage.getItem("devhub.sidebar") === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem("devhub.sidebar", c ? "open" : "collapsed");
      return !c;
    });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  }

  const width = collapsed ? 68 : 240;

  return (
    <div className="min-h-dvh" style={{ "--sb": `${width}px` } as React.CSSProperties}>
      <Aurora />
      <motion.aside
        initial={false}
        animate={{ width }}
        transition={{ duration: 0.25, ease: EASE }}
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line/60 bg-surface/55 px-3 py-4 shadow-[1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl md:flex"
      >
        <div className={cn("mb-6 flex h-8 items-center", collapsed ? "justify-center" : "justify-between pl-1.5")}>
          <Link href="/dashboard" className="focus-ring rounded-md" aria-label="DevHub home">
            <Logo compact={collapsed} />
          </Link>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavLinks items={NAV} active={active} collapsed={collapsed} layoutId="nav-active" />
        </nav>
        <div className="mt-auto flex flex-col gap-1">
          {isAdmin && (
            <>
              {!collapsed && <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Settings</div>}
              <NavLinks items={ADMIN_NAV} active={active} collapsed={collapsed} layoutId="nav-active" />
            </>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn("focus-ring mt-2 flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted transition hover:bg-surface/60 hover:text-ink", collapsed && "justify-center")}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.6} /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.6} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      <div className="transition-[padding] duration-250 ease-out md:pl-(--sb) motion-reduce:transition-none">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/60 bg-surface/60 px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
            className="focus-ring -ml-1 inline-flex size-9 items-center justify-center rounded-lg text-secondary hover:bg-surface/70 md:hidden"
          >
            <MenuIcon className="size-5" />
          </button>
          <div className="md:hidden">
            <Logo compact />
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={current?.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="hidden min-w-0 text-sm text-muted lg:block lg:w-40"
            >
              {current?.label}
            </motion.div>
          </AnimatePresence>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAdmin ? (
              <span className="ai-border hidden h-6 items-center rounded-full px-2.5 text-xs font-medium sm:inline-flex">
                <span className="text-ai">Admin</span>
              </span>
            ) : (
              <span className="hidden h-6 items-center rounded-full bg-subtle px-2.5 text-xs font-medium text-secondary sm:inline-flex">Viewer</span>
            )}
            <Menu
              trigger={(p) => (
                <button type="button" aria-label="Account menu" title={`${me.user.name} · ${me.user.email}`} className="focus-ring rounded-full transition hover:scale-105" {...p}>
                  <Avatar name={me.user.name} size={32} />
                </button>
              )}
              items={[
                ...(isAdmin
                  ? [
                      {
                        label: "Users",
                        icon: Users,
                        onClick: () => router.push("/users"),
                      },
                    ]
                  : []),
                { label: "Sign out", icon: LogOut, onClick: signOut },
              ]}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>
      </div>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => setDrawer(false)} aria-hidden />
            <motion.nav
              aria-label="Main mobile"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: EASE }}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-1 bg-surface/90 px-3 py-4 shadow-xl backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between pl-1.5">
                <Logo />
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setDrawer(false)}
                  className="focus-ring inline-flex size-9 items-center justify-center rounded-lg text-secondary hover:bg-subtle"
                >
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks items={NAV} active={active} collapsed={false} layoutId="nav-active-mobile" onNavigate={() => setDrawer(false)} />
              {isAdmin && (
                <div className="mt-auto">
                  <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Settings</div>
                  <NavLinks items={ADMIN_NAV} active={active} collapsed={false} layoutId="nav-active-mobile" onNavigate={() => setDrawer(false)} />
                </div>
              )}
              <div className="mt-3 border-t border-line px-2.5 pt-3 text-xs text-muted">
                <span className="font-medium text-ink">{me.user.name}</span> · {me.user.email}
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
