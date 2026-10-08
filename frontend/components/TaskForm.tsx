"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshTaskData, useProjects, useUsers } from "@/lib/hooks";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { Button, Field, Input, Modal, Select, TagInput, Textarea } from "./ui";
import { useToast } from "./toast";

export function TaskForm({ open, onClose, defaultProjectId }: { open: boolean; onClose: () => void; defaultProjectId?: string }) {
  const { data: projects } = useProjects();
  const { data: users } = useUsers();
  const toast = useToast();
  const empty = { title: "", projectId: defaultProjectId ?? "", description: "", assigneeId: "", priority: "MEDIUM" as TaskPriority, status: "BACKLOG" as TaskStatus, dueDate: "", tags: [] as string[] };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Title is required";
    if (!form.projectId) errs.projectId = "Project is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api<Task>("/api/tasks", {
        body: { ...form, title: form.title.trim(), assigneeId: form.assigneeId || null, dueDate: form.dueDate || null },
      });
      await refreshTaskData();
      toast("Task created");
      setForm(empty);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create task", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Create task
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Title *" htmlFor="t-title" error={errors.title} className="sm:col-span-2">
          <Input id="t-title" autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} invalid={Boolean(errors.title)} placeholder="e.g. Build OTP input" />
        </Field>
        <Field label="Project *" htmlFor="t-project" error={errors.projectId}>
          <Select id="t-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
            <option value="">Select project</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee" htmlFor="t-assignee">
          <Select id="t-assignee" value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)}>
            <option value="">Unassigned</option>
            {users?.filter((u) => u.active !== false).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" htmlFor="t-priority">
          <Select id="t-priority" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="t-status">
          <Select id="t-status" value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" htmlFor="t-due">
          <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <Field label="Tags" htmlFor="t-tags">
          <TagInput id="t-tags" value={form.tags} onChange={(v) => set("tags", v)} />
        </Field>
        <Field label="Description" htmlFor="t-desc" helper="Markdown supported" className="sm:col-span-2">
          <Textarea id="t-desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
