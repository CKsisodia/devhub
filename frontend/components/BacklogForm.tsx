"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshBacklogData, useProjects } from "@/lib/hooks";
import type { BacklogItem, BacklogStatus } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { useToast } from "./toast";

/** Admin-only: add a backlog item by hand, or edit one. */
export function BacklogForm({ item, open, onClose, defaultProjectId, onSaved }: { item?: BacklogItem; open: boolean; onClose: () => void; defaultProjectId?: string; onSaved?: (id: string) => void }) {
  const toast = useToast();
  const { data: projects } = useProjects();
  const [form, setForm] = useState({
    title: item?.title ?? "",
    notes: item?.notes ?? "",
    projectId: item ? (item.projectId ?? "") : (defaultProjectId ?? ""),
    status: item?.status ?? ("IN_PROGRESS" as BacklogStatus),
  });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.title.trim()) return setError("Title is required");
    setSaving(true);
    const body = { title: form.title.trim(), notes: form.notes, projectId: form.projectId || null, status: form.status };
    try {
      const saved = item
        ? await api<BacklogItem>(`/api/backlog/${item.id}`, { method: "PATCH", body })
        : await api<BacklogItem>("/api/backlog", { body });
      toast(item ? "Item updated" : "Item added");
      refreshBacklogData();
      onSaved?.(saved.id);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? "Edit backlog item" : "New backlog item"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {item ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Title" htmlFor="b-title" error={error}>
          <Input id="b-title" autoFocus value={form.title} onChange={(e) => (setForm({ ...form, title: e.target.value }), setError(undefined))} invalid={Boolean(error)} placeholder="Short summary" />
        </Field>
        <Field label="Notes" htmlFor="b-notes" helper="Optional. Details, links, decisions.">
          <Textarea id="b-notes" rows={6} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" htmlFor="b-project" helper="Optional">
            <Select id="b-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">No project</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="b-status">
            <Select id="b-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BacklogStatus })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
