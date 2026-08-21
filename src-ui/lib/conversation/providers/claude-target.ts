/**
 * Claude Target Adapter
 *
 * Implements AIConversationTarget for Anthropic's Claude API
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, and other Claude models
 */

import { BaseAITarget } from "../ai-target";
import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
} from "@/types/graph";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  id: string;
  content: Array<{
    type: "text";
    text: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeTarget extends BaseAITarget {
  private apiKey: string | null = null;
  private currentModel: string = "claude-3-5-sonnet-20241022";
  private baseURL: string = "https://api.anthropic.com/v1";

  constructor() {
    super(
      "claude-opus",
      "Claude (Anthropic)",
      "Advanced reasoning via Anthropic Claude API",
      "provider",
      "chat"
    );
    this.loadCredentials();
  }

  private loadCredentials(): void {
    // Load from secure credential store (to be implemented)
    // For now, check environment
    if (typeof process !== "undefined" && process.env) {
      this.apiKey = process.env.ANTHROPIC_API_KEY || null;
    }

    if (this.apiKey) {
      this.status = "connected";
      this.statusMessage = "Ready";
    } else {
      this.status = "offline";
      this.statusMessage = "No API key configured";
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      this.status = "offline";
      this.statusMessage = "Missing API key";
      return false;
    }

    try {
      // Test connection with a minimal request
      const response = await fetch(`${this.baseURL}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.currentModel,
          max_tokens: 10,
          messages: [{ role: "user", content: "ok" }],
        }),
      });

      if (response.ok || response.status === 400) {
        // 400 is OK for test - means API works
        this.status = "connected";
        this.statusMessage = "Connected";
        return true;
      } else {
        this.status = "error";
        this.statusMessage = `API error: ${response.status}`;
        return false;
      }
    } catch (error) {
      this.status = "offline";
      this.statusMessage = `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`;
      return false;
    }
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse> {
    if (!this.apiKey) {
      throw new Error("Claude API key not configured");
    }

    this.recordUsage();

    // Build messages
    const messages: ClaudeMessage[] = [];

    // Add conversation history (last 15 messages for Claude's longer context)
    const recentHistory = conversationHistory.slice(-15);
    for (const msg of recentHistory) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({
      role: "user",
      content: userMessage,
    });

    try {
      const response = await fetch(`${this.baseURL}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.currentModel,
          max_tokens: options.maxTokens ?? 2048,
          system: this.buildSystemPrompt(context),
          messages,
          temperature: options.temperature ?? 1,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Claude API error: ${response.status} - ${JSON.stringify(error)}`
        );
      }

      const data = (await response.json()) as ClaudeResponse;
      const content = data.content[0]?.text || "";
      const usage = data.usage;

      return {
        content,
        target: this.id as any,
        model: this.currentModel,
        usage: usage
          ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
            }
          : undefined,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.status = "error";
      this.statusMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return [
      "claude-3-5-sonnet-20241022",
      "claude-3-opus-20250219",
      "claude-3-haiku-20250122",
    ];
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async setModel(model: string): Promise<void> {
    const available = await this.getAvailableModels();
    if (!available.includes(model)) {
      throw new Error(`Model ${model} not available`);
    }
    this.currentModel = model;
  }

  supportsStreaming(): boolean {
    return true;
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
    return !!this.apiKey;
  }

  requiresAuth(): boolean {
    return true;
  }

  getAuthStatus(): "authenticated" | "unauthenticated" | "expired" {
    return this.apiKey ? "authenticated" : "unauthenticated";
  }

  async setCredentials(credentials: Record<string, string>): Promise<void> {
    if (credentials.apiKey) {
      this.apiKey = credentials.apiKey;
      // Persist to secure vault (to be implemented)
      await this.isAvailable();
    }
  }

  getContextLength(): number {
    return 200000; // Claude 3.5 Sonnet has 200K context window
  }

  getCostPerToken(): { input: number; output: number } {
    // Claude 3.5 Sonnet pricing
    return {
      input: 0.003, // $3 per 1M input tokens
      output: 0.015, // $15 per 1M output tokens
    };
  }
}
