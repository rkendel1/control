/**
 * Structured Logger
 *
 * All Control logging flows through here.
 * Structured events suitable for file persistence and analysis.
 * Automatic secret redaction on all outputs.
 */

import type { LogEvent, LogLevel, SubsystemName } from "@/types/production";
import { getSecretRedactor } from "./secret-redactor";

export class StructuredLogger {
  private events: LogEvent[] = [];
  private listeners: Array<(event: LogEvent) => void> = [];
  private maxStoredEvents = 5000;
  private logLevel: LogLevel = "INFO";

  constructor(private component: SubsystemName) {}

  /**
   * Set minimum log level (DEBUG, INFO, WARN, ERROR)
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Check if message should be logged at this level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  /**
   * Log debug message
   */
  debug(event: string, data?: Record<string, unknown>, message?: string): void {
    if (this.shouldLog("DEBUG")) {
      this.logEvent("DEBUG", event, data, message);
    }
  }

  /**
   * Log info message
   */
  info(event: string, data?: Record<string, unknown>, message?: string): void {
    if (this.shouldLog("INFO")) {
      this.logEvent("INFO", event, data, message);
    }
  }

  /**
   * Log warning
   */
  warn(event: string, data?: Record<string, unknown>, message?: string): void {
    if (this.shouldLog("WARN")) {
      this.logEvent("WARN", event, data, message);
    }
  }

  /**
   * Log error
   */
  error(event: string, data?: Record<string, unknown>, message?: string): void {
    if (this.shouldLog("ERROR")) {
      this.logEvent("ERROR", event, data, message);
    }
  }

  /**
   * Internal log event creation
   */
  private logEvent(
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>,
    message?: string
  ): void {
    const redactor = getSecretRedactor();

    const logEvent: LogEvent = {
      timestamp: Date.now(),
      level,
      component: this.component,
      event,
      message: message ? redactor.redact(message).redacted : undefined,
      data: data ? (redactor.redactObject(data) as Record<string, unknown>) : undefined,
    };

    this.events.push(logEvent);
    if (this.events.length > this.maxStoredEvents) {
      this.events = this.events.slice(-this.maxStoredEvents);
    }

    this.notifyListeners(logEvent);
  }

  /**
   * Log with context (project, task, agent)
   */
  withContext(
    event: string,
    context: {
      project?: string;
      task?: string;
      agent?: string;
    },
    data?: Record<string, unknown>,
    message?: string
  ): void {
    const redactor = getSecretRedactor();

    const logEvent: LogEvent = {
      timestamp: Date.now(),
      level: "INFO",
      component: this.component,
      event,
      project: context.project,
      task: context.task,
      agent: context.agent,
      message: message ? redactor.redact(message).redacted : undefined,
      data: data ? (redactor.redactObject(data) as Record<string, unknown>) : undefined,
    };

    this.events.push(logEvent);
    if (this.events.length > this.maxStoredEvents) {
      this.events = this.events.slice(-this.maxStoredEvents);
    }

    this.notifyListeners(logEvent);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(event: LogEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Prevent listener errors
      }
    });
  }

  /**
   * Register event listener
   */
  onEvent(listener: (event: LogEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 100): LogEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Get events by type
   */
  getEventsByType(event: string): LogEvent[] {
    return this.events.filter((e) => e.event === event);
  }

  /**
   * Get events by level
   */
  getEventsByLevel(level: LogLevel): LogEvent[] {
    return this.events.filter((e) => e.level === level);
  }

  /**
   * Get events for specific project
   */
  getEventsByProject(project: string): LogEvent[] {
    return this.events.filter((e) => e.project === project);
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.events = [];
  }

  /**
   * Export events as JSONL (one event per line)
   */
  exportAsJSONL(): string {
    return this.events.map((e) => JSON.stringify(e)).join("\n");
  }

  /**
   * Export events as JSON array
   */
  exportAsJSON(): string {
    const redactor = getSecretRedactor();
    return redactor.redactJSON(JSON.stringify(this.events, null, 2));
  }
}

// Global loggers by component
const loggers: Map<SubsystemName, StructuredLogger> = new Map();

/**
 * Get or create logger for component
 */
export function getLogger(component: SubsystemName): StructuredLogger {
  if (!loggers.has(component)) {
    loggers.set(component, new StructuredLogger(component));
  }
  return loggers.get(component)!;
}

/**
 * Configure log level globally
 */
export function setGlobalLogLevel(level: LogLevel): void {
  for (const logger of loggers.values()) {
    logger.setLogLevel(level);
  }
}

/**
 * Export all logs (redacted)
 */
export function exportAllLogs(): string {
  const redactor = getSecretRedactor();
  const allEvents: LogEvent[] = [];

  for (const logger of loggers.values()) {
    allEvents.push(...logger.getRecentEvents(1000));
  }

  return redactor.redactJSON(JSON.stringify(allEvents, null, 2));
}
