/**
 * Ollama Target Adapter
 *
 * Implements AIConversationTarget for Ollama local models
 * Ollama runs on localhost:11434 by default
 */

import { BaseAITarget } from "../ai-target";
import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  TargetResponse,
} from "@/types/graph";

interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OllamaChatResponse {
  message: {
    role: "assistant";
    content: string;
  };
  done: boolean;
}

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    size: number;
  }>;
}

export class OllamaTarget extends BaseAITarget {
  private baseURL: string = "http://localhost:11434";
  private currentModel: string = "llama2";
  private availableModels: string[] = [];

  constructor() {
    super("ollama", "Ollama (Local)", "Local LLM inference via Ollama", "provider", "chat");
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, { method: "GET" });

      if (response.ok) {
        const data = (await response.json()) as OllamaTagsResponse;
        this.availableModels = data.models.map((m) => m.name.split(":")[0]);

        if (this.availableModels.length > 0) {
          this.currentModel = this.availableModels[0];
          this.status = "connected";
          this.statusMessage = `Ready (${this.availableModels.length} models)`;
        } else {
          this.status = "offline";
          this.statusMessage = "No models downloaded";
        }
      } else {
        this.status = "offline";
        this.statusMessage = "Ollama not responding";
      }
    } catch (error) {
      this.status = "offline";
      this.statusMessage = "Ollama unavailable (is it running?)";
    }
  }

  async isAvailable(): Promise<boolean> {
    await this.checkAvailability();
    return this.status === "connected";
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: ConversationMessage[],
    context: ResolvedContext,
    options: TargetOptions
  ): Promise<TargetResponse> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error("Ollama is not available");
    }

    this.recordUsage();

    // Build messages
    const messages: OllamaMessage[] = [];

    // Add system prompt with context
    messages.push({
      role: "system",
      content: this.buildSystemPrompt(context),
    });

    // Add conversation history (last 10 messages)
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
      const startTime = Date.now();

      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.currentModel,
          messages,
          stream: false, // Non-streaming for simplicity
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 2048,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = (await response.json()) as OllamaChatResponse;
      const duration = Date.now() - startTime;

      return {
        content: data.message.content,
        target: this.id as any,
        model: this.currentModel,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.status = "error";
      this.statusMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    await this.checkAvailability();
    return this.availableModels;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async setModel(model: string): Promise<void> {
    const available = await this.getAvailableModels();
    if (!available.includes(model)) {
      throw new Error(`Model ${model} not available in Ollama`);
    }
    this.currentModel = model;
  }

  supportsStreaming(): boolean {
    return true;
  }

  supportsToolUse(): boolean {
    return false; // Most Ollama models don't support tool use
  }

  supportsArtifacts(): boolean {
    return false;
  }

  supportsImageInput(): boolean {
    return false;
  }

  hasCredentials(): boolean {
    return true; // Ollama doesn't require credentials
  }

  requiresAuth(): boolean {
    return false; // Local service, no auth needed
  }

  getAuthStatus(): "authenticated" | "unauthenticated" | "expired" {
    return "authenticated"; // Always "authenticated" for local service
  }

  getContextLength(): number {
    // Most Ollama models have 4K-8K context
    return 4096;
  }

  getCostPerToken(): { input: number; output: number } {
    return { input: 0, output: 0 }; // Local models have no cost
  }
}
