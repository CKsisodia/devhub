"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./ui";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Light / Dark / System switch. The choice is stored per browser (localStorage "devhub.theme"). */
export function ThemeToggle({ className, id = "theme" }: { className?: string; id?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the stored theme is only known after hydration
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("inline-flex items-center rounded-full border border-line bg-surface/70 p-0.5 shadow-xs", className)}>
      {OPTIONS.map((o) => {
        const on = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${o.label} theme`}
            title={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={cn("focus-ring relative inline-flex size-7 items-center justify-center rounded-full transition-colors", on ? "text-accent-600" : "text-muted hover:text-ink")}
          >
            {on && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-accent-50 ring-1 ring-accent-100" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <o.icon className="relative size-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

/** Resolved theme ("light" | "dark") for JS-rendered things (Mermaid, charts). "light" until mounted. */
export function useResolvedTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}
