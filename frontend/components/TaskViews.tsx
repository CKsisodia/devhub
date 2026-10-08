"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronsUpDown } from "lucide-react";
import { formatDate, isOverdue, PRIORITY_RANK, STATUS_LABEL, STATUS_STYLE, STATUSES } from "@/lib/format";
import type { Task, TaskStatus } from "@/lib/types";
import { Avatar, Chip, PriorityBadge, StatusPill, cn } from "./ui";

export function DueDate({ due, status }: { due: string | null; status: TaskStatus }) {
  if (!due) return <span className="text-muted">—</span>;
  const overdue = isOverdue(due, status);
  return (
    <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap", overdue ? "font-medium text-red-600" : "text-secondary")}>
      {overdue ? <AlertTriangle className="size-3.5" aria-hidden /> : <CalendarDays className="size-3.5 text-muted" aria-hidden />}
      {formatDate(due)}
      {overdue && <span className="sr-only">Overdue</span>}
    </span>
  );
}

type SortKey = "title" | "project" | "assignee" | "priority" | "status" | "due";

export function TaskList({ tasks, onOpen, highlight }: { tasks: Task[]; onOpen: (id: string) => void; highlight?: Set<string> }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const sorted = useMemo(() => {
    const val = (t: Task): string | number => {
      switch (sort.key) {
        case "title":
          return t.title.toLowerCase();
        case "project":
          return t.project.name;
        case "assignee":
          return t.assignee?.name ?? "~";
        case "priority":
          return PRIORITY_RANK[t.priority];
        case "status":
          return STATUSES.indexOf(t.status);
        case "due":
          return t.dueDate ?? "9999";
      }
    };
    return [...tasks].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
  }, [tasks, sort]);

  const th = (key: SortKey, label: string, className?: string) => (
    <th className={cn("sticky top-0 z-[1] bg-surface px-3 text-left text-xs font-medium text-muted", className)} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="focus-ring inline-flex h-10 items-center gap-1 rounded hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : 1 }))}>
        {label}
        {sort.key === key ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
      </button>
    </th>
  );

  return (
    <>
      {/* Desktop/tablet table */}
      <div className="hidden overflow-hidden rounded-lg border border-line/70 bg-surface shadow-sm md:block">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                {th("title", "Title", "pl-4")}
                {th("project", "Project")}
                {th("assignee", "Assignee")}
                {th("priority", "Priority")}
                {th("status", "Status")}
                {th("due", "Due")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr
                  key={t.id}
                  tabIndex={0}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(t.id)}
                  className={cn("focus-ring h-11 cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-subtle", highlight?.has(t.id) && "bg-accent-50")}
                >
                  <td className="max-w-[340px] truncate pl-4 pr-3 font-medium">{t.title}</td>
                  <td className="whitespace-nowrap px-3 text-secondary">{t.project.name}</td>
                  <td className="whitespace-nowrap px-3">
                    {t.assignee ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={t.assignee.name} size={24} inactive={t.assignee.active === false} />
                        <span className="text-secondary">{t.assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-3">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-3">
                    <DueDate due={t.dueDate} status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Mobile stacked cards */}
      <div className="space-y-2 md:hidden">
        {sorted.map((t) => (
          <TaskCard key={t.id} task={t} onOpen={onOpen} highlight={highlight?.has(t.id)} />
        ))}
      </div>
    </>
  );
}

export function TaskCard({ task: t, onOpen, highlight, dragging }: { task: Task; onOpen: (id: string) => void; highlight?: boolean; dragging?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(t.id)}
      className={cn(
        "focus-ring block w-full rounded-lg border bg-surface p-3 text-left shadow-sm transition hover:shadow-md",
        isOverdue(t.dueDate, t.status) ? "border-red-200" : "border-line/70",
        highlight && "ring-2 ring-accent-100",
        dragging && "rotate-2 shadow-md",
      )}
    >
      <div className="text-sm font-medium leading-5">{t.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip>{t.project.name}</Chip>
        <PriorityBadge priority={t.priority} />
      </div>
      <div className="mt-2.5 flex items-center justify-between text-xs">
        <DueDate due={t.dueDate} status={t.status} />
        {t.assignee ? <Avatar name={t.assignee.name} size={24} inactive={t.assignee.active === false} /> : <span className="text-muted">Unassigned</span>}
      </div>
    </button>
  );
}

function DraggableCard({ task, onOpen, highlight }: { task: Task; onOpen: (id: string) => void; highlight?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { status: task.status } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 20, position: "relative" } : undefined}
      className="cursor-grab active:cursor-grabbing"
    >
      <TaskCard task={task} onOpen={onOpen} highlight={highlight} dragging={isDragging} />
    </div>
  );
}

function Column({ status, count, canDrop, children }: { status: TaskStatus; count: number; canDrop: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canDrop });
  return (
    <section ref={setNodeRef} aria-label={STATUS_LABEL[status]} className={cn("flex w-[260px] shrink-0 flex-col rounded-lg bg-subtle/60 p-2 transition xl:w-auto xl:min-w-0 xl:flex-1", canDrop && isOver && "bg-accent-50 ring-2 ring-accent-100")}>
      <header className="mb-2 flex items-center gap-2 px-1 py-1">
        <StatusPill status={status} />
        <span className="tabular text-xs text-muted">{count}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

/** Kanban board. Admin can drag cards between columns; viewers get a static board. Mobile: status-grouped list. */
export function TaskBoard({ tasks, onOpen, canEdit, onMove, highlight }: { tasks: Task[]; onOpen: (id: string) => void; canEdit: boolean; onMove: (id: string, status: TaskStatus) => void; highlight?: Set<string> }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const byStatus = useMemo(() => {
    const m = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
    for (const t of tasks) m[t.status].push(t);
    for (const s of STATUSES) m[s].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
    return m;
  }, [tasks]);

  function onDragEnd(e: DragEndEvent) {
    const to = e.over?.id as TaskStatus | undefined;
    const from = e.active.data.current?.status as TaskStatus | undefined;
    if (to && from && to !== from) onMove(String(e.active.id), to);
  }

  const columns = (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STATUSES.map((s) => (
        <Column key={s} status={s} count={byStatus[s].length} canDrop={canEdit}>
          {byStatus[s].map((t) => (canEdit ? <DraggableCard key={t.id} task={t} onOpen={onOpen} highlight={highlight?.has(t.id)} /> : <TaskCard key={t.id} task={t} onOpen={onOpen} highlight={highlight?.has(t.id)} />))}
        </Column>
      ))}
    </div>
  );

  return (
    <>
      <div className="hidden md:block">{canEdit ? <DndContext sensors={sensors} onDragEnd={onDragEnd}>{columns}</DndContext> : columns}</div>
      <div className="space-y-5 md:hidden">
        {STATUSES.map((s) => (
          <section key={s}>
            <h3 className="mb-2 flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />
              <span className="text-sm font-semibold">{STATUS_LABEL[s]}</span>
              <span className="tabular text-xs text-muted">{byStatus[s].length}</span>
            </h3>
            <div className="space-y-2">
              {byStatus[s].map((t) => (
                <TaskCard key={t.id} task={t} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
