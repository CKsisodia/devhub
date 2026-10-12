"use client";

import { WORK } from "@/lib/workTypes";
import type { WorkType } from "@/lib/types";
import { PageHeader } from "./ui";
import { WorkItemsView } from "./WorkItemsView";

export function WorkSectionPage({ type }: { type: WorkType }) {
  const cfg = WORK[type];
  return <WorkItemsView type={type} withAi headerSlot={(actions) => <PageHeader title={cfg.label} subtitle={cfg.subtitle} icon={cfg.icon} tint={cfg.tint} actions={actions} />} />;
}
