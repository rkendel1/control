import { spawn, execSync, type ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import treeKill from "tree-kill";
import { logger } from "../logger";
import { loadConfig } from "../config";
import { validateBinary, buildSafeEnv, scrubCredentials } from "../security";
import type {
  AgentRuntime,
  AgentExecutionRequest,
  AgentExecution,
  AgentEvent,
  RuntimeCapabilities,
  RuntimeDiscovery,
  AgentUsage,
} from "../runtime-types";

const MAX_STDOUT_SIZE = 10_000_000; // 10MB max captured output

interface ResolvedBinary {
  bin: string;
  prefixArgs: string[];
  originalPath: string;
}

interface ClaudeOutputMeta {
  totalCostUsd: number | null;
  numTurns: number | null;
  subtype: string | null;
  sessionId: string | null;
  isError: boolean;
  usage: ClaudeUsage | null;
}

interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

let cachedBinary: ResolvedBinary | null = null;

function resolveJsFromCmd(cmdPath: string): string | null {
  try {
    const content = readFileSync(cmdPath, "utf-8");
    const match = content.match(/%dp0%\\([^"]+\.js)/i) || content.match(/%dp0%\\([^\s"]+\.js)/i);
    if (match) {
      const dir = path.dirname(cmdPath);
      const jsPath = path.join(dir, match[1]);
      if (existsSync(jsPath)) {
        return jsPath;
      }
    }
  } catch {
    /* */
  }

  const dir = path.dirname(cmdPath);
  const standard = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  if (existsSync(standard)) {
    return standard;
  }

  return null;
}

function findClaudeBinary(): ResolvedBinary {
  if (cachedBinary) return cachedBinary;

  try {
    const config = loadConfig();
    if (config.execution.claudeBinaryPath) {
      logger.info("claude-runtime", `Using configured binary path: ${config.execution.claudeBinaryPath}`);
      cachedBinary = {
        bin: config.execution.claudeBinaryPath,
        prefixArgs: [],
        originalPath: config.execution.claudeBinaryPath,
      };
      return cachedBinary;
    }
  } catch {
    /* */
  }

  const candidates: string[] = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? "";
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const userProfile = process.env.USERPROFILE ?? "";

    candidates.push(
      path.join(appData, "npm", "claude.cmd"),
      path.join(appData, "npm", "claude"),
      path.join(localAppData, "pnpm", "claude.cmd"),
      path.join(localAppData, "pnpm", "claude"),
      path.join(userProfile, ".local", "bin", "claude"),
      path.join(userProfile, ".local", "bin", "claude.exe")
    );
  } else {
    const home = process.env.HOME ?? "";
    candidates.push(
      path.join(home, ".local", "bin", "claude"),
      path.join(home, ".npm-global", "bin", "claude"),
      "/usr/local/bin/claude",
      "/usr/bin/claude"
    );
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      logger.info("claude-runtime", `Found claude at: ${candidate}`);

      if (candidate.endsWith(".cmd")) {
        const jsEntry = resolveJsFromCmd(candidate);
        if (jsEntry) {
          logger.info("claude-runtime", `Resolved .cmd shim → ${jsEntry} (via node.exe)`);
          cachedBinary = {
            bin: process.execPath,
            prefixArgs: [jsEntry],
            originalPath: candidate,
          };
          return cachedBinary;
        }
      }

      cachedBinary = { bin: candidate, prefixArgs: [], originalPath: candidate };
      return cachedBinary;
    }
  }

  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 })
      .trim()
      .split("\n")[0]
      .trim();
    if (result) {
      logger.info("claude-runtime", `Found claude via PATH: ${result}`);

      if (result.endsWith(".cmd")) {
        const jsEntry = resolveJsFromCmd(result);
        if (jsEntry) {
          logger.info("claude-runtime", `Resolved .cmd shim → ${jsEntry} (via node.exe)`);
          cachedBinary = {
            bin: process.execPath,
            prefixArgs: [jsEntry],
            originalPath: result,
          };
          return cachedBinary;
        }
      }

      cachedBinary = { bin: result, prefixArgs: [], originalPath: result };
      return cachedBinary;
    }
  } catch {
    /* */
  }

  logger.warn("claude-runtime", "Could not auto-detect claude binary. Set 'claudeBinaryPath' in daemon-config.json or install Claude Code globally (npm i -g @anthropic-ai/claude-code)");
  return { bin: "claude", prefixArgs: [], originalPath: "claude" };
}

function parseClaudeOutput(stdout: string): ClaudeOutputMeta {
  const empty: ClaudeOutputMeta = {
    totalCostUsd: null,
    numTurns: null,
    subtype: null,
    sessionId: null,
    isError: false,
    usage: null,
  };

  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;

    const meta: ClaudeOutputMeta = {
      totalCostUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
      numTurns: typeof parsed.num_turns === "number" ? parsed.num_turns : null,
      subtype: typeof parsed.subtype === "string" ? parsed.subtype : null,
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : null,
      isError: parsed.is_error === true,
      usage: null,
    };

    if (parsed.usage && typeof parsed.usage === "object") {
      const u = parsed.usage as Record<string, unknown>;
      const usage: ClaudeUsage = {
        inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
        outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
        cacheReadInputTokens: typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : 0,
        cacheCreationInputTokens: typeof u.cache_creation_input_tokens === "number" ? u.cache_creation_input_tokens : 0,
      };
      meta.usage = usage;
    }

    return meta;
  } catch {
    return empty;
  }
}

/**
 * Claude Code runtime adapter.
 * Preserves existing behavior by wrapping the current AgentRunner implementation.
 */
