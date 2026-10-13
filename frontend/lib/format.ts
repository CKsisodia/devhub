import type { LearningType, PocOutcome, ProjectStatus, WorkStatus } from "./types";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "accent" | "cyan" | "rose" | "orange" | "lime";
/** Theme-aware pill colours: CSS variables defined per theme in globals.css (bg, AA text, dot). */
export const tone = (n: Tone) => ({ bg: `var(--tone-${n}-bg)`, text: `var(--tone-${n}-fg)`, dot: `var(--tone-${n}-dot)` });

export const STATUSES: WorkStatus[] = ["TODO", "IN_PROGRESS", "DONE", "HOLD", "REJECT"];
export const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED"];
export const LEARNING_TYPES: LearningType[] = ["BLOG", "ARTICLE", "NEWS"];

export const STATUS_LABEL: Record<WorkStatus, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", HOLD: "Hold", REJECT: "Reject" };
/** Pill = tinted background + dark text + dot (design brief 2.4); every text/background pair passes WCAG AA in both themes. */
export const STATUS_STYLE: Record<WorkStatus, { bg: string; text: string; dot: string }> = {
  TODO: tone("info"),
  IN_PROGRESS: tone("warning"),
  DONE: tone("success"),
  HOLD: tone("neutral"),
  REJECT: tone("danger"),
};
export const OUTCOMES: PocOutcome[] = ["ADOPT", "DROP", "NEEDS_MORE_WORK"];
export const OUTCOME_LABEL: Record<PocOutcome, string> = { ADOPT: "Adopt", DROP: "Drop", NEEDS_MORE_WORK: "Needs more work" };
export const OUTCOME_STYLE: Record<PocOutcome, { bg: string; text: string; dot: string }> = {
  ADOPT: tone("success"),
  DROP: tone("danger"),
  NEEDS_MORE_WORK: tone("warning"),
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Roadmap period "2026-Q4" -> "Q4 2026", "2026-11" -> "Nov 2026". */
export function formatPeriod(p: string | null | undefined) {
  if (!p) return "";
  const [y, rest] = p.split("-");
  return rest.startsWith("Q") ? `${rest} ${y}` : `${MONTHS[Number(rest) - 1]} ${y}`;
}
/** Sort key: months and quarters on one axis (a quarter sorts at its last month); no period sorts last. */
export function periodKey(p: string | null | undefined) {
  if (!p) return Number.MAX_SAFE_INTEGER;
  const [y, rest] = p.split("-");
  const month = rest.startsWith("Q") ? Number(rest.slice(1)) * 3 : Number(rest);
  return Number(y) * 100 + month;
}
/** Days from today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(ymd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${ymd}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed" };
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  ACTIVE: tone("accent"),
  ON_HOLD: tone("info"),
  COMPLETED: tone("success"),
};
export const LEARNING_LABEL: Record<LearningType, string> = { BLOG: "Blog", ARTICLE: "Article", NEWS: "News" };

export function formatDate(ymd: string | null | undefined, withYear = false) {
  if (!ymd) return "";
  const d = new Date(ymd.length === 10 ? `${ymd}T00:00:00` : ymd);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "yesterday";
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(iso.slice(0, 10), true);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function domainOf(url: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
