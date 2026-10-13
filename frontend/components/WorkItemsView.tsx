"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import { FolderKanban, Lightbulb, MoreHorizontal, Pencil, Plus, Search, Sparkles, Target, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { formatPeriod, periodKey, STATUS_LABEL, STATUS_STYLE, STATUSES, timeAgo } from "@/lib/format";
import { refreshWorkData, useIsAdmin, useProjects } from "@/lib/hooks";
import type { WorkItem, WorkStatus, WorkType } from "@/lib/types";
import { WORK } from "@/lib/workTypes";
import { Button, Card, Chip, ConfirmModal, EmptyState, IconButton, Input, Menu, Select, Skeleton, cn } from "./ui";
import { itemVariants, listVariants } from "./motion";
import { OutcomePill, PeriodChip, StatusSelect, TimeboxChip } from "./WorkBits";
import { WorkItemForm } from "./WorkItemForm";
import { AiPrompt } from "./AiPrompt";
import { useToast } from "./toast";

function Clamp({ text, lines = 3, className }: { text: string; lines?: 2 | 3; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > (lines === 2 ? 160 : 220) || text.split("\n").length > lines;
  return (
    <div className={className}>
      <p className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-secondary", !expanded && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>{text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="focus-ring mt-1 text-xs font-medium text-accent-600 hover:underline">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function WorkCard({ item, isAdmin, highlight, showProject, onStatus, onEdit, onDelete }: { item: WorkItem; isAdmin: boolean; highlight?: boolean; showProject: boolean; onStatus: (s: WorkStatus) => void; onEdit?: () => void; onDelete?: () => void }) {
  const closed = item.status === "DONE" || item.status === "REJECT";
  return (
    <motion.li
      layout="position"
      variants={itemVariants}
      exit="exit"
      className={cn("glass-card lift relative rounded-xl p-4 focus-within:z-20 has-[[aria-expanded=true]]:z-30", highlight && "ai-border-animated ai-glow", closed && "bg-surface/60")}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[15px] font-semibold leading-6", item.status === "REJECT" && "text-muted line-through decoration-zinc-300")}>{item.title}</h3>
          {item.goal && (
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink/80">
              <Target className="mt-[3px] size-3.5 shrink-0 text-accent-500" aria-hidden />
              <span>
                <span className="sr-only">Goal: </span>
                {item.goal}
              </span>
            </p>
          )}
        </div>
        {item.outcome && <OutcomePill outcome={item.outcome} />}
        <StatusSelect item={item} onChange={onStatus} />
        {isAdmin && onEdit && onDelete && (
          <Menu
            trigger={(t) => <IconButton icon={MoreHorizontal} label={`Actions for ${item.title}`} className="-mr-1 -mt-0.5" {...t} />}
            items={[
              { label: "Edit", icon: Pencil, onClick: onEdit },
              { label: "Delete", icon: Trash2, danger: true, onClick: onDelete },
            ]}
          />
        )}
      </div>
      {item.notes && <Clamp text={item.notes} className="mt-1.5" />}
      {item.findings && (
        <div className="mt-2.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
            <Lightbulb className="size-3.5" aria-hidden /> Findings
          </div>
          <Clamp text={item.findings} lines={2} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
        {item.targetPeriod && <PeriodChip period={item.targetPeriod} />}
        {item.timeboxEnd && <TimeboxChip end={item.timeboxEnd} status={item.status} />}
        {showProject &&
          (item.project ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-zinc-100 px-1.5 py-0.5 font-medium text-secondary">
              <FolderKanban className="size-3" aria-hidden /> {item.project.name}
            </span>
          ) : (
            <span className="rounded-sm bg-zinc-50 px-1.5 py-0.5">No project</span>
          ))}
        <span>
          Added by <span className="text-secondary">{item.createdBy.name}</span> · <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
        </span>
        {item.updatedAt !== item.createdAt && (
          <span>
            Updated <time dateTime={item.updatedAt}>{timeAgo(item.updatedAt)}</time>
          </span>
        )}
      </div>
    </motion.li>
  );
}

type Filters = { projectId: string; status: "" | WorkStatus; q: string };

/**
 * One view for all four work sections (Tasks, Roadmap, R&D, POC): search, project filter, status chips with
 * counts, staggered cards, admin add / edit / delete and (optionally) the AI prompt box.
 */
export function WorkItemsView({ type, projectId, withAi = false, headerSlot }: { type: WorkType; projectId?: string; withAi?: boolean; headerSlot?: (actions: ReactNode) => ReactNode }) {
  const cfg = WORK[type];
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ projectId: projectId ?? "", status: "", q: "" });
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WorkItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  // Status is filtered client-side so the chips can show counts for the current project / search.
  const qs = new URLSearchParams(Object.entries({ projectId: filters.projectId, q: filters.q }).filter(([, v]) => v) as [string, string][]).toString();
  const { data: items, isLoading, mutate } = useSWR<WorkItem[]>(`/api/${cfg.path}${qs ? `?${qs}` : ""}`, fetcher, { keepPreviousData: true });
  const { data: projects } = useProjects();

  const counts = Object.fromEntries(STATUSES.map((s) => [s, items?.filter((i) => i.status === s).length ?? 0])) as Record<WorkStatus, number>;
  let shown = (items ?? []).filter((i) => !filters.status || i.status === filters.status);
  if (type === "ROADMAP") shown = [...shown].sort((a, b) => periodKey(a.targetPeriod) - periodKey(b.targetPeriod));
  const filtering = Boolean(filters.status || filters.q || (!projectId && filters.projectId));

  async function setStatus(item: WorkItem, status: WorkStatus) {
    if (status === item.status) return;
    await mutate((list) => list?.map((i) => (i.id === item.id ? { ...i, status } : i)), { revalidate: false });
    try {
      await api(`/api/${cfg.path}/${item.id}/status`, { method: "PATCH", body: { status } });
      toast(`“${item.title}” set to ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change status", "error");
    }
    refreshWorkData();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/api/${cfg.path}/${deleting.id}`, { method: "DELETE" });
      toast("Deleted");
      setDeleting(null);
      refreshWorkData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally {
      setBusyDelete(false);
    }
  }

  const flash = (ids: string[]) => {
    setHighlight(new Set(ids));
    setTimeout(() => setHighlight(new Set()), 3500);
  };

  const actions = isAdmin ? (
    <Button variant={withAi ? "secondary" : "primary"} icon={Plus} onClick={() => setCreating(true)}>
      New {cfg.noun}
    </Button>
  ) : null;

  // Roadmap: group by target period (already sorted)
  const groups: { key: string; label: string; items: WorkItem[] }[] = [];
  if (type === "ROADMAP") {
    for (const i of shown) {
      const key = i.targetPeriod ?? "none";
      const g = groups.find((x) => x.key === key);
      if (g) g.items.push(i);
      else groups.push({ key, label: i.targetPeriod ? formatPeriod(i.targetPeriod) : "No target", items: [i] });
    }
  } else groups.push({ key: "all", label: "", items: shown });

  const card = (item: WorkItem) => (
    <WorkCard
      key={item.id}
      item={item}
      isAdmin={isAdmin}
      highlight={highlight.has(item.id)}
      showProject={!projectId}
      onStatus={(s) => setStatus(item, s)}
      onEdit={() => setEditing(item)}
      onDelete={() => setDeleting(item)}
    />
  );

  return (
    <div>
      {headerSlot ? headerSlot(actions) : actions && <div className="mb-4 flex justify-end">{actions}</div>}
      {isAdmin && withAi && <AiPrompt type={type} onSaved={flash} onManual={() => setCreating(true)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label={`Search ${cfg.label}`} placeholder="Search title or notes" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="bg-surface/80 pl-8" />
        </div>
        {!projectId && (
          <Select aria-label="Filter by project" value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} className="w-auto min-w-36 bg-surface/80">
            <option value="">All projects</option>
            <option value="none">No project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <div role="group" aria-label="Filter by status" className="mb-5 flex flex-wrap items-center gap-1.5">
        <Chip selected={!filters.status} onClick={() => setFilters({ ...filters, status: "" })}>
          All <span className="tabular ml-1 opacity-70">{items?.length ?? 0}</span>
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} selected={filters.status === s} onClick={() => setFilters({ ...filters, status: filters.status === s ? "" : s })}>
            <span className="mr-1.5 inline-block size-1.5 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />
            {STATUS_LABEL[s]} <span className="tabular ml-1 opacity-70">{counts[s]}</span>
          </Chip>
        ))}
      </div>

      {isLoading && !items ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="glass-card rounded-xl p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-3 h-3 w-5/6" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card className="p-0">
          {filtering ? (
            <EmptyState icon={Search} title="Nothing matches these filters." text="Try another status, project or search." />
          ) : (
            <EmptyState
              icon={cfg.icon}
              title={cfg.emptyTitle}
              text={isAdmin ? cfg.emptyText : "Your admin hasn't added anything here yet."}
              action={
                isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                      New {cfg.noun}
                    </Button>
                    {withAi && (
                      <Button icon={Sparkles} onClick={() => document.querySelector<HTMLTextAreaElement>("textarea[data-ai-prompt]")?.focus()}>
                        Ask AI
                      </Button>
                    )}
                  </div>
                )
              }
            />
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label || cfg.label}>
              {g.label && (
                <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="bg-ai size-1.5 rounded-full" aria-hidden />
                  {g.label}
                  <span className="tabular font-normal normal-case tracking-normal">· {g.items.length}</span>
                </h2>
              )}
              <motion.ul className="space-y-3" aria-label={`${cfg.label} items`} variants={listVariants} initial="hidden" animate="show">
                <AnimatePresence mode="popLayout">
                  {g.items.map(card)}
                </AnimatePresence>
              </motion.ul>
            </section>
          ))}
        </div>
      )}

      {isAdmin && creating && <WorkItemForm type={type} open onClose={() => setCreating(false)} defaultProjectId={projectId} onSaved={(id) => flash([id])} />}
      {isAdmin && editing && <WorkItemForm key={editing.id} type={type} open item={editing} onClose={() => setEditing(null)} onSaved={(id) => flash([id])} />}
      <ConfirmModal
        open={Boolean(deleting)}
        title={`Delete this ${cfg.noun}?`}
        text={
          <>
            “{deleting?.title}” will be removed for everyone. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        loading={busyDelete}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
