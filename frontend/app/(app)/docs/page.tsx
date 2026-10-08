"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { ChevronDown, ChevronRight, FileText, FolderInput, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useIsAdmin, useProjects } from "@/lib/hooks";
import type { DocNode, DocPage } from "@/lib/types";
import { Button, Card, ConfirmModal, EmptyState, IconButton, Input, Menu, Modal, Select, Skeleton, cn } from "@/components/ui";
import { Markdown, extractHeadings } from "@/components/Markdown";
import { DocEditor, type DocDraft } from "@/components/DocEditor";
import { useToast } from "@/components/toast";

function DocsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const { data: projects } = useProjects();
  const space = params.get("space") ?? projects?.[0]?.id ?? "general";
  const pageParam = params.get("page");
  const mode = params.get("mode");
  const { data: nodes, mutate: mutateTree } = useSWR<DocNode[]>(projects ? `/api/docs?projectId=${space}` : null, fetcher);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);

  const top = useMemo(() => (nodes ?? []).filter((n) => !n.parentId), [nodes]);
  const childrenOf = (id: string) => (nodes ?? []).filter((n) => n.parentId === id);
  const pageId = pageParam ?? (mode === "new" ? null : (top[0]?.id ?? null));
  const { data: page, mutate: mutatePage } = useSWR<DocPage>(pageId ? `/api/docs/${pageId}` : null, fetcher);

  const go = (q: Record<string, string | null>) => {
    const next = new URLSearchParams({ space });
    if (pageId) next.set("page", pageId);
    for (const [k, v] of Object.entries(q)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`/docs?${next}`, { scroll: false });
  };

  const spaceName = space === "general" ? "General" : (projects?.find((p) => p.id === space)?.name ?? "Project");
  const filteredIds = query ? new Set((nodes ?? []).filter((n) => n.title.toLowerCase().includes(query.toLowerCase())).flatMap((n) => [n.id, n.parentId ?? ""])) : null;

  async function save(draft: DocDraft) {
    setSaving(true);
    try {
      if (mode === "new") {
        const res = await api<{ id: string }>("/api/docs", { body: { projectId: space === "general" ? null : space, parentId: draft.parentId, title: draft.title, content: draft.content } });
        await mutateTree();
        toast("Page created");
        router.push(`/docs?space=${space}&page=${res.id}`, { scroll: false });
      } else if (page) {
        await api(`/api/docs/${page.id}`, { method: "PATCH", body: draft });
        await Promise.all([mutateTree(), mutatePage()]);
        toast("Page saved");
        go({ mode: null });
      }
      globalMutate((k) => typeof k === "string" && k.startsWith("/api/dashboard"));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  const editing = isAdmin && (mode === "new" || (mode === "edit" && page));
  const headings = page ? extractHeadings(page.content) : [];
  const parentsFor = (selfId?: string) => top.filter((n) => n.id !== selfId);

  const treeItem = (n: DocNode, child = false) => {
    if (filteredIds && !filteredIds.has(n.id)) return null;
    const kids = child ? [] : childrenOf(n.id);
    const isOpen = !collapsed.has(n.id) || Boolean(query);
    return (
      <li key={n.id}>
        <div className={cn("group flex items-center rounded-md text-sm transition", pageId === n.id && mode !== "new" ? "bg-accent-50 text-ink" : "text-secondary hover:bg-subtle hover:text-ink", child && "ml-4")}>
          {kids.length ? (
            <button type="button" aria-label={isOpen ? "Collapse" : "Expand"} className="p-1 text-muted" onClick={() => setCollapsed((c) => (c.has(n.id) ? new Set([...c].filter((x) => x !== n.id)) : new Set([...c, n.id])))}>
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          <button type="button" onClick={() => router.push(`/docs?space=${space}&page=${n.id}`, { scroll: false })} className={cn("flex-1 truncate py-1.5 pr-2 text-left", pageId === n.id && mode !== "new" && "font-medium")}>
            {n.title}
          </button>
        </div>
        {kids.length > 0 && isOpen && <ul>{kids.map((k) => treeItem(k, true))}</ul>}
      </li>
    );
  };

  return (
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_200px]">
      <aside className="md:sticky md:top-20 md:self-start">
        <Select aria-label="Project space" value={space} onChange={(e) => router.push(`/docs?space=${e.target.value}`)} className="mb-3 font-medium">
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="general">General (team-wide)</option>
        </Select>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input aria-label="Search pages" placeholder="Search by title" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        <nav aria-label="Pages">
          {!nodes ? (
            <div className="space-y-2 p-2">
              <Skeleton className="w-3/4" />
              <Skeleton className="w-1/2" />
            </div>
          ) : (
            <ul className="space-y-0.5">{top.map((n) => treeItem(n))}</ul>
          )}
        </nav>
        {isAdmin && (
          <Button size="s" variant="ghost" icon={Plus} className="mt-2 w-full justify-start" onClick={() => router.push(`/docs?space=${space}&mode=new`)}>
            New page
          </Button>
        )}
      </aside>

      <section className="min-w-0">
        {editing ? (
          <DocEditor
            key={mode === "new" ? "new" : page!.id}
            initial={mode === "new" ? { title: "", parentId: null, content: "" } : { title: page!.title, parentId: page!.parentId, content: page!.content }}
            docId={mode === "new" ? undefined : page!.id}
            parents={parentsFor(mode === "new" ? undefined : page!.id)}
            parentLocked={mode !== "new" && page!.hasChildren}
            onCancel={() => (mode === "new" ? router.push(`/docs?space=${space}`) : go({ mode: null }))}
            onSave={save}
            saving={saving}
          />
        ) : !nodes ? (
          <Skeleton className="h-64 w-full" />
        ) : !nodes.length ? (
          <Card>
            <EmptyState icon={FileText} title={`No docs for ${space === "general" ? "the General space" : "this project"} yet.`} action={isAdmin && <Button variant="primary" icon={Plus} onClick={() => router.push(`/docs?space=${space}&mode=new`)}>New page</Button>} />
          </Card>
        ) : !page ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : (
          <article className="max-w-[760px]">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 text-[13px] text-muted">
                  {spaceName}
                  {page.parent && <> / {page.parent.title}</>} / <span className="text-ink">{page.title}</span>
                </div>
                <div className="text-xs text-muted">
                  Updated {timeAgo(page.updatedAt)} by {page.updatedBy.name}
                </div>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-1">
                  <Button icon={Pencil} onClick={() => go({ mode: "edit" })}>
                    Edit
                  </Button>
                  <Menu
                    trigger={(t) => <IconButton icon={MoreHorizontal} label="Page actions" {...t} />}
                    items={[
                      ...(page.hasChildren ? [] : [{ label: "Move", icon: FolderInput, onClick: () => setMoving(page.parentId ?? "") }]),
                      { label: "Delete", icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) },
                    ]}
                  />
                </div>
              )}
            </div>
            <Markdown>{page.content || "_This page is empty._"}</Markdown>
          </article>
        )}
      </section>

      {!editing && headings.length > 0 && (
        <aside className="hidden xl:block">
          <div className="sticky top-20">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">On this page</div>
            <ul className="space-y-1.5 border-l border-line text-[13px]">
              {headings.map((h) => (
                <li key={h.id} className={h.level === 3 ? "pl-6" : "pl-3"}>
                  <a href={`#${h.id}`} className="text-secondary hover:text-accent-600">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Delete page?"
        text={page?.hasChildren ? `"${page?.title}" and its sub-pages will be permanently deleted.` : `"${page?.title}" will be permanently deleted.`}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await api(`/api/docs/${page!.id}`, { method: "DELETE" });
            await mutateTree();
            setConfirmDelete(false);
            toast("Page deleted");
            router.push(`/docs?space=${space}`);
          } catch (e) {
            toast(e instanceof Error ? e.message : "Couldn't delete", "error");
          }
        }}
      />
      <Modal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title="Move page"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await api(`/api/docs/${page!.id}`, { method: "PATCH", body: { parentId: moving || null } });
                  await Promise.all([mutateTree(), mutatePage()]);
                  toast("Page moved");
                  setMoving(null);
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't move", "error");
                }
              }}
            >
              Move
            </Button>
          </>
        }
      >
        <Select aria-label="New parent" value={moving ?? ""} onChange={(e) => setMoving(e.target.value)}>
          <option value="">Top level</option>
          {parentsFor(page?.id).map((p) => (
            <option key={p.id} value={p.id}>
              Under “{p.title}”
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs text-muted">Pages can be nested one level deep.</p>
      </Modal>
    </div>
  );
}

export default function DocsPage() {
  return (
    <Suspense>
      <DocsInner />
    </Suspense>
  );
}
