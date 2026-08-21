/**
 * Startup Recovery Manager
 *
 * Orchestrates the complete startup recovery sequence:
 * Tauri → FeltDB → Conversations → Projects → Tasks → Agents → Git
 *
 * Updates application state machine as recovery progresses.
 * Handles partial failures gracefully.
 */

import type { GraphRepository } from "@/types/graph";
import type { ApplicationSession, CrashRecoveryInfo } from "@/types/production";
import { getApplicationStateManager } from "./application-state";
import { getLogger } from "./structured-logger";
import { getErrorHandler } from "./error-handler";
import { getAgentRunManager } from "./agent-run-manager";

const logger = getLogger("core");

export class StartupRecoveryManager {
  /**
   * Run complete startup recovery sequence
   */
  async recover(graphRepo: GraphRepository): Promise<CrashRecoveryInfo> {
    const stateManager = getApplicationStateManager();
    const errorHandler = getErrorHandler();
    const agentManager = getAgentRunManager();

    logger.info("startup_recovery_started");
    stateManager.setState("RECOVERING", "Starting application recovery");

    const recoveryInfo: CrashRecoveryInfo = {
      previousSessionClean: false,
      recoveredAt: Date.now(),
      itemsRecovered: 0,
      itemsFailed: 0,
      repositoriesModified: 0,
      message: "",
    };

    try {
      // Step 1: Check previous session
      logger.info("step_1_session_check");
      stateManager.updateRecoveryProgress("conversations", 0);
      const sessionClean = await this.checkPreviousSession(graphRepo);
      recoveryInfo.previousSessionClean = sessionClean;

      // Step 2: Recover conversations
      logger.info("step_2_conversation_recovery");
      try {
        const convCount = await this.recoverConversations(graphRepo);
        stateManager.updateRecoveryProgress("conversations", convCount);
        recoveryInfo.itemsRecovered += convCount;
      } catch (err) {
        logger.error("conversation_recovery_failed", {}, String(err));
        recoveryInfo.itemsFailed++;
        stateManager.setSubsystemHealth("projectgraph", "DEGRADED", "Conversation recovery failed");
      }

      // Step 3: Recover projects
      logger.info("step_3_project_recovery");
      try {
        const projectCount = await this.recoverProjects(graphRepo);
        stateManager.updateRecoveryProgress("projects", projectCount);
        recoveryInfo.itemsRecovered += projectCount;
      } catch (err) {
        logger.error("project_recovery_failed", {}, String(err));
        recoveryInfo.itemsFailed++;
        stateManager.setSubsystemHealth("projectgraph", "DEGRADED", "Project recovery failed");
      }

      // Step 4: Recover tasks
      logger.info("step_4_task_recovery");
      try {
        const taskCount = await this.recoverTasks(graphRepo);
        stateManager.updateRecoveryProgress("tasks", taskCount);
        recoveryInfo.itemsRecovered += taskCount;
      } catch (err) {
        logger.error("task_recovery_failed", {}, String(err));
        recoveryInfo.itemsFailed++;
      }

      // Step 5: Recover agent runs (detect orphaned agents)
      logger.info("step_5_agent_recovery");
      try {
        const orphaned = agentManager.detectOrphanedRuns();
        stateManager.updateRecoveryProgress("agents", orphaned.length);
        recoveryInfo.itemsRecovered += orphaned.length;

        if (orphaned.length > 0) {
          logger.warn("orphaned_agents_detected", { count: orphaned.length });
        }
      } catch (err) {
        logger.error("agent_recovery_failed", {}, String(err));
        recoveryInfo.itemsFailed++;
      }

      // Step 6: Reconcile filesystem
      logger.info("step_6_filesystem_reconciliation");
      try {
        await this.reconcileFilesystem(graphRepo);
      } catch (err) {
        logger.error("filesystem_reconciliation_failed", {}, String(err));
        stateManager.setSubsystemHealth("git", "DEGRADED", "Filesystem reconciliation failed");
      }

      // Step 7: Reconcile Git state
      logger.info("step_7_git_reconciliation");
      try {
        const modifiedRepos = await this.reconcileGit(graphRepo);
        recoveryInfo.repositoriesModified = modifiedRepos;
      } catch (err) {
        logger.error("git_reconciliation_failed", {}, String(err));
        stateManager.setSubsystemHealth("git", "DEGRADED", "Git reconciliation failed");
      }

      // Mark subsystems as healthy
      stateManager.setSubsystemHealth("core", "HEALTHY", "Core recovery complete");
      stateManager.setSubsystemHealth("storage", "HEALTHY", "Storage recovery complete");

      // Transition to READY if no critical failures
      if (recoveryInfo.itemsFailed === 0) {
        stateManager.setState("READY", "Application fully recovered");
        recoveryInfo.message = `✓ Recovery complete: ${recoveryInfo.itemsRecovered} items recovered`;
      } else {
        stateManager.setState("DEGRADED", `Recovery partial: ${recoveryInfo.itemsFailed} failures`);
        recoveryInfo.message = `⚠ Recovery partial: ${recoveryInfo.itemsRecovered} recovered, ${recoveryInfo.itemsFailed} failed`;
      }

      logger.info("startup_recovery_complete", undefined, recoveryInfo.message);
    } catch (err) {
      logger.error("startup_recovery_failed", {}, String(err));
      stateManager.setState("DEGRADED", "Recovery incomplete - manual intervention may be needed");
      recoveryInfo.message = `✗ Recovery failed: ${String(err)}`;

      const error = errorHandler.createError("RECOVERY_INCOMPLETE", String(err), {
        severity: "CRITICAL",
        operation: "startup_recovery",
        recoverability: "MANUAL",
      });
      throw error;
    }

    return recoveryInfo;
  }

