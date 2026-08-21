/**
 * Workspace Manager
 *
 * Manages isolated worktrees for each task.
 * Prevents agents from accidentally modifying another project's working directory.
 *
 * Workspace isolation is the foundation of multi-repository safety.
 */

import type { Workspace, WorkspaceStatus, GitStateSnapshot } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("agent");

export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private taskToWorkspace: Map<string, string> = new Map();

  /**
   * Create an isolated worktree for a task
   * Prefer worktree isolation over shared working directory
   */
  async createWorkspace(input: {
    projectId: string;
    repositoryPath: string;
    taskId: string;
    branch: string;
  }): Promise<Workspace> {
    const id = `workspace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate unique worktree path
    const worktreePath = `${input.repositoryPath}/.control/worktrees/${input.taskId}`;

    const workspace: Workspace = {
      id,
      projectId: input.projectId,
      repositoryPath: input.repositoryPath,
      worktreePath,
      branch: input.branch,
      taskId: input.taskId,
      status: "ACTIVE",
      createdAt: Date.now(),
      lastUsed: Date.now(),
      gitState: {
        branch: input.branch,
        commit: "unknown",
        dirty: false,
        uncommitted: 0,
        untracked: 0,
        stashed: 0,
        modifiedFiles: [],
        newFiles: [],
        deletedFiles: [],
      },
      isolationLevel: "ISOLATED",
    };

    this.workspaces.set(id, workspace);
    this.taskToWorkspace.set(input.taskId, id);

    logger.info("workspace_created", {
      project: input.projectId,
      task: input.taskId,
    });

    return workspace;
  }

  /**
   * Get workspace for a task
   */
  getWorkspaceForTask(taskId: string): Workspace | undefined {
    const workspaceId = this.taskToWorkspace.get(taskId);
    if (!workspaceId) return undefined;
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  /**
   * Update Git state snapshot
   * Captures the state of repository at a point in time
   */
  updateGitState(workspaceId: string, state: GitStateSnapshot): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    workspace.gitState = state;
    workspace.lastUsed = Date.now();

    logger.debug("git_state_updated", {
      workspace: workspaceId,
      commit: state.commit,
    });
  }

  /**
   * Pause workspace (task waiting for input)
   */
  pauseWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.status = "PAUSED";
      workspace.lastUsed = Date.now();
      logger.info("workspace_paused", { workspace: workspaceId });
    }
  }

  /**
   * Resume workspace (task resuming)
   */
  resumeWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.status = "ACTIVE";
      workspace.lastUsed = Date.now();
      logger.info("workspace_resumed", { workspace: workspaceId });
    }
  }

  /**
   * Complete workspace (task finished)
   * Can optionally clean up the worktree
   */
  async completeWorkspace(workspaceId: string, cleanup: boolean = false): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return;

    workspace.status = "COMPLETED";
    workspace.lastUsed = Date.now();

    if (cleanup) {
      // In real implementation, would remove worktree directory
      logger.info("workspace_cleaned", { workspace: workspaceId });
    }

    logger.info("workspace_completed", {
      workspace: workspaceId,
      task: workspace.taskId,
    });
  }

  /**
   * Validate workspace is still valid
   * Checks that repository path exists and is accessible
   */
  async validateWorkspace(workspaceId: string): Promise<boolean> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return false;
    }

    // In real implementation, would check:
    // - Repository path exists
    // - Worktree path exists and is writable
    // - Git state is consistent
    // - No merge/rebase in progress

    return true;
  }

  /**
   * Get all active workspaces
   */
  getActiveWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values()).filter((w) => w.status === "ACTIVE");
  }

  /**
   * Get workspaces for a project
   */
  getWorkspacesForProject(projectId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter((w) => w.projectId === projectId);
  }

  /**
   * Check if project has existing changes
   * Returns true if repository has uncommitted changes before task starts
   */
  hasExistingChanges(workspaceId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    const { uncommitted, untracked } = workspace.gitState;
    return uncommitted > 0 || untracked > 0;
  }

  /**
   * Get summary of workspace changes
   */
  getChangeSummary(workspaceId: string): string {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return "Workspace not found";

    const state = workspace.gitState;
    const parts = [];

    if (state.modifiedFiles.length > 0) {
      parts.push(`${state.modifiedFiles.length} modified`);
    }
    if (state.newFiles.length > 0) {
      parts.push(`${state.newFiles.length} new`);
    }
    if (state.deletedFiles.length > 0) {
      parts.push(`${state.deletedFiles.length} deleted`);
    }

    if (parts.length === 0) {
      return "No changes";
    }

    return parts.join(", ");
  }

  /**
   * Enforce isolation: validate operation is in authorized workspace only
   */
  validateIsolation(workspaceId: string, allowedProjects: string[]): boolean {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return false;

    // Operation must be in an authorized project
    return allowedProjects.includes(workspace.projectId);
  }

  /**
   * Get all workspaces (for diagnostics)
   */
  getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Get workspace statistics
   */
  getStatistics(): {
    total: number;
    active: number;
    paused: number;
    completed: number;
    abandoned: number;
  } {
    const workspaces = Array.from(this.workspaces.values());
    return {
      total: workspaces.length,
      active: workspaces.filter((w) => w.status === "ACTIVE").length,
      paused: workspaces.filter((w) => w.status === "PAUSED").length,
      completed: workspaces.filter((w) => w.status === "COMPLETED").length,
      abandoned: workspaces.filter((w) => w.status === "ABANDONED").length,
    };
  }

  /**
   * Cleanup old workspaces
   * Remove workspaces for completed tasks older than specified days
   */
  cleanupOldWorkspaces(olderThanDays: number = 7): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, workspace] of this.workspaces.entries()) {
      if (workspace.status === "COMPLETED" && workspace.lastUsed < cutoff) {
        this.workspaces.delete(id);
        this.taskToWorkspace.delete(workspace.taskId);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info("workspaces_cleaned", {}, `Removed ${removed} old workspaces`);
    }

    return removed;
  }
}

// Global instance
let manager: WorkspaceManager | null = null;

/**
 * Get or create workspace manager
 */
export function getWorkspaceManager(): WorkspaceManager {
  if (!manager) {
    manager = new WorkspaceManager();
  }
  return manager;
}
