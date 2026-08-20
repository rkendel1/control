import { spawn, execSync } from "child_process";
import { existsSync } from "fs";
import treeKill from "tree-kill";
import { logger } from "../logger";
import { scrubCredentials } from "../security";
import type {
  AgentRuntime,
  AgentExecutionRequest,
  AgentExecution,
  AgentEvent,
  RuntimeCapabilities,
  RuntimeDiscovery,
} from "../runtime-types";

const MAX_STDOUT_SIZE = 10_000_000; // 10MB max captured output

/**
 * Generic command-based runtime.
 * Allows Mission Control to delegate to any locally executable agent (OpenCode, Codex, Aider, etc.)
 */
export class CommandRuntime implements AgentRuntime {
  readonly id: string;
  readonly name: string;
  readonly capabilities: RuntimeCapabilities = {
    execute: true,
    streaming: false,
    toolCalling: false, // Depends on the command
    resume: false,
    stop: true,
    structuredOutput: false,
  };

  private command: string;
  private args: string[];
  private activeSessions = new Map<string, { pid: number }>();

  constructor(
    id: string,
    name: string,
    command: string,
    args: string[] = []
  ) {
    this.id = id;
    this.name = name;
    this.command = command;
    this.args = args;
  }

  async discover(): Promise<RuntimeDiscovery> {
    try {
      // Try to find the command in PATH
      const checkCmd = process.platform === "win32" ? `where ${this.command}` : `which ${this.command}`;
      try {
        execSync(checkCmd, { encoding: "utf-8", timeout: 5000, stdio: "pipe" });
      } catch {
        return {
          name: this.name,
          status: "unavailable",
          error: `Executable not found: ${this.command}. Install it or add to PATH.`,
        };
      }

      // Try to get version info
      try {
        const versionResult = execSync(`${this.command} --version`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();

        return {
          name: this.name,
          status: "available",
          version: versionResult,
        };
      } catch {
        return {
          name: this.name,
          status: "available",
        };
      }
    } catch (err) {
      return {
        name: this.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecution> {
    const events: AgentEvent[] = [];

    // Emit started event
    const startedEvent: AgentEvent = {
      type: "started",
      runId: request.runId,
      timestamp: new Date().toISOString(),
      data: { command: this.command },
    };
    events.push(startedEvent);
    request.onEvent?.(startedEvent);

    return new Promise<AgentExecution>((resolve) => {
      // Build args, replacing placeholders
      const resolvedArgs = this.args.map((arg) => {
        if (arg === "{{prompt}}") return request.prompt;
        if (arg === "{{workspace}}") return request.workingDirectory;
        return arg;
      });

      logger.debug("command-runtime", `Spawning: ${this.command} ${resolvedArgs.join(" ")}`);
      logger.debug("command-runtime", `CWD: ${request.workingDirectory}`);

      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const child = spawn(this.command, resolvedArgs, {
        cwd: request.workingDirectory,
        env: { ...process.env, ...request.environment },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const pid = child.pid ?? 0;
      this.activeSessions.set(request.runId, { pid });

      // Capture stdout
      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_STDOUT_SIZE) {
          stdout += chunk.toString();
        }
      });

      // Capture stderr
      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_STDOUT_SIZE) {
          stderr += chunk.toString();
        }
      });

      // Timeout enforcement
      const timeoutMs = request.timeoutMinutes * 60 * 1000;
      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        logger.warn("command-runtime", `Process ${pid} timed out after ${request.timeoutMinutes} minutes — killing`);

        treeKill(pid, "SIGTERM", (err?: Error) => {
          if (err) {
            logger.error("command-runtime", `Failed to kill process tree ${pid}: ${err.message}`);
            try {
              child.kill("SIGKILL");
            } catch {
              /* */
            }
          }
        });
      }, timeoutMs);

      // Process exit
      child.on("close", (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeSessions.delete(request.runId);

        const durationMs = Date.now() - startTime;

        if (exitCode !== null && exitCode !== 0 && !timedOut) {
          if (stderr.trim()) {
            logger.error("command-runtime", `Process ${pid} stderr: ${scrubCredentials(stderr.slice(0, 500))}`);
          }
          if (stdout.trim()) {
            logger.debug("command-runtime", `Process ${pid} stdout (first 500 chars): ${scrubCredentials(stdout.slice(0, 500))}`);
          }
        }

        const outputEvent: AgentEvent = {
          type: "output",
          runId: request.runId,
          timestamp: new Date().toISOString(),
          data: { content: scrubCredentials(stdout) },
        };
        events.push(outputEvent);
        request.onEvent?.(outputEvent);

        const completedEvent: AgentEvent = {
          type: "completed",
          runId: request.runId,
          timestamp: new Date().toISOString(),
          data: { exitCode: exitCode ?? 1, output: scrubCredentials(stdout) },
        };
        events.push(completedEvent);
        request.onEvent?.(completedEvent);

        resolve({
          runId: request.runId,
          exitCode: exitCode ?? 1,
          output: scrubCredentials(stdout),
          error: scrubCredentials(stderr),
          timedOut,
          usage: { durationMs },
          events,
        });
      });

      // Spawn error
      child.on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeSessions.delete(request.runId);

        logger.error("command-runtime", `Spawn error: ${err.message}`);

        const failedEvent: AgentEvent = {
          type: "failed",
          runId: request.runId,
          timestamp: new Date().toISOString(),
          data: { error: scrubCredentials(err.message) },
        };
        events.push(failedEvent);
        request.onEvent?.(failedEvent);

        resolve({
          runId: request.runId,
          exitCode: 1,
          output: "",
          error: scrubCredentials(err.message),
          timedOut: false,
          usage: {},
          events,
        });
      });
    });
  }

  async stop(runId: string): Promise<void> {
    const session = this.activeSessions.get(runId);
    if (!session) return;

    return new Promise((resolve) => {
      treeKill(session.pid, "SIGTERM", (err?: Error) => {
        if (err) {
          logger.error("command-runtime", `Failed to kill session ${session.pid}: ${err.message}`);
        } else {
          logger.info("command-runtime", `Killed session ${session.pid}`);
        }
        this.activeSessions.delete(runId);
        resolve();
      });
    });
  }
}
