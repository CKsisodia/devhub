import type { BacklogStatus, LearningType, ProjectStatus } from "./types";

export const STATUSES: BacklogStatus[] = ["IN_PROGRESS", "HOLD", "DONE", "REJECT"];
export const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED"];
export const LEARNING_TYPES: LearningType[] = ["BLOG", "ARTICLE", "NEWS"];

export const STATUS_LABEL: Record<BacklogStatus, string> = { IN_PROGRESS: "In progress", HOLD: "Hold", DONE: "Done", REJECT: "Reject" };
export const STATUS_STYLE: Record<BacklogStatus, { bg: string; text: string; dot: string }> = {
  IN_PROGRESS: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  HOLD: { bg: "#E0F2FE", text: "#075985", dot: "#0EA5E9" },
  DONE: { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
  REJECT: { bg: "#FEE2E2", text: "#991B1B", dot: "#EF4444" },
};
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed" };
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: "#F4F4F5", text: "#3F3F46", dot: "#71717A" },
  ON_HOLD: { bg: "#EFF6FF", text: "#1E40AF", dot: "#2563EB" },
  COMPLETED: { bg: "#F0FDF4", text: "#166534", dot: "#16A34A" },
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
