"use client";

import { useEffect, useId, useState } from "react";
import { Code2, Maximize2, Minus, Plus } from "lucide-react";
import { IconButton, cn } from "./ui";
import { useResolvedTheme } from "./ThemeToggle";

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
const loadMermaid = () => (mermaidPromise ??= import("mermaid").then((m) => m.default));

/** Mermaid colours per theme (kept in step with the tokens in globals.css). */
const MERMAID_THEME = {
  light: { primaryColor: "#F0FDFA", primaryBorderColor: "#0D9488", primaryTextColor: "#0F172A", lineColor: "#64748B", secondaryColor: "#ECFEFF", tertiaryColor: "#F8FAFC", actorBkg: "#F0FDFA", actorBorder: "#0D9488", noteBkgColor: "#FFFBEB", noteTextColor: "#0F172A", background: "#FFFFFF", mainBkg: "#F0FDFA", textColor: "#0F172A", edgeLabelBackground: "#FFFFFF", clusterBkg: "#F8FAFC", clusterBorder: "#CBD5E1" },
  dark: { primaryColor: "#0B2626", primaryBorderColor: "#2DD4BF", primaryTextColor: "#E7EEF7", lineColor: "#8A9AB2", secondaryColor: "#0E3440", tertiaryColor: "#172133", actorBkg: "#0B2626", actorBorder: "#2DD4BF", noteBkgColor: "#36270A", noteTextColor: "#FEF3C7", background: "#0F1724", mainBkg: "#0B2626", textColor: "#E7EEF7", edgeLabelBackground: "#0F1724", clusterBkg: "#172133", clusterBorder: "#31415C" },
} as const;

async function renderMermaid(id: string, code: string, theme: "light" | "dark") {
  const mermaid = await loadMermaid();
  // Re-initialise before each render so diagrams follow the current theme.
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", darkMode: theme === "dark", fontFamily: "Inter Variable, Inter, system-ui, sans-serif", themeVariables: { ...MERMAID_THEME[theme], fontSize: "14px" } });
  await mermaid.parse(code);
  return (await mermaid.render(id, code)).svg;
}

/** Renders Mermaid code client-side, with zoom/fit controls, a "view source" toggle and an error state. */
export function MermaidView({ code, compact = false }: { code: string; compact?: boolean }) {
  const rawId = useId();
  const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showSource, setShowSource] = useState(false);
  const theme = useResolvedTheme();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const svg = await renderMermaid(`${id}-${Date.now()}`, code, theme);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : "Invalid Mermaid diagram");
          setSvg(null);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id, theme]);

  return (
    <figure className={cn("not-prose my-5 overflow-hidden rounded-lg border border-line bg-surface shadow-sm", compact && "my-0")}>
      {!compact && (
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span className="text-xs font-medium text-muted">Mermaid diagram</span>
          <div className="flex items-center gap-0.5">
            <IconButton icon={Minus} label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} />
            <span className="tabular w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <IconButton icon={Plus} label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} />
            <IconButton icon={Maximize2} label="Fit" onClick={() => setZoom(1)} />
            <IconButton icon={Code2} label={showSource ? "Hide source" : "View source"} onClick={() => setShowSource((s) => !s)} className={showSource ? "bg-accent-50 text-accent-600" : ""} />
          </div>
        </div>
      )}
      {error ? (
        <div className="p-4">
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">Couldn&apos;t render diagram: {error}</p>
          {!compact && <pre className="mt-3 overflow-x-auto rounded-md bg-subtle p-3 font-mono text-[13px] leading-5 text-ink">{code}</pre>}
        </div>
      ) : svg ? (
        <div className="overflow-auto p-4">
          <div
            className="mx-auto flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center", minHeight: 40 }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="p-4">
          <div className="skeleton h-40 w-full" />
        </div>
      )}
      {showSource && !error && <pre className="overflow-x-auto border-t border-line bg-subtle p-3 font-mono text-[13px] leading-5 text-ink">{code}</pre>}
    </figure>
  );
}
