"use client";

import { createContext, useContext } from "react";
import useSWR, { mutate } from "swr";
import { fetcher } from "./api";
import type { Me, ProjectSummary, UserRef } from "./types";

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside the authenticated app");
  return me;
}

export const useIsAdmin = () => useMe().user.role === "admin";

export function useUsers() {
  return useSWR<UserRef[]>("/api/users", fetcher);
}

export function useProjects() {
  return useSWR<ProjectSummary[]>("/api/projects", fetcher);
}

/** Revalidate every cached list that depends on backlog items (backlog, dashboard, projects). */
export function refreshBacklogData() {
  return mutate((key) => typeof key === "string" && /^\/api\/(backlog|dashboard|projects)/.test(key));
}
