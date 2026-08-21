/**
 * Unified Chat Component
 *
 * Main UI surface for the conversation layer.
 * Displays messages, target selector, context mode, and input.
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import type {
  Conversation,
  ConversationMessage,
  AITargetId,
  ContextMode,
  GraphRepository,
} from "@/types/graph";
import { ConversationStore } from "@/lib/graph/conversation-store";
import { getContextResolver } from "@/lib/graph/context-resolver";
import { getTargetRegistry } from "@/lib/conversation/ai-target";

interface UnifiedChatProps {
  conversation: Conversation;
  graphRepo: GraphRepository;
  onConversationUpdate?: (updated: Conversation) => void;
}

export function UnifiedChat({
  conversation,
  graphRepo,
  onConversationUpdate,
}: UnifiedChatProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentTarget, setCurrentTarget] = useState<AITargetId>(
    conversation.activeTarget
  );
  const [contextMode, setContextMode] = useState<ContextMode>(
    conversation.contextMode
  );
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showComparisonMenu, setShowComparisonMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationStore = new ConversationStore(graphRepo);
  const contextResolver = getContextResolver();
  const targetRegistry = getTargetRegistry();

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [conversation.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages(): Promise<void> {
    const loaded = await conversationStore.getMessages(
      conversation.graphId,
      conversation.id,
      100
    );
    setMessages(loaded);
  }

  async function sendMessage(targetOverride?: AITargetId): Promise<void> {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setIsLoading(true);

    try {
      const target = targetOverride || currentTarget;

      // Add user message
      const userMsg = await conversationStore.addMessage(
        conversation.graphId,
        conversation.id,
        "user",
        trimmed,
        target
      );
      setMessages((prev) => [...prev, userMsg]);

      // Resolve context
      const resolvedContext = await contextResolver.resolveContext(
        contextMode,
        conversation.projectId,
        conversation.taskId
      );

      // Get target and send message
      const aiTarget = targetRegistry.getTarget(target);
      if (!aiTarget) {
        throw new Error(`Target ${target} not found`);
      }

      const response = await aiTarget.sendMessage(
        trimmed,
        messages,
        resolvedContext,
        { temperature: 0.7 }
      );

      // Add assistant message
      const assistantMsg = await conversationStore.addMessage(
        conversation.graphId,
        conversation.id,
        "assistant",
        response.content,
        target,
        resolvedContext
      );
      setMessages((prev) => [...prev, assistantMsg]);

      // Clear input
      setInputValue("");

      // Update conversation metadata
      if (targetOverride && targetOverride !== currentTarget) {
        // Don't update active target if override was used
      } else {
        await updateConversation({ activeTarget: target, contextMode });
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Add error message
      const errorMsg = await conversationStore.addMessage(
        conversation.graphId,
        conversation.id,
        "assistant",
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        currentTarget
      );
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateConversation(updates: {
    activeTarget?: AITargetId;
    contextMode?: ContextMode;
  }): Promise<void> {
    const updated = await conversationStore.updateConversation(
      conversation.graphId,
      conversation.id,
      {
        activeTarget: updates.activeTarget || currentTarget,
        contextMode: updates.contextMode || contextMode,
      }
    );

    if (updated) {
      setCurrentTarget(updates.activeTarget || currentTarget);
      setContextMode(updates.contextMode || contextMode);
      onConversationUpdate?.(updated);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleContextModeChange(mode: ContextMode): void {
    setContextMode(mode);
    updateConversation({ contextMode: mode });
  }

  function handleTargetChange(target: AITargetId): void {
    setCurrentTarget(target);
    updateConversation({ activeTarget: target });
  }

  const availableTargets = targetRegistry.getAllTargets();
  const contextModes: ContextMode[] = ["Current", "Project", "Global", "Task", "Full"];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {conversation.name}
          </h2>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {messages.length} messages
          </div>
        </div>

        {conversation.description && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            {conversation.description}
          </p>
        )}

        {/* Target & Context Selectors */}
        <div className="flex gap-2">
          <select
            value={currentTarget}
            onChange={(e) => handleTargetChange(e.target.value as AITargetId)}
            className="px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            title="Select AI target for this conversation"
          >
            {availableTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
                {target.getStatus() === "offline" && " (offline)"}
              </option>
            ))}
          </select>

          <select
            value={contextMode}
            onChange={(e) => handleContextModeChange(e.target.value as ContextMode)}
            className="px-3 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            title="Select context mode (what information to include)"
          >
            {contextModes.map((mode) => (
              <option key={mode} value={mode}>
                {mode} Context
              </option>
            ))}
          </select>

          <div className="px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900 rounded">
            📋 {contextMode}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-slate-500 dark:text-slate-400">
              <p className="mb-2">No messages yet</p>
              <p className="text-sm">Start a conversation to get insights about your project</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={idx === messages.length - 1}
            onAskAnother={() => setShowComparisonMenu(true)}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
        {showComparisonMenu && (
          <div className="flex gap-2 p-2 bg-slate-100 dark:bg-slate-900 rounded">
            <span className="text-xs text-slate-600 dark:text-slate-400 py-1">
              Ask another AI:
            </span>
            {availableTargets
              .filter((t) => t.id !== currentTarget && t.getStatus() !== "offline")
              .slice(0, 3)
              .map((target) => (
                <button
                  key={target.id}
                  onClick={() => {
                    sendMessage(target.id as AITargetId);
                    setShowComparisonMenu(false);
                  }}
                  className="px-2 py-1 text-xs rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  {target.name}
                </button>
              ))}
            <button
              onClick={() => setShowComparisonMenu(false)}
              className="px-2 py-1 text-xs rounded bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              ✕
            </button>
          </div>
        )}

        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Type your message... (Shift+Enter for new line)"
          className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
          rows={3}
          disabled={isLoading}
        />

        <div className="flex gap-2">
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !inputValue.trim()}
            className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => setShowComparisonMenu(!showComparisonMenu)}
              className="px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900"
              title="Ask another AI for comparison"
            >
              🤖 Compare
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          {currentTarget === "gpt-4" && "Using OpenAI GPT-4"}
          {currentTarget === "claude-opus" && "Using Claude (Anthropic)"}
          {currentTarget === "ollama" && "Using Ollama (Local)"}
          {currentTarget === "control" && "Using Control (Graph Orchestrator)"}
          {currentTarget === "auto" && "Using Auto (Smart Selection)"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ConversationMessage;
  isLast: boolean;
  onAskAnother: () => void;
}

