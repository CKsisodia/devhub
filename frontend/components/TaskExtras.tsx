"use client";

import { useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ExternalLink, FileImage, FileText, Link2, Paperclip, Plus, RotateCcw, Upload, WandSparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkAttachment, WorkLink } from "@/lib/types";
import { Banner, Button, IconButton, Input, cn } from "./ui";
import { EASE } from "./motion";

// ---------- Shared helpers ----------

/** Mirrors the backend limits (UPLOAD_MAX_BYTES default 5 MB; allowed types in backend lib/storage.ts). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 10;
const ALLOWED_EXT = ["png", "jpg", "jpeg", "svg", "gif", "webp", "pdf", "txt", "md", "markdown", "csv", "json", "zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
export const ACCEPT = ALLOWED_EXT.map((e) => `.${e}`).join(",");

export const formatBytes = (n: number | null | undefined) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isImage = (mime: string | null | undefined, name: string) => (mime ? mime.startsWith("image/") : ["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(extOf(name)));

/** Returns an error message for a file the server would reject, else undefined. */
export function checkFile(f: File): string | undefined {
  if (!ALLOWED_EXT.includes(extOf(f.name))) return `“${f.name}”: this file type isn't allowed.`;
  if (f.size > MAX_FILE_BYTES) return `“${f.name}” is larger than 5 MB.`;
  return undefined;
}

