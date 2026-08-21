#!/usr/bin/env node

import { program } from "commander";
import { globalRegistry } from "./daemon/runtime-registry";
import {
  loadWorkspaceRuntimeConfig,
  saveWorkspaceRuntimeConfig,
  ensureRuntimeConfigExists,
} from "./daemon/runtime-config";
import { logger } from "./daemon/logger";

const packageJson = require("../package.json");

program
  .name("agent")
  .description("Manage Mission Control agent runtimes")
  .version(packageJson.version);

/**
 * List all available runtimes
 */
program
  .command("list")
  .description("List all available agent runtimes")
  .action(async () => {
    try {
      const runtimes = globalRegistry.list();
      console.log("\nAgent Runtimes\n");

      if (runtimes.length === 0) {
        console.log("No runtimes registered.\n");
        return;
      }

      const discoveries = await globalRegistry.discoverAll();
      const statusMap = new Map(discoveries.map((d) => [d.name, d]));

      console.log(
        String(
          "Runtime".padEnd(20) +
            "Status".padEnd(15) +
            "Capabilities".padEnd(30)
        )
      );
      console.log("─".repeat(65));

      for (const runtime of runtimes) {
        const status = statusMap.get(runtime.name);
        const statusStr =
          status?.status === "available"
            ? "✓ available"
            : status?.status === "unavailable"
              ? "✗ unavailable"
              : "? unknown";

        const caps = [
          runtime.capabilities.toolCalling && "tools",
          runtime.capabilities.streaming && "streaming",
          runtime.capabilities.resume && "resume",
        ]
          .filter(Boolean)
          .join(", ");

        console.log(
          String(runtime.id.padEnd(20) + statusStr.padEnd(15) + caps.padEnd(30))
        );

        if (status?.version) {
          console.log("  " + `v${status.version}`.padEnd(28) + "");
        }

        if (status?.error) {
          console.log("  " + `(error: ${status.error})`.padEnd(28) + "");
        }
      }

      console.log("");
    } catch (err) {
      console.error("Error listing runtimes:", err);
      process.exit(1);
    }
  });

/**
 * Show detailed runtime status
 */
program
  .command("status")
  .description("Show detailed runtime status")
  .action(async () => {
    try {
      console.log("\n📊 Mission Control Agent Runtime Status\n");

      const config = loadWorkspaceRuntimeConfig();
      const discoveries = await globalRegistry.discoverAll();

      // Display default runtime
      console.log(`Default Runtime: ${config.defaultRuntime}\n`);

      // Display each runtime
      for (const [runtimeId, runtimeConfig] of Object.entries(config.runtimes)) {
        const discovery = discoveries.find(
          (d) =>
            d.status === "available" &&
            (runtimeId === "claude-code" ||
              (d as any).baseUrl === runtimeConfig.baseUrl)
        );

        const statusIcon =
          discovery?.status === "available" ? "✓" : "✗";
        const statusText =
          discovery?.status === "available"
            ? "available"
            : discovery?.status === "unavailable"
              ? "unavailable"
              : "unknown";

        console.log(`${statusIcon} ${runtimeId.toUpperCase()}`);
        console.log(`  Status: ${statusText}`);

        if (runtimeConfig.type === "ollama") {
          console.log(`  Type: Ollama`);
          console.log(`  URL: ${runtimeConfig.baseUrl}`);
          console.log(`  Model: ${runtimeConfig.model}`);

          if ((discovery as any)?.models) {
            const models = (discovery as any).models;
            console.log(`  Available models: ${models.map((m: any) => m.name).join(", ")}`);
          }
        } else if (runtimeConfig.type === "claude-code") {
          console.log(`  Type: Claude Code (Cloud)`);

          if (discovery?.version) {
            console.log(`  Version: ${discovery.version}`);
          }
        } else if (runtimeConfig.type === "command") {
          console.log(`  Type: Command`);
          console.log(`  Command: ${runtimeConfig.command}`);
        }

        if ((discovery as any)?.error) {
          console.log(`  Error: ${(discovery as any).error}`);
        }

        console.log("");
      }
    } catch (err) {
      console.error("Error checking status:", err);
      process.exit(1);
    }
  });

/**
 * List Ollama models
 */
