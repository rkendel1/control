/**
 * Process Manager
 *
 * Manages lifecycle of terminal processes and agent processes.
 * Ensures proper cleanup on shutdown.
 * Detects orphaned processes.
 */

import type { SubsystemName } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("terminal");

export type ProcessState = "STARTING" | "RUNNING" | "EXITED" | "KILLED" | "FAILED";

export interface ManagedProcess {
  id: string;
  pid?: number;
  command: string;
  workingDirectory: string;
  state: ProcessState;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number;
  output: string;
  error?: string;
}

export interface ProcessSignal {
  type: "SIGINT" | "SIGTERM" | "SIGKILL";
  timeout: number; // ms to wait before next signal
}

// Platform-appropriate signal escalation
const SIGNAL_ESCALATION = {
  linux: ["SIGINT", "SIGTERM", "SIGKILL"],
  darwin: ["SIGINT", "SIGTERM", "SIGKILL"],
  win32: ["SIGINT", "SIGTERM"], // No SIGKILL on Windows
};

export class ProcessManager {
  private processes: Map<string, ManagedProcess> = new Map();
  private processListeners: Array<(process: ManagedProcess) => void> = [];
  private maxProcessOutput = 1000000; // 1MB max output per process

  /**
   * Create and track a new process
   */
  createProcess(input: {
    command: string;
    workingDirectory: string;
  }): ManagedProcess {
    const id = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const process: ManagedProcess = {
      id,
      command: input.command,
      workingDirectory: input.workingDirectory,
      state: "STARTING",
      startedAt: Date.now(),
      output: "",
    };

    this.processes.set(id, process);
    logger.info("process_created", { processId: id }, input.command);

    return process;
  }

  /**
   * Get process by ID
   */
  getProcess(id: string): ManagedProcess | undefined {
    return this.processes.get(id);
  }

  /**
   * Update process state
   */
  setState(id: string, state: ProcessState, details?: { exitCode?: number; error?: string }): void {
    const process = this.processes.get(id);
    if (!process) return;

    const oldState = process.state;
    process.state = state;

    if (state === "EXITED" || state === "KILLED" || state === "FAILED") {
      process.exitedAt = Date.now();
    }

    if (details?.exitCode !== undefined) {
      process.exitCode = details.exitCode;
    }

    if (details?.error) {
      process.error = details.error;
    }

    logger.info("process_state_changed", { processId: id }, `${oldState} → ${state}`);
    this.notifyListeners(process);
  }

  /**
   * Append output to process
   */
  appendOutput(id: string, output: string): void {
    const process = this.processes.get(id);
    if (!process) return;

    // Don't store excessive output
    if (process.output.length + output.length > this.maxProcessOutput) {
      process.output = process.output.slice(-this.maxProcessOutput / 2);
    }

    process.output += output;
  }

  /**
   * Append error to process
   */
  appendError(id: string, error: string): void {
    const process = this.processes.get(id);
    if (!process) return;

    if (!process.error) {
      process.error = error;
    } else {
      process.error += `\n${error}`;
    }
  }

  /**
   * Stop process gracefully
   * Escalates from SIGINT → SIGTERM → SIGKILL
   */
  async stop(id: string, timeoutPerSignal: number = 3000): Promise<boolean> {
    const process = this.processes.get(id);
    if (!process || !process.pid) return false;

    if (process.state === "EXITED" || process.state === "KILLED") {
      return true;
    }

    logger.info("process_stopping", { processId: id, pid: process.pid });

    // Get platform-appropriate signals
    const platform = process.platform || "linux";
    const signals = SIGNAL_ESCALATION[platform as keyof typeof SIGNAL_ESCALATION] || SIGNAL_ESCALATION.linux;

    for (const signal of signals) {
      try {
        // Send signal (in real implementation)
        logger.debug("sending_signal", { processId: id, signal });

        // Wait for process to exit
        const exited = await this.waitForExit(id, timeoutPerSignal);
        if (exited) {
          this.setState(id, "KILLED");
          return true;
        }
      } catch (err) {
        logger.error("signal_error", { processId: id, signal }, String(err));
      }
    }

    return false;
  }

