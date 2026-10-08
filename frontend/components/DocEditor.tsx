"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Bold, Code2, Heading2, ImagePlus, Link2, List, Plus, Trash2, Type, Upload, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { newId, parseBlocks, serializeBlocks, type Block } from "@/lib/blocks";
import type { DocNode } from "@/lib/types";
import { Button, Field, IconButton, Input, Menu, Select, Textarea, cn } from "./ui";
import { Markdown } from "./Markdown";
import { MermaidView } from "./MermaidView";
import { ChartView, parseChartSpec, type ChartSpec, type ChartType } from "./ChartBlock";
import { useToast } from "./toast";

const DEFAULT_MERMAID = "flowchart LR\n  A[Start] --> B{Decision}\n  B -->|yes| C[Do it]\n  B -->|no| D[Skip]";
const DEFAULT_CHART: ChartSpec = { type: "bar", title: "New chart", data: [{ label: "A", value: 3 }, { label: "B", value: 5 }, { label: "C", value: 2 }] };

export interface DocDraft {
  title: string;
  parentId: string | null;
  content: string;
}

function TextBlock({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (before: string, after = before, placeholder = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholder;
    onChange(value.slice(0, s) + before + sel + after + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const linePrefix = (prefix: string) => {
    const el = ref.current;
    if (!el) return;
    const s = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    onChange(value.slice(0, s) + prefix + value.slice(s));
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <div className="mb-1 flex gap-0.5">
          <IconButton icon={Heading2} label="Heading" onClick={() => linePrefix("## ")} />
          <IconButton icon={Bold} label="Bold" onClick={() => wrap("**")} />
          <IconButton icon={List} label="Bulleted list" onClick={() => linePrefix("- ")} />
          <IconButton icon={Code2} label="Code" onClick={() => wrap("`")} />
          <IconButton icon={Link2} label="Link" onClick={() => wrap("[", "](https://)", "link text")} />
        </div>
        <Textarea ref={ref} aria-label="Text block (Markdown)" value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(18, Math.max(5, value.split("\n").length + 1))} className="font-mono text-[13px]" />
      </div>
      <div className="hidden rounded-md border border-dashed border-line p-3 lg:block">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Preview</div>
        <Markdown size="sm">{value || "_Empty_"}</Markdown>
      </div>
    </div>
  );
}

function MermaidBlock({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Textarea aria-label="Mermaid code" spellCheck={false} wrap="off" value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(20, Math.max(8, value.split("\n").length + 1))} className="overflow-x-auto whitespace-pre bg-zinc-950 font-mono text-[13px] text-zinc-100" />
      <div>
        <MermaidView code={value} compact />
      </div>
    </div>
  );
}

function ChartEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const spec = parseChartSpec(value) ?? DEFAULT_CHART;
  const update = (patch: Partial<ChartSpec>) => onChange(JSON.stringify({ ...spec, ...patch }));
  const setRow = (i: number, patch: Partial<{ label: string; value: number }>) => update({ data: spec.data.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input aria-label="Chart title" value={spec.title ?? ""} onChange={(e) => update({ title: e.target.value })} placeholder="Chart title" />
          <Select aria-label="Chart type" value={spec.type} onChange={(e) => update({ type: e.target.value as ChartType })} className="w-28">
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
          </Select>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-1 font-medium">Label</th>
              <th className="w-28 pb-1 font-medium">Value</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {spec.data.map((d, i) => (
              <tr key={i}>
                <td className="py-0.5 pr-2">
                  <Input aria-label={`Row ${i + 1} label`} value={d.label} onChange={(e) => setRow(i, { label: e.target.value })} className="h-8" />
                </td>
                <td className="py-0.5 pr-2">
                  <Input aria-label={`Row ${i + 1} value`} type="number" value={d.value} onChange={(e) => setRow(i, { value: Number(e.target.value) })} className="tabular h-8" />
                </td>
                <td>
                  <IconButton icon={Trash2} label="Remove row" onClick={() => update({ data: spec.data.filter((_, j) => j !== i) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button size="s" variant="ghost" icon={Plus} onClick={() => update({ data: [...spec.data, { label: `Item ${spec.data.length + 1}`, value: 1 }] })}>
          Add row
        </Button>
      </div>
      <div className="rounded-md border border-line bg-surface p-3">
        {spec.title && <div className="mb-2 text-sm font-semibold">{spec.title}</div>}
        <ChartView spec={spec} height={220} />
      </div>
    </div>
  );
}

function ImageBlock({ url, alt, docId, onChange }: { url: string; alt: string; docId?: string; onChange: (p: { url?: string; alt?: string }) => void }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    if (!/^image\/(png|jpeg|svg\+xml|gif|webp)$/.test(file.type)) return toast("Use a PNG, JPG, SVG, GIF or WEBP image.", "error");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (docId) form.append("docId", docId);
      const res = await api<{ url: string }>("/api/uploads", { form });
      onChange({ url: res.url, alt: alt || file.name.replace(/\.[^.]+$/, "") });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-2">
      {url ? (
        <img src={url} alt={alt} className="max-h-72 rounded-md border border-line" />
      ) : (
        <div
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
          className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted transition", over ? "border-accent-500 bg-accent-50" : "border-line")}
        >
          <Upload className="size-5" />
          Drop a wireframe image here (PNG, JPG, SVG; max 5 MB)
          <Button size="s" loading={uploading} onClick={() => input.current?.click()}>
            Choose file
          </Button>
        </div>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml,image/gif,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <div className="flex gap-2">
        <Input aria-label="Image caption" value={alt} onChange={(e) => onChange({ alt: e.target.value })} placeholder="Caption / alt text" />
        {url && (
          <Button size="m" loading={uploading} onClick={() => input.current?.click()}>
            Replace
          </Button>
        )}
      </div>
    </div>
  );
}

const BLOCK_META: Record<Block["kind"], { label: string; icon: typeof Type }> = {
  text: { label: "Text", icon: Type },
  mermaid: { label: "Mermaid diagram", icon: Workflow },
  chart: { label: "Chart", icon: BarChart3 },
  image: { label: "Image", icon: ImagePlus },
};

/** Block-based doc editor (stored as Markdown) with live previews for text, Mermaid and charts. */
export function DocEditor({ initial, docId, parents, parentLocked, onCancel, onSave, saving }: { initial: DocDraft; docId?: string; parents: DocNode[]; parentLocked?: boolean; onCancel: () => void; onSave: (d: DocDraft) => void; saving?: boolean }) {
  const [title, setTitle] = useState(initial.title);
  const [parentId, setParentId] = useState(initial.parentId);
  const [blocks, setBlocks] = useState<Block[]>(() => {
    const b = parseBlocks(initial.content);
    return b.length ? b : [{ id: newId(), kind: "text", text: "" }];
  });
  const [titleError, setTitleError] = useState(false);

  const update = (id: string, patch: Partial<Block>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)));
  const move = (i: number, dir: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const insert = (at: number, kind: Block["kind"] | "heading" | "list" | "code") => {
    const b: Block =
      kind === "mermaid"
        ? { id: newId(), kind, code: DEFAULT_MERMAID }
        : kind === "chart"
          ? { id: newId(), kind, json: JSON.stringify(DEFAULT_CHART) }
          : kind === "image"
            ? { id: newId(), kind, url: "", alt: "" }
            : { id: newId(), kind: "text", text: kind === "heading" ? "## Heading" : kind === "list" ? "- Item one\n- Item two" : kind === "code" ? "```ts\n// code\n```" : "" };
    setBlocks((bs) => [...bs.slice(0, at), b, ...bs.slice(at)]);
  };

  const addMenu = (at: number, compact = false) => (
    <Menu
      align="left"
      trigger={(t) =>
        compact ? (
          <button type="button" aria-label="Insert block" className="focus-ring inline-flex size-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-xs hover:text-accent-600" {...t}>
            <Plus className="size-3.5" />
          </button>
        ) : (
          <Button size="s" variant="secondary" icon={Plus} {...t}>
            Add block
          </Button>
        )
      }
      items={[
        { label: "Text", icon: Type, onClick: () => insert(at, "text") },
        { label: "Heading", icon: Heading2, onClick: () => insert(at, "heading") },
        { label: "List", icon: List, onClick: () => insert(at, "list") },
        { label: "Code", icon: Code2, onClick: () => insert(at, "code") },
        { label: "Chart", icon: BarChart3, onClick: () => insert(at, "chart") },
        { label: "Image", icon: ImagePlus, onClick: () => insert(at, "image") },
        { label: "Mermaid", icon: Workflow, onClick: () => insert(at, "mermaid") },
      ]}
    />
  );

  function save() {
    if (!title.trim()) return setTitleError(true);
    onSave({ title: title.trim(), parentId, content: serializeBlocks(blocks.filter((b) => !(b.kind === "image" && !b.url))) });
  }

  return (
    <div>
      <div className="sticky top-14 z-10 mb-4 flex flex-wrap items-end gap-3 border-b border-line bg-canvas/95 py-3 backdrop-blur">
        <Field label="Title" htmlFor="doc-title" error={titleError ? "Title is required" : undefined} className="min-w-56 flex-1">
          <Input id="doc-title" value={title} onChange={(e) => (setTitle(e.target.value), setTitleError(false))} className="text-base font-semibold" />
        </Field>
        <Field label="Parent page" htmlFor="doc-parent" className="w-56">
          <Select id="doc-parent" value={parentId ?? ""} onChange={(e) => setParentId(e.target.value || null)} disabled={parentLocked} title={parentLocked ? "This page has sub-pages, so it stays top-level" : undefined}>
            <option value="">None (top level)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            Save
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {blocks.map((b, i) => {
          const meta = BLOCK_META[b.kind];
          return (
            <div key={b.id} className="group relative">
              <div className="absolute -top-3 left-1/2 z-[1] -translate-x-1/2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">{addMenu(i, true)}</div>
              <div className="rounded-lg border border-line bg-surface p-3 shadow-xs transition focus-within:border-accent-100 focus-within:shadow-ai-glow">
                <div className="mb-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                    <meta.icon className="size-3.5" /> {meta.label}
                  </span>
                  <div className="flex gap-0.5">
                    <IconButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30" />
                    <IconButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="disabled:opacity-30" />
                    <IconButton icon={Trash2} label="Delete block" onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))} />
                  </div>
                </div>
                {b.kind === "text" && <TextBlock value={b.text} onChange={(text) => update(b.id, { text })} />}
                {b.kind === "mermaid" && <MermaidBlock value={b.code} onChange={(code) => update(b.id, { code })} />}
                {b.kind === "chart" && <ChartEditor value={b.json} onChange={(json) => update(b.id, { json })} />}
                {b.kind === "image" && <ImageBlock url={b.url} alt={b.alt} docId={docId} onChange={(p) => update(b.id, p)} />}
              </div>
            </div>
          );
        })}
        <div className="flex justify-center pt-2">{addMenu(blocks.length)}</div>
      </div>
    </div>
  );
}
