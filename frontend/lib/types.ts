export type Role = "admin" | "viewer";
export type BacklogStatus = "IN_PROGRESS" | "HOLD" | "DONE" | "REJECT";
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

export interface BacklogItem {
  id: string;
  title: string;
  notes: string;
  projectId: string | null;
  project: { id: string; name: string } | null;
  status: BacklogStatus;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
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
  counts: Record<BacklogStatus, number>;
  inProgress: BacklogItem[];
  onHold: BacklogItem[];
  projects: { id: string; name: string; status: ProjectStatus; counts: Record<BacklogStatus, number>; total: number; done: number; progress: number }[];
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
  counts: Record<BacklogStatus, number>;
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
}
export interface DraftItem {
  title: string;
  notes: string;
  projectId: string | null;
  projectName: string | null;
  status: BacklogStatus;
  flags: DraftFlags;
}
export interface ItemFields {
  title?: string;
  notes?: string;
  projectId?: string | null;
  status?: BacklogStatus;
}
export interface DraftUpdate {
  itemId: string;
  itemTitle: string;
  before: ItemFields;
  after: ItemFields;
  flags: DraftFlags;
}
export interface DraftResult {
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