program
  .command("models")
  .description("List available Ollama models")
  .action(async () => {
    try {
      const discoveries = await globalRegistry.discoverAll();
      const ollama = discoveries.find((d) => d.name.includes("Ollama"));

      if (!ollama || ollama.status !== "available") {
        console.log(
          "❌ Ollama is not available. Is it running? (ollama serve)\n"
        );
        return;
      }

      const models = (ollama as any).models || [];

      if (models.length === 0) {
        console.log("\n📚 No Ollama models installed\n");
        console.log("Pull a model with: ollama pull <model-name>\n");
        return;
      }

      console.log("\n📚 Available Ollama Models\n");
      console.log(
        String("Model".padEnd(30) + "Size".padEnd(10) + "Tools".padEnd(10))
      );
      console.log("─".repeat(50));

      for (const model of models) {
        const sizeStr = `${(model.size / (1024 * 1024 * 1024)).toFixed(1)}GB`;
        const toolsStr = model.supportsToolCalling ? "✓" : "?";

        console.log(
          String(
            model.name.padEnd(30) +
              sizeStr.padEnd(10) +
              toolsStr.padEnd(10)
          )
        );
      }

      console.log("");
    } catch (err) {
      console.error("Error fetching models:", err);
      process.exit(1);
    }
  });

/**
 * Switch to a runtime
 */
program
  .command("use <runtime>")
  .description("Switch to a runtime (e.g., 'claude-code', 'ollama', 'ollama:qwen2.5-coder:32b')")
  .action(async (runtimeSpec: string) => {
    try {
      ensureRuntimeConfigExists();
      const config = loadWorkspaceRuntimeConfig();

      // Parse runtime spec
      const [runtimeType, model] = runtimeSpec.split(":");

      if (runtimeType === "claude-code") {
        config.defaultRuntime = "claude-code";
        console.log("✓ Switched to Claude Code\n");
      } else if (runtimeType === "ollama") {
        if (!config.runtimes.ollama) {
          config.runtimes.ollama = {
            type: "ollama",
            baseUrl: "http://127.0.0.1:11434",
            model: model || "qwen2.5-coder:latest",
          };
        } else if (model) {
          config.runtimes.ollama.model = model;
        }

        config.defaultRuntime = "ollama";
        console.log(
          `✓ Switched to Ollama${model ? ` with model ${model}` : ""}\n`
        );
      } else if (runtimeType === "opencode" || runtimeType === "codex") {
        if (!config.runtimes[runtimeType]) {
          config.runtimes[runtimeType] = {
            type: "command",
            command: runtimeType,
          };
        }

        config.defaultRuntime = runtimeType;
        console.log(`✓ Switched to ${runtimeType}\n`);
      } else {
        // Try as-is if it's registered
        if (config.runtimes[runtimeType]) {
          config.defaultRuntime = runtimeType;
          console.log(`✓ Switched to ${runtimeType}\n`);
        } else {
          console.error(`❌ Unknown runtime: ${runtimeType}`);
          console.log("\nAvailable runtimes:");
          for (const [id] of Object.entries(config.runtimes)) {
            console.log(`  - ${id}`);
          }
          console.log("");
          process.exit(1);
        }
      }

      saveWorkspaceRuntimeConfig(config);
    } catch (err) {
      console.error("Error switching runtime:", err);
      process.exit(1);
    }
  });

/**
 * Test a runtime
 */
program
  .command("test [runtime]")
  .description("Test a runtime (verify it works)")
  .action(async (runtimeId?: string) => {
    try {
      const config = loadWorkspaceRuntimeConfig();
      const targetRuntime = runtimeId || config.defaultRuntime;

      console.log(`\n🧪 Testing runtime: ${targetRuntime}\n`);

      const runtime = await globalRegistry.resolve({
        type: targetRuntime as any,
        ...((config.runtimes[targetRuntime] as any) || {}),
      });

      const discovery = await runtime.discover();

      if (discovery.status === "available") {
        console.log("✓ Runtime is available");

        if (discovery.version) {
          console.log(`  Version: ${discovery.version}`);
        }

        console.log("");
      } else if (discovery.status === "unavailable") {
        console.log(`✗ Runtime is unavailable: ${discovery.error}`);
        console.log("");
        process.exit(1);
      } else {
        console.log(`? Runtime status unknown: ${discovery.error}`);
        console.log("");
        process.exit(1);
      }
    } catch (err) {
      console.error("❌ Test failed:", err instanceof Error ? err.message : String(err));
      console.log("");
      process.exit(1);
    }
  });

program.parse(process.argv);
