/**
 * AI Conversation Target Abstraction
 *
 * Defines the interface all AI targets must implement.
 * Providers (OpenAI, Ollama, Claude, etc.) and special targets (Control, Auto)
 * all implement this interface.
 */

import type {
  AITargetId,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
  ConversationMessage,
} from "@/types/graph";

export type TargetStatus = "connected" | "offline" | "error";
export type TargetType = "provider" | "agent" | "special";
export type TargetCategory = "chat" | "code" | "research" | "analysis" | "orchestration";

export interface AIConversationTarget {
  // ─── Identification ───────────────────────────────────────────
  id: AITargetId;
  name: string;
  description: string;
  type: TargetType;
  category: TargetCategory;

  // ─── Availability ─────────────────────────────────────────────
  isAvailable(): Promise<boolean>;
  getStatus(): TargetStatus;
  getStatusMessage(): string;

  // ─── Configuration ────────────────────────────────────────────
  getAvailableModels?(): Promise<string[]>;
  getCurrentModel?(): string;
  setModel?(model: string): Promise<void>;

  // ─── Main Conversation ────────────────────────────────────────
  sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse>;

  // ─── Capabilities ─────────────────────────────────────────────
  supportsStreaming(): boolean;
  supportsToolUse(): boolean;
  supportsArtifacts(): boolean;
  supportsImageInput(): boolean;

  // ─── Authentication ───────────────────────────────────────────
  hasCredentials(): boolean;
  requiresAuth(): boolean;
  getAuthStatus(): "authenticated" | "unauthenticated" | "expired";
  setCredentials?(credentials: Record<string, string>): Promise<void>;

  // ─── Metadata ─────────────────────────────────────────────────
  getContextLength(): number;
  getCostPerToken?(): { input: number; output: number };
  getLastUsed?(): Date | null;
}

/**
 * Base class for implementing AI targets
 * Provides common functionality and validation
 */
export abstract class BaseAITarget implements AIConversationTarget {
  id: AITargetId;
  name: string;
  description: string;
  type: TargetType;
  category: TargetCategory;
  protected status: TargetStatus = "offline";
  protected statusMessage: string = "Not initialized";
  protected lastUsed: Date | null = null;

  constructor(
    id: AITargetId,
    name: string,
    description: string,
    type: TargetType,
    category: TargetCategory
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.type = type;
    this.category = category;
  }

  abstract isAvailable(): Promise<boolean>;
  abstract sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse>;

  getStatus(): TargetStatus {
    return this.status;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  supportsStreaming(): boolean {
    return false;
  }

  supportsToolUse(): boolean {
    return false;
  }

  supportsArtifacts(): boolean {
    return false;
  }

  supportsImageInput(): boolean {
    return false;
  }

  hasCredentials(): boolean {
    return false;
  }

  requiresAuth(): boolean {
    return true;
  }

  getAuthStatus(): "authenticated" | "unauthenticated" | "expired" {
    return "unauthenticated";
  }

  getContextLength(): number {
    return 4096; // Default context window
  }

  getLastUsed(): Date | null {
    return this.lastUsed;
  }

  protected recordUsage(): void {
    this.lastUsed = new Date();
  }

  protected formatConversationForTarget(
    history: ConversationMessage[],
    context: ResolvedContext
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // Add system context if available
    if (context.injectedMarkdown) {
      messages.push({
        role: "assistant" as const,
        content: `## Project Context\n\n${context.injectedMarkdown}`,
      });
    }

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    return messages;
  }

  protected buildSystemPrompt(context: ResolvedContext): string {
    const lines: string[] = [
      "You are an AI assistant integrated with a project understanding system.",
      "You have access to contextual information about the project and workspace.",
      "",
      "When answering questions, use the provided context to give accurate, project-aware responses.",
      "Reference specific files, tasks, and project structure when relevant.",
    ];

    if (context.mode) {
      lines.push(`\nContext Mode: ${context.mode}`);
    }

    if (context.injectedMarkdown) {
      lines.push("\n---\n");
      lines.push("## Available Context\n");
      lines.push(context.injectedMarkdown);
    }

    return lines.join("\n");
  }
}

/**
 * Target Registry
 *
 * Manages all available targets and their lifecycle
 */
export class TargetRegistry {
  private targets: Map<AITargetId, AIConversationTarget> = new Map();

  register(target: AIConversationTarget): void {
    this.targets.set(target.id, target);
  }

  getTarget(id: AITargetId): AIConversationTarget | null {
    return this.targets.get(id) || null;
  }

  getAllTargets(): AIConversationTarget[] {
    return Array.from(this.targets.values());
  }

  getAvailableTargets(): AIConversationTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.getStatus() !== "offline");
  }

  getTargetsByCategory(category: TargetCategory): AIConversationTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.category === category);
  }

  getTargetsByType(type: TargetType): AIConversationTarget[] {
    return Array.from(this.targets.values()).filter((t) => t.type === type);
  }

  async refreshAvailability(): Promise<void> {
    for (const target of this.targets.values()) {
      const available = await target.isAvailable();
      if (available) {
        target["status"] = "connected";
        target["statusMessage"] = "Connected";
      } else {
        target["status"] = "offline";
        target["statusMessage"] = "Unavailable";
      }
    }
  }
}

let registryInstance: TargetRegistry | null = null;

export function getTargetRegistry(): TargetRegistry {
  if (!registryInstance) {
    registryInstance = new TargetRegistry();
  }
  return registryInstance;
}

export function initializeTargetRegistry(registry: TargetRegistry): void {
  registryInstance = registry;
}
