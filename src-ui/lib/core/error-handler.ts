/**
 * Structured Error Handler
 *
 * Centralizes error creation, logging, and recovery decisions.
 * All Control errors flow through this handler.
 * Errors include recoverability information.
 */

import type { ControlError, ErrorSeverity, ErrorRecoverability } from "@/types/production";
import { ErrorCodes } from "@/types/production";
import { getSecretRedactor } from "./secret-redactor";

export class ErrorHandler {
  private errors: ControlError[] = [];
  private errorListeners: Array<(error: ControlError) => void> = [];
  private maxStoredErrors = 1000;

  /**
   * Create and log an error
   */
  createError(
    code: string,
    message: string,
    options: {
      severity?: ErrorSeverity;
      operation: string;
      project?: string;
      task?: string;
      component?: any;
      recoverability?: ErrorRecoverability;
      details?: Record<string, unknown>;
    }
  ): ControlError {
    const redactor = getSecretRedactor();

    const error: ControlError = {
      code,
      message: redactor.redact(message).redacted,
      severity: options.severity || "ERROR",
      operation: options.operation,
      project: options.project,
      task: options.task,
      component: options.component,
      recoverability: options.recoverability || "MANUAL",
      timestamp: Date.now(),
      details: options.details ? (redactor.redactObject(options.details) as Record<string, unknown>) : undefined,
      redactedContext: this.createRedactedContext(options),
    };

    this.storeError(error);
    this.notifyListeners(error);

    return error;
  }

  /**
   * Create a safe, redacted context string for storage
   */
  private createRedactedContext(options: {
    project?: string;
    task?: string;
    component?: any;
    details?: Record<string, unknown>;
  }): string {
    const parts = [];
    if (options.project) parts.push(`project=${options.project}`);
    if (options.task) parts.push(`task=${options.task}`);
    if (options.component) parts.push(`component=${String(options.component)}`);
    return parts.join(", ");
  }

  /**
   * Wrap async operation with error handling
   */
  async handle<T>(
    operation: string,
    fn: () => Promise<T>,
    options?: {
      project?: string;
      task?: string;
      component?: any;
    }
  ): Promise<{ success: boolean; data?: T; error?: ControlError }> {
    try {
      const data = await fn();
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const error = this.createError("CONTROL_OPERATION_FAILED", message, {
        severity: "ERROR",
        operation,
        recoverability: "MANUAL",
        ...options,
      });
      return { success: false, error };
    }
  }

  /**
   * Store error in history (with size limit)
   */
  private storeError(error: ControlError): void {
    this.errors.push(error);
    if (this.errors.length > this.maxStoredErrors) {
      this.errors = this.errors.slice(-this.maxStoredErrors);
    }
  }

  /**
   * Notify all listeners of error
   */
  private notifyListeners(error: ControlError): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch {
        // Prevent listener errors from cascading
      }
    });
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 50): ControlError[] {
    return this.errors.slice(-limit);
  }

  /**
   * Get errors by component
   */
  getErrorsByComponent(component: string): ControlError[] {
    return this.errors.filter((e) => e.component === component);
  }

  /**
   * Get critical errors
   */
  getCriticalErrors(): ControlError[] {
    return this.errors.filter((e) => e.severity === "CRITICAL");
  }

  /**
   * Get recoverable errors
   */
  getRecoverableErrors(): ControlError[] {
    return this.errors.filter((e) => e.recoverability === "AUTO" || e.recoverability === "MANUAL");
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errors = [];
  }

  /**
   * Register error listener
   */
  onError(listener: (error: ControlError) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * Export errors as JSON (redacted)
   */
  exportErrors(): string {
    const redactor = getSecretRedactor();
    return redactor.redactJSON(JSON.stringify(this.errors, null, 2));
  }
}

// Global instance
let errorHandler: ErrorHandler | null = null;

/**
 * Get or create global error handler
 */
export function getErrorHandler(): ErrorHandler {
  if (!errorHandler) {
    errorHandler = new ErrorHandler();
  }
  return errorHandler;
}

/**
 * Convenience function for creating errors
 */
export function createError(
  code: keyof typeof ErrorCodes,
  message: string,
  options: {
    severity?: ErrorSeverity;
    operation: string;
    project?: string;
    task?: string;
    component?: any;
    recoverability?: ErrorRecoverability;
    details?: Record<string, unknown>;
  }
): ControlError {
  return getErrorHandler().createError(code, message, options);
}