export class ClaudeCodeRuntime implements AgentRuntime {
  readonly id = "claude-code";
  readonly name = "Claude Code";
  readonly capabilities: RuntimeCapabilities = {
    execute: true,
    streaming: true,
    toolCalling: true,
    resume: true,
    stop: true,
    structuredOutput: true,
  };

  private activeSessions = new Map<string, { pid: number; child: ChildProcess }>();

  async discover(): Promise<RuntimeDiscovery> {
    try {
      const resolved = findClaudeBinary();
      if (!existsSync(resolved.bin) && !resolved.bin.includes("claude")) {
        return {
          name: this.name,
          status: "unavailable",
          error: "Claude binary not found. Install with: npm i -g @anthropic-ai/claude-code",
        };
      }

      try {
        const result = execSync(`${resolved.bin} --version`, {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();

        return {
          name: this.name,
          status: "available",
          version: result,
        };
      } catch {
        return {
          name: this.name,
          status: "available",
          version: "unknown",
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
    const resolved = findClaudeBinary();

    if (!validateBinary(resolved.originalPath)) {
      return {
        runId: request.runId,
        exitCode: 1,
        output: "",
        error: `Security: binary "${resolved.originalPath}" is not in the allowed list`,
        timedOut: false,
        usage: {},
        events: [],
      };
    }

    const args: string[] = [
      ...resolved.prefixArgs,
      "-p",
      request.prompt,
      "--output-format",
      "json",
      "--max-turns",
      String(request.maxTurns),
    ];

    if (request.skipPermissionsPrompt) {
      args.push("--dangerously-skip-permissions");
      logger.security("claude-runtime", "Spawning with --dangerously-skip-permissions");
    } else if (request.allowedTools && request.allowedTools.length > 0) {
      args.push("--allowedTools", ...request.allowedTools);
      logger.info("claude-runtime", `Allowed tools: ${request.allowedTools.join(", ")}`);
    }

    const safeEnv = buildSafeEnv({});

    logger.debug("claude-runtime", `Spawning: ${resolved.bin} -p "<prompt>" --max-turns ${request.maxTurns}`);
    logger.debug("claude-runtime", `CWD: ${request.workingDirectory}`);

    return new Promise<AgentExecution>((resolve) => {
      const child: ChildProcess = spawn(resolved.bin, args, {
        cwd: request.workingDirectory,
        env: safeEnv as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const pid = child.pid ?? 0;
      this.activeSessions.set(request.runId, { pid, child });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      const events: AgentEvent[] = [];

      // Emit started event
      const startedEvent: AgentEvent = {
        type: "started",
        runId: request.runId,
        timestamp: new Date().toISOString(),
        data: { pid },
      };
      events.push(startedEvent);
      request.onEvent?.(startedEvent);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_STDOUT_SIZE) {
          stdout += chunk.toString();
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_STDOUT_SIZE) {
          stderr += chunk.toString();
        }
      });

      const timeoutMs = request.timeoutMinutes * 60 * 1000;
      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        logger.warn("claude-runtime", `Process ${pid} timed out after ${request.timeoutMinutes} minutes — killing`);

        treeKill(pid, "SIGTERM", (err?: Error) => {
          if (err) {
            logger.error("claude-runtime", `Failed to kill process tree ${pid}: ${err.message}`);
            try {
              child.kill("SIGKILL");
            } catch {
              /* */
            }
          }
        });
      }, timeoutMs);

      child.on("close", (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeSessions.delete(request.runId);

        if (exitCode !== null && exitCode !== 0 && !timedOut) {
          if (stderr.trim()) {
            logger.error("claude-runtime", `Process ${pid} stderr: ${scrubCredentials(stderr.slice(0, 500))}`);
          }
          if (stdout.trim()) {
            logger.debug("claude-runtime", `Process ${pid} stdout (first 500 chars): ${scrubCredentials(stdout.slice(0, 500))}`);
          }
          if (!stderr.trim() && !stdout.trim()) {
            logger.warn("claude-runtime", `Process ${pid} exited with code ${exitCode} but produced no output`);
          }
        }

        const meta = parseClaudeOutput(stdout);
        const usage: AgentUsage = meta.usage
          ? {
              inputTokens: meta.usage.inputTokens,
              outputTokens: meta.usage.outputTokens,
              cacheReadTokens: meta.usage.cacheReadInputTokens,
              cacheWriteTokens: meta.usage.cacheCreationInputTokens,
              estimatedCostUsd: meta.totalCostUsd ?? undefined,
            }
          : {};

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
          usage,
          events,
        });
      });

      child.on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeSessions.delete(request.runId);

        const binPath = resolved.originalPath;
        let errorMsg = err.message;
        if (err.message.includes("ENOENT")) {
          errorMsg = `Claude binary not found (${binPath}). Set "claudeBinaryPath" in daemon-config.json or install Claude Code globally: npm i -g @anthropic-ai/claude-code`;
          cachedBinary = null;
        }

        logger.error("claude-runtime", errorMsg);

        const failedEvent: AgentEvent = {
          type: "failed",
          runId: request.runId,
          timestamp: new Date().toISOString(),
          data: { error: scrubCredentials(errorMsg) },
        };
        events.push(failedEvent);
        request.onEvent?.(failedEvent);

        resolve({
          runId: request.runId,
          exitCode: 1,
          output: "",
          error: scrubCredentials(errorMsg),
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
          logger.error("claude-runtime", `Failed to kill session ${session.pid}: ${err.message}`);
        } else {
          logger.info("claude-runtime", `Killed session ${session.pid}`);
        }
        this.activeSessions.delete(runId);
        resolve();
      });
    });
  }
}
