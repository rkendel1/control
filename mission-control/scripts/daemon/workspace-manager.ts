import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { logger } from "./logger";
import type { WorkspaceConfig, WorkspaceMode } from "./project-types";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const WORKSPACES_BASE = path.join(WORKSPACE_ROOT, ".control", "workspaces");
const WORKTREES_BASE = path.join(WORKSPACE_ROOT, ".control", "worktrees");

/**
 * Manages workspace creation and cleanup.
 * A workspace is the directory where an agent executes.
 *
 * Three modes:
 * - direct: use existing checkout
 * - worktree: create git worktree (isolated, can coexist with main)
 * - clone: create independent clone
 */
export class WorkspaceManager {
  /**
   * Create a workspace for a task execution.
   */
  static async createWorkspace(
    repositoryPath: string,
    taskId: string,
    mode: WorkspaceMode,
    branch?: string
  ): Promise<WorkspaceConfig> {
    logger.info(
      "workspace",
      `Creating ${mode} workspace for task ${taskId} in ${repositoryPath}`
    );

    switch (mode) {
      case "direct":
        return this.createDirectWorkspace(repositoryPath);

      case "worktree":
        return this.createWorktreeWorkspace(
          repositoryPath,
          taskId,
          branch
        );

      case "clone":
        return this.createCloneWorkspace(repositoryPath, taskId, branch);

      default:
        throw new Error(`Unknown workspace mode: ${mode}`);
    }
  }

  /**
   * Create a direct workspace (use existing checkout).
   */
  private static createDirectWorkspace(
    repositoryPath: string
  ): WorkspaceConfig {
    if (!fs.existsSync(repositoryPath)) {
      throw new Error(`Repository not found: ${repositoryPath}`);
    }

    logger.info("workspace", `Using direct workspace: ${repositoryPath}`);

    return {
      mode: "direct",
      path: repositoryPath,
      reusable: false,
      cleanup: undefined, // Don't clean up user's checkout
    };
  }

