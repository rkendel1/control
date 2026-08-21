/**
 * AI Provider Resilience
 *
 * Handles failures gracefully without crashing Control.
 * Provider unavailable → Control remains READY
 * Strategies: retry, fallback, graceful degradation
 */

import type { AIConversationTarget } from "@/lib/conversation/ai-target";
import { getApplicationStateManager } from "@/lib/core/application-state";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("ollama");

export interface ProviderTimeout {
  connection: number; // ms to connect
  request: number; // ms for request
  stream: number; // ms between stream chunks
}

const DEFAULT_TIMEOUTS: Record<string, ProviderTimeout> = {
  openai: {
    connection: 10000, // 10s to connect
    request: 60000, // 60s for response
    stream: 30000, // 30s between chunks
  },
  claude: {
    connection: 10000,
    request: 120000, // Claude can be slower
    stream: 30000,
  },
  ollama: {
    connection: 5000,
    request: 30000,
    stream: 15000,
  },
};

export interface AIProviderHealth {
  targetId: string;
  available: boolean;
  lastCheck: number;
  failureCount: number;
  lastError?: string;
  canFallback: boolean;
}

export interface RetryStrategy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  initialDelay: 1000, // 1s
  maxDelay: 10000, // 10s
  backoffMultiplier: 2,
};

export class AIProviderResilience {
  private providerHealth: Map<string, AIProviderHealth> = new Map();
  private healthCheckInterval: number = 60000; // 60 seconds
  private lastHealthCheck: number = 0;
  private failureThreshold: number = 3;

  /**
   * Execute AI request with automatic retry and fallback
   */
  async executeWithResilience<T>(
    targetId: string,
    target: AIConversationTarget,
    operation: () => Promise<T>,
    fallbackTargets?: AIConversationTarget[]
  ): Promise<{ success: boolean; data?: T; error?: string; provider: string }> {
    const stateManager = getApplicationStateManager();

    // Check provider availability first
    if (!target.isAvailable()) {
      logger.warn("provider_unavailable", { provider: targetId });
      stateManager.setSubsystemHealth(targetId as any, "DEGRADED", `${targetId} unavailable`);

      // Try fallback
      if (fallbackTargets && fallbackTargets.length > 0) {
        return this.tryFallback(targetId, target, operation, fallbackTargets);
      }

      return {
        success: false,
        error: `${targetId} unavailable`,
        provider: targetId,
      };
    }

    // Execute with retries
    const result = await this.executeWithRetry(targetId, target, operation);

    if (result.success) {
      this.recordSuccess(targetId);
      stateManager.setSubsystemHealth(targetId as any, "HEALTHY");
      return result;
    }

    // On failure, try fallback
    if (fallbackTargets && fallbackTargets.length > 0) {
      logger.warn("provider_failed_trying_fallback", { provider: targetId });
      return this.tryFallback(targetId, target, operation, fallbackTargets);
    }

    this.recordFailure(targetId, result.error);
    return result;
  }

  /**
   * Execute with bounded retries and exponential backoff
   */
  private async executeWithRetry<T>(
    targetId: string,
    target: AIConversationTarget,
    operation: () => Promise<T>,
    strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY
  ): Promise<{ success: boolean; data?: T; error?: string; provider: string }> {
    let lastError: string = "";
    let delay = strategy.initialDelay;

    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
      try {
        const timeoutMs = this.getTimeout(targetId, "request");
        const data = await this.executeWithTimeout(operation, timeoutMs);

        return {
          success: true,
          data,
          provider: targetId,
        };
      } catch (err) {
        lastError = String(err);
        logger.warn("provider_request_failed", { provider: targetId, attempt }, lastError);

        if (attempt < strategy.maxRetries) {
          // Wait before retry (exponential backoff)
          await this.delay(Math.min(delay, strategy.maxDelay));
          delay *= strategy.backoffMultiplier;
        }
      }
    }

    return {
      success: false,
      error: lastError,
      provider: targetId,
    };
  }

  /**
   * Try fallback targets in order
   */
  private async tryFallback<T>(
    primaryId: string,
    primary: AIConversationTarget,
    operation: () => Promise<T>,
    fallbackTargets: AIConversationTarget[]
  ): Promise<{ success: boolean; data?: T; error?: string; provider: string }> {
    for (const fallback of fallbackTargets) {
      if (!fallback.isAvailable()) {
        continue;
      }

      try {
        logger.info("trying_fallback", { primary: primaryId, fallback: fallback.id });
        const result = await this.executeWithRetry(fallback.id, fallback, operation);

        if (result.success) {
          logger.info("fallback_succeeded", { primary: primaryId, fallback: fallback.id });
          return result;
        }
      } catch {
        // Try next fallback
        continue;
      }
    }

    return {
      success: false,
      error: "All providers failed",
      provider: primaryId,
    };
  }

  /**
   * Execute operation with timeout
   */
  private executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Handle streaming interruption
   * Persist partial response instead of losing it
   */
  handleStreamInterruption(provider: string, partial: string): {
    status: "INTERRUPTED_RESPONSE" | "COMPLETED_RESPONSE";
    content: string;
  } {
    logger.warn("stream_interrupted", { provider });

    return {
      status: "INTERRUPTED_RESPONSE",
      content: partial,
    };
  }

  /**
   * Get timeout for operation
   */
  private getTimeout(provider: string, operation: "connection" | "request" | "stream"): number {
    const timeouts = DEFAULT_TIMEOUTS[provider] || DEFAULT_TIMEOUTS.ollama;
    return timeouts[operation];
  }

  /**
   * Record successful request
   */
  private recordSuccess(targetId: string): void {
    const health = this.providerHealth.get(targetId) || {
      targetId,
      available: true,
      lastCheck: Date.now(),
      failureCount: 0,
      canFallback: true,
    };

    health.failureCount = Math.max(0, health.failureCount - 1);
    health.lastCheck = Date.now();
    health.available = true;

    this.providerHealth.set(targetId, health);
  }

  /**
   * Record failed request
   */
  private recordFailure(targetId: string, error: string): void {
    const health = this.providerHealth.get(targetId) || {
      targetId,
      available: true,
      lastCheck: Date.now(),
      failureCount: 0,
      canFallback: true,
    };

    health.failureCount++;
    health.lastError = error;
    health.lastCheck = Date.now();
    health.available = health.failureCount < this.failureThreshold;

    this.providerHealth.set(targetId, health);

    logger.warn("provider_health_degraded", { provider: targetId, failures: health.failureCount });
  }

  /**
   * Check provider health
   */
  getProviderHealth(targetId: string): AIProviderHealth | undefined {
    return this.providerHealth.get(targetId);
  }

  /**
   * Get all provider health status
   */
  getAllProviderHealth(): AIProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Reset provider failures (after recovery)
   */
  resetProvider(targetId: string): void {
    const health = this.providerHealth.get(targetId);
    if (health) {
      health.failureCount = 0;
      health.available = true;
      health.lastError = undefined;
      logger.info("provider_reset", { provider: targetId });
    }
  }

  /**
   * Delay helper for backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Global instance
let resilience: AIProviderResilience | null = null;

/**
 * Get or create AI provider resilience manager
 */
export function getAIProviderResilience(): AIProviderResilience {
  if (!resilience) {
    resilience = new AIProviderResilience();
  }
  return resilience;
}
