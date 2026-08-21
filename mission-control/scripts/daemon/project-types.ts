// ─── Multi-Repository Project Types ──────────────────────────────────────

/**
 * Repository reference within a project.
 * Projects can consist of one or more repositories.
 */
export interface RepositoryConfig {
  /** Absolute path to repository root */
  path: string;

  /** Repository type (currently only 'git') */
  type: "git";

  /** Human-readable name (defaults to directory name) */
  name?: string;

  /** Whether this is the primary repository for the project */
  primary?: boolean;
}

/**
 * Workspace execution mode for a run.
 * Controls where and how the agent executes.
 */
export type WorkspaceMode = "direct" | "worktree" | "clone";

/**
 * Describes where a run will execute.
 */
export interface WorkspaceConfig {
  mode: WorkspaceMode;

  /**
   * For 'direct': use existing checkout
   * For 'worktree': create git worktree at this path
   * For 'clone': create clone at this path
   */
  path: string;

  /** Whether this workspace can be reused for other tasks */
  reusable: boolean;

  /** Git branch (for worktree/clone modes) */
  branch?: string;

  /** When to clean up this workspace */
  cleanup?: "manual" | "task-completion" | "daily";
}

/**
 * Project metadata and runtime configuration.
 * A project can consist of multiple repositories.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;

  /** Single repository (most common) */
  repository?: RepositoryConfig;

  /** Multiple repositories (for multi-repo projects) */
  repositories?: RepositoryConfig[];

  /** Default runtime for tasks in this project */
  runtime?: {
    type: "claude-code" | "ollama" | "command";
    model?: string;
    command?: string;
  };

  /** Project-specific instructions for agents */
  instructions?: string;

  /** Architecture documentation or context */
  context?: {
    architecture?: string;
    conventions?: string;
    recent_changes?: string;
    known_problems?: string[];
  };

  /** Workspace defaults for this project */
  workspace?: {
    mode: WorkspaceMode;
    /** Template for worktree paths */
    worktreeTemplate?: string;
  };

  /** Security boundaries for agents working on this project */
  authorization?: {
    /** Paths agents are allowed to access */
    allowedPaths?: string[];
    /** Whether agents can access network */
    network?: boolean;
    /** Whether agents can access vault/secrets */
    secrets?: boolean;
    /** Whether agents can execute shell commands */
    shell?: boolean;
    /** Whether agents can execute Field Ops */
    fieldOps?: boolean;
  };

  /** Tags for organization */
  tags?: string[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

/**
 * Projects registry file format.
 */
export interface ProjectsRegistry {
  projects: Project[];
  version: "1.0";
}

/**
 * Discovered git repository metadata.
 * Used when scanning directories.
 */
export interface DiscoveredRepository {
  path: string;
  name: string;
  gitUrl?: string;
  defaultBranch?: string;
  hasUncommittedChanges: boolean;
  activeWorktrees?: number;
  lastCommit?: {
    hash: string;
    message: string;
    timestamp: string;
  };
}

/**
 * Project run execution details.
 * Links a task to its project and workspace.
 */
export interface ProjectRun {
  id: string;
  taskId: string;
  projectId: string;
  repositoryPath: string;

  /** Workspace where execution happens */
  workspace: WorkspaceConfig;

  /** When workspace should be cleaned up */
  workspaceCreatedAt: string;

  status: "pending" | "running" | "completed" | "failed" | "stopped";

  /** Git state at execution time */
  gitState?: {
    branch: string;
    commitHash: string;
    isDirty: boolean;
    worktreeId?: string;
  };

  /** Changes made during execution */
  changes?: {
    added: string[];
    modified: string[];
    deleted: string[];
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
  };

  /** Execution timing */
  startedAt: string;
  completedAt?: string;

  /** Ready for merge/review */
  readyForReview: boolean;
  reviewedAt?: string;
}

/**
 * Cross-repository task relationship.
 * Indicates when a task touches multiple projects.
 */
export interface CrossRepoTaskLink {
  taskId: string;
  projectIds: string[];
  relationshipType: "sequential" | "parallel" | "integrated";
  description?: string;
}

/**
 * Execution authorization context.
 * Used to determine what an agent can access during a run.
 */
export interface ExecutionAuthContext {
  projectId: string;
  repositoryPath: string;
  workspaceMode: WorkspaceMode;
  workspacePath: string;

  /** Paths the agent can access */
  allowedPaths: string[];

  /** Capabilities the agent has */
  capabilities: {
    filesystem: boolean;
    shell: boolean;
    network: boolean;
    fieldOps: boolean;
    secrets: boolean;
  };

  /** Restrictions by default */
  defaultDeny: boolean;
}
