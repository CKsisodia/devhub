"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CornerDownLeft, FolderKanban, Search } from "lucide-react";
import { useIsAdmin, useProjects } from "@/lib/hooks";
import { ADMIN_NAV, NAV, type NavItem } from "@/lib/nav";
import { EASE } from "./motion";
import { cn } from "./ui";

type Entry = NavItem & { group: "Go to" | "Projects" };

/** Cmd/Ctrl+K palette. Navigation only: pages (Users for admins) and projects. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Closes instantly (no exit animation) so it never lingers across a route transition.
  return open ? <Palette onClose={onClose} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const { data: projects } = useProjects();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const pages = [...NAV, ...(isAdmin ? ADMIN_NAV : [])].map((n) => ({
      ...n,
      group: "Go to" as const,
    }));
    const projs = (projects ?? []).map((p) => ({
      href: `/projects/${p.id}`,
      label: p.name,
      icon: FolderKanban,
      group: "Projects" as const,
    }));
    const needle = q.trim().toLowerCase();
    return [...pages, ...projs].filter((e) => !needle || e.label.toLowerCase().includes(needle));
  }, [projects, isAdmin, q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const go = (e?: Entry) => {
    if (!e) return;
    onClose();
    router.push(e.href);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="glass-card ai-glow relative w-full max-w-[560px] overflow-hidden rounded-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") return onClose();
          if (e.key === "ArrowDown") setIdx((i) => Math.min(entries.length - 1, i + 1));
          else if (e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
          else if (e.key === "Enter") go(entries[idx]);
          else return;
          e.preventDefault();
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Jump to a page or project…"
            aria-label="Jump to a page or project"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[idx] ? `palette-${idx}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>}
          {entries.map((e, i) => (
            <li key={e.href} role="presentation">
              {(i === 0 || entries[i - 1].group !== e.group) && <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{e.group}</div>}
              <button
                id={`palette-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === idx}
                type="button"
                onMouseMove={() => setIdx(i)}
                onClick={() => go(e)}
                className={cn("relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === idx ? "text-ink" : "text-secondary")}
              >
                {i === idx && <motion.span layoutId="palette-hl" className="absolute inset-0 rounded-lg bg-accent-50" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <e.icon className={cn("relative size-4", i === idx ? "text-accent-600" : "text-muted")} strokeWidth={1.75} />
                <span className="relative flex-1 truncate">{e.label}</span>
                {i === idx && <CornerDownLeft className="relative size-3.5 text-muted" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
