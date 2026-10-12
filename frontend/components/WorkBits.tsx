"use client";

import { motion } from "motion/react";
import { CalendarRange, ChevronDown, Hourglass } from "lucide-react";
import { daysUntil, formatDate, formatPeriod, OUTCOME_LABEL, OUTCOME_STYLE, STATUS_LABEL, STATUS_STYLE, STATUSES } from "@/lib/format";
import type { PocOutcome, WorkItem, WorkStatus } from "@/lib/types";
import { Pill, Select, cn } from "./ui";

/**
 * Status dropdown styled as an animated pill. Every signed-in user may change status (admins and viewers).
 * A native <select> underneath keeps it keyboard and screen-reader friendly.
 */
export function StatusSelect({ item, onChange }: { item: Pick<WorkItem, "title" | "status">; onChange: (s: WorkStatus) => void }) {
  const st = STATUS_STYLE[item.status];
  return (
    <motion.span className="relative inline-flex shrink-0 rounded-full" initial={false} animate={{ backgroundColor: st.bg }} transition={{ duration: 0.3 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
      <motion.span
        key={item.status}
        aria-hidden
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 600, damping: 20 }}
        className={cn("pointer-events-none absolute left-2.5 top-1/2 -mt-[3px] size-1.5 rounded-full", item.status === "IN_PROGRESS" && "dot-pulse")}
        style={{ background: st.dot }}
      />
      <select
        aria-label={`Status of ${item.title}`}
        value={item.status}
        onChange={(e) => onChange(e.target.value as WorkStatus)}
        className="focus-ring h-7 cursor-pointer appearance-none rounded-full border-0 bg-transparent pl-6 pr-7 text-xs font-medium transition-colors"
        style={{ color: st.text }}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 -mt-[7px] size-3.5" style={{ color: st.text }} />
    </motion.span>
  );
}

export const OutcomePill = ({ outcome }: { outcome: PocOutcome }) => <Pill {...OUTCOME_STYLE[outcome]}>{OUTCOME_LABEL[outcome]}</Pill>;

export function PeriodChip({ period }: { period: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-blue-50 px-1.5 py-0.5 font-medium text-blue-800">
      <CalendarRange className="size-3" aria-hidden /> Target: {formatPeriod(period)}
    </span>
  );
}

/** "4 days left", "Ends today", "Time box over"; neutral once the item is Done / Reject. */
export function TimeboxChip({ end, status }: { end: string; status: WorkStatus }) {
  const closed = status === "DONE" || status === "REJECT";
  const d = daysUntil(end);
  const date = formatDate(end, new Date(`${end}T00:00:00`).getFullYear() !== new Date().getFullYear());
  let text = `Time box ends ${date}`;
  let tone = "bg-zinc-100 text-secondary";
  if (!closed) {
    if (d < 0) {
      text = `Time box over · ended ${date}`;
      tone = "bg-red-50 text-red-800";
    } else if (d === 0) {
      text = "Time box ends today";
      tone = "bg-amber-50 text-amber-900";
    } else {
      text = `${d} day${d === 1 ? "" : "s"} left · ${date}`;
      tone = d <= 3 ? "bg-amber-50 text-amber-900" : "bg-zinc-100 text-secondary";
    }
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium", tone)}>
      <Hourglass className="size-3" aria-hidden /> {text}
    </span>
  );
}

/** Roadmap target picker: quarters and months around today, plus "No target". */
export function PeriodSelect({ id, value, onChange, invalid, className, label }: { id?: string; value: string | null; onChange: (v: string | null) => void; invalid?: boolean; className?: string; label?: string }) {
  const y = new Date().getFullYear();
  const quarters = [y - 1, y, y + 1, y + 2].flatMap((yr) => [1, 2, 3, 4].map((q) => `${yr}-Q${q}`));
  const months = [y, y + 1].flatMap((yr) => Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, "0")}`));
  const known = new Set([...quarters, ...months]);
  return (
    <Select id={id} aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} invalid={invalid} className={className}>
      <option value="">No target</option>
      {value && !known.has(value) && <option value={value}>{formatPeriod(value)}</option>}
      <optgroup label="Quarter">
        {quarters.map((p) => (
          <option key={p} value={p}>
            {formatPeriod(p)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Month">
        {months.map((p) => (
          <option key={p} value={p}>
            {formatPeriod(p)}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
