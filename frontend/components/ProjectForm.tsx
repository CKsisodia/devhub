"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES } from "@/lib/format";
import { useUsers } from "@/lib/hooks";
import type { ProjectDetail, ProjectStatus } from "@/lib/types";
import { Avatar, Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { useToast } from "./toast";

export function ProjectForm({ open, onClose, project, onSaved }: { open: boolean; onClose: () => void; project?: ProjectDetail; onSaved: (id: string) => void }) {
  const { data: users } = useUsers();
  const toast = useToast();
  const [form, setForm] = useState({
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: (project?.status ?? "ACTIVE") as ProjectStatus,
    startDate: project?.startDate ?? "",
    targetDate: project?.targetDate ?? "",
    memberIds: [] as string[],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!form.name.trim()) return setError("Name is required");
    setSaving(true);
    try {
      const body = { name: form.name.trim(), description: form.description, status: form.status, startDate: form.startDate || null, targetDate: form.targetDate || null };
      const res = project
        ? await api<{ id: string }>(`/api/projects/${project.id}`, { method: "PATCH", body })
        : await api<{ id: string }>("/api/projects", { body: { ...body, memberIds: form.memberIds } });
      toast(project ? "Project updated" : "Project created");
      onSaved(res.id);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save project", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {project ? "Save changes" : "Create project"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" htmlFor="p-name" error={error ?? undefined} className="sm:col-span-2">
          <Input id="p-name" autoFocus value={form.name} onChange={(e) => (setForm({ ...form, name: e.target.value }), setError(null))} invalid={Boolean(error)} />
        </Field>
        <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
          <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </Field>
        <Field label="Status" htmlFor="p-status">
          <Select id="p-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div />
        <Field label="Start date" htmlFor="p-start">
          <Input id="p-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Target date" htmlFor="p-target">
          <Input id="p-target" type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
        </Field>
        {!project && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-secondary">Members</legend>
            <div className="flex flex-wrap gap-2">
              {users
                ?.filter((u) => u.active !== false)
                .map((u) => {
                  const on = form.memberIds.includes(u.id);
                  return (
                    <label key={u.id} className={`flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${on ? "border-accent-100 bg-accent-50 text-accent-600" : "border-line bg-surface"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => setForm({ ...form, memberIds: on ? form.memberIds.filter((x) => x !== u.id) : [...form.memberIds, u.id] })} />
                      <Avatar name={u.name} size={24} />
                      {u.name}
                    </label>
                  );
                })}
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}
