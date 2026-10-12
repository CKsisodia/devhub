"use client";

import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { ArrowLeft, ExternalLink, GraduationCap } from "lucide-react";
import { fetcher } from "@/lib/api";
import { formatDate, LEARNING_LABEL } from "@/lib/format";
import type { LearningItem } from "@/lib/types";
import { Chip, EmptyState, Skeleton } from "@/components/ui";
import { Markdown } from "@/components/Markdown";

export default function LearningPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: item, error } = useSWR<LearningItem>(`/api/learning/${id}`, fetcher);
  if (error) return <EmptyState icon={GraduationCap} title="Item not found." />;
  return (
    <article className="mx-auto max-w-[720px]">
      <Link href="/learnings" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Learning
      </Link>
      {!item ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-accent-600">{LEARNING_LABEL[item.type]}</div>
          <h1 className="mt-1 text-[30px] font-semibold leading-9 tracking-[-0.01em]">{item.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span>
              {item.createdBy.name} · {formatDate(item.createdAt.slice(0, 10), true)}
            </span>
            {item.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
          <hr className="my-6 border-line" />
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-600 hover:underline">
              Open link <ExternalLink className="size-4" />
            </a>
          ) : (
            <Markdown>{item.body ?? ""}</Markdown>
          )}
        </>
      )}
    </article>
  );
}
