/**
 * Conversation Store
 *
 * Wraps GraphRepository to provide conversation-specific CRUD operations.
 * Manages conversations, messages, and artifacts with FeltDB persistence.
 */

import type {
  GraphRepository,
  GraphId,
  EntityId,
  Conversation,
  ConversationMessage,
  ConversationArtifactData,
  AITargetId,
  ContextMode,
  ResolvedContext,
  EntityReference,
  ConversationMetadata,
} from "@/types/graph";
import { makeEntityId, makeGraphId } from "@/types/graph";

export class ConversationStore {
  constructor(private graphRepo: GraphRepository) {}

  // ─────────────────────────────────────────────────────────────────
  // Conversation Operations
  // ─────────────────────────────────────────────────────────────────

  async createConversation(
    graphId: GraphId,
    name: string,
    activeTarget: AITargetId,
    contextMode: ContextMode,
    projectId?: string,
    taskId?: string,
    description?: string
  ): Promise<Conversation> {
    const now = Date.now();
    const metadata: ConversationMetadata = {
      projectId,
      taskId,
      createdAt: now,
      updatedAt: now,
      isArchived: false,
      tags: [],
    };

    const entity = await this.graphRepo.addEntity(graphId, {
      type: "Conversation",
      name,
      description,
      properties: {
        activeTarget,
        contextMode,
        metadata,
      },
    });

    return {
      id: entity.id,
      graphId,
      projectId,
      taskId,
      name,
      description,
      activeTarget,
      contextMode,
      metadata,
      messageCount: 0,
      artifactCount: 0,
    };
  }

  async getConversation(graphId: GraphId, conversationId: EntityId): Promise<Conversation | null> {
    const entity = await this.graphRepo.getEntity(graphId, conversationId);
    if (!entity || entity.type !== "Conversation") {
      return null;
    }

    const props = entity.properties as Record<string, unknown>;
    const metadata = props.metadata as ConversationMetadata;

    // Count messages and artifacts
    const messages = await this.graphRepo.query(graphId, {
      types: ["ConversationMessage"],
      search: `conversationId:${conversationId}`,
    });
    const artifacts = await this.graphRepo.query(graphId, {
      types: ["ConversationArtifact"],
      search: `conversationId:${conversationId}`,
    });

    return {
      id: entity.id,
      graphId,
      projectId: metadata.projectId,
      taskId: metadata.taskId,
      name: entity.name,
      description: entity.description,
      activeTarget: props.activeTarget as AITargetId,
      contextMode: props.contextMode as ContextMode,
      metadata,
      messageCount: messages.total,
      artifactCount: artifacts.total,
      lastMessageAt: metadata.updatedAt,
    };
  }

