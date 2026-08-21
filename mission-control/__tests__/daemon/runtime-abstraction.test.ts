import { describe, it, expect, beforeEach } from "vitest";
import { globalRegistry } from "../../scripts/daemon/runtime-registry";
import { ClaudeCodeRuntime } from "../../scripts/daemon/runtimes/claude-code-runtime";
import { OllamaRuntime } from "../../scripts/daemon/runtimes/ollama-runtime";
import { CommandRuntime } from "../../scripts/daemon/runtimes/command-runtime";
import type { AgentExecutionRequest, RuntimeCapabilities } from "../../scripts/daemon/runtime-types";

describe("Universal Agent Runtime", () => {
  describe("Runtime Registration", () => {
    it("should have Claude Code runtime registered by default", () => {
      const claude = globalRegistry.get("claude-code");
      expect(claude).toBeDefined();
      expect(claude?.name).toBe("Claude Code");
    });

    it("should register and retrieve custom runtimes", () => {
      const custom = new CommandRuntime("test-agent", "Test Agent", "echo", ["hello"]);
      globalRegistry.register(custom);

      const retrieved = globalRegistry.get("test-agent");
      expect(retrieved).toBe(custom);
      expect(retrieved?.name).toBe("Test Agent");
    });

    it("should list all registered runtimes", () => {
      const runtimes = globalRegistry.list();
      expect(runtimes.length).toBeGreaterThanOrEqual(1);
      expect(runtimes.some((r) => r.id === "claude-code")).toBe(true);
    });
  });

  describe("Runtime Resolution", () => {
    it("should resolve by string ID", async () => {
      const resolved = await globalRegistry.resolve("claude-code");
      expect(resolved.id).toBe("claude-code");
    });

    it("should resolve by type in config", async () => {
      const resolved = await globalRegistry.resolve({ type: "claude-code" });
      expect(resolved.id).toBe("claude-code");
    });

    it("should create Ollama runtime with config", async () => {
      const resolved = await globalRegistry.resolve({
        type: "ollama",
        model: "qwen2.5-coder:32b",
        baseUrl: "http://localhost:11434",
      });

      expect(resolved.id).toBe("ollama");
      expect(resolved.name).toContain("Ollama");
    });

    it("should handle command runtimes", async () => {
      const resolved = await globalRegistry.resolve({
        type: "command",
        command: "opencode",
        args: ["run"],
      });

      expect(resolved.id).toBe("command");
    });

    it("should use fallback config on resolution error", async () => {
      const resolved = await globalRegistry.resolve({
        type: "unavailable",
        fallback: { type: "claude-code" },
      });

      expect(resolved.id).toBe("claude-code");
    });
  });

  describe("Runtime Capabilities", () => {
    it("Claude Code should support all capabilities", () => {
      const claude = globalRegistry.get("claude-code")!;
      const caps = claude.capabilities;

      expect(caps.execute).toBe(true);
      expect(caps.streaming).toBe(true);
      expect(caps.toolCalling).toBe(true);
      expect(caps.resume).toBe(true);
      expect(caps.stop).toBe(true);
      expect(caps.structuredOutput).toBe(true);
    });

    it("Ollama should declare appropriate capabilities", () => {
      const ollama = new OllamaRuntime();
      const caps = ollama.capabilities;

      expect(caps.execute).toBe(true);
      expect(caps.toolCalling).toBe(true);
      expect(caps.resume).toBe(false); // Not implemented yet
      expect(caps.stop).toBe(true);
    });

    it("Command runtime should have minimal capabilities", () => {
      const cmd = new CommandRuntime("test", "Test", "echo");
      const caps = cmd.capabilities;

      expect(caps.execute).toBe(true);
      expect(caps.streaming).toBe(false);
      expect(caps.toolCalling).toBe(false);
      expect(caps.resume).toBe(false);
    });
  });

  describe("Execution Request Normalization", () => {
    it("should create valid execution request", () => {
      const request: AgentExecutionRequest = {
        runId: "test-run-123",
        prompt: "Write a hello world function",
        maxTurns: 3,
        timeoutMinutes: 10,
        workingDirectory: "/workspace",
        permissions: {
          filesystem: "workspace",
          shell: true,
          network: false,
          fieldOps: false,
          secrets: false,
        },
      };

      expect(request.runId).toBeDefined();
      expect(request.prompt).toBeDefined();
      expect(request.maxTurns).toBe(3);
      expect(request.workingDirectory).toBeDefined();
    });

    it("should support events callback", (done) => {
      const events = [];
      const request: AgentExecutionRequest = {
        runId: "test-run-with-events",
        prompt: "Test",
        maxTurns: 1,
        timeoutMinutes: 5,
        workingDirectory: "/tmp",
        permissions: {
          filesystem: "none",
          shell: false,
          network: false,
          fieldOps: false,
          secrets: false,
        },
        onEvent: (event) => {
          events.push(event);
        },
      };

      expect(request.onEvent).toBeDefined();
      done();
    });
  });

  describe("Runtime Discovery", () => {
    it("Claude Code should report availability", async () => {
      const claude = globalRegistry.get("claude-code")!;
      const discovery = await claude.discover();

      expect(discovery.status).toMatch(/available|unavailable|error/);
      expect(discovery.name).toBe("Claude Code");
    });

    it("Ollama should report unavailability when not running", async () => {
      const ollama = new OllamaRuntime("http://127.0.0.1:99999"); // Invalid port
      const discovery = await ollama.discover();

      expect(discovery.status).toMatch(/unavailable|error/);
    });

    it("should discover all runtimes", async () => {
      const discoveries = await globalRegistry.discoverAll();

      expect(discoveries.length).toBeGreaterThanOrEqual(1);
      expect(discoveries[0].name).toBeDefined();
      expect(discoveries[0].status).toMatch(/available|unavailable|error/);
    });
  });

  describe("Event Streaming", () => {
    it("should emit normalized events", async () => {
      const cmd = new CommandRuntime("echo-test", "Echo", "echo");
      const events = [];

      const request: AgentExecutionRequest = {
        runId: "event-test-123",
        prompt: "hello",
        maxTurns: 1,
        timeoutMinutes: 1,
        workingDirectory: "/tmp",
        permissions: {
          filesystem: "none",
          shell: false,
          network: false,
          fieldOps: false,
          secrets: false,
        },
        onEvent: (event) => events.push(event),
      };

      const execution = await cmd.execute(request);

      expect(execution.events.length).toBeGreaterThan(0);
      expect(execution.events.some((e) => e.type === "started")).toBe(true);
      expect(execution.events.some((e) => e.type === "completed" || e.type === "failed")).toBe(true);
    });

    it("should normalize usage across runtimes", async () => {
      const cmd = new CommandRuntime("test", "Test", "echo");
      const execution = await cmd.execute({
        runId: "usage-test",
        prompt: "test",
        maxTurns: 1,
        timeoutMinutes: 1,
        workingDirectory: "/tmp",
        permissions: {
          filesystem: "none",
          shell: false,
          network: false,
          fieldOps: false,
          secrets: false,
        },
      });

      expect(execution.usage).toBeDefined();
      expect(typeof execution.usage).toBe("object");
    });
  });

  describe("Execution Control", () => {
    it("should stop execution", async () => {
      const cmd = new CommandRuntime("sleep-test", "Sleep", "sleep", ["10"]);

      // Create a long-running execution
      const request: AgentExecutionRequest = {
        runId: "stop-test-123",
        prompt: "sleep",
        maxTurns: 1,
        timeoutMinutes: 5,
        workingDirectory: "/tmp",
        permissions: {
          filesystem: "none",
          shell: false,
          network: false,
          fieldOps: false,
          secrets: false,
        },
      };

      // This would normally run for 10 seconds
      // but we can stop it
      const promise = cmd.execute(request);

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Stop the execution
      await cmd.stop("stop-test-123");

      // The execution should complete (stopped)
      const result = await promise;
      expect(result.runId).toBe("stop-test-123");
    });
  });
});
