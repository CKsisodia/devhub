"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { MermaidView } from "./MermaidView";
import { ChartBlock } from "./ChartBlock";
import { cn } from "./ui";

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };
const hastText = (n: HastNode): string => (n.type === "text" ? (n.value ?? "") : (n.children ?? []).map(hastText).join(""));

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
const childText = (children: ReactNode): string =>
  typeof children === "string" ? children : Array.isArray(children) ? children.map(childText).join("") : typeof children === "number" ? String(children) : "";

function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="focus-ring my-4 block cursor-zoom-in rounded-lg" aria-label={`Zoom image: ${alt}`}>
        <img src={src} alt={alt} className="max-h-[480px] w-auto" />
      </button>
      {alt && <span className="-mt-2 mb-4 block text-[13px] text-muted">{alt}</span>}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(9,9,11,0.7)] p-6" onClick={() => setOpen(false)}>
          <button type="button" aria-label="Close" className="absolute right-4 top-4 rounded-full bg-white/90 p-2" onClick={() => setOpen(false)}>
            <X className="size-4" />
          </button>
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg bg-white shadow-lg" />
        </div>
      )}
    </>
  );
}

const components: Components = {
  pre({ node, children }) {
    const code = (node as HastNode | undefined)?.children?.[0];
    if (code && code.type === "element" && code.tagName === "code") {
      const cls = (code.properties?.className as string[] | undefined) ?? [];
      const text = hastText(code).replace(/\n$/, "");
      if (cls.includes("language-mermaid")) return <MermaidView code={text} />;
      if (cls.includes("language-chart")) return <ChartBlock source={text} />;
    }
    return <pre>{children}</pre>;
  },
  img({ src, alt }) {
    return typeof src === "string" ? <ZoomImage src={src} alt={alt ?? ""} /> : null;
  },
  a({ href, children }) {
    const external = href?.startsWith("http");
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined}>
        {children}
      </a>
    );
  },
  h2({ children }) {
    return <h2 id={slugify(childText(children))}>{children}</h2>;
  },
  h3({ children }) {
    return <h3 id={slugify(childText(children))}>{children}</h3>;
  },
  p({ children, node }) {
    // Avoid <figure>/<button> inside <p> for image-only paragraphs.
    const only = (node as HastNode | undefined)?.children;
    if (only?.length === 1 && only[0].tagName === "img") return <>{children}</>;
    return <p>{children}</p>;
  },
};

export function Markdown({ children, className, size = "base" }: { children: string; className?: string; size?: "base" | "sm" }) {
  return (
    <div className={cn("prose-doc", size === "sm" && "prose-sm", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** h2/h3 headings for the on-page table of contents (code fences skipped). */
export function extractHeadings(md: string) {
  const out: { level: 2 | 3; text: string; id: string }[] = [];
  let inFence = false;
  for (const line of md.split("\n")) {
    if (line.trim().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(##|###)\s+(.+)$/);
    if (m) {
      const text = m[2].replace(/[*_`]/g, "").trim();
      out.push({ level: m[1].length as 2 | 3, text, id: slugify(text) });
    }
  }
  return out;
}
