"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUp, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshBacklogData, useMe, useProjects } from "@/lib/hooks";
import type { BacklogItem, BacklogStatus, DraftItem, DraftResult, DraftUpdate, ItemFields } from "@/lib/types";
import { Banner, Button, IconButton, Input, Select, Skeleton, Textarea, cn } from "./ui";
import { useToast } from "./toast";

const EXAMPLES = ["Add 3 items for the login page redesign", "Mark all Checkout Performance items as done", "Add a note about upgrading Storybook, on hold"];

type EditableDraft = DraftItem & { key: number; selected: boolean };
type EditableUpdate = DraftUpdate & { selected: boolean };

/** Admin-only prompt box: drafts backlog items / updates with the LLM, shows an editable preview, saves only on confirm. */
export function AiPrompt({ initialPrompt, onConsumedInitial, onSaved, onManual }: { initialPrompt?: string | null; onConsumedInitial?: () => void; onSaved?: (ids: string[]) => void; onManual?: () => void }) {
  const me = useMe();
  const toast = useToast();
  const { data: projects } = useProjects();
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<"idle" | "generating" | "preview" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  const [updates, setUpdates] = useState<EditableUpdate[]>([]);
  const [meta, setMeta] = useState<Pick<DraftResult, "message" | "warnings" | "source"> | null>(null);
  const [saving, setSaving] = useState(false);
  const ranInitial = useRef<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function run(text = prompt) {
    const p = text.trim();
    if (!p) return;
    setPrompt(p);
    setState("generating");
    setError(null);
    try {
      const res = await api<DraftResult>("/api/ai/draft", { body: { prompt: p } });
      setDrafts(res.creates.map((d, i) => ({ ...d, key: i, selected: true })));
      setUpdates(res.updates.map((u) => ({ ...u, selected: Object.keys(u.after).length > 0 })));
      setMeta({ message: res.message, warnings: res.warnings, source: res.source });
      if (!res.creates.length && !res.updates.length) {
        setState("error");
        setError(res.message || "The AI didn't propose any changes. Try rephrasing or add an item manually.");
      } else setState("preview");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't draft items. Try rephrasing or add an item manually.");
    }
  }

  useEffect(() => {
    if (initialPrompt && ranInitial.current !== initialPrompt) {
      ranInitial.current = initialPrompt;
      run(initialPrompt);
      onConsumedInitial?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const patchDraft = (key: number, patch: Partial<EditableDraft>) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        const flags = { ...d.flags };
        if ("projectId" in patch) delete flags.project;
        if ("status" in patch) delete flags.status;
        return { ...d, ...patch, flags };
      }),
    );

  const selectedDrafts = drafts.filter((d) => d.selected);
  const selectedUpdates = updates.filter((u) => u.selected && Object.keys(u.after).length);
  const blocking = selectedDrafts.filter((d) => !d.title.trim());

  function discard() {
    setState("idle");
    setDrafts([]);
    setUpdates([]);
    setMeta(null);
  }

  async function confirm() {
    if (blocking.length) return toast("Every selected draft needs a title.", "error");
    setSaving(true);
    try {
      const res = await api<{ created: BacklogItem[]; updated: BacklogItem[] }>("/api/backlog/bulk", {
        body: {
          creates: selectedDrafts.map((d) => ({ title: d.title.trim(), notes: d.notes, projectId: d.projectId, status: d.status })),
          updates: selectedUpdates.map((u) => ({ id: u.itemId, patch: u.after })),
        },
      });
      await refreshBacklogData();
      const parts = [];
      if (res.created.length) parts.push(`${res.created.length} item${res.created.length === 1 ? "" : "s"} added to the backlog`);
      if (res.updated.length) parts.push(`${res.updated.length} item${res.updated.length === 1 ? "" : "s"} updated`);
      toast(parts.join(" · "));
      onSaved?.([...res.created, ...res.updated].map((t) => t.id));
      discard();
      setPrompt("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  const projectName = (id: string | null | undefined) => (id ? (projects?.find((p) => p.id === id)?.name ?? "Unknown project") : "No project");
  const fieldValue = (k: keyof ItemFields, v: ItemFields[keyof ItemFields]) => {
    if (k === "projectId") return projectName(v as string | null | undefined);
    if (v === undefined) return "—";
    if (k === "status") return STATUS_LABEL[v as BacklogStatus];
    if (k === "notes") return (v as string).length > 60 ? `${(v as string).slice(0, 60)}…` : String(v);
    return String(v);
  };
  const FIELD_LABEL: Record<keyof ItemFields, string> = { title: "Title", notes: "Notes", projectId: "Project", status: "Status" };

  const disabled = me.ai.mode === "disabled";

  return (
    <div className="mb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className={cn("flex items-end gap-2 rounded-xl p-2 pl-3 transition focus-within:shadow-ai-glow", state === "generating" ? "ai-generating" : "ai-border")}
      >
        <Sparkles className="mb-2 size-4 shrink-0 text-accent-500" strokeWidth={1.75} />
        <textarea
          ref={textRef}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
          rows={1}
          disabled={state === "generating"}
          aria-label="Ask AI to add or update backlog items"
          placeholder={disabled ? "AI drafting isn't configured on the server (set LLM_API_KEY)." : "Ask AI to add or update backlog items… e.g. “Add 3 items for Login Redesign”"}
          className="max-h-24 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-muted disabled:opacity-60"
        />
        <button type="submit" aria-label="Send to AI" disabled={state === "generating" || !prompt.trim()} className="bg-ai focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md text-white transition hover:brightness-110 disabled:opacity-40">
          <ArrowUp className="size-4" />
        </button>
      </form>
      {state === "idle" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => (setPrompt(ex), textRef.current?.focus())} className="focus-ring rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-secondary transition hover:border-accent-100 hover:bg-accent-50 hover:text-accent-600">
              {ex}
            </button>
          ))}
        </div>
      )}

      {state === "generating" && (
        <div className="mt-3 rounded-xl border border-accent-100 bg-accent-50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-accent-600">
            <Sparkles className="size-4 animate-pulse" /> Drafting backlog items…
          </p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="mb-2 h-9 w-full bg-white" />
          ))}
        </div>
      )}

      {state === "error" && error && (
        <div className="mt-3">
          <Banner tone="error" icon={AlertTriangle}>
            {error}{" "}
            {onManual && (
              <button type="button" onClick={onManual} className="font-medium underline">
                Add an item manually
              </button>
            )}
          </Banner>
        </div>
      )}

      {state === "preview" && (
        <section aria-label="AI draft preview" className="animate-in relative mt-3 overflow-hidden rounded-xl bg-accent-50 shadow-ai-glow">
          <span className="bg-ai absolute inset-y-0 left-0 w-1" aria-hidden />
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <div className="flex items-center gap-2">
              <span className="bg-ai inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-white">
                <Sparkles className="size-3" /> AI draft
              </span>
              {meta?.source === "mock" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Mock AI (dev): no LLM key configured</span>}
              <span className="text-sm text-secondary">{meta?.message || "Review and edit before saving. Nothing is saved yet."}</span>
            </div>
          </header>

          {meta?.warnings?.length ? (
            <ul className="mx-5 mt-3 list-inside list-disc text-xs text-amber-800">
              {meta.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {drafts.length > 0 && (
            <ul className="mt-3 space-y-2 px-5">
              {drafts.map((d, i) => (
                <li key={d.key} className={cn("animate-in rounded-lg bg-surface p-3 shadow-xs", !d.selected && "opacity-50")} style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" aria-label="Include draft" checked={d.selected} onChange={(e) => patchDraft(d.key, { selected: e.target.checked })} className="size-4 shrink-0 accent-violet-600" />
                    <Input aria-label="Draft title" value={d.title} onChange={(e) => patchDraft(d.key, { title: e.target.value })} invalid={!d.title.trim()} className="font-medium" />
                    <IconButton icon={Trash2} label="Remove draft" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} />
                  </div>
                  <div className="mt-2 grid gap-2 pl-6 pr-10 md:grid-cols-[1fr_200px_160px]">
                    <DraftField label="Notes">
                      <Textarea aria-label="Draft notes" rows={2} value={d.notes} onChange={(e) => patchDraft(d.key, { notes: e.target.value })} className="min-h-0" />
                    </DraftField>
                    <DraftField label="Project (optional)" flag={d.flags.project}>
                      <Select aria-label="Draft project" value={d.projectId ?? ""} onChange={(e) => patchDraft(d.key, { projectId: e.target.value || null })} invalid={Boolean(d.flags.project)}>
                        <option value="">No project</option>
                        {projects?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </DraftField>
                    <DraftField label="Status" flag={d.flags.status}>
                      <Select aria-label="Draft status" value={d.status} onChange={(e) => patchDraft(d.key, { status: e.target.value as BacklogStatus })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                    </DraftField>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {updates.length > 0 && (
            <div className="mt-3 space-y-2 px-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Proposed updates</h3>
              {updates.map((u) => (
                <div key={u.itemId} className={cn("flex items-start gap-3 rounded-lg bg-surface p-3 shadow-xs", !u.selected && "opacity-50")}>
                  <input type="checkbox" aria-label="Include update" checked={u.selected} onChange={(e) => setUpdates((us) => us.map((x) => (x.itemId === u.itemId ? { ...x, selected: e.target.checked } : x)))} className="mt-1 size-4 accent-violet-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{u.itemTitle}</div>
                    <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                      {(Object.keys(u.after) as (keyof ItemFields)[]).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5">
                          <span className="text-muted">{FIELD_LABEL[k]}:</span>
                          <span className="text-muted line-through">{fieldValue(k, u.before[k])}</span>
                          <ArrowRight className="size-3 text-muted" />
                          <span className="font-medium text-accent-600">{fieldValue(k, u.after[k])}</span>
                        </span>
                      ))}
                      {Object.values(u.flags).map((f) => (
                        <Flag key={f} text={f as string} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <footer className="mt-3 flex items-center justify-end gap-2 border-t border-accent-100 px-5 py-3">
            <span className="mr-auto text-xs text-muted">
              {selectedDrafts.length + selectedUpdates.length} selected · nothing is saved until you confirm
            </span>
            <Button variant="ghost" onClick={discard}>
              Discard
            </Button>
            <Button variant="primary" onClick={confirm} loading={saving} disabled={!selectedDrafts.length && !selectedUpdates.length}>
              Confirm and save
            </Button>
          </footer>
        </section>
      )}
    </div>
  );
}

function DraftField({ label, flag, children }: { label: string; flag?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 text-[11px] font-medium text-muted">{label}</div>
      {children}
      {flag && <Flag text={flag} />}
    </div>
  );
}

function Flag({ text }: { text: string }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
      <AlertTriangle className="size-3" /> {text}
    </span>
  );
}
