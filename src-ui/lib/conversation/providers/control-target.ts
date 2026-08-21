/**
 * Control Target Adapter
 *
 * Special target that uses Control graph intelligence to determine
 * the best action and route to appropriate AI providers or agents.
 */

import { BaseAITarget } from "../ai-target";
import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
} from "@/types/graph";
import type { GraphRepository } from "@/types/graph";
import { TargetRegistry } from "../ai-target";

export class ControlTarget extends BaseAITarget {
  private graphRepo: GraphRepository | null = null;
  private registry: TargetRegistry | null = null;

  constructor() {
    super("control", "Control", "AI decision engine using project graph", "special", "orchestration");
    this.status = "connected";
    this.statusMessage = "Ready";
  }

  setDependencies(graphRepo: GraphRepository, registry: TargetRegistry): void {
    this.graphRepo = graphRepo;
    this.registry = registry;
  }

  async isAvailable(): Promise<boolean> {
    return this.graphRepo !== null;
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse> {
    if (!this.graphRepo || !this.registry) {
      throw new Error("Control target not properly initialized");
    }

    this.recordUsage();

    // Analyze the message to determine best target
    const targetId = await this.determineTargetForMessage(
      userMessage,
      conversationHistory,
      context
    );

    // Get the target from registry
    const target = this.registry.getTarget(targetId);
    if (!target || target.id === "control") {
      throw new Error(`Could not route to target ${targetId}`);
    }

    // Send to determined target
    const response = await target.sendMessage(userMessage, conversationHistory, context, options);

    // Return response with Control attribution but showing actual target
    return {
      ...response,
      content: `[Routed to ${target.name}]\n\n${response.content}`,
    };
  }

  private async determineTargetForMessage(
    userMessage: string,
    _conversationHistory: ConversationMessage[],
    context: ResolvedContext
  ): Promise<any> {
    const messageLower = userMessage.toLowerCase();

    // Heuristics for target selection
    if (
      messageLower.includes("code") ||
      messageLower.includes("implement") ||
      messageLower.includes("debug") ||
      messageLower.includes("refactor") ||
      messageLower.includes("fix")
    ) {
      // Coding task - prefer Claude or GPT
      return "claude-opus";
    }

    if (
      messageLower.includes("research") ||
      messageLower.includes("analyze") ||
      messageLower.includes("compare") ||
      messageLower.includes("evaluate")
    ) {
      // Analysis task - prefer Claude
      return "claude-opus";
    }

    if (
      messageLower.includes("explain") ||
      messageLower.includes("what is") ||
      messageLower.includes("how does")
    ) {
      // Explanation - Ollama can handle locally, otherwise Claude
      if (context.mode === "Current" || context.mode === "Project") {
        return "ollama"; // Use local for quick responses
      }
      return "claude-opus";
    }

    if (
      messageLower.includes("summarize") ||
      messageLower.includes("brief") ||
      messageLower.includes("short")
    ) {
      // Quick summary - use Ollama locally
      return "ollama";
    }

    // Default to Claude for complex tasks
    return "claude-opus";
  }

  supportsStreaming(): boolean {
    return false; // Control itself doesn't stream, it delegates
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
    return true; // Control always "has credentials" (graph access)
  }

  requiresAuth(): boolean {
    return false; // Control is internal
  }

  getAuthStatus(): "authenticated" | "unauthenticated" | "expired" {
    return "authenticated";
  }

  getContextLength(): number {
    return 100000; // Use average of available models
  }
}
