/**
 * OpenAI Target Adapter
 *
 * Implements AIConversationTarget for OpenAI's API (GPT-4, GPT-3.5-turbo)
 */

import { BaseAITarget } from "../ai-target";
import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
} from "@/types/graph";

interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenAIChatCompletion {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class OpenAITarget extends BaseAITarget {
  private apiKey: string | null = null;
  private currentModel: string = "gpt-4";
  private baseURL: string = "https://api.openai.com/v1";

  constructor() {
    super("gpt-4", "OpenAI GPT-4", "Chat completions via OpenAI API", "provider", "chat");
    this.loadCredentials();
  }

  private loadCredentials(): void {
    // Load from secure credential store (to be implemented)
    // For now, check environment
    if (typeof process !== "undefined" && process.env) {
      this.apiKey = process.env.OPENAI_API_KEY || null;
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
      // Test connection with a simple request
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
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
      throw new Error("OpenAI API key not configured");
    }

    this.recordUsage();

    // Build messages
    const messages: OpenAIMessage[] = [];

    // Add system prompt with context
    messages.push({
      role: "system",
      content: this.buildSystemPrompt(context),
    });

    // Add conversation history (last 10 messages to stay within token limits)
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    // Add current message
    messages.push({
      role: "user",
      content: userMessage,
    });

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = (await response.json()) as OpenAIChatCompletion;
      const content = data.choices[0].message.content;
      const usage = data.usage;

      return {
        content,
        target: this.id as any,
        model: this.currentModel,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
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
    return ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"];
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
    return 128000; // GPT-4 Turbo context window
  }

  getCostPerToken(): { input: number; output: number } {
    return {
      input: 0.00003, // $0.03 per 1K input tokens
      output: 0.0006, // $0.06 per 1K output tokens
    };
  }
}
