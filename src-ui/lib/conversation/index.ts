/**
 * Conversation Module
 *
 * Provides AI target abstractions and target registry for unified conversation layer.
 * Includes all provider implementations and factory functions.
 */

export {
  type AIConversationTarget,
  BaseAITarget,
  TargetRegistry,
  getTargetRegistry,
  initializeTargetRegistry,
} from "./ai-target";
export type { TargetStatus, TargetType, TargetCategory } from "./ai-target";

export { initializeTargets, setupConversationLayer } from "./target-factory";

export {
  OpenAITarget,
  OllamaTarget,
  ClaudeTarget,
  ControlTarget,
  AutoTarget,
} from "./providers";

export {
  createArtifact,
  extractArtifactSuggestions,
  hasArtifacts,
  formatArtifact,
} from "./artifact-creator";
export type { CreateArtifactOptions, ArtifactResult } from "./artifact-creator";

export {
  askMultipleTargets,
  analyzeAgreement,
  deliberate,
  formatComparison,
} from "./multi-ai-deliberation";
export type { ComparisonResult, DeliberationResult } from "./multi-ai-deliberation";

export {
  parseEntityReferences,
  resolveEntityReferences,
  extractReferencedContext,
  formatReferencesForDisplay,
  enrichContextWithReferences,
  validateEntityReferences,
} from "./entity-references";
export type { ParsedReference } from "./entity-references";
