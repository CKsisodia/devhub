"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { motion } from "motion/react";
import { CircleDashed, Eye, FolderKanban, Inbox, PauseCircle } from "lucide-react";
import { fetcher } from "@/lib/api";
import { greeting, timeAgo } from "@/lib/format";
import { useMe, useUsers } from "@/lib/hooks";
import type { Dashboard, WorkItem } from "@/lib/types";
import { Avatar, Banner, Card, EmptyState, PageHeader, ProgressBar, Select, Skeleton } from "@/components/ui";
import { itemVariants, listVariants } from "@/components/motion";
import { TypeStatCards, WorkRows } from "@/components/WorkOverview";

function ListCard({ title, icon: Icon, items, loading, empty }: { title: string; icon: typeof Inbox; items?: WorkItem[]; loading: boolean; empty?: string }) {
  if (!loading && !items?.length && !empty) return null;
  return (
    <Card as="section" className="p-0">
      <h2 className="flex items-center gap-2 px-5 pb-2 pt-4 text-base font-semibold">
        <Icon className="size-4 text-accent-500" strokeWidth={1.75} /> {title}
      </h2>
      {loading && !items ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : !items?.length ? (
        <EmptyState icon={Icon} title={empty!} />
      ) : (
        <WorkRows items={items} />
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const me = useMe();
  const isAdmin = me.user.role === "admin";
  const [viewing, setViewing] = useState(me.user.id);
  const { data: users } = useUsers();
  const { data, isLoading } = useSWR<Dashboard>(`/api/dashboard${viewing !== me.user.id ? `?userId=${viewing}` : ""}`, fetcher, { keepPreviousData: true });
  const firstName = (data?.user.name ?? me.user.name).split(" ")[0];
  const self = viewing === me.user.id;

  return (
    <>
      <PageHeader
        title={self ? `${greeting()}, ${firstName}` : `${data?.user.name ?? "…"}'s dashboard`}
        subtitle={self ? "Tasks, roadmap, R&D and POCs across your projects." : "Tasks, roadmap, R&D and POCs across their projects."}
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

      <div className="mb-6">
        <TypeStatCards byType={data?.byType} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <ListCard title="In progress" icon={Inbox} items={data?.inProgress} loading={isLoading} empty="Nothing in progress right now." />
          <ListCard title="Up next" icon={CircleDashed} items={data?.upNext} loading={isLoading} />
          <ListCard title="On hold" icon={PauseCircle} items={data?.onHold} loading={isLoading} />
        </div>

        <Card as="section">
          <h2 className="mb-4 text-base font-semibold">{self ? "My projects" : "Projects"}</h2>
          {!data ? (
            <Skeleton className="h-16 w-full" />
          ) : !data.projects.length ? (
            <EmptyState icon={FolderKanban} title="Not a member of any project yet." />
          ) : (
            <motion.ul variants={listVariants} initial="hidden" animate="show" className="space-y-4">
              {data.projects.map((p) => (
                <motion.li key={p.id} variants={itemVariants}>
                  <Link href={`/projects/${p.id}`} className="focus-ring group block rounded-md">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium group-hover:text-accent-600">{p.name}</span>
                      <span className="tabular text-[13px] text-muted">{p.progress}%</span>
                    </div>
                    <ProgressBar value={p.progress} />
                    <div className="mt-1 text-xs text-muted">
                      {p.done} done · {p.counts.IN_PROGRESS} in progress · {p.counts.HOLD} on hold
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
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
