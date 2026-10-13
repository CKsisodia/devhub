import { FlaskConical, ListChecks, Microscope, Milestone, type LucideIcon } from "lucide-react";
import type { WorkType } from "./types";

export type ExtraField = "targetPeriod" | "goal" | "timeboxEnd" | "findings" | "outcome";

export interface WorkTypeConfig {
  type: WorkType;
  /** API segment (/api/<path>) and app route (/<path>). */
  path: string;
  label: string;
  /** "task", "roadmap item"… */
  noun: string;
  icon: LucideIcon;
  subtitle: string;
  extras: ExtraField[];
  emptyTitle: string;
  emptyText: string;
  aiPlaceholder: string;
  examples: string[];
  /** Tint for the section icon (decorative). */
  tint: { bg: string; fg: string };
}

/** The four work sections share one data model, one API shape and one set of components. */
export const WORK_TYPES: WorkType[] = ["TASK", "ROADMAP", "RND", "POC"];

export const WORK: Record<WorkType, WorkTypeConfig> = {
  TASK: {
    type: "TASK",
    path: "tasks",
    label: "Tasks",
    noun: "task",
    icon: ListChecks,
    subtitle: "What the team is working on. Anyone can update a task’s status.",
    extras: [],
    emptyTitle: "No tasks yet.",
    emptyText: "Add a task by hand or ask the AI to draft some.",
    aiPlaceholder: "Ask AI to add or update tasks… e.g. “Add 3 tasks for Login Redesign”",
    examples: ["Add 3 tasks for the login page redesign", "Mark all Checkout Performance tasks as done", "Add a task about upgrading Storybook, on hold"],
    tint: { bg: "var(--tone-accent-bg)", fg: "var(--tone-accent-fg)" },
  },
  ROADMAP: {
    type: "ROADMAP",
    path: "roadmap",
    label: "Roadmap",
    noun: "roadmap item",
    icon: Milestone,
    subtitle: "Where we’re heading, by month or quarter.",
    extras: ["targetPeriod"],
    emptyTitle: "The roadmap is empty.",
    emptyText: "Add an initiative with a target month or quarter.",
    aiPlaceholder: "Ask AI to plan roadmap items… e.g. “Add 2 roadmap items for Design System v2 in Q1”",
    examples: ["Add 2 roadmap items for Design System v2 in Q1 2027", "Add a roadmap item about dark mode for Q2 2027", "Move all Checkout Performance items to hold"],
    tint: { bg: "var(--tone-cyan-bg)", fg: "var(--tone-cyan-fg)" },
  },
  RND: {
    type: "RND",
    path: "rnd",
    label: "R&D",
    noun: "R&D item",
    icon: Microscope,
    subtitle: "Time-boxed research: a goal, an end date and what we found.",
    extras: ["goal", "timeboxEnd", "findings"],
    emptyTitle: "No research items yet.",
    emptyText: "Add a question to research, with a goal and a time box.",
    aiPlaceholder: "Ask AI to draft research items… e.g. “Add 2 R&D items about signals, 3 weeks”",
    examples: ["Add 2 R&D items about state management, 3 weeks", "Add an R&D item about CSS anchor positioning", "Mark all Checkout Performance items as done"],
    tint: { bg: "var(--tone-warning-bg)", fg: "var(--tone-warning-fg)" },
  },
  POC: {
    type: "POC",
    path: "poc",
    label: "POC",
    noun: "POC",
    icon: FlaskConical,
    subtitle: "Proofs of concept: goal, time box, findings and the outcome.",
    extras: ["goal", "timeboxEnd", "findings", "outcome"],
    emptyTitle: "No POCs yet.",
    emptyText: "Add a proof of concept with a goal and a time box.",
    aiPlaceholder: "Ask AI to draft POCs… e.g. “Add 1 POC for view transitions, 2 weeks”",
    examples: ["Add 1 POC for view transitions, 2 weeks", "Add 2 POCs about passkeys for Login Redesign", "Move all Design System v2 items to done"],
    tint: { bg: "var(--tone-rose-bg)", fg: "var(--tone-rose-fg)" },
  },
};

export const workHref = (t: WorkType) => `/${WORK[t].path}`;
export const hasExtra = (t: WorkType, f: ExtraField) => WORK[t].extras.includes(f);
