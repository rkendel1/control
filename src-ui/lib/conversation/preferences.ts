/**
 * Conversation Preferences
 *
 * Manages user preferences for AI conversations including:
 * - Preferred targets per project
 * - Default context mode
 * - Model selection preferences
 * - UI preferences (theme, layout, etc.)
 */

import type { AITargetId, ContextMode } from "@/types/graph";

export interface ConversationPreferences {
  // Target preferences
  defaultTarget: AITargetId;
  targetsByProject: Record<string, AITargetId>;
  targetsByType: Record<string, AITargetId>; // "code", "research", "chat"

  // Context preferences
  defaultContextMode: ContextMode;
  contextModesByProject: Record<string, ContextMode>;

  // Model preferences
  modelsByTarget: Record<AITargetId, string>;

  // UI preferences
  theme: "light" | "dark" | "system";
  compactMode: boolean;
  showTokenCount: boolean;
  autoScroll: boolean;
  showTimestamps: boolean;

  // Behavior preferences
  autoSaveMessages: boolean;
  enableSpellCheck: boolean;
  confirmBeforeDelete: boolean;
  showArtifactSuggestions: boolean;
}

const defaultPreferences: ConversationPreferences = {
  defaultTarget: "auto" as AITargetId,
  targetsByProject: {},
  targetsByType: {
    code: "claude-opus" as AITargetId,
    research: "claude-opus" as AITargetId,
    chat: "auto" as AITargetId,
  },
  defaultContextMode: "Project",
  contextModesByProject: {},
  modelsByTarget: {},
  theme: "system",
  compactMode: false,
  showTokenCount: false,
  autoScroll: true,
  showTimestamps: true,
  autoSaveMessages: true,
  enableSpellCheck: true,
  confirmBeforeDelete: true,
  showArtifactSuggestions: true,
};

/**
 * Conversation preferences manager
 */
export class PreferencesManager {
  private preferences: ConversationPreferences;
  private storageKey = "control:conversation:preferences";

  constructor() {
    this.preferences = this.loadPreferences();
  }

  /**
   * Load preferences from localStorage
   */
  private loadPreferences(): ConversationPreferences {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn("Failed to load preferences:", error);
    }
    return { ...defaultPreferences };
  }

  /**
   * Save preferences to localStorage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch (error) {
      console.warn("Failed to save preferences:", error);
    }
  }

  /**
   * Get preferred target for project
   */
  getPreferredTarget(projectId?: string): AITargetId {
    if (projectId && this.preferences.targetsByProject[projectId]) {
      return this.preferences.targetsByProject[projectId];
    }
    return this.preferences.defaultTarget;
  }

  /**
   * Set preferred target for project
   */
  setPreferredTarget(projectId: string, target: AITargetId): void {
    this.preferences.targetsByProject[projectId] = target;
    this.savePreferences();
  }

  /**
   * Get target for conversation type
   */
  getTargetForType(type: "code" | "research" | "chat"): AITargetId {
    return this.preferences.targetsByType[type] || this.preferences.defaultTarget;
  }

  /**
   * Set target for conversation type
   */
  setTargetForType(type: "code" | "research" | "chat", target: AITargetId): void {
    this.preferences.targetsByType[type] = target;
    this.savePreferences();
  }

  /**
   * Get preferred context mode for project
   */
  getPreferredContextMode(projectId?: string): ContextMode {
    if (projectId && this.preferences.contextModesByProject[projectId]) {
      return this.preferences.contextModesByProject[projectId];
    }
    return this.preferences.defaultContextMode;
  }

  /**
   * Set preferred context mode for project
   */
  setPreferredContextMode(projectId: string, mode: ContextMode): void {
    this.preferences.contextModesByProject[projectId] = mode;
    this.savePreferences();
  }

  /**
   * Get preferred model for target
   */
  getPreferredModel(target: AITargetId): string | undefined {
    return this.preferences.modelsByTarget[target];
  }

  /**
   * Set preferred model for target
   */
  setPreferredModel(target: AITargetId, model: string): void {
    this.preferences.modelsByTarget[target] = model;
    this.savePreferences();
  }

  /**
   * Get UI preference
   */
  getUIPreference<K extends keyof Omit<ConversationPreferences,
    "targetsByProject" | "targetsByType" | "contextModesByProject" | "modelsByTarget">>(
    key: K
  ): ConversationPreferences[K] {
    return this.preferences[key];
  }

  /**
   * Set UI preference
   */
  setUIPreference<K extends keyof Omit<ConversationPreferences,
    "targetsByProject" | "targetsByType" | "contextModesByProject" | "modelsByTarget">>(
    key: K,
    value: ConversationPreferences[K]
  ): void {
    this.preferences[key] = value;
    this.savePreferences();
  }

  /**
   * Get all preferences
   */
  getAllPreferences(): ConversationPreferences {
    return { ...this.preferences };
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.preferences = { ...defaultPreferences };
    this.savePreferences();
  }

  /**
   * Export preferences
   */
  export(): string {
    return JSON.stringify(this.preferences, null, 2);
  }

  /**
   * Import preferences
   */
  import(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      // Validate that it has the right structure
      if (typeof imported === "object" && imported !== null) {
        this.preferences = { ...defaultPreferences, ...imported };
        this.savePreferences();
        return true;
      }
    } catch (error) {
      console.error("Failed to import preferences:", error);
    }
    return false;
  }
}

// Global instance
let preferencesInstance: PreferencesManager | null = null;

export function getPreferencesManager(): PreferencesManager {
  if (!preferencesInstance) {
    preferencesInstance = new PreferencesManager();
  }
  return preferencesInstance;
}
