"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, Plus } from "lucide-react";
import { fetcher } from "@/lib/api";
import { useIsAdmin } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { AvatarGroup, Button, Card, EmptyState, PageHeader, ProgressBar, ProjectStatusPill, Skeleton, Pill } from "@/components/ui";
import { ProjectForm } from "@/components/ProjectForm";

export default function ProjectsPage() {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const { data: projects, isLoading } = useSWR<ProjectSummary[]>(`/api/projects${showArchived ? "?includeArchived=1" : ""}`, fetcher);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Tasks, roadmap, R&D, POCs, people and docs grouped by project."
        actions={
          <>
            <label className="mr-2 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-violet-600" /> Show archived
            </label>
            {isAdmin && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New project
              </Button>
            )}
          </>
        }
      />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : !projects?.length ? (
        <Card>
          <EmptyState icon={FolderKanban} title="No projects yet." action={isAdmin && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New project</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="focus-ring group rounded-lg">
              <Card className="flex h-full flex-col transition group-hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{p.name}</h2>
                  <div className="flex gap-1">
                    {p.archived && <Pill bg="#F4F4F5" text="#71717A">Archived</Pill>}
                    <ProjectStatusPill status={p.status} />
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>
                <div className="mt-auto pt-5">
                  <div className="mb-1.5 flex justify-between text-[13px] text-muted">
                    <span>{p.itemCount} work item{p.itemCount === 1 ? "" : "s"}</span>
                    <span className="tabular">{p.progress}%</span>
                  </div>
                  <ProgressBar value={p.progress} />
                  <div className="mt-4 flex items-center justify-between">
                    <AvatarGroup users={p.members} />
                    <span className="text-xs text-muted">
                      {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {isAdmin && creating && <ProjectForm open onClose={() => setCreating(false)} onSaved={(id) => router.push(`/projects/${id}`)} />}
    </>
  );
}
