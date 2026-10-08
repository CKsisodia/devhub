"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, GraduationCap, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { domainOf, formatDate, LEARNING_LABEL } from "@/lib/format";
import { useIsAdmin } from "@/lib/hooks";
import type { LearningItem, LearningType } from "@/lib/types";
import { Button, Card, Chip, ConfirmModal, EmptyState, IconButton, Input, Menu, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { LearningForm } from "@/components/LearningForm";
import { useToast } from "@/components/toast";

const TYPE_COLOR: Record<LearningType, string> = { ARTICLE: "text-blue-700", NEWS: "text-amber-700", BLOG: "text-violet-700" };

export default function LearningPage() {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const [type, setType] = useState<"ALL" | LearningType>("ALL");
  const [tags, setTags] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const params = new URLSearchParams();
  if (type !== "ALL") params.set("type", type);
  if (tags.length) params.set("tags", tags.join(","));
  if (q) params.set("q", q);
  const { data: items, isLoading, mutate } = useSWR<LearningItem[]>(`/api/learning?${params}`, fetcher, { keepPreviousData: true });
  const { data: allTags, mutate: mutateTags } = useSWR<string[]>("/api/learning/tags", fetcher);
  const [editing, setEditing] = useState<LearningItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<LearningItem | null>(null);

  const refresh = () => (mutate(), mutateTags());
  const filtered = type !== "ALL" || tags.length > 0 || q;

  async function togglePin(i: LearningItem) {
    try {
      await api(`/api/learning/${i.id}`, { method: "PATCH", body: { pinned: !i.pinned } });
      toast(i.pinned ? "Unpinned" : "Pinned to top");
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update", "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Learning"
        subtitle="Blogs, articles and news curated for the team."
        actions={
          isAdmin && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>
              Add item
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Type"
          value={type}
          onChange={setType}
          options={[
            { value: "ALL", label: "All" },
            { value: "BLOG", label: "Blogs" },
            { value: "ARTICLE", label: "Articles" },
            { value: "NEWS", label: "News" },
          ]}
        />
        <div className="relative w-full sm:ml-auto sm:w-60">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label="Search learning" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>
      {!!allTags?.length && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13px] text-muted">Topics:</span>
          {allTags.map((t) => (
            <Chip key={t} selected={tags.includes(t)} onClick={() => setTags((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}>
              {t}
            </Chip>
          ))}
        </div>
      )}

      {isLoading && !items ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : !items?.length ? (
        <Card>
          <EmptyState icon={GraduationCap} title={filtered ? "No items match these filters." : "Nothing to read yet."} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const href = i.url ?? `/learning/${i.id}`;
            return (
              <Card key={i.id} className="group relative flex flex-col transition hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${TYPE_COLOR[i.type]}`}>
                    {LEARNING_LABEL[i.type]}
                    {i.pinned && (
                      <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-600">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                  </span>
                  {isAdmin ? (
                    <div className="relative z-10">
                      <Menu
                        trigger={(t) => <IconButton icon={MoreHorizontal} label="Item actions" className="-my-1" {...t} />}
                        items={[
                          { label: "Edit", icon: Pencil, onClick: () => setEditing(i) },
                          { label: i.pinned ? "Unpin" : "Pin to top", icon: i.pinned ? PinOff : Pin, onClick: () => togglePin(i) },
                          { label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleting(i) },
                        ]}
                      />
                    </div>
                  ) : (
                    i.url && <ExternalLink className="size-4 text-muted opacity-0 transition group-hover:opacity-100" />
                  )}
                </div>
                <h2 className="text-base font-semibold leading-6">
                  {i.url ? (
                    <a href={href} target="_blank" rel="noreferrer noopener" className="after:absolute after:inset-0 hover:text-accent-600">
                      {i.title}
                    </a>
                  ) : (
                    <Link href={href} className="after:absolute after:inset-0 hover:text-accent-600">
                      {i.title}
                    </Link>
                  )}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{i.summary}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-xs text-muted">
                  <span>{i.url ? domainOf(i.url) : "Internal post"}</span>
                  <span>·</span>
                  <span>{formatDate(i.createdAt.slice(0, 10), true)}</span>
                  <span className="flex-1" />
                  {i.tags.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {isAdmin && editing && <LearningForm item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={refresh} suggestedTags={allTags ?? []} />}
      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete item?"
        text={`"${deleting?.title}" will be removed from Learning.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await api(`/api/learning/${deleting!.id}`, { method: "DELETE" });
            toast("Item deleted");
            setDeleting(null);
            refresh();
          } catch (e) {
            toast(e instanceof Error ? e.message : "Couldn't delete", "error");
          }
        }}
      />
    </>
  );
}
