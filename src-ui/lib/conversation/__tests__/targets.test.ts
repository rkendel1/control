/**
 * AI Target Adapter Tests
 *
 * Verifies that all AI target implementations follow the interface correctly
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initializeTargets } from "../target-factory";
import { createGraphRepository } from "../../graph";
import { getTargetRegistry } from "../ai-target";
import type { GraphRepository } from "@/types/graph";

describe("AI Target Adapters - Phase 2", () => {
  let graphRepo: GraphRepository;

  beforeAll(async () => {
    graphRepo = await createGraphRepository(`test_targets_${Date.now()}`);

    // Initialize targets
    await initializeTargets(graphRepo);
  });

  describe("Target Registry", () => {
    it("should have all targets registered", () => {
      const registry = getTargetRegistry();
      const allTargets = registry.getAllTargets();

      expect(allTargets.length).toBeGreaterThanOrEqual(5);

      const ids = allTargets.map((t) => t.id);
      expect(ids).toContain("gpt-4");
      expect(ids).toContain("ollama");
      expect(ids).toContain("claude-opus");
      expect(ids).toContain("control");
      expect(ids).toContain("auto");
    });

    it("should get target by ID", () => {
      const registry = getTargetRegistry();

      const gpt = registry.getTarget("gpt-4");
      expect(gpt).toBeDefined();
      expect(gpt?.name).toContain("OpenAI");

      const claude = registry.getTarget("claude-opus");
      expect(claude).toBeDefined();
      expect(claude?.name).toContain("Claude");

      const ollama = registry.getTarget("ollama");
      expect(ollama).toBeDefined();
      expect(ollama?.name).toContain("Ollama");
    });

    it("should get targets by category", () => {
      const registry = getTargetRegistry();

      const chatTargets = registry.getTargetsByCategory("chat");
      expect(chatTargets.length).toBeGreaterThan(0);

      const orchestrationTargets = registry.getTargetsByCategory("orchestration");
      expect(orchestrationTargets.some((t) => t.id === "control")).toBe(true);
    });

    it("should get targets by type", () => {
      const registry = getTargetRegistry();

      const providers = registry.getTargetsByType("provider");
      expect(providers.length).toBeGreaterThan(0);

      const special = registry.getTargetsByType("special");
      expect(special.some((t) => t.id === "control")).toBe(true);
      expect(special.some((t) => t.id === "auto")).toBe(true);
    });
  });

  describe("OpenAI Target", () => {
    it("should have correct metadata", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("gpt-4");

      expect(target?.name).toBe("OpenAI GPT-4");
      expect(target?.type).toBe("provider");
      expect(target?.category).toBe("chat");
      expect(target?.requiresAuth()).toBe(true);
    });

    it("should support required capabilities", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("gpt-4");

      expect(target?.supportsStreaming()).toBe(true);
      expect(target?.supportsToolUse()).toBe(true);
      expect(target?.supportsArtifacts()).toBe(true);
      expect(target?.supportsImageInput()).toBe(true);
    });

    it("should have available models", async () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("gpt-4");

      const models = await target?.getAvailableModels();
      expect(models).toBeDefined();
      expect(models?.length).toBeGreaterThan(0);
      expect(models).toContain("gpt-4");
      expect(models).toContain("gpt-3.5-turbo");
    });

    it("should have context length", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("gpt-4");

      const contextLength = target?.getContextLength();
      expect(contextLength).toBeGreaterThan(4000);
      expect(contextLength).toBeLessThan(200000);
    });

    it("should have pricing info", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("gpt-4");

      const pricing = target?.getCostPerToken?.();
      expect(pricing).toBeDefined();
      expect(pricing?.input).toBeGreaterThan(0);
      expect(pricing?.output).toBeGreaterThan(0);
    });
  });

  describe("Claude Target", () => {
    it("should have correct metadata", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("claude-opus");

      expect(target?.name).toContain("Claude");
      expect(target?.type).toBe("provider");
      expect(target?.category).toBe("chat");
      expect(target?.requiresAuth()).toBe(true);
    });

    it("should support required capabilities", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("claude-opus");

      expect(target?.supportsStreaming()).toBe(true);
      expect(target?.supportsToolUse()).toBe(true);
      expect(target?.supportsArtifacts()).toBe(true);
      expect(target?.supportsImageInput()).toBe(true);
    });

    it("should have large context window", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("claude-opus");

      const contextLength = target?.getContextLength();
      expect(contextLength).toBeGreaterThan(100000);
    });
  });

  describe("Ollama Target", () => {
    it("should have correct metadata", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("ollama");

      expect(target?.name).toContain("Ollama");
      expect(target?.type).toBe("provider");
      expect(target?.category).toBe("chat");
      expect(target?.requiresAuth()).toBe(false);
    });

    it("should not require credentials", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("ollama");

      expect(target?.hasCredentials()).toBe(true);
      expect(target?.requiresAuth()).toBe(false);
      expect(target?.getAuthStatus()).toBe("authenticated");
    });

    it("should not support tool use by default", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("ollama");

      expect(target?.supportsToolUse()).toBe(false);
    });

    it("should have zero cost", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("ollama");

      const pricing = target?.getCostPerToken?.();
      expect(pricing?.input).toBe(0);
      expect(pricing?.output).toBe(0);
    });
  });

  describe("Control Target", () => {
    it("should have correct metadata", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("control");

      expect(target?.name).toBe("Control");
      expect(target?.type).toBe("special");
      expect(target?.category).toBe("orchestration");
      expect(target?.requiresAuth()).toBe(false);
    });

    it("should support artifacts", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("control");

      expect(target?.supportsArtifacts()).toBe(true);
    });

    it("should not stream directly", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("control");

      expect(target?.supportsStreaming()).toBe(false);
    });
  });

  describe("Auto Target", () => {
    it("should have correct metadata", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("auto");

      expect(target?.name).toContain("Auto");
      expect(target?.type).toBe("special");
      expect(target?.category).toBe("chat");
      expect(target?.requiresAuth()).toBe(false);
    });

    it("should support all capabilities", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("auto");

      expect(target?.supportsToolUse()).toBe(true);
      expect(target?.supportsArtifacts()).toBe(true);
      expect(target?.supportsImageInput()).toBe(true);
    });

    it("should have reasonable context length", () => {
      const registry = getTargetRegistry();
      const target = registry.getTarget("auto");

      const contextLength = target?.getContextLength();
      expect(contextLength).toBeGreaterThan(1000);
    });
  });

  describe("Target Availability", () => {
    it("should track availability status", async () => {
      const registry = getTargetRegistry();

      for (const target of registry.getAllTargets()) {
        expect(target.getStatus()).toBeDefined();
        expect(["connected", "offline", "error"]).toContain(target.getStatus());
      }
    });

    it("should provide status message", () => {
      const registry = getTargetRegistry();

      for (const target of registry.getAllTargets()) {
        const message = target.getStatusMessage();
        expect(message).toBeDefined();
        expect(message.length).toBeGreaterThan(0);
      }
    });

    it("should refresh availability", async () => {
      const registry = getTargetRegistry();

      // This should not throw
      await registry.refreshAvailability();

      const available = registry.getAvailableTargets();
      expect(available).toBeDefined();
      expect(Array.isArray(available)).toBe(true);
    });
  });

  describe("Model Selection", () => {
    it("should support model switching for multi-model providers", async () => {
      const registry = getTargetRegistry();
      const gpt = registry.getTarget("gpt-4");

      const initialModel = gpt?.getCurrentModel();
      expect(initialModel).toBeDefined();

      const models = await gpt?.getAvailableModels?.();
      if (models && models.length > 1) {
        const otherModel = models.find((m) => m !== initialModel);
        if (otherModel) {
          await gpt?.setModel?.(otherModel);
          expect(gpt?.getCurrentModel()).toBe(otherModel);
        }
      }
    });
  });

  describe("Context Window Sizes", () => {
    it("should report accurate context lengths", () => {
      const registry = getTargetRegistry();

      const gpt = registry.getTarget("gpt-4");
      const gptContext = gpt?.getContextLength() || 0;
      expect(gptContext).toBeGreaterThan(4000);

      const claude = registry.getTarget("claude-opus");
      const claudeContext = claude?.getContextLength() || 0;
      expect(claudeContext).toBeGreaterThan(gptContext); // Claude has larger context

      const ollama = registry.getTarget("ollama");
      const ollamaContext = ollama?.getContextLength() || 0;
      expect(ollamaContext).toBeGreaterThan(0);
    });
  });
});