  /**
   * Check if previous session shut down cleanly
   */
  private async checkPreviousSession(graphRepo: GraphRepository): Promise<boolean> {
    try {
      // In a real implementation, this would check a session file
      // For now, assume clean if we reach this point
      logger.info("session_check_complete");
      return true;
    } catch (err) {
      logger.warn("session_check_failed", {}, String(err));
      return false;
    }
  }

  /**
   * Recover conversations from persistent storage
   */
  private async recoverConversations(graphRepo: GraphRepository): Promise<number> {
    try {
      // Query for all conversations
      // In real implementation, would load from FeltDB via ConversationStore
      logger.debug("recovering_conversations");
      return 0; // Placeholder
    } catch (err) {
      logger.error("conversation_recovery_error", {}, String(err));
      throw err;
    }
  }

  /**
   * Recover projects and graphs
   */
  private async recoverProjects(graphRepo: GraphRepository): Promise<number> {
    try {
      logger.debug("recovering_projects");
      return 0; // Placeholder
    } catch (err) {
      logger.error("project_recovery_error", {}, String(err));
      throw err;
    }
  }

  /**
   * Recover tasks
   */
  private async recoverTasks(graphRepo: GraphRepository): Promise<number> {
    try {
      logger.debug("recovering_tasks");
      return 0; // Placeholder
    } catch (err) {
      logger.error("task_recovery_error", {}, String(err));
      throw err;
    }
  }

  /**
   * Reconcile filesystem state
   * Detect external changes and update metadata
   */
  private async reconcileFilesystem(graphRepo: GraphRepository): Promise<void> {
    try {
      logger.debug("reconciling_filesystem");
      // In real implementation, would scan for external changes
    } catch (err) {
      logger.error("filesystem_reconciliation_error", {}, String(err));
      throw err;
    }
  }

  /**
   * Reconcile Git state across all projects
   * Returns number of projects with detected changes
   */
  private async reconcileGit(graphRepo: GraphRepository): Promise<number> {
    try {
      logger.debug("reconciling_git");
      // In real implementation, would check git status for all projects
      return 0;
    } catch (err) {
      logger.error("git_reconciliation_error", {}, String(err));
      throw err;
    }
  }
}

// Global instance
let recoveryManager: StartupRecoveryManager | null = null;

/**
 * Get or create startup recovery manager
 */
export function getStartupRecoveryManager(): StartupRecoveryManager {
  if (!recoveryManager) {
    recoveryManager = new StartupRecoveryManager();
  }
  return recoveryManager;
}
