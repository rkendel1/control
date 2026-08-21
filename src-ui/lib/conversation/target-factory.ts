/**
 * Target Factory
 *
 * Initializes all AI targets and registers them with the target registry.
 * Provides a single entry point for setting up the conversation layer.
 */

import type { GraphRepository } from "@/types/graph";
import { TargetRegistry, initializeTargetRegistry } from "./ai-target";
import { OpenAITarget } from "./providers/openai-target";
import { OllamaTarget } from "./providers/ollama-target";
import { ClaudeTarget } from "./providers/claude-target";
import { ControlTarget } from "./providers/control-target";
import { AutoTarget } from "./providers/auto-target";

/**
 * Initialize all AI targets and return the registry
 */
export async function initializeTargets(
  graphRepo: GraphRepository
): Promise<TargetRegistry> {
  const registry = new TargetRegistry();

  // Create all provider targets
  const openai = new OpenAITarget();
  const ollama = new OllamaTarget();
  const claude = new ClaudeTarget();
  const control = new ControlTarget();
  const auto = new AutoTarget();

  // Register targets
  registry.register(openai);
  registry.register(ollama);
  registry.register(claude);
  registry.register(control);
  registry.register(auto);

  // Set up dependencies
  control.setDependencies(graphRepo, registry);
  auto.setRegistry(registry);

  // Refresh availability of all targets
  await registry.refreshAvailability();

  // Initialize global registry
  initializeTargetRegistry(registry);

  return registry;
}

/**
 * Get or create the target registry
 * This is typically called once during app initialization
 */
export async function setupConversationLayer(
  graphRepo: GraphRepository
): Promise<void> {
  await initializeTargets(graphRepo);
}
