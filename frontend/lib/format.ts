import type { LearningType, ProjectStatus, TaskPriority, TaskStatus } from "./types";

export const STATUSES: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"];
export const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
export const PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "ON_HOLD", "COMPLETED"];
export const LEARNING_TYPES: LearningType[] = ["BLOG", "ARTICLE", "NEWS"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  DONE: "Done",
};
export const STATUS_STYLE: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  BACKLOG: { bg: "#F4F4F5", text: "#52525B", dot: "#A1A1AA" },
  TODO: { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  IN_PROGRESS: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  REVIEW: { bg: "#EDE9FE", text: "#5B21B6", dot: "#8B5CF6" },
  DONE: { bg: "#DCFCE7", text: "#166534", dot: "#22C55E" },
};
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const PRIORITY_STYLE: Record<TaskPriority, { bg: string; text: string; bars: number }> = {
  LOW: { bg: "#F1F5F9", text: "#475569", bars: 1 },
  MEDIUM: { bg: "#E0F2FE", text: "#075985", bars: 2 },
  HIGH: { bg: "#FFEDD5", text: "#9A3412", bars: 3 },
  URGENT: { bg: "#FEE2E2", text: "#991B1B", bars: 4 },
};
export const PRIORITY_RANK: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed" };
export const PROJECT_STATUS_STYLE: Record<ProjectStatus, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: "#F4F4F5", text: "#3F3F46", dot: "#71717A" },
  ON_HOLD: { bg: "#EFF6FF", text: "#1E40AF", dot: "#2563EB" },
  COMPLETED: { bg: "#F0FDF4", text: "#166534", dot: "#16A34A" },
};
export const LEARNING_LABEL: Record<LearningType, string> = { BLOG: "Blog", ARTICLE: "Article", NEWS: "News" };

export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(due: string | null, status?: TaskStatus) {
  return Boolean(due && status !== "DONE" && due < todayYmd());
}

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
