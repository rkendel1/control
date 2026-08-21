/**
 * Conversation Module
 *
 * Provides AI target abstractions and target registry for unified conversation layer.
 */

export {
  type AIConversationTarget,
  BaseAITarget,
  TargetRegistry,
  getTargetRegistry,
  initializeTargetRegistry,
} from "./ai-target";
export type { TargetStatus, TargetType, TargetCategory } from "./ai-target";
