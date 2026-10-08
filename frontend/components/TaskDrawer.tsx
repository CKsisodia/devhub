"use client";

import { useState } from "react";
import useSWR from "swr";
import { CalendarDays, Check, FolderKanban, History, MoreHorizontal, Pencil, Tag, Trash2, User, X, AlertCircle } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { formatDate, isOverdue, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES, timeAgo } from "@/lib/format";
import { refreshTaskData, useIsAdmin, useProjects, useUsers } from "@/lib/hooks";
import type { TaskDetail, TaskFields } from "@/lib/types";
import { Avatar, Button, ConfirmModal, Drawer, IconButton, Input, Menu, PriorityBadge, Select, Skeleton, StatusPill, TagInput, Textarea, Chip } from "./ui";
import { Markdown } from "./Markdown";
import { useToast } from "./toast";

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3 py-1.5">
      <span className="flex items-center gap-2 text-[13px] text-muted">
        <Icon className="size-4" strokeWidth={1.5} />
        {label}
      </span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function TaskDrawer({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const { data: task, mutate } = useSWR<TaskDetail>(taskId ? `/api/tasks/${taskId}` : null, fetcher);
  const { data: users } = useUsers();
  const { data: projects } = useProjects();
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(patch: TaskFields) {
    if (!task) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: patch });
      await Promise.all([mutate(), refreshTaskData()]);
      toast("Saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    }
  }

  async function remove() {
    if (!task) return;
    setDeleting(true);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      await refreshTaskData();
      toast("Task deleted");
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't delete", "error");
    } finally {
      setDeleting(false);
    }
  }

  const close = () => {
    setEditingDesc(null);
    setTitleDraft(null);
    onClose();
  };

  return (
    <Drawer open={Boolean(taskId)} onClose={close} label="Task detail">
      <div className="flex items-center justify-between border-b border-white/60 px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Task</span>
        <div className="flex items-center gap-1">
          {isAdmin && task && (
            <Menu trigger={(p) => <IconButton icon={MoreHorizontal} label="More actions" {...p} />} items={[{ label: "Delete task", icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) }]} />
          )}
          <IconButton icon={X} label="Close" onClick={close} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {!task ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            {isAdmin ? (
              <Input
                aria-label="Title"
                value={titleDraft ?? task.title}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  if (titleDraft !== null && titleDraft.trim() && titleDraft !== task.title) save({ title: titleDraft.trim() });
                  setTitleDraft(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-auto border-transparent bg-transparent px-1 py-1 text-xl font-semibold shadow-none hover:border-line-strong"
              />
            ) : (
              <h2 className="text-xl font-semibold">{task.title}</h2>
            )}

            <div className="mt-4 divide-y divide-transparent">
              <Row icon={Check} label="Status">
                {isAdmin ? (
                  <Select aria-label="Status" value={task.status} onChange={(e) => save({ status: e.target.value as TaskDetail["status"] })} className="max-w-48">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <StatusPill status={task.status} />
                )}
              </Row>
              <Row icon={AlertCircle} label="Priority">
                {isAdmin ? (
                  <Select aria-label="Priority" value={task.priority} onChange={(e) => save({ priority: e.target.value as TaskDetail["priority"] })} className="max-w-48">
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <PriorityBadge priority={task.priority} />
                )}
              </Row>
              <Row icon={FolderKanban} label="Project">
                {isAdmin ? (
                  <Select aria-label="Project" value={task.projectId} onChange={(e) => save({ projectId: e.target.value })} className="max-w-64">
                    {(projects ?? [{ id: task.projectId, name: task.project.name }]).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  task.project.name
                )}
              </Row>
              <Row icon={User} label="Assignee">
                {isAdmin ? (
                  <Select aria-label="Assignee" value={task.assigneeId ?? ""} onChange={(e) => save({ assigneeId: e.target.value || null })} className="max-w-64">
                    <option value="">Unassigned</option>
                    {(users ?? []).filter((u) => u.active !== false || u.id === task.assigneeId).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                ) : task.assignee ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={task.assignee.name} size={24} /> {task.assignee.name}
                  </span>
                ) : (
                  <span className="text-muted">Unassigned</span>
                )}
              </Row>
              <Row icon={CalendarDays} label="Due date">
                {isAdmin ? (
                  <Input type="date" aria-label="Due date" value={task.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} className="max-w-48" />
                ) : task.dueDate ? (
                  <span className={isOverdue(task.dueDate, task.status) ? "font-medium text-red-600" : ""}>
                    {formatDate(task.dueDate, true)}
                    {isOverdue(task.dueDate, task.status) && " · Overdue"}
                  </span>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </Row>
              <Row icon={Tag} label="Tags">
                {isAdmin ? (
                  <TagInput value={task.tags} onChange={(tags) => save({ tags })} />
                ) : task.tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {task.tags.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </Row>
            </div>

            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Description</h3>
                {isAdmin && editingDesc === null && (
                  <Button size="s" variant="ghost" icon={Pencil} onClick={() => setEditingDesc(task.description)}>
                    Edit
                  </Button>
                )}
              </div>
              {editingDesc !== null ? (
                <div className="space-y-2">
                  <Textarea autoFocus value={editingDesc} onChange={(e) => setEditingDesc(e.target.value)} rows={8} className="font-mono text-[13px]" placeholder="Markdown supported" />
                  <div className="flex justify-end gap-2">
                    <Button size="s" variant="ghost" onClick={() => setEditingDesc(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="s"
                      variant="primary"
                      onClick={async () => {
                        await save({ description: editingDesc });
                        setEditingDesc(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : task.description ? (
                <div className="rounded-lg bg-white/70 p-3">
                  <Markdown size="sm">{task.description}</Markdown>
                </div>
              ) : (
                <p className="text-sm text-muted">No description.</p>
              )}
            </section>

            <section className="mt-8">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-muted" strokeWidth={1.5} /> History
              </h3>
              <ol className="space-y-3">
                {task.history.map((h) => (
                  <li key={h.id} className="flex gap-2.5 text-[13px]">
                    <Avatar name={h.user.name} size={24} />
                    <div>
                      <span className="font-medium">{h.user.name.split(" ")[0]}</span> <span className="text-secondary">{h.summary}</span>
                      <div className="text-xs text-muted">{timeAgo(h.createdAt)}</div>
                    </div>
                  </li>
                ))}
                {!task.history.length && <li className="text-[13px] text-muted">Created by {task.createdBy.name} · {timeAgo(task.createdAt)}</li>}
              </ol>
            </section>
          </>
        )}
      </div>
      <ConfirmModal open={confirmDelete} title="Delete task?" text={`"${task?.title}" will be permanently deleted.`} onConfirm={remove} onClose={() => setConfirmDelete(false)} loading={deleting} />
    </Drawer>
  );
}
