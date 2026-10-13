"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { LEARNING_LABEL, LEARNING_TYPES } from "@/lib/format";
import type { LearningItem, LearningType } from "@/lib/types";
import { Button, Field, Input, Modal, Segmented, Select, TagInput, Textarea } from "./ui";
import { Markdown } from "./Markdown";
import { useToast } from "./toast";

export function LearningForm({ item, onClose, onSaved, suggestedTags }: { item?: LearningItem; onClose: () => void; onSaved: () => void; suggestedTags: string[] }) {
  const toast = useToast();
  const [mode, setMode] = useState<"link" | "post">(item && !item.url ? "post" : "link");
  const [form, setForm] = useState({
    type: (item?.type ?? "ARTICLE") as LearningType,
    title: item?.title ?? "",
    url: item?.url ?? "",
    summary: item?.summary ?? "",
    body: item?.body ?? "",
    tags: item?.tags ?? [],
    pinned: item?.pinned ?? false,
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!form.title.trim()) return setError("Title is required");
    if (mode === "link" && !/^https?:\/\//.test(form.url)) return setError("Enter a full URL starting with https://");
    if (mode === "post" && !form.body.trim()) return setError("Write the post body");
    setSaving(true);
    try {
      const body = { type: form.type, title: form.title.trim(), summary: form.summary, tags: form.tags, pinned: form.pinned, url: mode === "link" ? form.url : null, body: mode === "post" ? form.body : null };
      await api(item ? `/api/learning/${item.id}` : "/api/learning", { method: item ? "PATCH" : "POST", body });
      toast(item ? "Item updated" : "Item added");
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      wide={mode === "post"}
      onClose={onClose}
      title={item ? "Edit item" : "Add item"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {item ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Field label="Type" htmlFor="l-type">
            <Select id="l-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LearningType })} className="w-36">
              {LEARNING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LEARNING_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-6">
            <Segmented
              label="Source"
              value={mode}
              onChange={setMode}
              options={[
                { value: "link", label: "External link" },
                { value: "post", label: "Write a post" },
              ]}
            />
          </div>
        </div>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <Field label="Title *" htmlFor="l-title">
          <Input id="l-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        {mode === "link" && (
          <Field label="URL *" htmlFor="l-url">
            <Input id="l-url" type="url" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </Field>
        )}
        <Field label="Summary" htmlFor="l-summary" helper="Shown on the card (2 lines).">
          <Textarea id="l-summary" rows={2} className="min-h-16" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
        {mode === "post" && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-secondary">Post (Markdown)</span>
              <Button size="s" variant="ghost" onClick={() => setPreview((p) => !p)}>
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>
            {preview ? (
              <div className="max-h-80 overflow-y-auto rounded-md border border-line bg-surface p-4">
                <Markdown size="sm">{form.body || "_Nothing yet_"}</Markdown>
              </div>
            ) : (
              <Textarea rows={10} className="font-mono text-[13px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            )}
          </div>
        )}
        <Field label="Topic tags" htmlFor="l-tags" helper={suggestedTags.length ? `Existing: ${suggestedTags.join(", ")}` : undefined}>
          <TagInput id="l-tags" value={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="size-4 accent-accent-500" />
          Pin to top
        </label>
      </div>
    </Modal>
  );
}
