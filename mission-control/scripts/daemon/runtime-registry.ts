import { logger } from "./logger";
import {
  type AgentRuntime,
  type RuntimeRegistry,
  type RuntimeConfig,
  type RuntimeDiscovery,
} from "./runtime-types";
import { ClaudeCodeRuntime } from "./runtimes/claude-code-runtime";
import { OllamaRuntime } from "./runtimes/ollama-runtime";
import { CommandRuntime } from "./runtimes/command-runtime";

/**
 * Global runtime registry.
 * Manages available agent runtimes and their resolution from configuration.
 */
class DefaultRuntimeRegistry implements RuntimeRegistry {
  private runtimes = new Map<string, AgentRuntime>();

  constructor() {
    // Register built-in runtimes
    this.register(new ClaudeCodeRuntime());
  }

  register(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.id, runtime);
    logger.info("registry", `Registered runtime: ${runtime.id} (${runtime.name})`);
  }

  get(id: string): AgentRuntime | null {
    return this.runtimes.get(id) ?? null;
  }

  async resolve(config: RuntimeConfig | string): Promise<AgentRuntime> {
    // If config is just a string, resolve as type ID
    if (typeof config === "string") {
      const runtime = this.runtimes.get(config);
      if (!runtime) {
        throw new Error(`Unknown runtime: ${config}. Available: ${Array.from(this.runtimes.keys()).join(", ")}`);
      }
      return runtime;
    }

    // Check if it's a registered type
    if (this.runtimes.has(config.type)) {
      const runtime = this.runtimes.get(config.type)!;

      // For built-in runtimes with configuration (e.g., Ollama), instantiate with config
      if (config.type === "ollama" && config.model) {
        const baseUrl = config.baseUrl ?? "http://127.0.0.1:11434";
        return new OllamaRuntime(baseUrl, config.model);
      }

      if (config.type === "claude-code") {
        return runtime;
      }

      return runtime;
    }

    // Handle command-based runtimes
    if (config.type === "command") {
      if (!config.command) {
        throw new Error("Command runtime requires 'command' field");
      }
      return new CommandRuntime(
        config.command,
        config.command,
        config.command,
        config.args ?? []
      );
    }

    // Try fallback if available
    if (config.fallback) {
      logger.warn("registry", `Runtime ${config.type} not available, trying fallback`);
      return this.resolve(config.fallback);
    }

    throw new Error(
      `Could not resolve runtime ${config.type}. Available: ${Array.from(this.runtimes.keys()).join(", ")}`
    );
  }

  list(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }

  async discoverAll(): Promise<RuntimeDiscovery[]> {
    const discoveries: RuntimeDiscovery[] = [];

    for (const runtime of this.runtimes.values()) {
      try {
        const discovery = await Promise.race([
          runtime.discover(),
          new Promise<RuntimeDiscovery>((_, reject) =>
            setTimeout(
              () => reject(new Error("Discover timeout")),
              10000
            ) // 10 second timeout
          ),
        ]);
        discoveries.push(discovery);
      } catch (err) {
        discoveries.push({
          name: runtime.name,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return discoveries;
  }
}

// Global singleton
export const globalRegistry = new DefaultRuntimeRegistry();

/**
 * Load additional runtimes from configuration.
 * Typically called during daemon startup.
 */
export async function loadConfiguredRuntimes(
  config: Record<string, any>
): Promise<void> {
  if (!config.runtimes) return;

  for (const [key, runtimeConfig] of Object.entries(config.runtimes)) {
    const cfg = runtimeConfig as any;

    if (cfg.type === "ollama") {
      const baseUrl = cfg.baseUrl ?? "http://127.0.0.1:11434";
      const model = cfg.model ?? "qwen2.5-coder:latest";
      const runtime = new OllamaRuntime(baseUrl, model);
      globalRegistry.register(runtime);
    } else if (cfg.type === "command") {
      if (!cfg.command) {
        logger.warn("registry", `Skipping command runtime '${key}': no command specified`);
        continue;
      }
      const runtime = new CommandRuntime(
        key,
        cfg.name ?? cfg.command,
        cfg.command,
        cfg.args ?? []
      );
      globalRegistry.register(runtime);
    }
  }
}

export type { RuntimeRegistry };
