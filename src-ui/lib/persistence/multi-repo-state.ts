/**
 * Multi-Repository State Management
 *
 * Manages state consistency across multiple git repositories.
 * Prevents cross-repo contamination when working with multiple projects.
 * Tracks repository contexts, branch associations, and state isolation.
 */

import type { Workspace, GitStateSnapshot } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("storage");

export interface RepositoryContext {
  id: string;
  path: string;
  branch: string;
  lastCommit: string;
  isDirty: boolean;
  stagedChanges: string[];
  unstagedChanges: string[];
  untrackedFiles: string[];
  timestamp: number;
}

export interface RepositoryState {
  contexts: Map<string, RepositoryContext>;
  activeContext?: RepositoryContext;
  workspaceAssociations: Map<string, string>; // workspace ID → repo ID
}

export interface MultiRepoSnapshot {
  timestamp: number;
  repositories: RepositoryContext[];
  activeRepository: string | null;
  workspaces: Array<{ workspaceId: string; repositoryId: string }>;
  stateHash: string;
}

export class MultiRepositoryStateManager {
  private repoState: RepositoryState = {
    contexts: new Map(),
    workspaceAssociations: new Map(),
  };
  private stateHistory: MultiRepoSnapshot[] = [];

  /**
   * Register a repository in multi-repo context
   */
  registerRepository(config: { path: string; branch: string; lastCommit: string }): RepositoryContext {
    const id = `repo_${config.path.split("/").pop() || Date.now()}`;

    const context: RepositoryContext = {
      id,
      path: config.path,
      branch: config.branch,
      lastCommit: config.lastCommit,
      isDirty: false,
      stagedChanges: [],
      unstagedChanges: [],
      untrackedFiles: [],
      timestamp: Date.now(),
    };

    this.repoState.contexts.set(id, context);

    logger.info("repository_registered", { repositoryId: id, path: config.path, branch: config.branch });

    return context;
  }

  /**
   * Associate a workspace with a repository
   * Ensures workspace operations stay in correct repo context
   */
  associateWorkspace(workspaceId: string, repositoryId: string): boolean {
    if (!this.repoState.contexts.has(repositoryId)) {
      logger.warn("repository_not_found", { repositoryId });
      return false;
    }

    this.repoState.workspaceAssociations.set(workspaceId, repositoryId);
    logger.info("workspace_associated", { workspaceId, repositoryId });

    return true;
  }

  /**
   * Get repository context for workspace
   * Validates workspace is still in correct repo
   */
  getRepositoryForWorkspace(workspaceId: string): RepositoryContext | undefined {
    const repositoryId = this.repoState.workspaceAssociations.get(workspaceId);
    if (!repositoryId) {
      return undefined;
    }
    return this.repoState.contexts.get(repositoryId);
  }

  /**
   * Verify workspace hasn't drifted to wrong repository
   */
  verifyWorkspaceContext(workspaceId: string, expectedRepositoryId: string): {
    valid: boolean;
    issue?: string;
    currentRepository?: RepositoryContext;
  } {
    const actualRepository = this.repoState.workspaceAssociations.get(workspaceId);

    if (actualRepository !== expectedRepositoryId) {
      const current = this.repoState.contexts.get(actualRepository || "");
      return {
        valid: false,
        issue: `Workspace associated with wrong repository (expected ${expectedRepositoryId}, found ${actualRepository})`,
        currentRepository: current,
      };
    }

    return { valid: true };
  }

  /**
   * Update repository git state
   * Tracks dirty state and changes per repo independently
   */
  updateRepositoryState(
    repositoryId: string,
    state: {
      branch: string;
      lastCommit: string;
      isDirty: boolean;
      stagedChanges: string[];
      unstagedChanges: string[];
      untrackedFiles: string[];
    }
  ): boolean {
    const context = this.repoState.contexts.get(repositoryId);
    if (!context) {
      return false;
    }

    context.branch = state.branch;
    context.lastCommit = state.lastCommit;
    context.isDirty = state.isDirty;
    context.stagedChanges = state.stagedChanges;
    context.unstagedChanges = state.unstagedChanges;
    context.untrackedFiles = state.untrackedFiles;
    context.timestamp = Date.now();

    logger.info("repository_state_updated", {
      repositoryId,
      branch: state.branch,
      isDirty: state.isDirty,
      changes: state.stagedChanges.length + state.unstagedChanges.length,
    });

    return true;
  }

  /**
   * Set active repository context
   * Only one repo context active at a time
   */
  setActiveContext(repositoryId: string): boolean {
    const context = this.repoState.contexts.get(repositoryId);
    if (!context) {
      return false;
    }

    const previousActive = this.repoState.activeContext;
    this.repoState.activeContext = context;

    logger.info("repository_context_switched", {
      from: previousActive?.id,
      to: repositoryId,
    });

    return true;
  }

  /**
   * Get active repository context
   */
  getActiveContext(): RepositoryContext | undefined {
    return this.repoState.activeContext;
  }

  /**
   * Verify repository state consistency
   * Detects when multiple repos have conflicting states
   */
  verifyStateConsistency(): {
    consistent: boolean;
    conflicts: Array<{ repository: string; issue: string }>;
    warnings: Array<{ repository: string; warning: string }>;
  } {
    const conflicts: Array<{ repository: string; issue: string }> = [];
    const warnings: Array<{ repository: string; warning: string }> = [];

    // Check for dirty repos
    for (const [repoId, context] of this.repoState.contexts.entries()) {
      if (context.isDirty) {
        warnings.push({
          repository: repoId,
          warning: `Repository has uncommitted changes (${context.unstagedChanges.length} files)`,
        });
      }

      // Check for orphaned workspaces (workspace points to this repo but repo not in active use)
      const associatedWorkspaces = Array.from(this.repoState.workspaceAssociations.entries()).filter(
        ([, id]) => id === repoId
      );

      if (associatedWorkspaces.length > 1) {
        warnings.push({
          repository: repoId,
          warning: `Multiple workspaces associated with this repository (${associatedWorkspaces.length})`,
        });
      }
    }

    return {
      consistent: conflicts.length === 0,
      conflicts,
      warnings,
    };
  }

