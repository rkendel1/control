/**
 * Application State Manager
 *
 * Manages application lifecycle and state machine:
 * STARTING → RECOVERING → READY → DEGRADED → SHUTTING_DOWN
 *
 * Prevents crashes from invalid state transitions.
 * Tracks subsystem health independently.
 */

import type {
  ApplicationState,
  ApplicationStatus,
  SubsystemHealth,
  SubsystemName,
  HealthStatus,
} from "@/types/production";

export class ApplicationStateManager {
  private state: ApplicationState = "STARTING";
  private status: ApplicationStatus;
  private subsystems: Map<SubsystemName, SubsystemHealth> = new Map();
  private stateChangeListeners: Array<(oldState: ApplicationState, newState: ApplicationState) => void> = [];
  private healthChangeListeners: Array<(subsystem: SubsystemName, health: SubsystemHealth) => void> = [];
  private startTime: number = Date.now();

  constructor() {
    this.status = {
      state: "STARTING",
      startedAt: this.startTime,
      lastHealthCheck: this.startTime,
      recoveryInProgress: {
        conversations: 0,
        projects: 0,
        tasks: 0,
        agents: 0,
      },
      subsystems: {},
    };

    this.initializeSubsystems();
  }

  /**
   * Initialize all subsystems as DEGRADED until proven HEALTHY
   */
  private initializeSubsystems(): void {
    const subsystems: SubsystemName[] = [
      "core",
      "feltdb",
      "projectgraph",
      "globalgraph",
      "git",
      "terminal",
      "ollama",
      "openai",
      "claude",
      "agent",
      "storage",
    ];

    for (const name of subsystems) {
      this.subsystems.set(name, {
        name,
        status: "DEGRADED",
        lastCheck: this.startTime,
        recoverable: true,
      });
    }
  }

  /**
   * Transition to a new application state
   * Validates state transitions
   */
  setState(newState: ApplicationState, message?: string): void {
    if (!this.isValidTransition(this.state, newState)) {
      throw new Error(`Invalid state transition: ${this.state} → ${newState}`);
    }

    const oldState = this.state;
    this.state = newState;
    this.status.state = newState;
    if (message) {
      this.status.message = message;
    }
    this.status.lastHealthCheck = Date.now();

    this.stateChangeListeners.forEach((listener) => listener(oldState, newState));
  }

  /**
   * Check if state transition is valid
   */
  private isValidTransition(from: ApplicationState, to: ApplicationState): boolean {
    const validTransitions: Record<ApplicationState, ApplicationState[]> = {
      STARTING: ["RECOVERING", "READY", "DEGRADED"],
      RECOVERING: ["READY", "DEGRADED", "SHUTTING_DOWN"],
      READY: ["DEGRADED", "SHUTTING_DOWN"],
      DEGRADED: ["READY", "SHUTTING_DOWN"],
      SHUTTING_DOWN: [],
    };

    return validTransitions[from].includes(to);
  }

  /**
   * Update subsystem health
   * Auto-degrades application if critical subsystem fails
   */
  setSubsystemHealth(
    subsystem: SubsystemName,
    status: HealthStatus,
    message?: string
  ): void {
    const health: SubsystemHealth = {
      name: subsystem,
      status,
      lastCheck: Date.now(),
      message,
      recoverable: status !== "FAILED" || this.isRecoverable(subsystem),
    };

    this.subsystems.set(subsystem, health);
    this.status.subsystems[subsystem] = health;

    this.healthChangeListeners.forEach((listener) => listener(subsystem, health));

    // Auto-degrade if critical subsystem fails
    if (this.isCritical(subsystem) && status === "FAILED") {
      if (this.state !== "SHUTTING_DOWN") {
        this.setState("DEGRADED", `Critical subsystem failed: ${subsystem}`);
      }
    }
  }

  /**
   * Check if subsystem is critical to operation
   */
  private isCritical(subsystem: SubsystemName): boolean {
    return ["core", "feltdb", "storage", "git"].includes(subsystem);
  }

  /**
   * Check if subsystem can recover
   */
  private isRecoverable(subsystem: SubsystemName): boolean {
    // AI providers and terminal are recoverable
    // Core and storage failures are not automatically recoverable
    const nonRecoverable = ["core", "feltdb", "storage"];
    return !nonRecoverable.includes(subsystem);
  }

  /**
   * Update recovery progress
   */
  updateRecoveryProgress(category: keyof ApplicationStatus["recoveryInProgress"], count: number): void {
    this.status.recoveryInProgress[category] = count;
    this.status.lastHealthCheck = Date.now();
  }

  /**
   * Get current application status
   */
  getStatus(): ApplicationStatus {
    return {
      ...this.status,
      subsystems: Object.fromEntries(this.subsystems),
    };
  }

  /**
   * Get current state
   */
  getState(): ApplicationState {
    return this.state;
  }

  /**
   * Check if application is ready
   */
  isReady(): boolean {
    return this.state === "READY";
  }

  /**
   * Check if application is shutting down
   */
  isShuttingDown(): boolean {
    return this.state === "SHUTTING_DOWN";
  }

  /**
   * Get subsystem status
   */
  getSubsystemHealth(subsystem: SubsystemName): SubsystemHealth | undefined {
    return this.subsystems.get(subsystem);
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): HealthStatus {
    let hasHealthy = false;
    let hasDegraded = false;

    for (const health of this.subsystems.values()) {
      if (health.status === "HEALTHY") hasHealthy = true;
      if (health.status === "DEGRADED") hasDegraded = true;
      if (health.status === "FAILED" && this.isCritical(health.name)) {
        return "FAILED";
      }
    }

    if (hasDegraded) return "DEGRADED";
    if (hasHealthy) return "HEALTHY";
    return "FAILED";
  }

  /**
   * Check if application can accept mutations
   */
  canAcceptMutations(): boolean {
    return this.state === "READY" && this.getOverallHealth() !== "FAILED";
  }

  /**
   * Register state change listener
   */
  onStateChange(listener: (oldState: ApplicationState, newState: ApplicationState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  /**
   * Register health change listener
   */
  onHealthChange(listener: (subsystem: SubsystemName, health: SubsystemHealth) => void): void {
    this.healthChangeListeners.push(listener);
  }

  /**
   * Get uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }
}

// Global instance
let stateManager: ApplicationStateManager | null = null;

/**
 * Get or create global state manager
 */
export function getApplicationStateManager(): ApplicationStateManager {
  if (!stateManager) {
    stateManager = new ApplicationStateManager();
  }
  return stateManager;
}
