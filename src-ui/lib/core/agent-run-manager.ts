/**
 * Agent Run Manager
 *
 * Manages agent lifecycle with explicit recovery states.
 * Never leaves an agent in zombie RUNNING state.
 * Persists recovery information for restart scenarios.
 */

import type { AgentRun, AgentRunStatus, AgentRecoveryState, GitStateSnapshot } from "@/types/production";
import { getLogger } from "./structured-logger";

const logger = getLogger("agent");

export class AgentRunManager {
  private runs: Map<string, AgentRun> = new Map();
  private statusChangeListeners: Array<(run: AgentRun) => void> = [];

  /**
   * Create a new agent run
   */
  createRun(input: {
    taskId: string;
    projectId: string;
    workspaceId: string;
    targetId: string;
    command: string;
    workingDirectory: string;
  }): AgentRun {
    const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const run: AgentRun = {
      id,
      taskId: input.taskId,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      targetId: input.targetId,
      status: "QUEUED",
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
      command: input.command,
      workingDirectory: input.workingDirectory,
      output: "",
      recoveryState: {
        checkpointedAt: Date.now(),
        filesWritten: [],
        workspaceValid: true,
        canResume: false,
      },
    };

    this.runs.set(id, run);
    logger.withContext("agent_run_created", { task: input.taskId }, { agentId: id });

    return run;
  }

  /**
   * Get agent run by ID
   */
  getRun(id: string): AgentRun | undefined {
    return this.runs.get(id);
  }

  /**
   * Update agent run status
   */
  setStatus(id: string, status: AgentRunStatus, details?: { error?: string; exitCode?: number }): void {
    const run = this.runs.get(id);
    if (!run) {
      logger.error("agent_run_not_found", { agentId: id });
      return;
    }

    const oldStatus = run.status;
    run.status = status;
    run.lastHeartbeat = Date.now();

    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
      run.completedAt = Date.now();
    }

    if (details?.error) {
      run.error = details.error;
    }

    if (details?.exitCode !== undefined) {
      run.exitCode = details.exitCode;
    }

    logger.withContext("agent_status_changed", { task: run.taskId }, { from: oldStatus, to: status, agentId: id });

