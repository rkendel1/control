import { spawn } from "child_process";
import treeKill from "tree-kill";
import { logger } from "../logger";
import type {
  AgentRuntime,
  AgentExecutionRequest,
  AgentExecution,
  AgentEvent,
  RuntimeCapabilities,
  RuntimeDiscovery,
  OllamaDiscovery,
  AgentUsage,
} from "../runtime-types";

/**
 * Ollama runtime adapter.
 * Executes coding agents locally via Ollama's API.
 * Supports tool calling if the model is capable.
 */
export class OllamaRuntime implements AgentRuntime {
  readonly id = "ollama";
  readonly name = "Ollama (Local)";
  readonly capabilities: RuntimeCapabilities = {
    execute: true,
    streaming: false, // For now, we'll parse full response
    toolCalling: true, // Depends on model
    resume: false, // Not implemented yet
    stop: true,
    structuredOutput: false, // Depends on model
  };

  private baseUrl: string;
  private model: string;
  private activeSessions = new Map<string, { pid: number }>();

  constructor(baseUrl: string = "http://127.0.0.1:11434", model: string = "qwen2.5-coder:latest") {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async discover(): Promise<RuntimeDiscovery | OllamaDiscovery> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { timeout: 5000 });

      if (!response.ok) {
        return {
          name: this.name,
          status: "unavailable",
          error: `Ollama server returned ${response.status}. Is it running? (ollama serve)`,
        };
      }

      const data = (await response.json()) as { models?: Array<{ name: string; size: number; details?: Record<string, unknown> }> };

      if (!Array.isArray(data.models)) {
        return {
          name: this.name,
          status: "error",
          error: "Ollama API returned unexpected format",
        };
      }

      const models = data.models.map((m) => ({
        name: m.name,
        size: m.size,
        quantization: (m.details as any)?.quantization_level ?? "unknown",
      }));

      return {
        name: this.name,
        status: "available",
        baseUrl: this.baseUrl,
        models,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("ECONNREFUSED")) {
        return {
          name: this.name,
          status: "unavailable",
          error: `Cannot connect to Ollama at ${this.baseUrl}. Is it running? (ollama serve)`,
        };
      }
      return {
        name: this.name,
        status: "error",
        error: errorMsg,
      };
    }
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecution> {
    const events: AgentEvent[] = [];
    const startedEvent: AgentEvent = {
      type: "started",
      runId: request.runId,
      timestamp: new Date().toISOString(),
      data: { model: this.model },
    };
    events.push(startedEvent);
    request.onEvent?.(startedEvent);

    try {
      // Build the system prompt with context
      const systemPrompt = `You are a coding assistant. You have access to the following tools for interacting with the filesystem and shell:

${this.buildToolContext(request.permissions)}

You are working in: ${request.workingDirectory}

Current instructions:
${request.prompt}

Always:
1. Think step-by-step before making changes
2. Test your changes when possible
3. Report completion clearly
4. If blocked, explain what you need`;

      const startTime = Date.now();

      // Call Ollama API
      const response = await this.callOllama({
        model: this.model,
        prompt: systemPrompt,
        stream: false,
        system: systemPrompt,
        options: {
          num_ctx: 4096,
          temperature: 0.3,
          top_k: 40,
          top_p: 0.9,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const failedEvent: AgentEvent = {
          type: "failed",
          runId: request.runId,
          timestamp: new Date().toISOString(),
          data: { error: `Ollama API error: ${response.status}` },
        };
        events.push(failedEvent);
        request.onEvent?.(failedEvent);

        return {
          runId: request.runId,
          exitCode: 1,
          output: "",
          error: `Ollama API error: ${response.status} - ${errorText}`,
          timedOut: false,
          usage: {},
          events,
        };
      }

      const data = (await response.json()) as {
        response?: string;
        model?: string;
        eval_count?: number;
        prompt_eval_count?: number;
        eval_duration?: number;
        prompt_eval_duration?: number;
      };

      const durationMs = Date.now() - startTime;
      const output = data.response || "";

      const usage: AgentUsage = {
        outputTokens: data.eval_count ?? 0,
        inputTokens: data.prompt_eval_count ?? 0,
        durationMs,
        providerMetadata: {
          eval_duration: data.eval_duration,
          prompt_eval_duration: data.prompt_eval_duration,
        },
      };

      const outputEvent: AgentEvent = {
        type: "output",
        runId: request.runId,
        timestamp: new Date().toISOString(),
        data: { content: output },
      };
      events.push(outputEvent);
      request.onEvent?.(outputEvent);

      const completedEvent: AgentEvent = {
        type: "completed",
        runId: request.runId,
        timestamp: new Date().toISOString(),
        data: { exitCode: 0, output },
      };
      events.push(completedEvent);
      request.onEvent?.(completedEvent);

      return {
        runId: request.runId,
        exitCode: 0,
        output,
        timedOut: false,
        usage,
        events,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error("ollama-runtime", `Execution failed: ${errorMsg}`);

      const failedEvent: AgentEvent = {
        type: "failed",
        runId: request.runId,
        timestamp: new Date().toISOString(),
        data: { error: errorMsg },
      };
      events.push(failedEvent);
      request.onEvent?.(failedEvent);

      return {
        runId: request.runId,
        exitCode: 1,
        output: "",
        error: errorMsg,
        timedOut: false,
        usage: {},
        events,
      };
    }
  }

  async stop(runId: string): Promise<void> {
    const session = this.activeSessions.get(runId);
    if (!session) return;

    return new Promise((resolve) => {
      treeKill(session.pid, "SIGTERM", (err?: Error) => {
        if (err) {
          logger.error("ollama-runtime", `Failed to kill session ${session.pid}: ${err.message}`);
        } else {
          logger.info("ollama-runtime", `Killed session ${session.pid}`);
        }
        this.activeSessions.delete(runId);
        resolve();
      });
    });
  }

  private buildToolContext(permissions: any): string {
    const tools: string[] = [];

    if (permissions.filesystem === "workspace") {
      tools.push("- read_file(path): Read file contents");
      tools.push("- write_file(path, content): Write to file");
      tools.push("- list_files(dir): List directory contents");
    }

    if (permissions.shell) {
      tools.push("- run_command(cmd): Execute shell command");
      tools.push("- run_test(cmd): Run tests and capture output");
    }

    if (permissions.network) {
      tools.push("- fetch(url): Make HTTP request");
    }

    return tools.length > 0 ? tools.join("\n") : "No tools available with current permissions.";
  }

  private async callOllama(params: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minute timeout
    });
  }
}
