"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { OUTCOME_LABEL, OUTCOMES, STATUS_LABEL, STATUSES } from "@/lib/format";
import { refreshWorkData, useProjects } from "@/lib/hooks";
import type { PocOutcome, WorkItem, WorkStatus, WorkType } from "@/lib/types";
import { hasExtra, WORK } from "@/lib/workTypes";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { PeriodSelect } from "./WorkBits";
import { useToast } from "./toast";

/** Admin-only: add an item to a work section by hand, or edit one. Shows only the section's own fields. */
export function WorkItemForm({ type, item, open, onClose, defaultProjectId, onSaved }: { type: WorkType; item?: WorkItem; open: boolean; onClose: () => void; defaultProjectId?: string; onSaved?: (id: string) => void }) {
  const cfg = WORK[type];
  const toast = useToast();
  const { data: projects } = useProjects();
  const [form, setForm] = useState({
    title: item?.title ?? "",
    notes: item?.notes ?? "",
    projectId: item ? (item.projectId ?? "") : (defaultProjectId ?? ""),
    status: item?.status ?? ("TODO" as WorkStatus),
    targetPeriod: item?.targetPeriod ?? null,
    goal: item?.goal ?? "",
    timeboxEnd: item?.timeboxEnd ?? "",
    findings: item?.findings ?? "",
    outcome: item?.outcome ?? ("" as PocOutcome | ""),
  });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) return setError("Title is required");
    setSaving(true);
    const body: Record<string, unknown> = { title: form.title.trim(), notes: form.notes, projectId: form.projectId || null, status: form.status };
    if (hasExtra(type, "targetPeriod")) body.targetPeriod = form.targetPeriod;
    if (hasExtra(type, "goal")) body.goal = form.goal;
    if (hasExtra(type, "timeboxEnd")) body.timeboxEnd = form.timeboxEnd || null;
    if (hasExtra(type, "findings")) body.findings = form.findings;
    if (hasExtra(type, "outcome")) body.outcome = form.outcome || null;
    try {
      const saved = item
        ? await api<WorkItem>(`/api/${cfg.path}/${item.id}`, { method: "PATCH", body })
        : await api<WorkItem>(`/api/${cfg.path}`, { body });
      toast(item ? "Changes saved" : `Added to ${cfg.label}`);
      refreshWorkData();
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
      title={item ? `Edit ${cfg.noun}` : `New ${cfg.noun}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {item ? "Save changes" : `Add ${cfg.noun}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Title" htmlFor="w-title" error={error}>
          <Input id="w-title" autoFocus value={form.title} onChange={(e) => (set("title", e.target.value), setError(undefined))} invalid={Boolean(error)} placeholder="Short summary" />
        </Field>
        {hasExtra(type, "goal") && (
          <Field label="Goal" htmlFor="w-goal" helper="What question should this answer?">
            <Input id="w-goal" value={form.goal} onChange={(e) => set("goal", e.target.value)} placeholder="e.g. Decide whether signals are worth adopting" />
          </Field>
        )}
        <Field label="Notes" htmlFor="w-notes" helper="Optional. Details, links, decisions.">
          <Textarea id="w-notes" rows={hasExtra(type, "findings") ? 3 : 5} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        {hasExtra(type, "findings") && (
          <Field label="Findings" htmlFor="w-findings" helper="What you learned so far.">
            <Textarea id="w-findings" rows={3} value={form.findings} onChange={(e) => set("findings", e.target.value)} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" htmlFor="w-project" helper="Optional">
            <Select id="w-project" value={form.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">No project</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="w-status">
            <Select id="w-status" value={form.status} onChange={(e) => set("status", e.target.value as WorkStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          {hasExtra(type, "targetPeriod") && (
            <Field label="Target" htmlFor="w-period" helper="A month or a quarter">
              <PeriodSelect id="w-period" value={form.targetPeriod} onChange={(v) => set("targetPeriod", v)} />
            </Field>
          )}
          {hasExtra(type, "timeboxEnd") && (
            <Field label="Time box ends" htmlFor="w-timebox" helper="Optional end date">
              <Input id="w-timebox" type="date" value={form.timeboxEnd} onChange={(e) => set("timeboxEnd", e.target.value)} />
            </Field>
          )}
          {hasExtra(type, "outcome") && (
            <Field label="Outcome" htmlFor="w-outcome">
              <Select id="w-outcome" value={form.outcome} onChange={(e) => set("outcome", e.target.value as PocOutcome | "")}>
                <option value="">Not decided</option>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABEL[o]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}
