"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ChevronRight, Eye, FolderKanban, Inbox, PauseCircle } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { greeting, STATUS_LABEL, STATUS_STYLE, STATUSES, timeAgo } from "@/lib/format";
import { refreshBacklogData, useMe, useUsers } from "@/lib/hooks";
import type { BacklogItem, BacklogStatus, Dashboard } from "@/lib/types";
import { Avatar, Banner, Card, EmptyState, PageHeader, ProgressBar, Select, Skeleton } from "@/components/ui";
import { StatusSelect } from "@/components/BacklogView";
import { useToast } from "@/components/toast";

function ItemRows({ items, onStatus }: { items: BacklogItem[]; onStatus: (item: BacklogItem, s: BacklogStatus) => void }) {
  return (
    <ul className="pb-2">
      {items.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm sm:flex-nowrap">
          <span className="w-full min-w-0 sm:w-auto sm:flex-1">
            <span className="block truncate font-medium">{i.title}</span>
            <span className="block truncate text-xs text-muted">
              {i.project?.name ?? "No project"} · updated {timeAgo(i.updatedAt)}
            </span>
          </span>
          <StatusSelect item={i} onChange={(s) => onStatus(i, s)} />
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const toast = useToast();
  const isAdmin = me.user.role === "admin";
  const [viewing, setViewing] = useState(me.user.id);
  const { data: users } = useUsers();
  const { data, isLoading } = useSWR<Dashboard>(`/api/dashboard${viewing !== me.user.id ? `?userId=${viewing}` : ""}`, fetcher, { keepPreviousData: true });
  const firstName = (data?.user.name ?? me.user.name).split(" ")[0];
  const self = viewing === me.user.id;

  async function setStatus(item: BacklogItem, status: BacklogStatus) {
    if (status === item.status) return;
    try {
      await api(`/api/backlog/${item.id}/status`, { method: "PATCH", body: { status } });
      toast(`“${item.title}” set to ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change status", "error");
    }
    refreshBacklogData();
  }

  return (
    <>
      <PageHeader
        title={self ? `${greeting()}, ${firstName}` : `${data?.user.name ?? "…"}'s dashboard`}
        subtitle={self ? "The backlog across your projects." : "The backlog across their projects."}
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

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <div className="space-y-6">
          <Card as="section" className="p-0">
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <h2 className="text-base font-semibold">In progress</h2>
              <Link href="/backlog" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-accent-600 hover:underline">
                View backlog <ChevronRight className="size-3.5" />
              </Link>
            </div>
            {isLoading && !data ? (
              <div className="space-y-2 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !data?.inProgress.length ? (
              <EmptyState icon={Inbox} title="Nothing in progress right now." />
            ) : (
              <ItemRows items={data.inProgress} onStatus={setStatus} />
            )}
          </Card>
          {data && data.onHold.length > 0 && (
            <Card as="section" className="p-0">
              <h2 className="flex items-center gap-2 px-5 pb-2 pt-4 text-base font-semibold">
                <PauseCircle className="size-4 text-sky-600" /> On hold
              </h2>
              <ItemRows items={data.onHold} onStatus={setStatus} />
            </Card>
          )}
        </div>

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
                      {p.done} done · {p.counts.IN_PROGRESS} in progress · {p.counts.HOLD} on hold
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
    </>
  );
}
