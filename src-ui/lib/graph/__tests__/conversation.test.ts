/**
 * Conversation Store Integration Tests
 *
 * Verifies conversation persistence and CRUD operations
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGraphRepository } from "../index";
import { ConversationStore } from "../conversation-store";
import { ContextResolver, createContextResolver } from "../context-resolver";
import { makeGraphId, makeEntityId } from "@/types/graph";
import type { GraphRepository } from "@/types/graph";

describe("Conversation Layer - Phase 1", () => {
  let graphRepo: GraphRepository;
  let conversationStore: ConversationStore;
  let contextResolver: ContextResolver;

  beforeAll(async () => {
    // Initialize repository with test namespace
    graphRepo = await createGraphRepository(`test_conv_${Date.now()}`);
    conversationStore = new ConversationStore(graphRepo);
    contextResolver = createContextResolver(graphRepo);
  });

  afterAll(async () => {
    if (graphRepo.close) {
      await graphRepo.close();
    }
  });

  describe("Conversation CRUD", () => {
    it("should create a conversation", async () => {
      const graphId = makeGraphId(`test_graph_${Date.now()}`);

      // Create project graph first
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_project",
        projectName: "Test Project",
        projectPath: "/test",
      });

      const conversation = await conversationStore.createConversation(
        projectGraph.id,
        "Test Conversation",
        "claude-opus",
        "Project",
        "test_project"
      );

      expect(conversation).toBeDefined();
      expect(conversation.name).toBe("Test Conversation");
      expect(conversation.activeTarget).toBe("claude-opus");
      expect(conversation.contextMode).toBe("Project");
      expect(conversation.projectId).toBe("test_project");
    });

    it("should list conversations", async () => {
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_project_2",
        projectName: "Test Project 2",
        projectPath: "/test2",
      });

      // Create multiple conversations
      await conversationStore.createConversation(
        projectGraph.id,
        "Conv 1",
        "gpt-4",
        "Current",
        "test_project_2"
      );

      await conversationStore.createConversation(
        projectGraph.id,
        "Conv 2",
        "claude-opus",
        "Project",
        "test_project_2"
      );

      const conversations = await conversationStore.listConversations(
        projectGraph.id,
        "test_project_2"
      );

      expect(conversations.length).toBeGreaterThanOrEqual(2);
    });

    it("should update a conversation", async () => {
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_project_3",
        projectName: "Test Project 3",
        projectPath: "/test3",
      });

      const created = await conversationStore.createConversation(
        projectGraph.id,
        "Original Name",
        "gpt-4",
        "Current"
      );

      const updated = await conversationStore.updateConversation(
        projectGraph.id,
        created.id,
        {
          name: "Updated Name",
          activeTarget: "claude-opus",
          contextMode: "Full",
        }
      );

      expect(updated.name).toBe("Updated Name");
      expect(updated.activeTarget).toBe("claude-opus");
      expect(updated.contextMode).toBe("Full");
    });

    it("should get a conversation", async () => {
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_project_4",
        projectName: "Test Project 4",
        projectPath: "/test4",
      });

      const created = await conversationStore.createConversation(
        projectGraph.id,
        "Test Get",
        "ollama",
        "Global"
      );

      const retrieved = await conversationStore.getConversation(
        projectGraph.id,
        created.id
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("Test Get");
      expect(retrieved?.activeTarget).toBe("ollama");
    });

    it("should delete a conversation", async () => {
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_project_5",
        projectName: "Test Project 5",
        projectPath: "/test5",
      });

      const created = await conversationStore.createConversation(
        projectGraph.id,
        "To Delete",
        "gpt-4",
        "Current"
      );

      await conversationStore.deleteConversation(projectGraph.id, created.id);

      const retrieved = await conversationStore.getConversation(
        projectGraph.id,
        created.id
      );

      expect(retrieved).toBeNull();
    });
  });

  describe("Message Operations", () => {
    let projectGraph: any;
    let conversationId: any;

    beforeAll(async () => {
      projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_messages",
        projectName: "Test Messages",
        projectPath: "/test_messages",
      });

      const conv = await conversationStore.createConversation(
        projectGraph.id,
        "Message Test",
        "claude-opus",
        "Project"
      );
      conversationId = conv.id;
    });

    it("should add a message to conversation", async () => {
      const message = await conversationStore.addMessage(
        projectGraph.id,
        conversationId,
        "user",
        "What is the project structure?",
        "claude-opus"
      );

      expect(message).toBeDefined();
      expect(message.role).toBe("user");
      expect(message.content).toBe("What is the project structure?");
      expect(message.target).toBe("claude-opus");
      expect(message.index).toBe(0);
    });

    it("should add multiple messages in order", async () => {
      const msg1 = await conversationStore.addMessage(
        projectGraph.id,
        conversationId,
        "user",
        "First question",
        "gpt-4"
      );

      const msg2 = await conversationStore.addMessage(
        projectGraph.id,
        conversationId,
        "assistant",
        "First answer",
        "gpt-4"
      );

      const msg3 = await conversationStore.addMessage(
        projectGraph.id,
        conversationId,
        "user",
        "Second question",
        "claude-opus"
      );

      expect(msg1.index).toBeLessThan(msg2.index);
      expect(msg2.index).toBeLessThan(msg3.index);
    });

    it("should retrieve messages in order", async () => {
      const messages = await conversationStore.getMessages(
        projectGraph.id,
        conversationId,
        100
      );

      expect(messages.length).toBeGreaterThan(0);

      // Verify ordering
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].index).toBeGreaterThanOrEqual(messages[i - 1].index);
      }
    });

    it("should get a single message", async () => {
      const messages = await conversationStore.getMessages(
        projectGraph.id,
        conversationId,
        1
      );

      expect(messages.length).toBeGreaterThan(0);
      const messageId = messages[0].id;

      const retrieved = await conversationStore.getMessage(projectGraph.id, messageId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(messageId);
    });

    it("should update message references", async () => {
      const messages = await conversationStore.getMessages(
        projectGraph.id,
        conversationId,
        1
      );

      const messageId = messages[0].id;

      const references = [
        {
          type: "File" as const,
          entityId: makeEntityId("file_123"),
          excerpt: "Some code excerpt",
        },
      ];

      await conversationStore.updateMessageReferences(
        projectGraph.id,
        messageId,
        references
      );

      const updated = await conversationStore.getMessage(projectGraph.id, messageId);

      expect(updated?.references).toHaveLength(1);
      expect(updated?.references[0].type).toBe("File");
    });
  });

  describe("Artifact Operations", () => {
    let projectGraph: any;
    let conversationId: any;
    let messageId: any;

    beforeAll(async () => {
      projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_artifacts",
        projectName: "Test Artifacts",
        projectPath: "/test_artifacts",
      });

      const conv = await conversationStore.createConversation(
        projectGraph.id,
        "Artifact Test",
        "claude-opus",
        "Project"
      );
      conversationId = conv.id;

      const msg = await conversationStore.addMessage(
        projectGraph.id,
        conversationId,
        "assistant",
        "I'll create a task for this",
        "claude-opus"
      );
      messageId = msg.id;
    });

    it("should create an artifact", async () => {
      const artifact = await conversationStore.createArtifact(
        projectGraph.id,
        conversationId,
        messageId,
        "Task",
        "Implement graph persistence layer"
      );

      expect(artifact).toBeDefined();
      expect(artifact.artifactType).toBe("Task");
      expect(artifact.conversationId).toBe(conversationId);
      expect(artifact.messageId).toBe(messageId);
    });

    it("should get an artifact", async () => {
      const created = await conversationStore.createArtifact(
        projectGraph.id,
        conversationId,
        messageId,
        "Decision",
        "Choose between option A and B"
      );

      // Get the entity ID from the created artifact
      const entities = await graphRepo.query(projectGraph.id, {
        types: ["ConversationArtifact"],
      });

      if (entities.entities.length > 0) {
        const retrieved = await conversationStore.getArtifact(
          projectGraph.id,
          entities.entities[0].id
        );

        expect(retrieved).toBeDefined();
        expect(retrieved?.artifactType).toBe("Decision");
      }
    });

    it("should list artifacts", async () => {
      await conversationStore.createArtifact(
        projectGraph.id,
        conversationId,
        messageId,
        "Requirement",
        "System must handle 10k files"
      );

      const artifacts = await conversationStore.listArtifacts(projectGraph.id, conversationId);

      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts.some((a) => a.artifactType === "Task")).toBe(true);
      expect(artifacts.some((a) => a.artifactType === "Decision")).toBe(true);
      expect(artifacts.some((a) => a.artifactType === "Requirement")).toBe(true);
    });
  });

  describe("Context Resolution", () => {
    let projectGraph: any;

    beforeAll(async () => {
      projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_context",
        projectName: "Test Context Project",
        projectPath: "/test_context",
      });
    });

    it("should resolve Current context", async () => {
      const context = await contextResolver.resolveContext(
        "Current",
        "test_context",
        undefined,
        {
          openFiles: ["src/main.ts", "src/graph.ts"],
          gitStatus: {
            branch: "main",
            isDirty: true,
            uncommittedChanges: ["src/main.ts"],
            stagedChanges: [],
          },
        }
      );

      expect(context.mode).toBe("Current");
      expect(context.currentWorkspace).toBeDefined();
      expect(context.currentWorkspace?.openFiles).toHaveLength(2);
      expect(context.injectedMarkdown).toContain("Current Workspace");
    });

    it("should resolve Project context", async () => {
      const context = await contextResolver.resolveContext(
        "Project",
        "test_context"
      );

      expect(context.mode).toBe("Project");
      expect(context.projectContext).toBeDefined();
      expect(context.injectedMarkdown.length).toBeGreaterThan(0);
    });

    it("should resolve Global context", async () => {
      const context = await contextResolver.resolveContext("Global");

      expect(context.mode).toBe("Global");
      expect(context.globalContext).toBeDefined();
      expect(context.globalContext?.allProjects).toBeDefined();
      expect(context.injectedMarkdown).toContain("Global");
    });

    it("should resolve Full context", async () => {
      const context = await contextResolver.resolveContext("Full", "test_context", undefined, {
        openFiles: ["src/main.ts"],
        gitStatus: {
          branch: "main",
          isDirty: false,
          uncommittedChanges: [],
          stagedChanges: [],
        },
      });

      expect(context.mode).toBe("Full");
      expect(context.currentWorkspace).toBeDefined();
      expect(context.globalContext).toBeDefined();
    });
  });

  describe("Persistence Verification", () => {
    it("should persist conversations across operations", async () => {
      const projectGraph = await graphRepo.createProjectGraph({
        projectId: "test_persist",
        projectName: "Persistence Test",
        projectPath: "/test_persist",
      });

      // Create and persist
      const created = await conversationStore.createConversation(
        projectGraph.id,
        "Persistent Conversation",
        "claude-opus",
        "Project"
      );

      // Add messages
      const msg1 = await conversationStore.addMessage(
        projectGraph.id,
        created.id,
        "user",
        "Question 1",
        "claude-opus"
      );

      const msg2 = await conversationStore.addMessage(
        projectGraph.id,
        created.id,
        "assistant",
        "Answer 1",
        "claude-opus"
      );

      // Create artifact
      const artifact = await conversationStore.createArtifact(
        projectGraph.id,
        created.id,
        msg1.id,
        "Task",
        "Do something"
      );

      // Retrieve and verify all persisted
      const retrievedConv = await conversationStore.getConversation(projectGraph.id, created.id);
      const messages = await conversationStore.getMessages(projectGraph.id, created.id);
      const artifacts = await conversationStore.listArtifacts(projectGraph.id, created.id);

      expect(retrievedConv).toBeDefined();
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(artifacts.length).toBeGreaterThan(0);
    });
  });
});
