// ─── Universal Agent Runtime Types ──────────────────────────────────────────
// Core abstraction for executing coding agents across multiple platforms/models

import type { ClaudeUsage } from "./types";

// ─── Runtime Capabilities ───────────────────────────────────────────────────

/**
 * Capabilities that a runtime may or may not support.
 * Used by orchestration layer to make intelligent routing decisions.
 */
export interface RuntimeCapabilities {
  execute: boolean;
  streaming: boolean;
  toolCalling: boolean;
  resume: boolean;
  stop: boolean;
  structuredOutput: boolean;
}

// ─── Runtime Status ─────────────────────────────────────────────────────────

export type RuntimeDiscoveryStatus = "available" | "unavailable" | "error";

export interface RuntimeDiscovery {
  name: string;
  status: RuntimeDiscoveryStatus;
  version?: string;
  error?: string;
}

export interface OllamaDiscovery extends RuntimeDiscovery {
  baseUrl: string;
  models: Array<{
    name: string;
    size: number;
    quantization?: string;
    supportsToolCalling?: boolean;
  }>;
}

export interface CommandRuntimeDiscovery extends RuntimeDiscovery {
  command: string;
  executable: boolean;
}

// ─── Execution Events ───────────────────────────────────────────────────────

export type AgentEventType =
  | "started"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "output"
  | "progress"
  | "completed"
  | "failed"
  | "stopped";

export interface AgentEvent {
  type: AgentEventType;
  runId: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ToolCallEvent extends AgentEvent {
  type: "tool_call";
  data: {
    toolName: string;
    toolUse: Record<string, unknown>;
    inputJson?: string;
  };
}

export interface ToolResultEvent extends AgentEvent {
  type: "tool_result";
  data: {
    toolName: string;
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

export interface OutputEvent extends AgentEvent {
  type: "output";
  data: {
    content: string;
    messageId?: string;
  };
}

export interface CompletedEvent extends AgentEvent {
  type: "completed";
  data: {
    exitCode: number;
    output?: string;
  };
}

export interface FailedEvent extends AgentEvent {
  type: "failed";
  data: {
    error: string;
    code?: string;
  };
}

// ─── Execution Request/Response ─────────────────────────────────────────────

export interface ExecutionPermissions {
  filesystem: "workspace" | "none";
  shell: boolean;
  network: boolean;
  fieldOps: boolean;
  secrets: boolean;
}

/**
 * Request to execute work via an agent runtime.
 * Inputs are normalizable across all runtimes.
 */
export interface AgentExecutionRequest {
  runId: string;
  prompt: string;
  maxTurns: number;
  timeoutMinutes: number;
  workingDirectory: string;
  environment?: Record<string, string>;
  permissions: ExecutionPermissions;
  skipPermissionsPrompt?: boolean;
  allowedTools?: string[];
  tools?: Record<string, unknown>; // Tool definitions if runtime supports tool_calling
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentResumeRequest {
  runId: string;
  message: string;
  workingDirectory: string;
  permissions: ExecutionPermissions;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Normalized usage metrics across all runtimes.
 * Some fields may be null for runtimes that don't provide them.
 */
export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  durationMs?: number;
  estimatedCostUsd?: number;
  providerMetadata?: Record<string, unknown>;
}

export interface AgentExecution {
  runId: string;
  exitCode: number | null;
  output: string;
  error?: string;
  timedOut: boolean;
  usage: AgentUsage;
  events: AgentEvent[];
}

// ─── Runtime Interface ──────────────────────────────────────────────────────

/**
 * Provider-neutral runtime interface.
 * All agent runtimes (Claude Code, Ollama, command-based, etc.) implement this.
 */
export interface AgentRuntime {
  readonly id: string;
  readonly name: string;
  readonly capabilities: RuntimeCapabilities;

  /**
   * Discover if this runtime is available and report its status.
   * Should not throw — return an error status instead.
   */
  discover(): Promise<RuntimeDiscovery>;

  /**
   * Execute an agent task synchronously (blocks until complete).
   * Should normalize all output to AgentExecution regardless of runtime.
   */
  execute(request: AgentExecutionRequest): Promise<AgentExecution>;

  /**
   * Stop a running execution by runId (if supported).
   * Returns silently if runId not found or already stopped.
   */
  stop(runId: string): Promise<void>;

  /**
   * Resume a previous execution (if supported).
   * Only available if capabilities.resume === true.
   */
  resume?(request: AgentResumeRequest): Promise<AgentExecution>;
}

// ─── Runtime Configuration ──────────────────────────────────────────────────

export type RuntimeType = "claude-code" | "ollama" | "command";

/**
 * Configuration for a runtime instance.
 * Parsed from agents.json or runtime-config.json.
 */
export interface RuntimeConfig {
  type: RuntimeType;
  model?: string;
  baseUrl?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  fallback?: RuntimeConfig;
}

/**
 * Extended agent configuration with runtime binding.
 */
export interface AgentWithRuntime {
  id: string;
  name: string;
  runtime?: RuntimeConfig;
  instructions: string;
  capabilities: string[];
}

/**
 * Workspace-level runtime defaults and configuration.
 */
export interface WorkspaceRuntimeConfig {
  defaultRuntime: RuntimeType | string;
  runtimes: Record<string, RuntimeConfig>;
  fallbackChain?: Array<RuntimeType | string>;
}

// ─── Runtime Registry ───────────────────────────────────────────────────────

export interface RuntimeRegistry {
  /**
   * Register a runtime implementation.
   */
  register(runtime: AgentRuntime): void;

  /**
   * Get a registered runtime by ID.
   */
  get(id: string): AgentRuntime | null;

  /**
   * Resolve a runtime from configuration.
   * Follows resolution chain: exact type → fallback → default.
   */
  resolve(config: RuntimeConfig | string): Promise<AgentRuntime>;

  /**
   * List all registered runtimes.
   */
  list(): AgentRuntime[];

  /**
   * Discover status of all registered runtimes.
   */
  discoverAll(): Promise<RuntimeDiscovery[]>;
}

// ─── Execution Tracking ─────────────────────────────────────────────────────

/**
 * Tracks an ongoing execution for resumption and cancellation.
 */
export interface ExecutionHandle {
  runId: string;
  runtime: AgentRuntime;
  pid?: number;
  startedAt: string;
  terminationPromise: Promise<AgentExecution>;
  stop(): Promise<void>;
}
