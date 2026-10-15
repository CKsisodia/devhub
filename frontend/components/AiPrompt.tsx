"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, ArrowUp, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatPeriod, OUTCOME_LABEL, OUTCOMES, STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshWorkData, useMe, useProjects } from "@/lib/hooks";
import type { DraftItem, DraftResult, DraftUpdate, ItemFields, PocOutcome, WorkItem, WorkStatus, WorkType } from "@/lib/types";
import { hasExtra, WORK, type ExtraField } from "@/lib/workTypes";
import { Banner, Button, IconButton, Input, Select, Skeleton, Textarea, cn } from "./ui";
import { EASE, useTypewriter } from "./motion";
import { PeriodSelect } from "./WorkBits";
import { useToast } from "./toast";

type EditableDraft = DraftItem & { key: number; selected: boolean };
type EditableUpdate = DraftUpdate & { selected: boolean };

const thinkingSteps = (label: string) => ["Reading your projects…", `Drafting ${label}…`, "Matching names and statuses…", "Tidying up the preview…", "Still working: local models can take up to a minute…"];

function ThinkingLine({ label }: { label: string }) {
  const steps = thinkingSteps(label);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 2500);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <span className="relative inline-flex h-5 items-center overflow-hidden" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.span
          key={i}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="text-ai-shimmer text-sm font-medium"
        >
          {steps[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Title that "types itself" when the draft first appears, then becomes an editable input. */
function DraftTitle({ value, onChange, fresh }: { value: string; onChange: (v: string) => void; fresh: boolean }) {
  const { text, done } = useTypewriter(value, fresh);
  if (!done)
    return (
      <div aria-hidden className="caret flex h-9 flex-1 items-center rounded-md border border-transparent px-3 text-sm font-medium">
        {text}
      </div>
    );
  return <Input aria-label="Draft title" value={value} onChange={(e) => onChange(e.target.value)} invalid={!value.trim()} className="font-medium" />;
}

/**
 * Admin-only prompt box for one work section: drafts items / updates with the LLM, reveals them one by one
 * in an editable preview and saves only when the admin confirms.
 */
export function AiPrompt({ type, onSaved, onManual }: { type: WorkType; onSaved?: (ids: string[]) => void; onManual?: () => void }) {
  const cfg = WORK[type];
  const me = useMe();
  const toast = useToast();
  const reduce = useReducedMotion();
  const { data: projects } = useProjects();
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<"idle" | "generating" | "preview" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<EditableDraft[]>([]);
  const [updates, setUpdates] = useState<EditableUpdate[]>([]);
  const [meta, setMeta] = useState<Pick<DraftResult, "message" | "warnings" | "source" | "model" | "ms"> | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const total = drafts.length + updates.length;

  // Streaming-style reveal: one draft every ~320 ms (all at once with reduced motion).
  useEffect(() => {
    if (state !== "preview" || revealed >= total) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), reduce ? 0 : 320);
    return () => clearTimeout(id);
  }, [state, revealed, total, reduce]);

  async function run(text = prompt) {
    const p = text.trim();
    if (!p) return;
    setPrompt(p);
    setState("generating");
    setError(null);
    try {
      const res = await api<DraftResult>("/api/ai/draft", {
        body: { prompt: p, type },
      });
      setDrafts(res.creates.map((d, i) => ({ ...d, key: i, selected: true })));
      setUpdates(
        res.updates.map((u) => ({
          ...u,
          selected: Object.keys(u.after).length > 0,
        })),
      );
      setMeta({
        message: res.message,
        warnings: res.warnings,
        source: res.source,
        model: res.model,
        ms: res.ms,
      });
      setRevealed(0);
      if (!res.creates.length && !res.updates.length) {
        setState("error");
        setError(res.message || "The AI didn't propose any changes. Try rephrasing or add an item manually.");
      } else setState("preview");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't draft items. Try rephrasing or add an item manually.");
    }
  }

  const patchDraft = (key: number, patch: Partial<EditableDraft>) =>
    setDrafts((ds) =>
      ds.map((d) => {
        if (d.key !== key) return d;
        const flags = { ...d.flags };
        for (const k of ["projectId", "status", "targetPeriod", "timeboxEnd", "outcome"] as const) if (k in patch) delete flags[k === "projectId" ? "project" : k];
        return { ...d, ...patch, flags };
      }),
    );

  const selectedDrafts = drafts.filter((d) => d.selected);
  const selectedUpdates = updates.filter((u) => u.selected && Object.keys(u.after).length);
  const blocking = selectedDrafts.filter((d) => !d.title.trim());
  const streaming = state === "preview" && revealed < total;

  function discard() {
    setState("idle");
    setDrafts([]);
    setUpdates([]);
    setMeta(null);
    setRevealed(0);
  }

  async function confirm() {
    if (blocking.length) return toast("Every selected draft needs a title.", "error");
    setSaving(true);
    const extras = (d: EditableDraft) => {
      const out: Record<string, unknown> = {};
      for (const f of cfg.extras) if (d[f] !== undefined) out[f] = d[f] === "" && f === "timeboxEnd" ? null : d[f];
      return out;
    };
    try {
      const res = await api<{ created: WorkItem[]; updated: WorkItem[] }>(`/api/${cfg.path}/bulk`, {
        body: {
          creates: selectedDrafts.map((d) => ({
            title: d.title.trim(),
            notes: d.notes,
            projectId: d.projectId,
            status: d.status,
            ...extras(d),
          })),
          updates: selectedUpdates.map((u) => ({
            id: u.itemId,
            patch: u.after,
          })),
        },
      });
      await refreshWorkData();
      const parts = [];
      if (res.created.length) parts.push(`${res.created.length} added to ${cfg.label}`);
      if (res.updated.length) parts.push(`${res.updated.length} updated`);
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
    if (v === undefined || v === null || v === "") return "—";
    if (k === "status") return STATUS_LABEL[v as WorkStatus];
    if (k === "outcome") return OUTCOME_LABEL[v as PocOutcome];
    if (k === "targetPeriod") return formatPeriod(v as string);
    if (k === "timeboxEnd") return formatDate(v as string, true);
    const str = String(v);
    return str.length > 60 ? `${str.slice(0, 60)}…` : str;
  };
  const FIELD_LABEL: Record<keyof ItemFields, string> = {
    title: "Title",
    notes: "Notes",
    projectId: "Project",
    status: "Status",
    targetPeriod: "Target",
    goal: "Goal",
    timeboxEnd: "Time box",
    findings: "Findings",
    outcome: "Outcome",
  };

  const disabled = me.ai.mode === "disabled";
  const extraCols = cfg.extras.filter((f): f is Exclude<ExtraField, "findings" | "goal"> => f !== "findings" && f !== "goal");

  return (
    <div className="mb-6">
      <motion.form
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        style={{ "--ai-fill": "var(--color-surface)" } as React.CSSProperties}
        className={cn("ai-border-animated relative flex items-end gap-2 rounded-2xl p-2 pl-3 shadow-sm transition-shadow focus-within:shadow-ai-glow", state === "generating" && "is-thinking")}
      >
        <motion.span
          animate={state === "generating" && !reduce ? { rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
          transition={{
            duration: 1.2,
            repeat: state === "generating" ? Infinity : 0,
          }}
          className="mb-2 shrink-0"
        >
          <Sparkles className="size-4 text-accent-500" strokeWidth={1.75} />
        </motion.span>
        <textarea
          ref={textRef}
          data-ai-prompt
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
          aria-label={`Ask AI to add or update ${cfg.label} items`}
          placeholder={disabled ? "AI drafting isn't configured on the server (set LLM_API_KEY)." : cfg.aiPlaceholder}
          className="max-h-24 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 outline-none placeholder:text-muted disabled:opacity-60"
        />
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          type="submit"
          aria-label="Send to AI"
          disabled={state === "generating" || !prompt.trim()}
          className="bg-ai focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-ai-glow transition disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </motion.button>
      </motion.form>

      <AnimatePresence mode="wait" initial={false}>
        {state === "idle" && (
          <motion.div key="examples" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 flex flex-wrap gap-1.5">
            {cfg.examples.map((ex, i) => (
              <motion.button
                key={ex}
                type="button"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.05 * i } }}
                onClick={() => (setPrompt(ex), textRef.current?.focus())}
                className="focus-ring inline-flex items-center gap-1 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-xs text-secondary transition hover:-translate-y-px hover:border-accent-100 hover:bg-accent-50 hover:text-accent-600"
              >
                <Wand2 className="size-3" aria-hidden /> {ex}
              </motion.button>
            ))}
          </motion.div>
        )}

        {state === "generating" && (
          <motion.div
            key="gen"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 overflow-hidden rounded-2xl border border-accent-100 bg-accent-50/80 p-4 backdrop-blur-sm"
          >
            <p className="mb-3 flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="bg-ai absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" />
                <span className="bg-ai relative inline-flex size-2.5 rounded-full" />
              </span>
              <ThinkingLine label={cfg.label.toLowerCase()} />
            </p>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="skeleton-ai mb-2 h-10 w-full rounded-lg" />
            ))}
          </motion.div>
        )}

        {state === "error" && error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <Banner tone="error" icon={AlertTriangle}>
              {error}{" "}
              {onManual && (
                <button type="button" onClick={onManual} className="font-medium underline">
                  Add one manually
                </button>
              )}
            </Banner>
          </motion.div>
        )}

        {state === "preview" && (
          <motion.section
            key="preview"
            aria-label="AI draft preview"
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ "--ai-fill": "var(--ai-fill-soft)" } as React.CSSProperties}
            className="ai-border-animated ai-glow relative mt-3 overflow-hidden rounded-2xl"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-ai inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-white">
                  <Sparkles className="size-3" /> AI draft · {cfg.label}
                </span>
                {meta?.source === "mock" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Mock AI (dev): no LLM configured</span>}
                {meta?.source === "llm" && meta.model && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-secondary" title="Model that drafted this">
                    {meta.model}
                    {meta.ms ? ` · ${(meta.ms / 1000).toFixed(1)} s` : ""}
                  </span>
                )}
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
                <AnimatePresence>
                  {drafts.slice(0, revealed).map((d) => (
                    <motion.li
                      key={d.key}
                      layout="position"
                      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                      animate={{
                        opacity: d.selected ? 1 : 0.5,
                        y: 0,
                        filter: "blur(0px)",
                      }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="rounded-xl border border-line/80 bg-surface/90 p-3 shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label="Include draft"
                          checked={d.selected}
                          onChange={(e) => patchDraft(d.key, { selected: e.target.checked })}
                          className="size-4 shrink-0 accent-accent-500"
                        />
                        <DraftTitle value={d.title} onChange={(v) => patchDraft(d.key, { title: v })} fresh={!reduce} />
                        <IconButton icon={Trash2} label="Remove draft" onClick={() => (setDrafts((ds) => ds.filter((x) => x.key !== d.key)), setRevealed((r) => Math.max(0, r - 1)))} />
                      </div>
                      <div className={cn("mt-2 grid gap-2 pl-6 pr-10", extraCols.length ? "md:grid-cols-[1fr_180px_140px_160px]" : "md:grid-cols-[1fr_200px_160px]")}>
                        <DraftField label="Notes">
                          <Textarea aria-label="Draft notes" rows={2} value={d.notes} onChange={(e) => patchDraft(d.key, { notes: e.target.value })} className="min-h-0" />
                        </DraftField>
                        <DraftField label="Project (optional)" flag={d.flags.project}>
                          <Select
                            aria-label="Draft project"
                            value={d.projectId ?? ""}
                            onChange={(e) =>
                              patchDraft(d.key, {
                                projectId: e.target.value || null,
                              })
                            }
                            invalid={Boolean(d.flags.project)}
                          >
                            <option value="">No project</option>
                            {projects?.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                        </DraftField>
                        <DraftField label="Status" flag={d.flags.status}>
                          <Select
                            aria-label="Draft status"
                            value={d.status}
                            onChange={(e) =>
                              patchDraft(d.key, {
                                status: e.target.value as WorkStatus,
                              })
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </Select>
                        </DraftField>
                        {hasExtra(type, "targetPeriod") && (
                          <DraftField label="Target" flag={d.flags.targetPeriod}>
                            <PeriodSelect label="Draft target" value={d.targetPeriod ?? null} onChange={(v) => patchDraft(d.key, { targetPeriod: v })} invalid={Boolean(d.flags.targetPeriod)} />
                          </DraftField>
                        )}
                        {hasExtra(type, "timeboxEnd") && (
                          <DraftField label="Time box ends" flag={d.flags.timeboxEnd}>
                            <Input
                              aria-label="Draft time box end"
                              type="date"
                              value={d.timeboxEnd ?? ""}
                              onChange={(e) =>
                                patchDraft(d.key, {
                                  timeboxEnd: e.target.value || null,
                                })
                              }
                            />
                          </DraftField>
                        )}
                        {hasExtra(type, "goal") && (
                          <DraftField label="Goal" className="md:col-span-2">
                            <Input aria-label="Draft goal" value={d.goal ?? ""} onChange={(e) => patchDraft(d.key, { goal: e.target.value })} />
                          </DraftField>
                        )}
                        {hasExtra(type, "outcome") && (
                          <DraftField label="Outcome" flag={d.flags.outcome}>
                            <Select
                              aria-label="Draft outcome"
                              value={d.outcome ?? ""}
                              onChange={(e) =>
                                patchDraft(d.key, {
                                  outcome: (e.target.value || null) as PocOutcome | null,
                                })
                              }
                            >
                              <option value="">Not decided</option>
                              {OUTCOMES.map((o) => (
                                <option key={o} value={o}>
                                  {OUTCOME_LABEL[o]}
                                </option>
                              ))}
                            </Select>
                          </DraftField>
                        )}
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {updates.length > 0 && (
              <div className="mt-3 space-y-2 px-5">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Proposed updates</h3>
                <AnimatePresence>
                  {updates.slice(0, Math.max(0, revealed - drafts.length)).map((u) => (
                    <motion.div
                      key={u.itemId}
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{
                        opacity: u.selected ? 1 : 0.5,
                        y: 0,
                        filter: "blur(0px)",
                      }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-start gap-3 rounded-xl border border-line/80 bg-surface/90 p-3 shadow-xs"
                    >
                      <input
                        type="checkbox"
                        aria-label="Include update"
                        checked={u.selected}
                        onChange={(e) => setUpdates((us) => us.map((x) => (x.itemId === u.itemId ? { ...x, selected: e.target.checked } : x)))}
                        className="mt-1 size-4 accent-accent-500"
                      />
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
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <footer className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-accent-100 px-5 py-3">
              <span className="mr-auto text-xs text-muted" aria-live="polite">
                {streaming ? (
                  <span className="text-ai-shimmer font-medium">
                    Writing drafts… {revealed}/{total}
                  </span>
                ) : (
                  <>{selectedDrafts.length + selectedUpdates.length} selected · nothing is saved until you confirm</>
                )}
              </span>
              <Button variant="ghost" onClick={discard}>
                Discard
              </Button>
              <Button variant="primary" onClick={confirm} loading={saving} disabled={streaming || (!selectedDrafts.length && !selectedUpdates.length)}>
                Confirm and save
              </Button>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function DraftField({ label, flag, children, className }: { label: string; flag?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
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
