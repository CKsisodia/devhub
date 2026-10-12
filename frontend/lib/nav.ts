import { FileText, FolderKanban, GraduationCap, LayoutDashboard, Users, type LucideIcon } from "lucide-react";
import { WORK } from "./workTypes";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar order is fixed by the requirements: Dashboard, Projects, Tasks, Roadmap, R&D, POC, Docs, Learnings. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  ...(["TASK", "ROADMAP", "RND", "POC"] as const).map((t) => ({ href: `/${WORK[t].path}`, label: WORK[t].label, icon: WORK[t].icon })),
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/learnings", label: "Learnings", icon: GraduationCap },
];

export const ADMIN_NAV: NavItem[] = [{ href: "/users", label: "Users", icon: Users }];
