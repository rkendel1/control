/**
 * End-to-End Integration Tests
 *
 * Verifies complete unified conversation layer workflow
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGraphRepository } from "../../graph";
import {
  ConversationStore,
  ContextResolver,
  createContextResolver,
} from "../../graph/index";
import { initializeTargets, getTargetRegistry } from "../target-factory";
import {
  parseEntityReferences,
  extractArtifactSuggestions,
  globalSearch,
  ConversationHistoryManager,
  getPreferencesManager,
} from "../index";
import type { GraphRepository, Conversation } from "@/types/graph";
import { makeEntityId } from "@/types/graph";

describe("Unified Conversation Layer - E2E Integration", () => {
  let graphRepo: GraphRepository;
  let conversationStore: ConversationStore;
  let contextResolver: ContextResolver;
  let historyManager: ConversationHistoryManager;
  let preferencesManager: any;
  let conversation: Conversation;

  beforeAll(async () => {
    // Initialize all components
    graphRepo = await createGraphRepository(`test_e2e_${Date.now()}`);
    conversationStore = new ConversationStore(graphRepo);
    contextResolver = createContextResolver(graphRepo);
    historyManager = new ConversationHistoryManager(graphRepo);
    preferencesManager = getPreferencesManager();

    // Initialize targets
    await initializeTargets(graphRepo);

    // Create test project and conversation
    const projectGraph = await graphRepo.createProjectGraph({
      projectId: "e2e_project",
      projectName: "E2E Test Project",
      projectPath: "/e2e",
    });

    conversation = await conversationStore.createConversation(
      projectGraph.id,
      "E2E Test Conversation",
      "claude-opus",
      "Project",
      "e2e_project",
      undefined,
      "Testing unified conversation layer"
    );
  });

  afterAll(async () => {
    if (graphRepo.close) {
      await graphRepo.close();
    }
  });

  describe("Complete Workflow", () => {
    it("should support full conversation flow", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      expect(projectGraph).toBeDefined();

      // 1. Load conversation
      const loaded = await conversationStore.getConversation(
        projectGraph!.id,
        conversation.id
      );
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe("E2E Test Conversation");

      // 2. Add user message
      const userMsg = await conversationStore.addMessage(
        projectGraph!.id,
        conversation.id,
        "user",
        "How should I structure this project?",
        "claude-opus"
      );
      expect(userMsg).toBeDefined();
      expect(userMsg.role).toBe("user");
      expect(userMsg.target).toBe("claude-opus");

      // 3. Resolve context
      const context = await contextResolver.resolveContext("Project", "e2e_project");
      expect(context).toBeDefined();
      expect(context.mode).toBe("Project");
      expect(context.injectedMarkdown.length).toBeGreaterThan(0);

      // 4. Parse entity references from user message
      const msgWithRefs =
        "Looking at [file: src/main.ts] for the [symbol: GraphRepository]";
      const refs = parseEntityReferences(msgWithRefs);
      expect(refs.length).toBeGreaterThan(0);

      // 5. Add assistant message
      const assistantMsg = await conversationStore.addMessage(
        projectGraph!.id,
        conversation.id,
        "assistant",
        "I recommend using a modular architecture with clear separation of concerns.",
        "claude-opus",
        context,
        refs.map((r) => ({
          type: r.type,
          entityId: makeEntityId(`ref_${Date.now()}`),
          excerpt: r.identifier,
        }))
      );
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.contextUsed).toBeDefined();

      // 6. Extract artifacts from response
      const artifacts = extractArtifactSuggestions(assistantMsg.content);
      expect(artifacts).toBeDefined();

      // 7. Create artifact from conversation
      if (artifacts.length > 0 || assistantMsg.content.includes("module")) {
        const artifact = await conversationStore.createArtifact(
          projectGraph!.id,
          conversation.id,
          assistantMsg.id,
          "Requirement",
          "Implement modular architecture"
        );
        expect(artifact).toBeDefined();
        expect(artifact.artifactType).toBe("Requirement");
      }

      // 8. Load all messages
      const messages = await conversationStore.getMessages(
        projectGraph!.id,
        conversation.id
      );
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    it("should support target switching", async () => {
      const registry = getTargetRegistry();
      const targets = registry.getAllTargets();

      expect(targets.length).toBeGreaterThan(0);

      // Verify targets are available
      const claude = registry.getTarget("claude-opus");
      expect(claude).toBeDefined();
      expect(claude?.name).toContain("Claude");

      const ollama = registry.getTarget("ollama");
      expect(ollama).toBeDefined();
      expect(ollama?.name).toContain("Ollama");
    });

    it("should support conversation persistence", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      expect(projectGraph).toBeDefined();

      // Load conversations
      const convs = await conversationStore.listConversations(projectGraph!.id);
      expect(convs.length).toBeGreaterThan(0);

      // Verify persisted conversation
      const persisted = convs.find((c) => c.id === conversation.id);
      expect(persisted).toBeDefined();
      expect(persisted?.messageCount).toBeGreaterThan(0);
    });

    it("should support history filtering", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      const convs = await conversationStore.listConversations(projectGraph!.id);

      // Filter by target
      const filtered = historyManager.filterConversations(convs, {
        target: "claude-opus",
      });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered[0].activeTarget).toBe("claude-opus");

      // Filter by context mode
      const projectFiltered = historyManager.filterConversations(convs, {
        contextMode: "Project",
      });
      expect(projectFiltered.length).toBeGreaterThan(0);
    });

    it("should support history grouping", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      const convs = await conversationStore.listConversations(projectGraph!.id);

      // Group by date
      const byDate = historyManager.groupByDate(convs);
      expect(Object.keys(byDate).length).toBeGreaterThan(0);

      // Group by project
      const byProject = historyManager.groupByProject(convs);
      expect(byProject["e2e_project"]).toBeDefined();
    });

    it("should support conversation search", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      const convs = await conversationStore.listConversations(projectGraph!.id);

      // Search by name
      const results = historyManager.search(convs, "E2E Test");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toContain("E2E Test");
    });

    it("should support statistics", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      const convs = await conversationStore.listConversations(projectGraph!.id);

      const stats = historyManager.getStatistics(convs);
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byTarget["claude-opus"]).toBeGreaterThan(0);
      expect(stats.averageMessages).toBeGreaterThan(0);
    });

    it("should support preferences", () => {
      // Set preference
      preferencesManager.setPreferredTarget("e2e_project", "claude-opus");

      // Get preference
      const target = preferencesManager.getPreferredTarget("e2e_project");
      expect(target).toBe("claude-opus");

      // Set context mode preference
      preferencesManager.setPreferredContextMode("e2e_project", "Full");
      const mode = preferencesManager.getPreferredContextMode("e2e_project");
      expect(mode).toBe("Full");

      // Set UI preference
      preferencesManager.setUIPreference("theme", "dark");
      const theme = preferencesManager.getUIPreference("theme");
      expect(theme).toBe("dark");
    });

    it("should support global search", async () => {
      const results = await globalSearch(graphRepo, {
        text: "E2E",
        scope: "all",
        limit: 10,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("should track last used timestamp", async () => {
      const claude = getTargetRegistry().getTarget("claude-opus");
      const lastUsed = claude?.getLastUsed?.();

      // Should be null initially or set from previous usage
      expect(lastUsed === null || lastUsed instanceof Date).toBe(true);
    });

    it("should support context modes", async () => {
      const modes: Array<"Current" | "Project" | "Global" | "Task" | "Full"> = [
        "Current",
        "Project",
        "Global",
        "Task",
        "Full",
      ];

      for (const mode of modes) {
        const context = await contextResolver.resolveContext(mode);
        expect(context.mode).toBe(mode);
        expect(context.injectedMarkdown).toBeDefined();
      }
    });

    it("should support multi-target comparison", () => {
      const registry = getTargetRegistry();
      const available = registry.getAvailableTargets();

      // Should have at least one target available
      expect(available.length).toBeGreaterThan(0);

      // Targets should have different capabilities
      const capabilities = available.map((t) => ({
        id: t.id,
        supportsStreaming: t.supportsStreaming(),
        supportsToolUse: t.supportsToolUse(),
        supportsArtifacts: t.supportsArtifacts(),
      }));

      expect(capabilities.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing conversation", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");
      const missing = await conversationStore.getConversation(
        projectGraph!.id,
        makeEntityId("nonexistent")
      );

      expect(missing).toBeNull();
    });

    it("should handle invalid entity references", () => {
      const content = "[invalid: not a real reference]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBe(0);
    });

    it("should handle empty search results", async () => {
      const results = await globalSearch(graphRepo, {
        text: "xyzabc123nonexistent",
        scope: "all",
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain message ordering", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");

      // Add multiple messages in sequence
      const msg1 = await conversationStore.addMessage(
        projectGraph!.id,
        conversation.id,
        "user",
        "Message 1",
        "claude-opus"
      );

      const msg2 = await conversationStore.addMessage(
        projectGraph!.id,
        conversation.id,
        "assistant",
        "Response 1",
        "claude-opus"
      );

      const msg3 = await conversationStore.addMessage(
        projectGraph!.id,
        conversation.id,
        "user",
        "Message 2",
        "claude-opus"
      );

      // Verify ordering
      expect(msg1.index).toBeLessThan(msg2.index);
      expect(msg2.index).toBeLessThan(msg3.index);

      // Load and verify
      const messages = await conversationStore.getMessages(projectGraph!.id, conversation.id);
      const indices = messages.map((m) => m.index);
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
      }
    });

    it("should maintain conversation integrity", async () => {
      const projectGraph = await graphRepo.getProjectGraph("e2e_project");

      const updated = await conversationStore.updateConversation(
        projectGraph!.id,
        conversation.id,
        {
          activeTarget: "gpt-4",
          contextMode: "Global",
        }
      );

      expect(updated.activeTarget).toBe("gpt-4");
      expect(updated.contextMode).toBe("Global");

      // Verify persisted
      const reloaded = await conversationStore.getConversation(
        projectGraph!.id,
        conversation.id
      );
      expect(reloaded?.activeTarget).toBe("gpt-4");
      expect(reloaded?.contextMode).toBe("Global");
    });
  });
});
