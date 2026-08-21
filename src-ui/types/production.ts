/**
 * Production Hardening Types
 *
 * Core types for:
 * - Application state machine
 * - Agent run recovery
 * - Workspace isolation
 * - Error handling
 * - Structured logging
 */

// ============================================================================
// APPLICATION STATE MACHINE
// ============================================================================

export type ApplicationState =
  | "STARTING"
  | "RECOVERING"
  | "READY"
  | "DEGRADED"
  | "SHUTTING_DOWN";

export interface ApplicationStatus {
  state: ApplicationState;
  startedAt: number;
  lastHealthCheck: number;
  recoveryInProgress: {
    conversations: number;
    projects: number;
    tasks: number;
    agents: number;
  };
  subsystems: Record<string, SubsystemHealth>;
  message?: string;
}

export type SubsystemName =
  | "core"
  | "feltdb"
  | "projectgraph"
  | "globalgraph"
  | "git"
  | "terminal"
  | "ollama"
  | "openai"
  | "claude"
  | "agent"
  | "storage";

export type HealthStatus = "HEALTHY" | "DEGRADED" | "FAILED";

export interface SubsystemHealth {
  name: SubsystemName;
  status: HealthStatus;
  lastCheck: number;
  message?: string;
  recoverable: boolean;
}

// ============================================================================
// AGENT RUN RECOVERY
// ============================================================================

export type AgentRunStatus =
  | "QUEUED"
  | "STARTING"
  | "RUNNING"
  | "WAITING_FOR_INPUT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED"
  | "RECOVERABLE";

export interface AgentRun {
  id: string;
  taskId: string;
  projectId: string;
  workspaceId: string;
  targetId: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  lastHeartbeat: number;
  processId?: number;
  command: string;
  workingDirectory: string;
  recoveryState: AgentRecoveryState;
  input?: string;
  output: string;
  error?: string;
  exitCode?: number;
}

export interface AgentRecoveryState {
  checkpointedAt: number;
  filesWritten: string[];
  gitStateSnapshot?: GitStateSnapshot;
  workspaceValid: boolean;
  canResume: boolean;
}

// ============================================================================
// WORKSPACE ISOLATION
// ============================================================================

export type WorkspaceStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";

export interface Workspace {
  id: string;
  projectId: string;
  repositoryPath: string;
  worktreePath: string;
  branch: string;
  taskId: string;
  status: WorkspaceStatus;
  createdAt: number;
  lastUsed: number;
  gitState: GitStateSnapshot;
  isolationLevel: "ISOLATED" | "SHARED";
}

export interface GitStateSnapshot {
  branch: string;
  commit: string;
  dirty: boolean;
  uncommitted: number;
  untracked: number;
  stashed: number;
  modifiedFiles: string[];
  newFiles: string[];
  deletedFiles: string[];
}

// ============================================================================
// MUTATION SAFETY
// ============================================================================

export type CommandClassification = "SAFE" | "REQUIRES_CONFIRMATION" | "BLOCKED";

export interface MutationRequest {
  id: string;
  taskId: string;
  projectId: string;
  workspaceId: string;
  operation: string;
  authorizedProjects: string[];
  files: {
    modified: string[];
    deleted: string[];
    created: string[];
  };
  gitOperation?: {
    type: "commit" | "push" | "merge" | "reset";
    target: string;
  };
  classification: CommandClassification;
  requiresAuthorization: boolean;
  authorizedBy?: string;
  authorizedAt?: number;
}

export interface MutationVerification {
  requestId: string;
  authorized: boolean;
  workspaceValid: boolean;
  gitStateValid: boolean;
  pathsValid: boolean;
  filesAccessible: boolean;
  errors: string[];
}

export interface MutationEvidence {
  requestId: string;
  timestamp: number;
  gitStateBefore: GitStateSnapshot;
  gitStateAfter: GitStateSnapshot;
  filesModified: string[];
  success: boolean;
  error?: string;
}

// ============================================================================
// ERROR MODEL
// ============================================================================

export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type ErrorRecoverability = "AUTO" | "MANUAL" | "NONE";

export interface ControlError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  operation: string;
  project?: string;
  task?: string;
  component?: SubsystemName;
  recoverability: ErrorRecoverability;
  timestamp: number;
  details?: Record<string, unknown>;
  redactedContext?: string;
}

