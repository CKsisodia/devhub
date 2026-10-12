export type Role = "admin" | "viewer";
export type WorkStatus = "TODO" | "IN_PROGRESS" | "DONE" | "HOLD" | "REJECT";
export type WorkType = "TASK" | "ROADMAP" | "RND" | "POC";
export type PocOutcome = "ADOPT" | "DROP" | "NEEDS_MORE_WORK";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type LearningType = "BLOG" | "ARTICLE" | "NEWS";

export interface Me {
  user: { id: string; name: string; role: Role; email: string };
  ai: { mode: "llm" | "mock" | "disabled" };
}

export interface UserRef {
  id: string;
  name: string;
  active?: boolean;
}

export interface AdminUser extends UserRef {
  email: string;
  active: boolean;
  role: Role;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Type-specific fields: Roadmap -> targetPeriod; R&D -> goal, timeboxEnd, findings; POC -> those + outcome. */
export interface ExtraFields {
  targetPeriod?: string | null;
  goal?: string;
  timeboxEnd?: string | null;
  findings?: string;
  outcome?: PocOutcome | null;
}

/** One item in Tasks, Roadmap, R&D or POC. */
export interface WorkItem {
  id: string;
  type: WorkType;
  title: string;
  notes: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  status: WorkStatus;
  targetPeriod: string | null;
  goal: string;
  timeboxEnd: string | null;
  findings: string;
  outcome: PocOutcome | null;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface StatusStats {
  counts: Record<WorkStatus, number>;
  total: number;
  done: number;
  progress: number;
}

export interface Activity {
  id: string;
  user: UserRef;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface Dashboard {
  user: UserRef;
  byType: Record<WorkType, StatusStats>;
  counts: Record<WorkStatus, number>;
  inProgress: WorkItem[];
  upNext: WorkItem[];
  onHold: WorkItem[];
  projects: ({ id: string; name: string; status: ProjectStatus } & StatusStats)[];
  activity: Activity[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archived: boolean;
  startDate: string | null;
  targetDate: string | null;
  itemCount: number;
  progress: number;
  memberCount: number;
  members: UserRef[];
}

export interface ProjectDetail extends Omit<ProjectSummary, "members" | "memberCount"> {
  createdBy: UserRef;
  counts: Record<WorkStatus, number>;
  byType: Record<WorkType, StatusStats>;
  recent: WorkItem[];
  members: UserRef[];
}

export interface LearningItem {
  id: string;
  type: LearningType;
  title: string;
  url: string | null;
  summary: string;
  isPost: boolean;
  body?: string | null;
  tags: string[];
  pinned: boolean;
  createdBy: UserRef;
  createdAt: string;
}

export interface DocNode {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  updatedAt: string;
}

export interface DocPage {
  id: string;
  title: string;
  content: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  parentId: string | null;
  parent: { id: string; title: string } | null;
  hasChildren: boolean;
  updatedBy: UserRef;
  updatedAt: string;
}

// AI drafts
export interface DraftFlags {
  project?: string;
  status?: string;
  targetPeriod?: string;
  timeboxEnd?: string;
  outcome?: string;
}
export interface DraftItem extends ExtraFields {
  title: string;
  notes: string;
  projectId: string | null;
  projectName: string | null;
  status: WorkStatus;
  flags: DraftFlags;
}
export interface ItemFields extends ExtraFields {
  title?: string;
  notes?: string;
  projectId?: string | null;
  status?: WorkStatus;
}
export interface DraftUpdate {
  itemId: string;
  itemTitle: string;
  before: ItemFields;
  after: ItemFields;
  flags: DraftFlags;
}
export interface DraftResult {
  type: WorkType;
  creates: DraftItem[];
  updates: DraftUpdate[];
  warnings: string[];
  message?: string;
  source: "llm" | "mock";
}

// Sign-in
export type LoginStep = "totp_setup" | "totp_verify" | "set_password" | "done";
export interface LoginState {
  step: LoginStep;
  user: { name: string; email: string };
}
export interface TotpSetup {
  qrDataUrl: string;
  secret: string;
  otpauthUri: string;
  issuer: string;
  account: string;
}
