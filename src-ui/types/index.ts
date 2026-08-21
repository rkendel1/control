// Core types for Control Workbench

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  runtime?: string;
  color?: string;
}

export interface Workspace {
  id: string;
  projectId: string;
  path: string;
  mode: "direct" | "worktree" | "clone";
  branch?: string;
  taskId?: string;
}

export interface WorkspaceState {
  currentProjectId: string;
  currentWorkspaceId?: string;
  openFiles: Map<string, EditorTab>;
  activeFileId?: string;
  terminals: Map<string, TerminalSession>;
  activeTerminalId?: string;
  scrollPositions: Map<string, { line: number; column: number; revision?:number }>;
}

export interface EditorTab {
  id: string;
  path: string;
  projectId: string;
  isDirty: boolean;
  isGitModified: boolean;
  gitStatus?: GitFileStatus;
  savedAt?: number;
}

export interface TerminalSession {
  id: string;
  name: string;
  type: "shell" | "test" | "agent";
  cwd: string;
  isActive: boolean;
  history: string[];
}

export interface GitFileStatus {
  status: "M" | "A" | "D" | "R" | "C" | "?";
  stagedStatus?: "M" | "A" | "D" | "R" | "C";
  isConflicted: boolean;
  hasWorktreeChanges?:boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  files: Map<string, GitFileStatus>;
  stagedFiles: Set<string>;
}

export interface ExplorerNode {
  id: string;
  path: string;
  name: string;
  type: "file" | "folder";
  parentId?: string;
  children?: ExplorerNode[];
  gitStatus?: GitFileStatus;
  isExpanded?: boolean;
}

export interface AgentActivity {
  id: string;
  timestamp: number;
  action: string;
  details?: string;
  fileChanges?: {
    path: string;
    added: number;
    removed: number;
  }[];
  severity?: "info" | "warning" | "error";
}

export interface AgentRun {
  id: string;
  taskId: string;
  status: "idle" | "running" | "paused" | "stopped" | "completed" | "failed";
  model: string;
  runtime: string;
  startedAt: number;
  activity: AgentActivity[];
  filesChanged: Map<string, { added: number; removed: number }>;
  currentActivity?: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: "not-started" | "in-progress" | "done";
  assignedAgent?: string;
}

export interface ProblemItem {
  id: string;
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  source: "compiler" | "lint" | "test" | "agent";
  code?: string;
}

export interface DiffChange {
  type: "add" | "remove" | "modify";
  path: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}

export interface TabState {
  id: string;
  path: string;
  scrollPosition: { line: number; column: number };
  viewState?: unknown; // Monaco editor state
}
