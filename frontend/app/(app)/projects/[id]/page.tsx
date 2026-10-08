"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, ChevronRight, FileText, MoreHorizontal, Pencil, Plus, Trash2, UserMinus, Users } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { formatDate, STATUS_LABEL, STATUS_STYLE, STATUSES } from "@/lib/format";
import { refreshTaskData, useIsAdmin, useUsers } from "@/lib/hooks";
import type { DocNode, ProjectDetail } from "@/lib/types";
import { Avatar, Button, Card, ConfirmModal, EmptyState, IconButton, Menu, PageHeader, Pill, ProgressBar, ProjectStatusPill, Select, Skeleton, Tabs } from "@/components/ui";
import { BacklogView } from "@/components/BacklogView";
import { ProjectForm } from "@/components/ProjectForm";
import { useToast } from "@/components/toast";

type Tab = "overview" | "tasks" | "docs" | "members";

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const toast = useToast();
  const { data: p, error, mutate } = useSWR<ProjectDetail>(`/api/projects/${id}`, fetcher);
  const { data: docs } = useSWR<DocNode[]>(`/api/docs?projectId=${id}`, fetcher);
  const { data: users } = useUsers();
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addMember, setAddMember] = useState("");

  if (error) return <EmptyState icon={FileText} title="Project not found." action={<Link href="/projects" className="text-sm font-medium text-accent-600">Back to projects</Link>} />;
  if (!p)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );

  async function act(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      await mutate();
      refreshTaskData();
      toast(msg);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    }
  }

  const project = p;
  const nonMembers = users?.filter((u) => u.active !== false && !project.members.some((m) => m.id === u.id)) ?? [];
  const topDocs = docs?.filter((d) => !d.parentId) ?? [];

  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Projects
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name} <ProjectStatusPill status={project.status} />
            {project.archived && <Pill bg="#F4F4F5" text="#71717A">Archived</Pill>}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Menu
                trigger={(t) => <IconButton icon={MoreHorizontal} label="More project actions" {...t} />}
                items={[
                  project.archived
                    ? { label: "Unarchive", icon: ArchiveRestore, onClick: () => act(() => api(`/api/projects/${id}`, { method: "PATCH", body: { archived: false } }), "Project unarchived") }
                    : { label: "Archive", icon: Archive, onClick: () => act(() => api(`/api/projects/${id}`, { method: "PATCH", body: { archived: true } }), "Project archived") },
                  { label: "Delete project", icon: Trash2, danger: true, onClick: () => setConfirmDelete(true) },
                ]}
              />
            </>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "tasks", label: "Tasks", count: project.taskCount },
          { value: "docs", label: "Docs", count: docs?.length },
          { value: "members", label: "Members", count: project.members.length },
        ]}
      />

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <h2 className="mb-2 text-base font-semibold">About</h2>
            <p className="whitespace-pre-wrap text-sm leading-6 text-secondary">{project.description || "No description."}</p>
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span className="tabular text-muted">{project.progress}%</span>
              </div>
              <ProgressBar value={project.progress} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {STATUSES.map((s) => (
                <div key={s} className="rounded-lg bg-subtle/70 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="size-1.5 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />
                    {STATUS_LABEL[s]}
                  </div>
                  <div className="tabular mt-0.5 text-xl font-semibold">{project.counts[s]}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-base font-semibold">Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted">
                  <CalendarDays className="size-4" strokeWidth={1.5} /> Start
                </dt>
                <dd>{formatDate(project.startDate, true) || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted">
                  <CalendarDays className="size-4" strokeWidth={1.5} /> Target
                </dt>
                <dd>{formatDate(project.targetDate, true) || "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-muted">
                  <Users className="size-4" strokeWidth={1.5} /> Members
                </dt>
                <dd>{project.members.length}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "tasks" && <BacklogView projectId={id} />}

      {tab === "docs" && (
        <Card className="p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-semibold">Documentation</h2>
            <div className="flex gap-2">
              {isAdmin && (
                <Button size="s" icon={Plus} onClick={() => router.push(`/docs?space=${id}&mode=new`)}>
                  New page
                </Button>
              )}
              <Button size="s" variant="ghost" onClick={() => router.push(`/docs?space=${id}`)}>
                Open in Docs
              </Button>
            </div>
          </div>
          {!docs?.length ? (
            <EmptyState icon={FileText} title="No docs for this project yet." />
          ) : (
            <ul className="pb-2">
              {topDocs.map((d) => (
                <li key={d.id}>
                  <DocRow id={d.id} title={d.title} space={id} updatedAt={d.updatedAt} />
                  {docs
                    .filter((c) => c.parentId === d.id)
                    .map((c) => (
                      <DocRow key={c.id} id={c.id} title={c.title} space={id} updatedAt={c.updatedAt} child />
                    ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "members" && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <h2 className="text-base font-semibold">Members</h2>
            {isAdmin && (
              <div className="flex gap-2">
                <Select aria-label="Add member" value={addMember} onChange={(e) => setAddMember(e.target.value)} className="w-48">
                  <option value="">Select user…</option>
                  {nonMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="m"
                  icon={Plus}
                  disabled={!addMember}
                  onClick={() => act(() => api(`/api/projects/${id}/members`, { body: { userId: addMember } }), "Member added").then(() => setAddMember(""))}
                >
                  Add member
                </Button>
              </div>
            )}
          </div>
          {!project.members.length ? (
            <EmptyState icon={Users} title="No members yet." />
          ) : (
            <ul className="divide-y divide-line/60">
              {project.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={m.name} inactive={m.active === false} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-muted">
                      {m.openTasks} open task{m.openTasks === 1 ? "" : "s"}
                      {m.active === false && " · Deactivated"}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button size="s" variant="ghost" icon={UserMinus} onClick={() => act(() => api(`/api/projects/${id}/members/${m.id}`, { method: "DELETE" }), "Member removed")}>
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isAdmin && editing && <ProjectForm open project={project} onClose={() => setEditing(false)} onSaved={() => mutate()} />}
      <ConfirmModal
        open={confirmDelete}
        title="Delete project?"
        text={`"${project.name}" and all its tasks and docs will be permanently deleted. Consider archiving instead.`}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await api(`/api/projects/${id}`, { method: "DELETE" });
            refreshTaskData();
            toast("Project deleted");
            router.push("/projects");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Couldn't delete", "error");
          }
        }}
      />
    </>
  );
}

function DocRow({ id, title, space, updatedAt, child }: { id: string; title: string; space: string; updatedAt: string; child?: boolean }) {
  return (
    <Link href={`/docs?space=${space}&page=${id}`} className={`flex items-center gap-2 px-5 py-2.5 text-sm transition hover:bg-subtle ${child ? "pl-10" : ""}`}>
      <FileText className="size-4 text-muted" strokeWidth={1.5} />
      <span className="flex-1 font-medium">{title}</span>
      <span className="text-xs text-muted">Updated {formatDate(updatedAt.slice(0, 10))}</span>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}