    this.notifyStatusChange(run);
  }

  /**
   * Append output to agent run
   */
  appendOutput(id: string, output: string): void {
    const run = this.runs.get(id);
    if (!run) return;

    run.output += output;
    run.lastHeartbeat = Date.now();
  }

  /**
   * Update heartbeat (keep-alive signal)
   */
  updateHeartbeat(id: string): void {
    const run = this.runs.get(id);
    if (run) {
      run.lastHeartbeat = Date.now();
    }
  }

  /**
   * Checkpoint agent recovery state
   */
  checkpoint(
    id: string,
    state: {
      filesWritten: string[];
      gitState?: GitStateSnapshot;
      workspaceValid: boolean;
      canResume: boolean;
    }
  ): void {
    const run = this.runs.get(id);
    if (!run) return;

    run.recoveryState = {
      checkpointedAt: Date.now(),
      filesWritten: state.filesWritten,
      gitStateSnapshot: state.gitState,
      workspaceValid: state.workspaceValid,
      canResume: state.canResume,
    };

    logger.debug("agent_checkpoint", { agentId: id });
  }

  /**
   * Handle agent crash - convert RUNNING to INTERRUPTED
   */
  handleCrash(id: string, error: string): void {
    const run = this.runs.get(id);
    if (!run) return;

    logger.error("agent_crash", { agentId: id, taskId: run.taskId }, error);

    if (run.status === "RUNNING" || run.status === "WAITING_FOR_INPUT") {
      this.setStatus(id, "INTERRUPTED", { error: `Agent crashed: ${error}` });
    }
  }

  /**
   * Detect and recover orphaned agent runs on startup
   * Returns runs that were RUNNING but process is gone
   */
  detectOrphanedRuns(): AgentRun[] {
    const orphaned: AgentRun[] = [];

    for (const run of this.runs.values()) {
      if ((run.status === "RUNNING" || run.status === "WAITING_FOR_INPUT") && !run.completedAt) {
        // Check if process still exists (would be checked against actual process list)
        // For now, any RUNNING without heartbeat in last minute is orphaned
        const minuteAgo = Date.now() - 60000;
        if (run.lastHeartbeat < minuteAgo) {
          orphaned.push(run);
          this.setStatus(run.id, "INTERRUPTED", {
            error: "Process lost - recovered from crash",
          });
        }
      }
    }

    return orphaned;
  }

  /**
   * Get all active runs (RUNNING or WAITING_FOR_INPUT)
   */
  getActiveRuns(): AgentRun[] {
    return Array.from(this.runs.values()).filter((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_INPUT");
  }

  /**
   * Get all runs for a task
   */
  getRunsForTask(taskId: string): AgentRun[] {
    return Array.from(this.runs.values()).filter((r) => r.taskId === taskId);
  }

  /**
   * Get run history (completed runs)
   */
  getHistory(limit: number = 100): AgentRun[] {
    return Array.from(this.runs.values())
      .filter((r) => r.completedAt)
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
      .slice(0, limit);
  }

  /**
   * Get failed runs
   */
  getFailedRuns(): AgentRun[] {
    return Array.from(this.runs.values()).filter((r) => r.status === "FAILED" || r.status === "INTERRUPTED");
  }

  /**
   * Cancel a run gracefully
   */
  cancel(id: string, reason?: string): void {
    const run = this.runs.get(id);
    if (!run) return;

    if (run.status !== "COMPLETED" && run.status !== "FAILED" && run.status !== "CANCELLED") {
      this.setStatus(id, "CANCELLED", { error: reason || "Cancelled by user" });
      logger.info("agent_cancelled", { agentId: id, taskId: run.taskId }, reason);
    }
  }

  /**
   * Request user input for agent
   */
  requestInput(id: string, prompt: string): void {
    const run = this.runs.get(id);
    if (!run) return;

    run.status = "WAITING_FOR_INPUT";
    run.lastHeartbeat = Date.now();
    logger.info("agent_input_requested", { agentId: id }, prompt);

    this.notifyStatusChange(run);
  }

  /**
   * Provide input to waiting agent
   */
  provideInput(id: string, input: string): void {
    const run = this.runs.get(id);
    if (!run) return;

    if (run.status === "WAITING_FOR_INPUT") {
      run.input = input;
      run.status = "RUNNING";
      run.lastHeartbeat = Date.now();
      logger.debug("agent_input_provided", { agentId: id });

      this.notifyStatusChange(run);
    }
  }

  /**
   * Get summary of all runs
   */
  getSummary(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    interrupted: number;
  } {
    const runs = Array.from(this.runs.values());
    return {
      total: runs.length,
      active: runs.filter((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_INPUT").length,
      completed: runs.filter((r) => r.status === "COMPLETED").length,
      failed: runs.filter((r) => r.status === "FAILED").length,
      interrupted: runs.filter((r) => r.status === "INTERRUPTED").length,
    };
  }

  /**
   * Register status change listener
   */
  onStatusChange(listener: (run: AgentRun) => void): void {
    this.statusChangeListeners.push(listener);
  }

  /**
   * Notify listeners of status change
   */
  private notifyStatusChange(run: AgentRun): void {
    this.statusChangeListeners.forEach((listener) => {
      try {
        listener(run);
      } catch (err) {
        logger.error("listener_error", {}, String(err));
      }
    });
  }

  /**
   * Clear run history (keep active/recent)
   */
  clearHistory(olderThanDays: number = 7): void {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const before = this.runs.size;

    for (const [id, run] of this.runs.entries()) {
      if (run.completedAt && run.completedAt < cutoff && run.status === "COMPLETED") {
        this.runs.delete(id);
      }
    }

    logger.info("history_cleared", {}, `Removed ${before - this.runs.size} old runs`);
  }
}

// Global instance
let manager: AgentRunManager | null = null;

/**
 * Get or create global agent run manager
 */
export function getAgentRunManager(): AgentRunManager {
  if (!manager) {
    manager = new AgentRunManager();
  }
  return manager;
}