export const ErrorCodes = {
  // Core
  CONTROL_INITIALIZATION_FAILED: "CONTROL_INITIALIZATION_FAILED",
  CONTROL_SHUTDOWN_FAILED: "CONTROL_SHUTDOWN_FAILED",
  CONTROL_STATE_CORRUPTED: "CONTROL_STATE_CORRUPTED",

  // FeltDB
  FELTDB_OPEN_FAILED: "FELTDB_OPEN_FAILED",
  FELTDB_QUERY_FAILED: "FELTDB_QUERY_FAILED",
  FELTDB_WRITE_FAILED: "FELTDB_WRITE_FAILED",
  FELTDB_INTEGRITY_CHECK_FAILED: "FELTDB_INTEGRITY_CHECK_FAILED",
  FELTDB_MIGRATION_FAILED: "FELTDB_MIGRATION_FAILED",

  // Recovery
  RECOVERY_INCOMPLETE: "RECOVERY_INCOMPLETE",
  RECOVERY_FAILED: "RECOVERY_FAILED",
  AGENT_RUN_RECOVERY_FAILED: "AGENT_RUN_RECOVERY_FAILED",

  // Workspace
  WORKSPACE_VALIDATION_FAILED: "WORKSPACE_VALIDATION_FAILED",
  WORKSPACE_ISOLATION_FAILED: "WORKSPACE_ISOLATION_FAILED",
  WORKSPACE_NOT_FOUND: "WORKSPACE_NOT_FOUND",

  // Mutation
  MUTATION_VALIDATION_FAILED: "MUTATION_VALIDATION_FAILED",
  MUTATION_NOT_AUTHORIZED: "MUTATION_NOT_AUTHORIZED",
  MUTATION_EXECUTION_FAILED: "MUTATION_EXECUTION_FAILED",
  PATH_TRAVERSAL_DETECTED: "PATH_TRAVERSAL_DETECTED",

  // Git
  GIT_OPERATION_FAILED: "GIT_OPERATION_FAILED",
  GIT_STATE_INVALID: "GIT_STATE_INVALID",
  GIT_MERGE_CONFLICT: "GIT_MERGE_CONFLICT",

  // Agent
  AGENT_CRASH: "AGENT_CRASH",
  AGENT_TIMEOUT: "AGENT_TIMEOUT",
  AGENT_OUTPUT_MALFORMED: "AGENT_OUTPUT_MALFORMED",

  // AI Provider
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_REQUEST_TIMEOUT: "AI_REQUEST_TIMEOUT",
  AI_STREAM_INTERRUPTED: "AI_STREAM_INTERRUPTED",
  AI_INVALID_RESPONSE: "AI_INVALID_RESPONSE",

  // Terminal
  TERMINAL_PROCESS_FAILED: "TERMINAL_PROCESS_FAILED",
  TERMINAL_OUTPUT_CORRUPTED: "TERMINAL_OUTPUT_CORRUPTED",

  // Secrets
  CREDENTIAL_DETECTED_IN_OUTPUT: "CREDENTIAL_DETECTED_IN_OUTPUT",
  CREDENTIAL_DETECTED_IN_GRAPH: "CREDENTIAL_DETECTED_IN_GRAPH",
};

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEvent {
  timestamp: number;
  level: LogLevel;
  component: SubsystemName;
  event: string;
  project?: string;
  task?: string;
  agent?: string;
  message?: string;
  data?: Record<string, unknown>;
  redactedContext?: string;
}

// ============================================================================
// SESSION RECOVERY
// ============================================================================

export interface ApplicationSession {
  id: string;
  startedAt: number;
  lastHeartbeat: number;
  cleanShutdown: boolean;
  version: string;
  recoveredItems?: {
    conversations: number;
    projects: number;
    tasks: number;
    agents: number;
  };
}

export interface CrashRecoveryInfo {
  previousSessionClean: boolean;
  recoveredAt: number;
  itemsRecovered: number;
  itemsFailed: number;
  repositoriesModified: number;
  message: string;
}

// ============================================================================
// SECRETS REDACTION
// ============================================================================

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface RedactionResult {
  original: string;
  redacted: string;
  secretsFound: string[];
}

// ============================================================================
// PROJECT DISCOVERY RECONCILIATION
// ============================================================================

export type ProjectDiscoveryState =
  | "HEALTHY"
  | "MISSING"
  | "MOVED"
  | "NOT_A_REPOSITORY"
  | "UNAVAILABLE"
  | "NEEDS_INDEX";

export interface ProjectReconciliation {
  projectId: string;
  state: ProjectDiscoveryState;
  registeredPath: string;
  actualPath?: string;
  lastSeen: number;
  action?: "NONE" | "UPDATE_PATH" | "INDEX" | "NOTIFY_USER";
  message?: string;
}

// ============================================================================
// DATABASE MIGRATION
// ============================================================================

export interface SchemaMigration {
  from: number;
  to: number;
  name: string;
  migrate: (data: unknown) => Promise<unknown>;
  rollback?: (data: unknown) => Promise<unknown>;
}

export interface DatabaseSchema {
  version: number;
  entities: string[];
  relationships: string[];
}

// ============================================================================
// BACKUP AND DISASTER RECOVERY
// ============================================================================

export interface WorkspaceBackup {
  id: string;
  timestamp: number;
  version: string;
  includes: {
    projectMetadata: boolean;
    globalGraph: boolean;
    tasks: boolean;
    conversations: boolean;
    agentHistory: boolean;
    decisions: boolean;
    configuration: boolean;
  };
  size: number;
  integrity: "VALID" | "CORRUPTED" | "UNKNOWN";
}

export interface BackupPolicy {
  enabled: boolean;
  frequency: "hourly" | "daily" | "weekly";
  retention: number; // days
  maxBackups: number;
  autoRestore: boolean;
}

// ============================================================================
// HEALTH CHECK RESULTS
// ============================================================================

export interface DiagnosticsResult {
  timestamp: number;
  subsystems: Record<SubsystemName, DiagnosticDetail>;
  overallStatus: HealthStatus;
  recommendations: string[];
}

export interface DiagnosticDetail {
  status: HealthStatus;
  version?: string;
  latency?: number;
  message?: string;
  lastError?: ControlError;
}

// ============================================================================
// MULTI-REPOSITORY STATE
// ============================================================================

export interface MultiRepositoryTask {
  id: string;
  title: string;
  authorizedProjects: string[];
  projectTasks: Record<string, string>; // projectId → taskId
  status: "PLANNING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
  blockers: string[];
}