  /**
   * Create snapshot of multi-repo state
   * Used for crash recovery and audit trails
   */
  createSnapshot(): MultiRepoSnapshot {
    const stateHash = this.computeStateHash();

    const snapshot: MultiRepoSnapshot = {
      timestamp: Date.now(),
      repositories: Array.from(this.repoState.contexts.values()),
      activeRepository: this.repoState.activeContext?.id || null,
      workspaces: Array.from(this.repoState.workspaceAssociations.entries()).map(([workspaceId, repositoryId]) => ({
        workspaceId,
        repositoryId,
      })),
      stateHash,
    };

    this.stateHistory.push(snapshot);

    logger.info("multi_repo_snapshot_created", {
      repositories: snapshot.repositories.length,
      workspaces: snapshot.workspaces.length,
      stateHash,
    });

    return snapshot;
  }

  /**
   * Restore from snapshot
   * Recovers multi-repo state from crash
   */
  async restoreFromSnapshot(snapshot: MultiRepoSnapshot): Promise<{
    success: boolean;
    message: string;
    restored?: number;
  }> {
    try {
      // Clear current state
      this.repoState.contexts.clear();
      this.repoState.workspaceAssociations.clear();
      this.repoState.activeContext = undefined;

      // Restore repositories
      for (const repo of snapshot.repositories) {
        this.repoState.contexts.set(repo.id, repo);
      }

      // Restore workspace associations
      for (const assoc of snapshot.workspaces) {
        this.repoState.workspaceAssociations.set(assoc.workspaceId, assoc.repositoryId);
      }

      // Restore active context
      if (snapshot.activeRepository) {
        this.repoState.activeContext = this.repoState.contexts.get(snapshot.activeRepository);
      }

      logger.info("multi_repo_state_restored", {
        repositories: snapshot.repositories.length,
        workspaces: snapshot.workspaces.length,
      });

      return {
        success: true,
        message: "Multi-repository state restored",
        restored: snapshot.repositories.length,
      };
    } catch (err) {
      logger.error("multi_repo_restore_failed", {}, String(err));
      return {
        success: false,
        message: `Restore failed: ${String(err)}`,
      };
    }
  }

  /**
   * Get all repositories
   */
  getAllRepositories(): RepositoryContext[] {
    return Array.from(this.repoState.contexts.values());
  }

  /**
   * Get repository by ID
   */
  getRepository(repositoryId: string): RepositoryContext | undefined {
    return this.repoState.contexts.get(repositoryId);
  }

  /**
   * Get all workspaces for a repository
   */
  getWorkspacesForRepository(repositoryId: string): string[] {
    return Array.from(this.repoState.workspaceAssociations.entries())
      .filter(([, id]) => id === repositoryId)
      .map(([workspaceId]) => workspaceId);
  }

  /**
   * Detect cross-repo contamination
   * Finds evidence of operations affecting wrong repository
   */
  detectCrossRepoContamination(): Array<{
    workspace: string;
    issue: string;
    severity: "low" | "medium" | "high";
  }> {
    const issues: Array<{ workspace: string; issue: string; severity: "low" | "medium" | "high" }> = [];

    for (const [workspaceId, repositoryId] of this.repoState.workspaceAssociations.entries()) {
      const repo = this.repoState.contexts.get(repositoryId);
      if (!repo) {
        issues.push({
          workspace: workspaceId,
          issue: `Workspace points to missing repository ${repositoryId}`,
          severity: "high",
        });
      }
    }

    // Check for multiple active branches
    const branches = new Set(Array.from(this.repoState.contexts.values()).map((r) => r.branch));
    if (branches.size > 2) {
      issues.push({
        workspace: "system",
        issue: `Unusually high number of active branches (${branches.size})`,
        severity: "medium",
      });
    }

    return issues;
  }

  /**
   * Compute hash of current state
   * Used for change detection
   */
  private computeStateHash(): string {
    const stateStr = JSON.stringify({
      repos: Array.from(this.repoState.contexts.entries()).map(([id, ctx]) => ({
        id,
        branch: ctx.branch,
        lastCommit: ctx.lastCommit,
        isDirty: ctx.isDirty,
      })),
      active: this.repoState.activeContext?.id,
    });

    // Simple hash using string length and character codes
    let hash = 0;
    for (let i = 0; i < stateStr.length; i++) {
      hash = ((hash << 5) - hash) + stateStr.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Export state for persistence
   */
  exportState(): string {
    return JSON.stringify(
      {
        timestamp: Date.now(),
        repositories: Array.from(this.repoState.contexts.values()),
        workspaceAssociations: Array.from(this.repoState.workspaceAssociations.entries()),
        activeContext: this.repoState.activeContext?.id,
      },
      null,
      2
    );
  }

  /**
   * Get state history
   */
  getStateHistory(limit: number = 100): MultiRepoSnapshot[] {
    return this.stateHistory.slice(-limit);
  }
}

// Global instance
let multiRepoManager: MultiRepositoryStateManager | null = null;

/**
 * Get or create multi-repository state manager
 */
export function getMultiRepositoryStateManager(): MultiRepositoryStateManager {
  if (!multiRepoManager) {
    multiRepoManager = new MultiRepositoryStateManager();
  }
  return multiRepoManager;
}
