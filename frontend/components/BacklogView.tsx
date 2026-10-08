"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { ChevronDown, FolderKanban, ListTodo, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { STATUS_LABEL, STATUS_STYLE, STATUSES, timeAgo } from "@/lib/format";
import { refreshBacklogData, useIsAdmin, useProjects } from "@/lib/hooks";
import type { BacklogItem, BacklogStatus } from "@/lib/types";
import { Button, Chip, ConfirmModal, EmptyState, IconButton, Input, Menu, Select, Skeleton, cn } from "./ui";
import { BacklogForm } from "./BacklogForm";
import { AiPrompt } from "./AiPrompt";
import { useToast } from "./toast";

/** Status dropdown styled as a pill. Every signed-in user may change status (admins and viewers). */
export function StatusSelect({ item, onChange }: { item: BacklogItem; onChange: (s: BacklogStatus) => void }) {
  const st = STATUS_STYLE[item.status];
  return (
    <span className="relative inline-flex shrink-0">
      <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full" style={{ background: st.dot }} />
      <select
        aria-label={`Status of ${item.title}`}
        value={item.status}
        onChange={(e) => onChange(e.target.value as BacklogStatus)}
        className="focus-ring h-7 cursor-pointer appearance-none rounded-full border-0 pl-6 pr-7 text-xs font-medium"
        style={{ background: st.bg, color: st.text }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2" style={{ color: st.text }} />
    </span>
  );
}

function BacklogCard({ item, isAdmin, highlight, showProject, onStatus, onEdit, onDelete }: { item: BacklogItem; isAdmin: boolean; highlight: boolean; showProject: boolean; onStatus: (s: BacklogStatus) => void; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = item.notes.length > 220 || item.notes.split("\n").length > 3;
  return (
    <li
      className={cn(
        "rounded-lg border border-line/70 bg-surface p-4 shadow-xs transition hover:border-line-strong",
        highlight && "ai-border shadow-ai-glow",
        (item.status === "DONE" || item.status === "REJECT") && "bg-zinc-50/60",
      )}
    >
      <div className="flex items-start gap-3">
        <h3 className={cn("min-w-0 flex-1 text-[15px] font-semibold leading-6", item.status === "REJECT" && "text-muted line-through decoration-zinc-300")}>{item.title}</h3>
        <StatusSelect item={item} onChange={onStatus} />
        {isAdmin && (
          <Menu
            trigger={(t) => <IconButton icon={MoreHorizontal} label={`Actions for ${item.title}`} className="-mr-1 -mt-0.5" {...t} />}
            items={[
              { label: "Edit", icon: Pencil, onClick: onEdit },
              { label: "Delete", icon: Trash2, danger: true, onClick: onDelete },
            ]}
          />
        )}
      </div>
      {item.notes && (
        <div className="mt-1.5">
          <p className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-secondary", !expanded && "line-clamp-3")}>{item.notes}</p>
          {long && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="focus-ring mt-1 text-xs font-medium text-accent-600 hover:underline">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {showProject &&
          (item.project ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-zinc-100 px-1.5 py-0.5 font-medium text-secondary">
              <FolderKanban className="size-3" /> {item.project.name}
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
    </li>
  );
}

type Filters = { projectId: string; status: "" | BacklogStatus; q: string };

export function BacklogView({ projectId, withAi = false, initialAiPrompt, onConsumedAiPrompt, headerSlot }: { projectId?: string; withAi?: boolean; initialAiPrompt?: string | null; onConsumedAiPrompt?: () => void; headerSlot?: (actions: ReactNode) => ReactNode }) {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ projectId: projectId ?? "", status: "", q: "" });
  const [editing, setEditing] = useState<BacklogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BacklogItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  // Status is filtered client-side so the chips can show counts for the current project / search.
  const qs = new URLSearchParams(Object.entries({ projectId: filters.projectId, q: filters.q }).filter(([, v]) => v) as [string, string][]).toString();
  const { data: items, isLoading, mutate } = useSWR<BacklogItem[]>(`/api/backlog${qs ? `?${qs}` : ""}`, fetcher, { keepPreviousData: true });
  const { data: projects } = useProjects();

  const counts = Object.fromEntries(STATUSES.map((s) => [s, items?.filter((i) => i.status === s).length ?? 0])) as Record<BacklogStatus, number>;
  const shown = (items ?? []).filter((i) => !filters.status || i.status === filters.status);
  const filtering = Boolean(filters.status || filters.q || (!projectId && filters.projectId));

  async function setStatus(item: BacklogItem, status: BacklogStatus) {
    if (status === item.status) return;
    await mutate((list) => list?.map((i) => (i.id === item.id ? { ...i, status } : i)), { revalidate: false });
    try {
      await api(`/api/backlog/${item.id}/status`, { method: "PATCH", body: { status } });
      toast(`“${item.title}” set to ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change status", "error");
    }
    refreshBacklogData();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/api/backlog/${deleting.id}`, { method: "DELETE" });
      toast("Item deleted");
      setDeleting(null);
      refreshBacklogData();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally {
      setBusyDelete(false);
    }
  }

  const flash = (ids: string[]) => {
    setHighlight(new Set(ids));
    setTimeout(() => setHighlight(new Set()), 3000);
  };

  const actions = isAdmin ? (
    <Button variant={withAi ? "secondary" : "primary"} icon={Plus} onClick={() => setCreating(true)}>
      New item
    </Button>
  ) : null;

  return (
    <div>
      {headerSlot ? headerSlot(actions) : actions && <div className="mb-4 flex justify-end">{actions}</div>}
      {isAdmin && withAi && <AiPrompt initialPrompt={initialAiPrompt} onConsumedInitial={onConsumedAiPrompt} onSaved={flash} onManual={() => setCreating(true)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label="Search backlog" placeholder="Search title or notes" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} className="pl-8" />
        </div>
        {!projectId && (
          <Select aria-label="Filter by project" value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} className="w-auto min-w-36">
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
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap items-center gap-1.5">
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
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-line/70 bg-surface">
          {filtering ? (
            <EmptyState icon={Search} title="No items match these filters." />
          ) : (
            <EmptyState
              icon={ListTodo}
              title="The backlog is empty."
              text={isAdmin ? "Add an item by hand or ask the AI to draft some." : "Your admin hasn't added any items yet."}
              action={
                isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                      New item
                    </Button>
                    {withAi && (
                      <Button icon={Sparkles} onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask AI to add or update backlog items"]')?.focus()}>
                        Ask AI
                      </Button>
                    )}
                  </div>
                )
              }
            />
          )}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Backlog items">
          {shown.map((item) => (
            <BacklogCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              highlight={highlight.has(item.id)}
              showProject={!projectId}
              onStatus={(s) => setStatus(item, s)}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
            />
          ))}
        </ul>
      )}

      {isAdmin && creating && <BacklogForm open onClose={() => setCreating(false)} defaultProjectId={projectId} onSaved={(id) => flash([id])} />}
      {isAdmin && editing && <BacklogForm key={editing.id} open item={editing} onClose={() => setEditing(null)} onSaved={(id) => flash([id])} />}
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this item?"
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