/** http(s) only, like the backend. */
export function isHttpUrl(s: string) {
  try {
    const u = new URL(s.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// ---------- Read-only display (every signed-in user) ----------

/** Links and attachments on a task card. Files open through the authenticated /api/uploads route. */
export function TaskExtrasView({ attachments, links }: { attachments?: WorkAttachment[]; links?: WorkLink[] }) {
  if (!attachments?.length && !links?.length) return null;
  return (
    <div className="mt-2.5 space-y-1.5">
      {links && links.length > 0 && (
        <ul aria-label="Links" className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <li key={l.id} className="min-w-0 max-w-full">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={l.url}
                className="focus-ring inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-line/80 bg-surface/70 px-2 text-xs font-medium text-accent-600 transition hover:border-accent-500/50 hover:bg-surface"
              >
                <Link2 className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{l.label || hostOf(l.url)}</span>
                {l.label && <span className="hidden truncate font-normal text-muted sm:inline">{hostOf(l.url)}</span>}
                <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {attachments && attachments.length > 0 && (
        <ul aria-label="Attachments" className="flex flex-wrap gap-1.5">
          {attachments.map((a) => {
            const img = isImage(a.mimeType, a.fileName);
            const Icon = img ? FileImage : FileText;
            return (
              <li key={a.id} className="min-w-0 max-w-full">
                <a
                  href={a.url}
                  {...(img ? { target: "_blank", rel: "noopener noreferrer" } : { download: a.fileName })}
                  title={`${a.fileName}${a.sizeBytes ? ` · ${formatBytes(a.sizeBytes)}` : ""}`}
                  className="focus-ring inline-flex h-7 max-w-full items-center gap-1.5 rounded-md bg-subtle px-2 text-xs font-medium text-secondary transition hover:bg-[var(--tone-accent-bg)] hover:text-[var(--tone-accent-fg)]"
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{a.fileName}</span>
                  {a.sizeBytes != null && <span className="tabular shrink-0 font-normal text-muted">{formatBytes(a.sizeBytes)}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Admin editors (inside the task form) ----------

export type LinkDraft = { key: string; url: string; label: string };
let linkSeq = 0;
export const newLinkDraft = (l?: { url: string; label: string }): LinkDraft => ({ key: `l${++linkSeq}`, url: l?.url ?? "", label: l?.label ?? "" });

/** Validates link rows; empty rows are dropped. Returns links to save, or per-row errors. */
export function validateLinks(rows: LinkDraft[]): { links: { url: string; label: string }[]; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const links: { url: string; label: string }[] = [];
  for (const r of rows) {
    const url = r.url.trim();
    const label = r.label.trim();
    if (!url && !label) continue;
    if (!url) errors[r.key] = "Add the URL";
    else if (!isHttpUrl(url)) errors[r.key] = "Use a full http:// or https:// URL";
    else links.push({ url, label });
  }
  return { links, errors };
}

export function LinksEditor({ rows, onChange, errors }: { rows: LinkDraft[]; onChange: (rows: LinkDraft[]) => void; errors: Record<string, string> }) {
  const reduce = useReducedMotion();
  const update = (key: string, patch: Partial<LinkDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-secondary">Links</span>
      <AnimatePresence initial={false}>
        {rows.map((r, i) => (
          <motion.div
            key={r.key}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.14 } }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <div className="flex items-start gap-2">
              <Input
                aria-label={`Link ${i + 1} URL`}
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={r.url}
                invalid={Boolean(errors[r.key])}
                onChange={(e) => update(r.key, { url: e.target.value })}
                className="min-w-0 flex-[3]"
              />
              <Input aria-label={`Link ${i + 1} label`} placeholder="Label (optional)" value={r.label} maxLength={200} onChange={(e) => update(r.key, { label: e.target.value })} className="min-w-0 flex-[2]" />
              <IconButton icon={X} label={`Remove link ${i + 1}`} className="mt-0.5" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} />
            </div>
            {errors[r.key] && <p className="mt-1 text-[13px] text-red-600">{errors[r.key]}</p>}
          </motion.div>
        ))}
      </AnimatePresence>
      <div>
        <Button size="s" variant="ghost" icon={Plus} onClick={() => onChange([...rows, newLinkDraft()])} disabled={rows.length >= 25} className="-ml-2">
          Add link
        </Button>
      </div>
    </div>
  );
}

export function AttachmentsEditor({
  existing,
  removedIds,
  onToggleRemove,
  pending,
  onPendingChange,
}: {
  existing: WorkAttachment[];
  removedIds: Set<string>;
  onToggleRemove: (id: string) => void;
  pending: File[];
  onPendingChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string>();

  function add(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    const bad = files.map(checkFile).find(Boolean);
    setError(bad);
    onPendingChange([...pending, ...files.filter((f) => !checkFile(f))]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-secondary">Attachments</span>
      {(existing.length > 0 || pending.length > 0) && (
        <ul className="flex flex-col gap-1">
          {existing.map((a) => {
            const removed = removedIds.has(a.id);
            return (
              <li key={a.id} className={cn("flex items-center gap-2 rounded-md border border-line/80 bg-surface/70 px-2.5 py-1.5 text-sm", removed && "opacity-60")}>
                <Paperclip className="size-3.5 shrink-0 text-muted" aria-hidden />
                <a href={a.url} target="_blank" rel="noopener noreferrer" className={cn("focus-ring min-w-0 flex-1 truncate hover:underline", removed && "line-through")}>
                  {a.fileName}
                </a>
                <span className="tabular shrink-0 text-xs text-muted">{removed ? "Will be removed" : formatBytes(a.sizeBytes)}</span>
                {removed ? (
                  <IconButton icon={RotateCcw} label={`Keep ${a.fileName}`} className="size-7" onClick={() => onToggleRemove(a.id)} />
                ) : (
                  <IconButton icon={X} label={`Remove ${a.fileName}`} className="size-7" onClick={() => onToggleRemove(a.id)} />
                )}
              </li>
            );
          })}
          {pending.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 rounded-md border border-dashed border-accent-500/50 bg-[var(--tone-accent-bg)] px-2.5 py-1.5 text-sm">
              <Upload className="size-3.5 shrink-0 text-accent-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="tabular shrink-0 text-xs text-muted">New · {formatBytes(f.size)}</span>
              <IconButton icon={X} label={`Don't upload ${f.name}`} className="size-7" onClick={() => onPendingChange(pending.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "focus-ring flex items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-secondary transition hover:border-accent-500/60 hover:text-ink",
          dragging && "border-accent-500 bg-[var(--tone-accent-bg)] text-[var(--tone-accent-fg)]",
        )}
      >
        <Paperclip className="size-4" strokeWidth={1.75} aria-hidden />
        <span>
          Drop files or <span className="font-medium text-accent-600">browse</span>
        </span>
        <span className="text-xs text-muted">· images, PDF, docs · max 5 MB each</span>
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => add(e.target.files)} />
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

/** Uploads files in batches of 10 (the backend's per-request limit). */
export async function uploadAttachments(path: string, itemId: string, files: File[]) {
  for (let i = 0; i < files.length; i += MAX_FILES_PER_UPLOAD) {
    const form = new FormData();
    for (const f of files.slice(i, i + MAX_FILES_PER_UPLOAD)) form.append("files", f, f.name);
    await api(`/api/${path}/${itemId}/attachments`, { form });
  }
}

// ---------- AI rephrase ----------

type RephraseResult = { text: string; source: "llm" | "mock"; model?: string; ms: number };

/**
 * "Rephrase" under the notes: asks the AI for a readable, professional rewrite and shows it as a suggestion.
 * Nothing changes until the admin clicks "Replace notes"; "Discard" drops it. Never saves on its own.
 */
export function RephraseNotes({ notes, title, onAccept }: { notes: string; title: string; onAccept: (text: string) => void }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"idle" | "loading">("idle");
  const [result, setResult] = useState<RephraseResult | null>(null);
  const [error, setError] = useState<string>();
  const empty = !notes.trim();

  async function run() {
    setState("loading");
    setError(undefined);
    try {
      setResult(await api<RephraseResult>("/api/ai/rephrase", { body: { text: notes, title: title.trim() || undefined } }));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Couldn't rephrase the notes. Try again.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="s" icon={WandSparkles} loading={state === "loading"} disabled={empty} onClick={run} aria-describedby="rephrase-help">
          {state === "loading" ? <span className="text-ai-shimmer">Rephrasing…</span> : "Rephrase"}
        </Button>
        <span id="rephrase-help" className="text-[13px] text-muted">
          {empty ? "Write some notes, then let AI make them clear and professional." : "AI rewrites the notes so they're readable and professional. You review it first."}
        </span>
      </div>

      {error && (
        <div className="mt-2" role="alert">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.section
            key="suggestion"
            aria-label="AI rephrased notes"
            initial={reduce ? false : { opacity: 0, y: 6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.15 } }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ "--ai-fill": "var(--ai-fill-soft)" } as CSSProperties}
            className="ai-border-animated ai-glow mt-3 overflow-hidden rounded-xl"
          >
            <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
              <span className="bg-ai inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-white">
                <WandSparkles className="size-3" aria-hidden /> Suggested notes
              </span>
              {result.source === "mock" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Mock AI (dev)</span>}
              {result.source === "llm" && result.model && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-secondary">
                  {result.model} · {(result.ms / 1000).toFixed(1)} s
                </span>
              )}
            </header>
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-ink">{result.text}</p>
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 px-4 py-2.5">
              <Button size="s" variant="ghost" icon={X} onClick={() => setResult(null)}>
                Discard
              </Button>
              <Button size="s" variant="ghost" icon={RotateCcw} onClick={run} disabled={state === "loading"}>
                Try again
              </Button>
              <Button
                size="s"
                variant="primary"
                icon={Check}
                onClick={() => {
                  onAccept(result.text);
                  setResult(null);
                }}
              >
                Replace notes
              </Button>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
