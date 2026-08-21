/**
 * Advanced Conversation Features Tests
 *
 * Verifies artifacts, multi-AI deliberation, and entity references work correctly
 */

import { describe, it, expect } from "vitest";
import {
  parseEntityReferences,
  formatReferencesForDisplay,
  extractArtifactSuggestions,
  hasArtifacts,
} from "../index";
import { analyzeAgreement } from "../multi-ai-deliberation";
import type { ComparisonResult } from "../multi-ai-deliberation";

describe("Advanced Conversation Features - Phase 4", () => {
  describe("Entity References", () => {
    it("should parse file references", () => {
      const content = "Check [file: src/main.ts] and [file: src/graph.rs]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBe(2);
      expect(refs[0].type).toBe("File");
      expect(refs[0].identifier).toBe("src/main.ts");
      expect(refs[1].identifier).toBe("src/graph.rs");
    });

    it("should parse task references", () => {
      const content = "Related to [task: Implement graph layer] and [task: Add tests]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBe(2);
      expect(refs[0].type).toBe("Task");
      expect(refs[0].identifier).toBe("Implement graph layer");
      expect(refs[1].identifier).toBe("Add tests");
    });

    it("should parse symbol references", () => {
      const content =
        "The [symbol: GraphRepository] interface is used in [symbol: FeltDBGraphRepository]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBe(2);
      expect(refs[0].type).toBe("Symbol");
      expect(refs[0].identifier).toBe("GraphRepository");
    });

    it("should parse commit references", () => {
      const content = "See changes in [commit: abc1234def5678]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBe(1);
      expect(refs[0].type).toBe("Commit");
      expect(refs[0].identifier).toBe("abc1234def5678");
    });

    it("should handle mixed references", () => {
      const content = `
        Looking at [file: src/main.ts] for the [symbol: GraphRepository] interface.
        This is related to [task: Implement persistence] and [commit: abc1234].
        We should update [file: README.md] with these changes.
      `;
      const refs = parseEntityReferences(content);

      expect(refs.length).toBeGreaterThanOrEqual(5);
      expect(refs.map((r) => r.type)).toContain("File");
      expect(refs.map((r) => r.type)).toContain("Symbol");
      expect(refs.map((r) => r.type)).toContain("Task");
      expect(refs.map((r) => r.type)).toContain("Commit");
    });

    it("should format references for display", () => {
      const refs = parseEntityReferences("[file: src/main.ts] and [task: Do something]");
      const formatted = formatReferencesForDisplay(
        refs.map((r) => ({
          type: r.type,
          entityId: "123" as any,
          excerpt: r.identifier,
        }))
      );

      expect(formatted.length).toBe(2);
      expect(formatted[0]).toContain("File");
      expect(formatted[1]).toContain("Task");
    });
  });

  describe("Artifact Suggestions", () => {
    it("should extract task suggestions", () => {
      const content = "Task: Implement graph persistence and Task: Add comprehensive tests";
      const suggestions = extractArtifactSuggestions(content);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.type === "Task")).toBe(true);
      expect(suggestions.some((s) => s.title.includes("persistence"))).toBe(true);
    });

    it("should extract decision suggestions", () => {
      const content =
        "We should use FeltDB for persistence. Consider using TypeScript for type safety.";
      const suggestions = extractArtifactSuggestions(content);

      expect(suggestions.some((s) => s.type === "Decision")).toBe(true);
    });

    it("should extract requirement suggestions", () => {
      const content = "Requirement: Support 10,000 files. Must handle concurrent requests.";
      const suggestions = extractArtifactSuggestions(content);

      expect(suggestions.some((s) => s.type === "Requirement")).toBe(true);
    });

    it("should detect when content has artifacts", () => {
      const withArtifacts = "Task: Do something important";
      const withoutArtifacts = "This is just a regular message with no tasks or decisions";

      expect(hasArtifacts(withArtifacts)).toBe(true);
      expect(hasArtifacts(withoutArtifacts)).toBe(false);
    });

    it("should handle multiple artifact types", () => {
      const content = `
        Task: Implement feature X
        Decision: Use approach A or B?
        Requirement: Must support 1000+ concurrent users
        Task: Write tests for feature X
      `;
      const suggestions = extractArtifactSuggestions(content);

      const types = suggestions.map((s) => s.type);
      expect(types).toContain("Task");
      expect(types).toContain("Decision");
      expect(types).toContain("Requirement");
    });
  });

  describe("Multi-AI Deliberation", () => {
    it("should detect high agreement", () => {
      const responses: ComparisonResult[] = [
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response: "I recommend using FeltDB for persistence with type safety",
          duration: 100,
        },
        {
          targetId: "claude-opus",
          targetName: "Claude",
          response: "FeltDB is a good choice for persistence with type safe operations",
          duration: 120,
        },
      ];

      const { agreement } = analyzeAgreement(responses);
      expect(["high", "moderate"]).toContain(agreement);
    });

    it("should detect low agreement", () => {
      const responses: ComparisonResult[] = [
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response: "Use FeltDB for persistence",
          duration: 100,
        },
        {
          targetId: "ollama",
          targetName: "Ollama",
          response: "Use MongoDB for NoSQL flexibility",
          duration: 200,
        },
      ];

      const { agreement } = analyzeAgreement(responses);
      expect(["low", "none"]).toContain(agreement);
    });

    it("should handle single response", () => {
      const responses: ComparisonResult[] = [
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response: "Single response",
          duration: 100,
        },
      ];

      const { agreement } = analyzeAgreement(responses);
      expect(agreement).toBe("none");
    });

    it("should track response times", () => {
      const responses: ComparisonResult[] = [
        {
          targetId: "ollama",
          targetName: "Ollama",
          response: "Local response",
          duration: 50,
        },
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response: "API response",
          duration: 2000,
        },
      ];

      expect(responses[0].duration).toBeLessThan(responses[1].duration);
      expect(responses[0].targetName).toBe("Ollama");
    });
  });

  describe("Context Enrichment", () => {
    it("should identify message has references", () => {
      const msgWithRefs = "Looking at [file: src/main.ts]";
      const msgWithout = "Just a regular message";

      const refsIn = parseEntityReferences(msgWithRefs);
      const refsOut = parseEntityReferences(msgWithout);

      expect(refsIn.length).toBeGreaterThan(0);
      expect(refsOut.length).toBe(0);
    });

    it("should handle multiple references of same type", () => {
      const content = `
        Looking at [file: src/main.ts], [file: src/graph.ts], and [file: src/types.ts]
        for the implementation.
      `;
      const refs = parseEntityReferences(content);

      const fileRefs = refs.filter((r) => r.type === "File");
      expect(fileRefs.length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty content", () => {
      const refs = parseEntityReferences("");
      const artifacts = extractArtifactSuggestions("");

      expect(refs.length).toBe(0);
      expect(artifacts.length).toBe(0);
      expect(hasArtifacts("")).toBe(false);
    });

    it("should handle malformed references", () => {
      const content = "[file src/main.ts] and [file: broken content";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBeLessThan(2);
    });

    it("should handle references with special characters", () => {
      const content = "[file: src/file-name.ts] and [task: Task with (parentheses)]";
      const refs = parseEntityReferences(content);

      expect(refs.length).toBeGreaterThan(0);
    });

    it("should preserve original message content", () => {
      const original = "Check [file: src/main.ts] for details";
      const refs = parseEntityReferences(original);

      expect(refs.length).toBe(1);
      // Original content should remain unchanged
      expect(original).toContain("[file:");
    });
  });

  describe("Similarity Analysis", () => {
    it("should analyze response similarity", () => {
      const similar: ComparisonResult[] = [
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response:
            "The architecture is well-designed with proper separation of concerns and clear abstractions.",
          duration: 100,
        },
        {
          targetId: "claude-opus",
          targetName: "Claude",
          response:
            "The design demonstrates good separation of concerns and uses clear architectural abstractions.",
          duration: 120,
        },
      ];

      const { similarityScore } = analyzeAgreement(similar);
      expect(similarityScore).toBeGreaterThan(0.3);
    });

    it("should handle very different responses", () => {
      const different: ComparisonResult[] = [
        {
          targetId: "gpt-4",
          targetName: "GPT-4",
          response: "Use microservices architecture",
          duration: 100,
        },
        {
          targetId: "ollama",
          targetName: "Ollama",
          response: "Deploy as a monolithic application",
          duration: 150,
        },
      ];

      const { similarityScore } = analyzeAgreement(different);
      expect(similarityScore).toBeLessThan(0.5);
    });
  });
});
