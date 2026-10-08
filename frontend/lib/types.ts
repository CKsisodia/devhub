export type Role = "admin" | "viewer";
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED";
export type LearningType = "BLOG" | "ARTICLE" | "NEWS";

export interface Me {
  user: { id: string; name: string; role: Role; phoneMasked: string };
  ai: { mode: "llm" | "mock" | "disabled" };
}

export interface UserRef {
  id: string;
  name: string;
  active?: boolean;
}

export interface AdminUser extends UserRef {
  active: boolean;
  role: Role;
  phoneMasked: string;
  hasSignedIn: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  project: { id: string; name: string };
  assigneeId: string | null;
  assignee: UserRef | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  tags: string[];
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  user: UserRef;
  action: string;
  summary: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  history: HistoryEntry[];
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
  counts: Record<TaskStatus, number>;
  openTasks: Task[];
  projects: { id: string; name: string; status: ProjectStatus; total: number; done: number; progress: number }[];
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
  taskCount: number;
  progress: number;
  memberCount: number;
  members: UserRef[];
}

export interface ProjectDetail extends Omit<ProjectSummary, "members" | "memberCount"> {
  createdBy: UserRef;
  counts: Record<TaskStatus, number>;
  members: (UserRef & { openTasks: number })[];
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
  assignee?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
}
export interface DraftTask {
  title: string;
  description: string;
  projectId: string | null;
  projectName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  tags: string[];
  flags: DraftFlags;
}
export interface TaskFields {
  title?: string;
  description?: string;
  projectId?: string;
  assigneeId?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string | null;
  tags?: string[];
}
export interface DraftUpdate {
  taskId: string;
  taskTitle: string;
  before: TaskFields;
  after: TaskFields;
  flags: DraftFlags;
}
export interface DraftResult {
  creates: DraftTask[];
  updates: DraftUpdate[];
  warnings: string[];
  message?: string;
  source: "llm" | "mock";
}
