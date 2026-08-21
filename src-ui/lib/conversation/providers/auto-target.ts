/**
 * Auto Target Adapter
 *
 * Intelligently routes requests to the best available provider
 * based on request type, complexity, and provider capabilities.
 */

import { BaseAITarget } from "../ai-target";
import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
  AITargetId,
} from "@/types/graph";
import { TargetRegistry } from "../ai-target";

export class AutoTarget extends BaseAITarget {
  private registry: TargetRegistry | null = null;

  constructor() {
    super(
      "auto",
      "Auto (Smart Selection)",
      "Automatically selects best provider for each request",
      "special",
      "chat"
    );
    this.status = "connected";
    this.statusMessage = "Ready";
  }

  setRegistry(registry: TargetRegistry): void {
    this.registry = registry;
  }

  async isAvailable(): Promise<boolean> {
    return this.registry !== null && this.registry.getAvailableTargets().length > 0;
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse> {
    if (!this.registry) {
      throw new Error("Auto target not properly initialized");
    }

    this.recordUsage();

    // Select best target for this message
    const targetId = await this.selectBestTarget(userMessage, context);

    const target = this.registry.getTarget(targetId);
    if (!target) {
      throw new Error(`Could not select a target for this request`);
    }

    // Send to selected target
    const response = await target.sendMessage(userMessage, conversationHistory, context, options);

    // Include selection info in response
    return {
      ...response,
      content: `[Using ${target.name}]\n\n${response.content}`,
    };
  }

  private async selectBestTarget(
    userMessage: string,
    context: ResolvedContext
  ): Promise<AITargetId> {
    if (!this.registry) {
      return "gpt-4";
    }

    const available = this.registry.getAvailableTargets();
    if (available.length === 0) {
      throw new Error("No AI providers available");
    }

    const messageLower = userMessage.toLowerCase();
    const messageLength = userMessage.length;
    const contextMode = context.mode;

    // Score providers based on different factors
    const scores: Record<string, number> = {};

    for (const target of available) {
      scores[target.id] = 0;

      // Prefer Ollama for quick, local responses
      if (
        target.id === "ollama" &&
        (messageLength < 200 || contextMode === "Current")
      ) {
        scores[target.id] += 10;
      }

      // Prefer Claude for complex analysis
      if (target.name.includes("Claude") && messageLength > 300) {
        scores[target.id] += 8;
      }

      // Prefer Claude for code-related tasks
      if (
        target.name.includes("Claude") &&
        (messageLower.includes("code") ||
          messageLower.includes("implement") ||
          messageLower.includes("debug"))
      ) {
        scores[target.id] += 15;
      }

      // Prefer GPT for creative tasks
      if (
        target.name.includes("GPT") &&
        (messageLower.includes("create") ||
          messageLower.includes("brainstorm") ||
          messageLower.includes("write"))
      ) {
        scores[target.id] += 12;
      }

      // Penalize if requires auth and context suggests offline
      if (target.requiresAuth() && contextMode === "Current") {
        scores[target.id] -= 5;
      }

      // Boost cost-effective local options
      if (!target.requiresAuth()) {
        scores[target.id] += 3;
      }

      // Add small random factor for variety
      scores[target.id] += Math.random() * 2;
    }

    // Select target with highest score
    let bestTarget = available[0];
    let bestScore = scores[bestTarget.id] || 0;

    for (const target of available) {
      const score = scores[target.id] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    return bestTarget.id as AITargetId;
  }

  supportsStreaming(): boolean {
    return false; // Auto delegates, so it doesn't directly support streaming
  }

  supportsToolUse(): boolean {
    return true;
  }

  supportsArtifacts(): boolean {
    return true;
  }

  supportsImageInput(): boolean {
    return true;
  }

  hasCredentials(): boolean {
    return true;
  }

  requiresAuth(): boolean {
    return false; // Auto doesn't require auth itself
  }

  getAuthStatus(): "authenticated" | "unauthenticated" | "expired" {
    return "authenticated";
  }

  getContextLength(): number {
    // Return average context length of available models
    if (!this.registry) {
      return 4096;
    }

    const available = this.registry.getAvailableTargets();
    if (available.length === 0) {
      return 4096;
    }

    const sum = available.reduce((acc, target) => acc + target.getContextLength(), 0);
    return Math.floor(sum / available.length);
  }
}
