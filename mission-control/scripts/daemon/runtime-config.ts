import fs from "fs";
import path from "path";
import { logger } from "./logger";
import type { WorkspaceRuntimeConfig, RuntimeConfig } from "./runtime-types";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const RUNTIME_CONFIG_PATH = path.join(WORKSPACE_ROOT, "mission-control", "data", "runtime-config.json");

/**
 * Default workspace runtime configuration.
 * Used when runtime-config.json doesn't exist or is incomplete.
 */
const DEFAULT_CONFIG: WorkspaceRuntimeConfig = {
  defaultRuntime: "claude-code",
  runtimes: {
    "claude-code": {
      type: "claude-code",
    },
    ollama: {
      type: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5-coder:latest",
    },
  },
};

/**
 * Load workspace runtime configuration.
 * Merges user config with defaults for missing fields.
 */
export function loadWorkspaceRuntimeConfig(): WorkspaceRuntimeConfig {
  try {
    if (fs.existsSync(RUNTIME_CONFIG_PATH)) {
      const content = fs.readFileSync(RUNTIME_CONFIG_PATH, "utf-8");
      const userConfig = JSON.parse(content) as Partial<WorkspaceRuntimeConfig>;

      logger.debug("runtime-config", `Loaded runtime config from ${RUNTIME_CONFIG_PATH}`);

      // Merge with defaults
      return {
        defaultRuntime: userConfig.defaultRuntime ?? DEFAULT_CONFIG.defaultRuntime,
        runtimes: {
          ...DEFAULT_CONFIG.runtimes,
          ...userConfig.runtimes,
        },
        fallbackChain: userConfig.fallbackChain,
      };
    }
  } catch (err) {
    logger.warn(
      "runtime-config",
      `Failed to load runtime config: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  logger.info("runtime-config", "Using default runtime configuration");
  return DEFAULT_CONFIG;
}

/**
 * Save workspace runtime configuration.
 */
export function saveWorkspaceRuntimeConfig(config: WorkspaceRuntimeConfig): void {
  try {
    const dir = path.dirname(RUNTIME_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(RUNTIME_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    logger.info("runtime-config", `Saved runtime config to ${RUNTIME_CONFIG_PATH}`);
  } catch (err) {
    logger.error(
      "runtime-config",
      `Failed to save runtime config: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
}

/**
 * Load agent runtime configuration from agents.json.
 */
export function loadAgentRuntimeConfig(agentId: string): RuntimeConfig | null {
  try {
    const agentsPath = path.join(WORKSPACE_ROOT, "mission-control", "data", "agents.json");
    if (!fs.existsSync(agentsPath)) {
      return null;
    }

    const content = fs.readFileSync(agentsPath, "utf-8");
    const data = JSON.parse(content) as { agents?: Array<{ id: string; runtime?: RuntimeConfig }> };

    if (!data.agents) {
      return null;
    }

    const agent = data.agents.find((a) => a.id === agentId);
    return agent?.runtime ?? null;
  } catch (err) {
    logger.warn(
      "runtime-config",
      `Failed to load agent config for ${agentId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Resolve the runtime configuration for an execution.
 * Follows resolution order: task → agent → project → workspace default
 */
export function resolveRuntimeConfig(
  taskRuntime?: RuntimeConfig,
  agentRuntime?: RuntimeConfig,
  projectRuntime?: RuntimeConfig
): RuntimeConfig {
  if (taskRuntime) {
    logger.debug("runtime-config", "Using task-level runtime configuration");
    return taskRuntime;
  }

  if (agentRuntime) {
    logger.debug("runtime-config", "Using agent-level runtime configuration");
    return agentRuntime;
  }

  if (projectRuntime) {
    logger.debug("runtime-config", "Using project-level runtime configuration");
    return projectRuntime;
  }

  const workspace = loadWorkspaceRuntimeConfig();
  logger.debug("runtime-config", `Using workspace default runtime: ${workspace.defaultRuntime}`);

  const runtimeId =
    typeof workspace.defaultRuntime === "string"
      ? workspace.defaultRuntime
      : workspace.defaultRuntime;

  if (!workspace.runtimes[runtimeId]) {
    logger.warn("runtime-config", `Default runtime ${runtimeId} not found, falling back to claude-code`);
    return { type: "claude-code" };
  }

  return workspace.runtimes[runtimeId]!;
}

/**
 * Initialize runtime configuration file if it doesn't exist.
 */
export function ensureRuntimeConfigExists(): void {
  if (!fs.existsSync(RUNTIME_CONFIG_PATH)) {
    logger.info("runtime-config", "Initializing runtime configuration");
    saveWorkspaceRuntimeConfig(DEFAULT_CONFIG);
  }
}