  /**
   * Create a git worktree workspace (isolated checkout, same repo).
   */
  private static async createWorktreeWorkspace(
    repositoryPath: string,
    taskId: string,
    branch?: string
  ): Promise<WorkspaceConfig> {
    if (!fs.existsSync(repositoryPath)) {
      throw new Error(`Repository not found: ${repositoryPath}`);
    }

    // Ensure worktrees directory exists
    if (!fs.existsSync(WORKTREES_BASE)) {
      fs.mkdirSync(WORKTREES_BASE, { recursive: true });
    }

    const repoName = path.basename(repositoryPath);
    const worktreePath = path.join(WORKTREES_BASE, repoName, taskId);

    logger.info("workspace", `Creating worktree at ${worktreePath}`);

    try {
      // Create worktree
      const createBranch = branch || "main";
      execSync(`git worktree add "${worktreePath}" "${createBranch}"`, {
        cwd: repositoryPath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      logger.info("workspace", `Worktree created: ${worktreePath}`);

      return {
        mode: "worktree",
        path: worktreePath,
        reusable: false,
        branch: createBranch,
        cleanup: "task-completion",
      };
    } catch (err) {
      throw new Error(
        `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Create a clone workspace (independent copy).
   */
  private static async createCloneWorkspace(
    repositoryPath: string,
    taskId: string,
    branch?: string
  ): Promise<WorkspaceConfig> {
    if (!fs.existsSync(repositoryPath)) {
      throw new Error(`Repository not found: ${repositoryPath}`);
    }

    // Ensure clones directory exists
    if (!fs.existsSync(WORKSPACES_BASE)) {
      fs.mkdirSync(WORKSPACES_BASE, { recursive: true });
    }

    const repoName = path.basename(repositoryPath);
    const clonePath = path.join(WORKSPACES_BASE, repoName, taskId);

    logger.info("workspace", `Creating clone at ${clonePath}`);

    try {
      // Create parent directory
      const parentDir = path.dirname(clonePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Clone repository
      const cloneBranch = branch ? `--branch ${branch}` : "";
      execSync(`git clone ${cloneBranch} "${repositoryPath}" "${clonePath}"`, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      logger.info("workspace", `Clone created: ${clonePath}`);

      return {
        mode: "clone",
        path: clonePath,
        reusable: false,
        branch,
        cleanup: "task-completion",
      };
    } catch (err) {
      throw new Error(
        `Failed to create clone: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Clean up a workspace after task completion.
   */
  static async cleanupWorkspace(workspace: WorkspaceConfig): Promise<void> {
    if (workspace.cleanup === undefined) {
      logger.info("workspace", `Skipping cleanup for ${workspace.path}`);
      return;
    }

    if (workspace.mode === "direct") {
      logger.info("workspace", `Not cleaning up direct workspace: ${workspace.path}`);
      return;
    }

    logger.info("workspace", `Cleaning up ${workspace.mode} workspace: ${workspace.path}`);

    try {
      if (workspace.mode === "worktree") {
        // Remove worktree
        const repoPath = this.findRepositoryRoot(workspace.path);
        if (repoPath) {
          execSync(`git worktree remove "${workspace.path}"`, {
            cwd: repoPath,
            stdio: ["ignore", "pipe", "pipe"],
          });
          logger.info("workspace", `Removed worktree: ${workspace.path}`);
        }
      } else if (workspace.mode === "clone") {
        // Remove clone directory
        if (fs.existsSync(workspace.path)) {
          fs.rmSync(workspace.path, { recursive: true, force: true });
          logger.info("workspace", `Removed clone: ${workspace.path}`);
        }

        // Clean up parent if empty
        const parent = path.dirname(workspace.path);
        try {
          const entries = fs.readdirSync(parent);
          if (entries.length === 0) {
            fs.rmSync(parent, { recursive: true });
            logger.info("workspace", `Cleaned up empty directory: ${parent}`);
          }
        } catch {
          /* parent cleanup failed, leave it */
        }
      }
    } catch (err) {
      logger.warn(
        "workspace",
        `Failed to clean up workspace: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Get git status for a workspace.
   */
  static getGitStatus(workspacePath: string): {
    branch: string;
    commitHash: string;
    isDirty: boolean;
  } | null {
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: workspacePath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      const commitHash = execSync("git rev-parse HEAD", {
        cwd: workspacePath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      const status = execSync("git status --porcelain", {
        cwd: workspacePath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      const isDirty = status.length > 0;

      return { branch, commitHash, isDirty };
    } catch (err) {
      logger.debug(
        "workspace",
        `Failed to get git status: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  /**
   * Get diff statistics for a workspace.
   */
  static getDiffStats(workspacePath: string, baseBranch = "main"): {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    files: { path: string; status: string }[];
  } | null {
    try {
      const diffOutput = execSync(
        `git diff --numstat ${baseBranch}...HEAD`,
        {
          cwd: workspacePath,
          encoding: "utf-8",
          timeout: 5000,
        }
      ).trim();

      if (!diffOutput) {
        return {
          filesChanged: 0,
          linesAdded: 0,
          linesDeleted: 0,
          files: [],
        };
      }

      let filesChanged = 0;
      let linesAdded = 0;
      let linesDeleted = 0;
      const files: { path: string; status: string }[] = [];

      for (const line of diffOutput.split("\n")) {
        const [added, deleted, filePath] = line.split("\t");
        if (filePath) {
          filesChanged++;
          linesAdded += parseInt(added, 10) || 0;
          linesDeleted += parseInt(deleted, 10) || 0;
          files.push({ path: filePath, status: "modified" });
        }
      }

      return { filesChanged, linesAdded, linesDeleted, files };
    } catch (err) {
      logger.debug(
        "workspace",
        `Failed to get diff stats: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  /**
   * Find the git repository root by traversing up from a path.
   */
  private static findRepositoryRoot(fromPath: string): string | null {
    let current = fromPath;

    while (current !== path.dirname(current)) {
      if (fs.existsSync(path.join(current, ".git"))) {
        return current;
      }
      current = path.dirname(current);
    }

    return null;
  }

  /**
   * List active worktrees for a repository.
   */
  static listWorktrees(repositoryPath: string): Array<{
    path: string;
    branch: string;
    commitHash: string;
    prunable: boolean;
  }> {
    try {
      const output = execSync("git worktree list --porcelain", {
        cwd: repositoryPath,
        encoding: "utf-8",
        timeout: 5000,
      }).trim();

      if (!output) {
        return [];
      }

      const worktrees = [];

      for (const line of output.split("\n")) {
        const parts = line.split(" ");
        if (parts.length < 2) continue;

        const [path, ...rest] = parts;
        const branch = rest.find((p) => p.startsWith("branch"))?.split("/").pop();
        const commitHash = rest.find((p) => /^[0-9a-f]{40}$/.test(p));
        const prunable = rest.includes("prunable");

        if (path && commitHash) {
          worktrees.push({
            path,
            branch: branch || "unknown",
            commitHash,
            prunable,
          });
        }
      }

      return worktrees;
    } catch (err) {
      logger.debug(
        "workspace",
        `Failed to list worktrees: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }
}
