"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { STATUS_LABEL, STATUS_STYLE, STATUSES, timeAgo } from "@/lib/format";
import { refreshWorkData } from "@/lib/hooks";
import type { StatusStats, WorkItem, WorkStatus, WorkType } from "@/lib/types";
import { WORK, WORK_TYPES } from "@/lib/workTypes";
import { CountUp, itemVariants, listVariants } from "./motion";
import { Skeleton, cn } from "./ui";
import { StatusSelect } from "./WorkBits";
import { useToast } from "./toast";

/** Four cards (Tasks, Roadmap, R&D, POC): total, animated status distribution bar and a per-status legend. */
export function TypeStatCards({ byType, onSelect }: { byType?: Record<WorkType, StatusStats>; onSelect?: (t: WorkType) => void }) {
  return (
    <motion.div variants={listVariants} initial="hidden" animate="show" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {WORK_TYPES.map((t) => {
        const cfg = WORK[t];
        const s = byType?.[t];
        return (
          <motion.div key={t} variants={itemVariants}>
            <CardLink href={`/${cfg.path}`} onSelect={onSelect && (() => onSelect(t))}>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-lg" style={{ background: cfg.tint.bg, color: cfg.tint.fg }}>
                  <cfg.icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-medium">{cfg.label}</span>
                <ChevronRight className="ml-auto size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent-600" />
              </div>
              {s ? (
                <>
                  <div className="mt-3 flex items-baseline gap-2">
                    <CountUp value={s.total} className="tabular text-2xl font-semibold" />
                    <span className="text-xs text-muted">{s.progress}% done</span>
                  </div>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-subtle" role="img" aria-label={STATUSES.map((st) => `${STATUS_LABEL[st]} ${s.counts[st]}`).join(", ")}>
                    {STATUSES.map((st, i) =>
                      s.total && s.counts[st] ? (
                        <motion.span
                          key={st}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(s.counts[st] / s.total) * 100}%`,
                          }}
                          transition={{
                            duration: 0.6,
                            delay: 0.15 + i * 0.05,
                            ease: [0.2, 0, 0, 1],
                          }}
                          style={{ background: STATUS_STYLE[st].dot }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    {STATUSES.map((st) => (
                      <span key={st} className="inline-flex items-center gap-1">
                        <span className="size-1.5 rounded-full" style={{ background: STATUS_STYLE[st].dot }} />
                        {STATUS_LABEL[st]} <span className="tabular text-secondary">{s.counts[st]}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Skeleton className="mt-3 h-7 w-12" />
                  <Skeleton className="mt-3 h-1.5 w-full" />
                </>
              )}
            </CardLink>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function CardLink({ href, onSelect, children }: { href: string; onSelect?: () => void; children: React.ReactNode }) {
  const cls = "glass-card lift focus-ring group block w-full rounded-2xl p-4 text-left";
  return onSelect ? (
    <button type="button" onClick={onSelect} className={cls}>
      {children}
    </button>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function TypeBadge({ type }: { type: WorkType }) {
  const cfg = WORK[type];
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium" style={{ background: cfg.tint.bg, color: cfg.tint.fg }}>
      <cfg.icon className="size-3" strokeWidth={2} />
      {cfg.label}
    </span>
  );
}

export function useWorkStatusChange() {
  const toast = useToast();
  return async (item: WorkItem, status: WorkStatus) => {
    if (status === item.status) return;
    try {
      await api(`/api/${WORK[item.type].path}/${item.id}/status`, {
        method: "PATCH",
        body: { status },
      });
      toast(`“${item.title}” set to ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change status", "error");
    }
    refreshWorkData();
  };
}

/** Compact rows mixing all four types, with a type badge and the status dropdown (available to everyone). */
export function WorkRows({ items, showProject = true }: { items: WorkItem[]; showProject?: boolean }) {
  const onStatus = useWorkStatusChange();
  return (
    <motion.ul variants={listVariants} initial="hidden" animate="show" className="pb-2">
      {items.map((i) => (
        <motion.li key={i.id} variants={itemVariants} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm transition-colors hover:bg-surface/50 sm:flex-nowrap")}>
          <TypeBadge type={i.type} />
          <span className="min-w-0 flex-1">
            <Link href={`/${WORK[i.type].path}`} className="block truncate font-medium hover:text-accent-600">
              {i.title}
            </Link>
            <span className="block truncate text-xs text-muted">
              {showProject ? `${i.project?.name ?? "No project"} · ` : ""}
              updated {timeAgo(i.updatedAt)}
            </span>
          </span>
          <StatusSelect item={i} onChange={(s) => onStatus(i, s)} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
