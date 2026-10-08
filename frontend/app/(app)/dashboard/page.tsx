"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ChevronRight, Eye, FolderKanban, Inbox } from "lucide-react";
import { fetcher } from "@/lib/api";
import { greeting, STATUS_LABEL, STATUS_STYLE, STATUSES, timeAgo } from "@/lib/format";
import { useMe, useUsers } from "@/lib/hooks";
import type { Dashboard } from "@/lib/types";
import { Avatar, Banner, Card, EmptyState, PageHeader, PriorityBadge, ProgressBar, Select, Skeleton, StatusPill } from "@/components/ui";
import { DueDate } from "@/components/TaskViews";
import { TaskDrawer } from "@/components/TaskDrawer";

export default function DashboardPage() {
  const me = useMe();
  const isAdmin = me.user.role === "admin";
  const [viewing, setViewing] = useState(me.user.id);
  const { data: users } = useUsers();
  const { data, isLoading } = useSWR<Dashboard>(`/api/dashboard${viewing !== me.user.id ? `?userId=${viewing}` : ""}`, fetcher, { keepPreviousData: true });
  const [openTask, setOpenTask] = useState<string | null>(null);
  const firstName = (data?.user.name ?? me.user.name).split(" ")[0];
  const self = viewing === me.user.id;

  return (
    <>
      <PageHeader
        title={self ? `${greeting()}, ${firstName}` : `${data?.user.name ?? "…"}'s dashboard`}
        subtitle={self ? "Here's what's on your plate." : undefined}
        actions={
          isAdmin && (
            <label className="flex items-center gap-2 text-sm text-muted">
              Viewing:
              <Select aria-label="View dashboard for user" value={viewing} onChange={(e) => setViewing(e.target.value)} className="w-52">
                {users
                  ?.filter((u) => u.active !== false || u.id === viewing)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.id === me.user.id ? " (you)" : ""}
                    </option>
                  ))}
              </Select>
            </label>
          )
        }
      />
      {!self && data && (
        <div className="mb-5">
          <Banner icon={Eye}>You&apos;re viewing {data.user.name}&apos;s dashboard.</Banner>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUSES.map((s) => (
          <Card key={s} className="p-4">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className="size-2 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />
              {STATUS_LABEL[s]}
            </div>
            {data ? <div className="tabular mt-1 text-2xl font-semibold">{data.counts[s]}</div> : <Skeleton className="mt-2 h-7 w-10" />}
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card as="section" className="p-0">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-base font-semibold">{self ? "My open tasks" : "Open tasks"}</h2>
            <Link href="/backlog" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-600 hover:underline">
              View all <ChevronRight className="size-3.5" />
            </Link>
          </div>
          {isLoading && !data ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !data?.openTasks.length ? (
            <EmptyState icon={Inbox} title={self ? "No tasks assigned to you yet." : "No open tasks."} />
          ) : (
            <ul className="pb-2">
              {data.openTasks.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpenTask(t.id)} className="focus-ring flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left text-sm transition hover:bg-subtle sm:flex-nowrap">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_STYLE[t.status].dot }} aria-hidden />
                    <span className="w-[calc(100%-20px)] min-w-0 truncate font-medium sm:w-auto sm:flex-1">{t.title}</span>
                    <span className="hidden truncate text-[13px] text-muted md:inline md:max-w-36">{t.project.name}</span>
                    <StatusPill status={t.status} />
                    <PriorityBadge priority={t.priority} />
                    <span className="ml-auto text-right text-[13px] sm:ml-0 sm:w-20">
                      <DueDate due={t.dueDate} status={t.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section">
          <h2 className="mb-4 text-base font-semibold">{self ? "My projects" : "Projects"}</h2>
          {!data ? (
            <Skeleton className="h-16 w-full" />
          ) : !data.projects.length ? (
            <EmptyState icon={FolderKanban} title="Not a member of any project yet." />
          ) : (
            <ul className="space-y-4">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="focus-ring block rounded-md">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium">{p.name}</span>
                      <span className="tabular text-[13px] text-muted">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} />
                    <div className="mt-1 text-xs text-muted">
                      {p.done} of {p.total} tasks done
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card as="section" className="mt-6">
        <h2 className="mb-4 text-base font-semibold">Recent activity</h2>
        {!data ? (
          <Skeleton className="h-16 w-full" />
        ) : !data.activity.length ? (
          <p className="text-sm text-muted">No recent changes.</p>
        ) : (
          <ul className="space-y-3">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <Avatar name={a.user.name} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{a.user.name.split(" ")[0]}</span> <span className="text-secondary">{a.summary}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}
