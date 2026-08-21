/**
 * Conversation History Manager
 *
 * Manages conversation history with filtering, sorting, and organization.
 * Loads persistent conversations from FeltDB on startup.
 */

import type {
  GraphRepository,
  Conversation,
  AITargetId,
  ContextMode,
  GraphId,
} from "@/types/graph";
import { ConversationStore } from "@/lib/graph/conversation-store";

export interface ConversationFilter {
  projectId?: string;
  taskId?: string;
  target?: AITargetId;
  contextMode?: ContextMode;
  isArchived?: boolean;
  searchText?: string;
  dateRange?: {
    start: number;
    end: number;
  };
}

export interface SortOptions {
  field: "name" | "createdAt" | "updatedAt" | "messageCount";
  direction: "asc" | "desc";
}

/**
 * Conversation history manager
 */
export class ConversationHistoryManager {
  private conversations: Map<string, Conversation> = new Map();
  private conversationStore: ConversationStore | null = null;
  private graphRepo: GraphRepository | null = null;

  constructor(graphRepo: GraphRepository) {
    this.graphRepo = graphRepo;
    this.conversationStore = new ConversationStore(graphRepo);
  }

  /**
   * Load all conversations for a project
   */
  async loadProjectConversations(
    graphId: GraphId,
    projectId: string
  ): Promise<Conversation[]> {
    if (!this.conversationStore) {
      throw new Error("ConversationStore not initialized");
    }

    const conversations = await this.conversationStore.listConversations(
      graphId,
      projectId,
      1000
    );

    // Cache them
    conversations.forEach((conv) => {
      this.conversations.set(conv.id, conv);
    });

    return conversations;
  }

  /**
   * Load all conversations across all projects
   */
  async loadAllConversations(graphId: GraphId): Promise<Conversation[]> {
    if (!this.conversationStore) {
      throw new Error("ConversationStore not initialized");
    }

    const conversations = await this.conversationStore.listConversations(
      graphId,
      undefined,
      10000
    );

    // Cache them
    conversations.forEach((conv) => {
      this.conversations.set(conv.id, conv);
    });

    return conversations;
  }

  /**
   * Filter conversations based on criteria
   */
  filterConversations(
    conversations: Conversation[],
    filter: ConversationFilter
  ): Conversation[] {
    let results = [...conversations];

    if (filter.projectId) {
      results = results.filter((c) => c.projectId === filter.projectId);
    }

    if (filter.taskId) {
      results = results.filter((c) => c.taskId === filter.taskId);
    }

    if (filter.target) {
      results = results.filter((c) => c.activeTarget === filter.target);
    }

    if (filter.contextMode) {
      results = results.filter((c) => c.contextMode === filter.contextMode);
    }

    if (filter.isArchived !== undefined) {
      results = results.filter((c) => c.metadata.isArchived === filter.isArchived);
    }

    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.description?.toLowerCase().includes(searchLower)
      );
    }

    if (filter.dateRange) {
      results = results.filter(
        (c) =>
          c.metadata.createdAt >= filter.dateRange!.start &&
          c.metadata.createdAt <= filter.dateRange!.end
      );
    }

    return results;
  }

  /**
   * Sort conversations
   */
  sortConversations(
    conversations: Conversation[],
    options: SortOptions
  ): Conversation[] {
    const sorted = [...conversations];

    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (options.field) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "createdAt":
          aVal = a.metadata.createdAt;
          bVal = b.metadata.createdAt;
          break;
        case "updatedAt":
          aVal = a.metadata.updatedAt;
          bVal = b.metadata.updatedAt;
          break;
        case "messageCount":
          aVal = a.messageCount;
          bVal = b.messageCount;
          break;
      }

      if (options.direction === "asc") {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return sorted;
  }

  /**
   * Group conversations by date
   */
  groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
    const groups: Record<string, Conversation[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "This Month": [],
      Earlier: [],
    };

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const conv of conversations) {
      const daysSince = Math.floor((now - conv.metadata.updatedAt) / oneDayMs);

      if (daysSince === 0) {
        groups["Today"].push(conv);
      } else if (daysSince === 1) {
        groups["Yesterday"].push(conv);
      } else if (daysSince < 7) {
        groups["This Week"].push(conv);
      } else if (daysSince < 30) {
        groups["This Month"].push(conv);
      } else {
        groups["Earlier"].push(conv);
      }
    }

    // Remove empty groups
    Object.keys(groups).forEach((key) => {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    });

    return groups;
  }

  /**
   * Group conversations by project
   */
  groupByProject(
    conversations: Conversation[]
  ): Record<string, Conversation[]> {
    const groups: Record<string, Conversation[]> = {};

    for (const conv of conversations) {
      const projectId = conv.projectId || "No Project";
      if (!groups[projectId]) {
        groups[projectId] = [];
      }
      groups[projectId].push(conv);
    }

    return groups;
  }

  /**
   * Get conversation statistics
   */
  getStatistics(conversations: Conversation[]): {
    total: number;
    byTarget: Record<AITargetId, number>;
    byContextMode: Record<ContextMode, number>;
    averageMessages: number;
    oldestCreated: number;
  } {
    const byTarget: Record<AITargetId, number> = {};
    const byContextMode: Record<ContextMode, number> = {};

    let totalMessages = 0;
    let oldestCreated = Date.now();

    for (const conv of conversations) {
      // Count by target
      byTarget[conv.activeTarget] = (byTarget[conv.activeTarget] || 0) + 1;

      // Count by context mode
      byContextMode[conv.contextMode] = (byContextMode[conv.contextMode] || 0) + 1;

      // Message stats
      totalMessages += conv.messageCount;
      oldestCreated = Math.min(oldestCreated, conv.metadata.createdAt);
    }

    return {
      total: conversations.length,
      byTarget,
      byContextMode,
      averageMessages: conversations.length > 0 ? totalMessages / conversations.length : 0,
      oldestCreated,
    };
  }

  /**
   * Search conversation history
   */
  search(
    conversations: Conversation[],
    query: string,
    fields: ("name" | "description")[] = ["name", "description"]
  ): Conversation[] {
    const queryLower = query.toLowerCase();

    return conversations.filter((conv) => {
      for (const field of fields) {
        const value = conv[field as keyof Conversation];
        if (
          typeof value === "string" &&
          value.toLowerCase().includes(queryLower)
        ) {
          return true;
        }
      }
      return false;
    });
  }

  /**
   * Get recent conversations
   */
  getRecent(conversations: Conversation[], limit: number = 10): Conversation[] {
    return this.sortConversations(conversations, {
      field: "updatedAt",
      direction: "desc",
    }).slice(0, limit);
  }

  /**
   * Get pinned/starred conversations
   */
  getStarred(
    conversations: Conversation[]
  ): Conversation[] {
    return conversations.filter((c) => c.metadata.tags?.includes("starred"));
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(
    graphId: GraphId,
    conversationId: string
  ): Promise<void> {
    if (!this.conversationStore) {
      throw new Error("ConversationStore not initialized");
    }

    await this.conversationStore.updateConversation(graphId, conversationId as any, {
      isArchived: true,
    });

    // Remove from cache
    this.conversations.delete(conversationId);
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(
    graphId: GraphId,
    conversationId: string
  ): Promise<void> {
    if (!this.conversationStore) {
      throw new Error("ConversationStore not initialized");
    }

    await this.conversationStore.deleteConversation(graphId, conversationId as any);

    // Remove from cache
    this.conversations.delete(conversationId);
  }
}