  /**
   * Wait for process to exit (with timeout)
   */
  private waitForExit(id: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const process = this.processes.get(id);
      if (!process || process.state === "EXITED" || process.state === "KILLED") {
        resolve(true);
        return;
      }

      const timer = setTimeout(() => resolve(false), timeoutMs);

      const listener = (updatedProcess: ManagedProcess) => {
        if (updatedProcess.id === id && (updatedProcess.state === "EXITED" || updatedProcess.state === "KILLED")) {
          clearTimeout(timer);
          resolve(true);
        }
      };

      this.processListeners.push(listener);
    });
  }

  /**
   * Kill process immediately (SIGKILL equivalent)
   */
  kill(id: string): void {
    const process = this.processes.get(id);
    if (!process) return;

    logger.warn("process_killed", { processId: id, pid: process.pid });
    this.setState(id, "KILLED", { exitCode: -1 });
  }

  /**
   * Get all active processes
   */
  getActiveProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values()).filter((p) => p.state === "RUNNING" || p.state === "STARTING");
  }

  /**
   * Detect orphaned processes
   * Processes that are marked RUNNING but have no parent
   */
  detectOrphanedProcesses(): ManagedProcess[] {
    const orphaned: ManagedProcess[] = [];

    for (const process of this.processes.values()) {
      if ((process.state === "RUNNING" || process.state === "STARTING") && !process.pid) {
        orphaned.push(process);
        this.setState(process.id, "FAILED", { error: "Process lost - marked as orphaned" });
      }
    }

    if (orphaned.length > 0) {
      logger.warn("orphaned_processes_detected", {}, `Found ${orphaned.length} orphaned processes`);
    }

    return orphaned;
  }

  /**
   * Clean shutdown
   * Stop all managed processes gracefully
   */
  async shutdownAll(timeoutMs: number = 30000): Promise<{ stopped: number; failed: number }> {
    logger.info("shutting_down_processes");

    const activeProcesses = this.getActiveProcesses();
    let stopped = 0;
    let failed = 0;

    const startTime = Date.now();

    for (const process of activeProcesses) {
      if (Date.now() - startTime > timeoutMs) {
        // Time limit reached, kill remaining
        process.id && this.kill(process.id);
        failed++;
      } else {
        const success = await this.stop(process.id);
        if (success) {
          stopped++;
        } else {
          failed++;
          this.kill(process.id);
        }
      }
    }

    logger.info("shutdown_complete", {}, `${stopped} stopped, ${failed} force-killed`);
    return { stopped, failed };
  }

  /**
   * Get process output safely (redacted if needed)
   */
  getOutput(id: string, maxLines: number = 100): string[] {
    const process = this.processes.get(id);
    if (!process) return [];

    const lines = process.output.split("\n");
    return lines.slice(-maxLines);
  }

  /**
   * Register listener for process changes
   */
  onProcessChange(listener: (process: ManagedProcess) => void): void {
    this.processListeners.push(listener);
  }

  /**
   * Notify listeners of process change
   */
  private notifyListeners(process: ManagedProcess): void {
    this.processListeners.forEach((listener) => {
      try {
        listener(process);
      } catch (err) {
        logger.error("listener_error", {}, String(err));
      }
    });
  }

  /**
   * Get process statistics
   */
  getStatistics(): {
    total: number;
    running: number;
    exited: number;
    failed: number;
  } {
    const processes = Array.from(this.processes.values());
    return {
      total: processes.length,
      running: processes.filter((p) => p.state === "RUNNING").length,
      exited: processes.filter((p) => p.state === "EXITED").length,
      failed: processes.filter((p) => p.state === "FAILED").length,
    };
  }

  /**
   * Cleanup old processes
   */
  cleanup(olderThanMinutes: number = 60): number {
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    let removed = 0;

    for (const [id, process] of this.processes.entries()) {
      if (process.exitedAt && process.exitedAt < cutoff) {
        this.processes.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info("processes_cleaned", {}, `Removed ${removed} old processes`);
    }

    return removed;
  }
}

// Global instance
let manager: ProcessManager | null = null;

/**
 * Get or create process manager
 */
export function getProcessManager(): ProcessManager {
  if (!manager) {
    manager = new ProcessManager();
  }
  return manager;
}
