"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { KanbanSquare, List, ListTodo, Plus, Search, Sparkles } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshTaskData, useIsAdmin, useProjects, useUsers } from "@/lib/hooks";
import type { Task, TaskStatus } from "@/lib/types";
import { Button, Chip, EmptyState, Input, Segmented, Select, Skeleton } from "./ui";
import { TaskBoard, TaskList } from "./TaskViews";
import { TaskDrawer } from "./TaskDrawer";
import { TaskForm } from "./TaskForm";
import { AiPrompt } from "./AiPrompt";
import { useToast } from "./toast";

type Filters = { projectId: string; assigneeId: string; status: string; priority: string; tag: string; q: string };

export function BacklogView({ projectId, withAi = false, initialAiPrompt, onConsumedAiPrompt, headerSlot }: { projectId?: string; withAi?: boolean; initialAiPrompt?: string | null; onConsumedAiPrompt?: () => void; headerSlot?: (actions: React.ReactNode) => React.ReactNode }) {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [view, setView] = useState<"list" | "board">("list");
  const [filters, setFilters] = useState<Filters>({ projectId: projectId ?? "", assigneeId: "", status: "", priority: "", tag: "", q: "" });
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(false);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const key = `/api/tasks${qs ? `?${qs}` : ""}`;
  const { data: tasks, isLoading, mutate } = useSWR<Task[]>(key, fetcher, { keepPreviousData: true });
  const { data: projects } = useProjects();
  const { data: users } = useUsers();
  const { data: tags } = useSWR<string[]>("/api/tasks/tags", fetcher);

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const active = (Object.keys(filters) as (keyof Filters)[]).filter((k) => filters[k] && !(k === "projectId" && projectId));
  const chipLabel = (k: keyof Filters) => {
    const v = filters[k];
    if (k === "projectId") return projects?.find((p) => p.id === v)?.name ?? "Project";
    if (k === "assigneeId") return v === "none" ? "Unassigned" : (users?.find((u) => u.id === v)?.name ?? "Assignee");
    if (k === "status") return STATUS_LABEL[v as TaskStatus];
    if (k === "priority") return PRIORITY_LABEL[v as keyof typeof PRIORITY_LABEL];
    if (k === "tag") return `#${v}`;
    return `“${v}”`;
  };

  async function move(id: string, status: TaskStatus) {
    await mutate((ts) => ts?.map((t) => (t.id === id ? { ...t, status } : t)), { revalidate: false });
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", body: { status } });
      toast(`Moved to ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't move task", "error");
    }
    refreshTaskData();
  }

  const onSaved = (ids: string[]) => {
    setHighlight(new Set(ids));
    setTimeout(() => setHighlight(new Set()), 3000);
  };

  const actions = (
    <>
      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: "list", label: "List", icon: List },
          { value: "board", label: "Board", icon: KanbanSquare },
        ]}
      />
      {isAdmin && (
        <Button variant={withAi ? "secondary" : "primary"} icon={Plus} onClick={() => setNewTask(true)}>
          New task
        </Button>
      )}
    </>
  );

  const filtered = useMemo(() => tasks ?? [], [tasks]);

  return (
    <div>
      {headerSlot ? headerSlot(actions) : <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
      {isAdmin && withAi && <AiPrompt initialPrompt={initialAiPrompt} onConsumedInitial={onConsumedAiPrompt} onSaved={onSaved} onManual={() => setNewTask(true)} />}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label="Search tasks" placeholder="Search title" value={filters.q} onChange={(e) => set("q", e.target.value)} className="pl-8" />
        </div>
        {!projectId && (
          <Select aria-label="Filter by project" value={filters.projectId} onChange={(e) => set("projectId", e.target.value)} className="w-auto min-w-32">
            <option value="">Project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Filter by assignee" value={filters.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} className="w-auto min-w-32">
          <option value="">Assignee</option>
          <option value="none">Unassigned</option>
          {users?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => set("status", e.target.value)} className="w-auto min-w-28">
          <option value="">Status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by priority" value={filters.priority} onChange={(e) => set("priority", e.target.value)} className="w-auto min-w-28">
          <option value="">Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by tag" value={filters.tag} onChange={(e) => set("tag", e.target.value)} className="w-auto min-w-24">
          <option value="">Tags</option>
          {tags?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      {active.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {active.map((k) => (
            <Chip key={k} selected onRemove={() => set(k, "")}>
              {chipLabel(k)}
            </Chip>
          ))}
          <button type="button" className="ml-1 text-xs font-medium text-muted hover:text-ink" onClick={() => setFilters({ projectId: projectId ?? "", assigneeId: "", status: "", priority: "", tag: "", q: "" })}>
            Clear all
          </button>
        </div>
      )}

      {isLoading && !tasks ? (
        <div className="space-y-2 rounded-lg border border-line/70 bg-surface p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-line/70 bg-surface">
          {active.length ? (
            <EmptyState icon={Search} title="No tasks match these filters." />
          ) : (
            <EmptyState
              icon={ListTodo}
              title="The backlog is empty."
              text={isAdmin ? "Add a task by hand or ask the AI to draft some." : "Your admin hasn't added any tasks yet."}
              action={
                isAdmin && (
                  <div className="flex gap-2">
                    <Button variant="primary" icon={Plus} onClick={() => setNewTask(true)}>
                      New task
                    </Button>
                    {withAi && (
                      <Button icon={Sparkles} onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask AI to add or update tasks"]')?.focus()}>
                        Ask AI
                      </Button>
                    )}
                  </div>
                )
              }
            />
          )}
        </div>
      ) : view === "list" ? (
        <TaskList tasks={filtered} onOpen={setOpenTask} highlight={highlight} />
      ) : (
        <TaskBoard tasks={filtered} onOpen={setOpenTask} canEdit={isAdmin} onMove={move} highlight={highlight} />
      )}

      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />
      {isAdmin && <TaskForm key={String(newTask)} open={newTask} onClose={() => setNewTask(false)} defaultProjectId={projectId} />}
    </div>
  );
}