function MessageBubble({ message, isLast, onAskAnother }: MessageBubbleProps) {
  const isUser = message.role === "user";

  const targetNames: Record<AITargetId, string> = {
    "gpt-4": "GPT-4",
    "gpt-3.5-turbo": "GPT-3.5",
    ollama: "Ollama",
    "claude-opus": "Claude",
    "claude-sonnet": "Claude",
    codex: "Codex",
    opencode: "OpenCode",
    "developer-agent": "Developer",
    control: "Control",
    auto: "Auto",
  };

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-2xl rounded-lg p-3 ${
          isUser
            ? "bg-blue-600 text-white rounded-br-none"
            : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none"
        }`}
      >
        {!isUser && (
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {targetNames[message.target] || message.target}
          </div>
        )}

        <div className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {message.references && message.references.length > 0 && (
          <div className="mt-2 pt-2 border-t border-opacity-30 border-current text-xs opacity-75">
            {message.references.map((ref) => (
              <div key={`${ref.type}:${ref.entityId}`}>
                📎 {ref.type}
              </div>
            ))}
          </div>
        )}

        {!isUser && isLast && (
          <button
            onClick={onAskAnother}
            className="mt-2 text-xs px-2 py-1 rounded opacity-70 hover:opacity-100 bg-white/20 hover:bg-white/30"
          >
            Ask another AI →
          </button>
        )}
      </div>
    </div>
  );
}