  async listConversations(
    graphId: GraphId,
    projectId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Conversation[]> {
    const query = projectId
      ? {
          types: ["Conversation"] as const,
          search: `projectId:${projectId}`,
          limit,
          offset,
        }
      : {
          types: ["Conversation"] as const,
          limit,
          offset,
        };

    const result = await this.graphRepo.query(graphId, query);

    return Promise.all(
      result.entities.map(async (entity) => {
        const conv = await this.getConversation(graphId, entity.id);
        return conv!;
      })
    );
  }

  async updateConversation(
    graphId: GraphId,
    conversationId: EntityId,
    updates: Partial<{
      name: string;
      description: string;
      activeTarget: AITargetId;
      contextMode: ContextMode;
      isArchived: boolean;
      tags: string[];
    }>
  ): Promise<Conversation> {
    const current = await this.getConversation(graphId, conversationId);
    if (!current) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const metadata: ConversationMetadata = {
      ...current.metadata,
      isArchived: updates.isArchived ?? current.metadata.isArchived,
      tags: updates.tags ?? current.metadata.tags,
      updatedAt: Date.now(),
    };

    await this.graphRepo.updateEntity(graphId, conversationId, {
      name: updates.name ?? current.name,
      description: updates.description ?? current.description,
      properties: {
        activeTarget: updates.activeTarget ?? current.activeTarget,
        contextMode: updates.contextMode ?? current.contextMode,
        metadata,
      },
    });

    return this.getConversation(graphId, conversationId)!;
  }

  async deleteConversation(graphId: GraphId, conversationId: EntityId): Promise<void> {
    // Delete all messages
    const messages = await this.graphRepo.query(graphId, {
      types: ["ConversationMessage"],
      search: `conversationId:${conversationId}`,
    });

    for (const msg of messages.entities) {
      await this.graphRepo.deleteEntity(graphId, msg.id);
    }

    // Delete all artifacts
    const artifacts = await this.graphRepo.query(graphId, {
      types: ["ConversationArtifact"],
      search: `conversationId:${conversationId}`,
    });

    for (const artifact of artifacts.entities) {
      await this.graphRepo.deleteEntity(graphId, artifact.id);
    }

    // Delete conversation itself
    await this.graphRepo.deleteEntity(graphId, conversationId);
  }

  // ─────────────────────────────────────────────────────────────────
  // Message Operations
  // ─────────────────────────────────────────────────────────────────

  async addMessage(
    graphId: GraphId,
    conversationId: EntityId,
    role: "user" | "assistant" | "system",
    content: string,
    target: AITargetId,
    contextUsed?: ResolvedContext,
    references?: EntityReference[]
  ): Promise<ConversationMessage> {
    // Get current message count to determine index
    const messages = await this.graphRepo.query(graphId, {
      types: ["ConversationMessage"],
      search: `conversationId:${conversationId}`,
    });

    const index = messages.total;
    const now = Date.now();

    const entity = await this.graphRepo.addEntity(graphId, {
      type: "ConversationMessage",
      name: `[${role}] ${content.substring(0, 50)}...`,
      properties: {
        conversationId,
        role,
        content,
        target,
        timestamp: now,
        index,
        contextUsed,
        references: references || [],
        artifacts: [],
      },
    });

    // Link message to conversation
    await this.graphRepo.addRelationship(graphId, {
      type: "includes_message",
      fromId: conversationId,
      toId: entity.id,
    });

    // Update conversation metadata
    const conv = await this.getConversation(graphId, conversationId);
    if (conv) {
      const metadata = { ...conv.metadata, updatedAt: now };
      await this.graphRepo.updateEntity(graphId, conversationId, {
        properties: {
          activeTarget: conv.activeTarget,
          contextMode: conv.contextMode,
          metadata,
        },
      });
    }

    return {
      id: entity.id,
      conversationId,
      role,
      content,
      target,
      timestamp: now,
      index,
      contextUsed,
      references: references || [],
      artifacts: [],
    };
  }

  async getMessages(
    graphId: GraphId,
    conversationId: EntityId,
    limit: number = 100,
    offset: number = 0
  ): Promise<ConversationMessage[]> {
    const result = await this.graphRepo.query(graphId, {
      types: ["ConversationMessage"],
      search: `conversationId:${conversationId}`,
      limit,
      offset,
    });

    return result.entities.map((entity) => {
      const props = entity.properties as Record<string, unknown>;
      return {
        id: entity.id,
        conversationId: conversationId,
        role: props.role as "user" | "assistant" | "system",
        content: props.content as string,
        target: props.target as AITargetId,
        timestamp: props.timestamp as number,
        index: props.index as number,
        contextUsed: props.contextUsed as ResolvedContext | undefined,
        references: (props.references as EntityReference[]) || [],
        artifacts: (props.artifacts as EntityId[]) || [],
      };
    });
  }

  async getMessage(
    graphId: GraphId,
    messageId: EntityId
  ): Promise<ConversationMessage | null> {
    const entity = await this.graphRepo.getEntity(graphId, messageId);
    if (!entity || entity.type !== "ConversationMessage") {
      return null;
    }

    const props = entity.properties as Record<string, unknown>;
    return {
      id: entity.id,
      conversationId: props.conversationId as EntityId,
      role: props.role as "user" | "assistant" | "system",
      content: props.content as string,
      target: props.target as AITargetId,
      timestamp: props.timestamp as number,
      index: props.index as number,
      contextUsed: props.contextUsed as ResolvedContext | undefined,
      references: (props.references as EntityReference[]) || [],
      artifacts: (props.artifacts as EntityId[]) || [],
    };
  }

  async updateMessageReferences(
    graphId: GraphId,
    messageId: EntityId,
    references: EntityReference[]
  ): Promise<void> {
    const msg = await this.getMessage(graphId, messageId);
    if (!msg) {
      throw new Error(`Message ${messageId} not found`);
    }

    const entity = await this.graphRepo.getEntity(graphId, messageId);
    const props = entity!.properties as Record<string, unknown>;

    await this.graphRepo.updateEntity(graphId, messageId, {
      properties: {
        ...props,
        references,
      },
    });
  }

  async addMessageArtifact(
    graphId: GraphId,
    messageId: EntityId,
    artifactId: EntityId
  ): Promise<void> {
    const msg = await this.getMessage(graphId, messageId);
    if (!msg) {
      throw new Error(`Message ${messageId} not found`);
    }

    const entity = await this.graphRepo.getEntity(graphId, messageId);
    const props = entity!.properties as Record<string, unknown>;
    const artifacts = (props.artifacts as EntityId[]) || [];

    if (!artifacts.includes(artifactId)) {
      artifacts.push(artifactId);
      await this.graphRepo.updateEntity(graphId, messageId, {
        properties: {
          ...props,
          artifacts,
        },
      });
    }

    // Link artifact to message
    await this.graphRepo.addRelationship(graphId, {
      type: "creates_artifact",
      fromId: messageId,
      toId: artifactId,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Artifact Operations
  // ─────────────────────────────────────────────────────────────────

  async createArtifact(
    graphId: GraphId,
    conversationId: EntityId,
    messageId: EntityId,
    artifactType: "Task" | "Decision" | "Requirement",
    content: string,
    linkedEntityId?: EntityId
  ): Promise<ConversationArtifactData> {
    const now = Date.now();

    const entity = await this.graphRepo.addEntity(graphId, {
      type: "ConversationArtifact",
      name: `${artifactType}: ${content.substring(0, 40)}...`,
      properties: {
        conversationId,
        messageId,
        artifactType,
        linkedEntityId,
        content,
        createdAt: now,
      },
    });

    // Link to conversation
    await this.graphRepo.addRelationship(graphId, {
      type: "linked_to_conversation",
      fromId: entity.id,
      toId: conversationId,
    });

    // Link to message
    await this.addMessageArtifact(graphId, messageId, entity.id);

    // Link to linked entity if provided
    if (linkedEntityId) {
      await this.graphRepo.addRelationship(graphId, {
        type: "derived_from",
        fromId: entity.id,
        toId: linkedEntityId,
      });
    }

    return {
      conversationId,
      messageId,
      artifactType,
      linkedEntityId,
      content,
      createdAt: now,
    };
  }

  async getArtifact(
    graphId: GraphId,
    artifactId: EntityId
  ): Promise<ConversationArtifactData | null> {
    const entity = await this.graphRepo.getEntity(graphId, artifactId);
    if (!entity || entity.type !== "ConversationArtifact") {
      return null;
    }

    const props = entity.properties as Record<string, unknown>;
    return {
      conversationId: props.conversationId as EntityId,
      messageId: props.messageId as EntityId,
      artifactType: props.artifactType as "Task" | "Decision" | "Requirement",
      linkedEntityId: props.linkedEntityId as EntityId | undefined,
      content: props.content as string,
      createdAt: props.createdAt as number,
    };
  }

  async listArtifacts(
    graphId: GraphId,
    conversationId: EntityId
  ): Promise<ConversationArtifactData[]> {
    const result = await this.graphRepo.query(graphId, {
      types: ["ConversationArtifact"],
      search: `conversationId:${conversationId}`,
    });

    return result.entities.map((entity) => {
      const props = entity.properties as Record<string, unknown>;
      return {
        conversationId,
        messageId: props.messageId as EntityId,
        artifactType: props.artifactType as "Task" | "Decision" | "Requirement",
        linkedEntityId: props.linkedEntityId as EntityId | undefined,
        content: props.content as string,
        createdAt: props.createdAt as number,
      };
    });
  }
}
