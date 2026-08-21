/**
 * Artifact Creator
 *
 * Creates durable artifacts (Tasks, Decisions, Requirements) from conversations.
 * Links artifacts back to the conversation and conversation message.
 */

import type { GraphRepository, EntityId } from "@/types/graph";
import { ConversationStore } from "@/lib/graph/conversation-store";
import { makeEntityId } from "@/types/graph";

export interface CreateArtifactOptions {
  conversationId: EntityId;
  messageId: EntityId;
  artifactType: "Task" | "Decision" | "Requirement";
  title: string;
  content: string;
  linkedEntityId?: EntityId;
}

export interface ArtifactResult {
  artifactId: EntityId;
  artifactType: "Task" | "Decision" | "Requirement";
  title: string;
  linkedEntityId?: EntityId;
}

/**
 * Create durable artifacts from conversation content
 */
export async function createArtifact(
  graphRepo: GraphRepository,
  graphId: any,
  options: CreateArtifactOptions
): Promise<ArtifactResult> {
  const conversationStore = new ConversationStore(graphRepo);

  // Create the artifact in FeltDB
  const artifact = await conversationStore.createArtifact(
    graphId,
    options.conversationId,
    options.messageId,
    options.artifactType,
    options.content,
    options.linkedEntityId
  );

  return {
    artifactId: makeEntityId(`artifact_${Date.now()}`),
    artifactType: artifact.artifactType,
    title: options.title,
    linkedEntityId: artifact.linkedEntityId,
  };
}

/**
 * Extract potential artifact from message content
 */
export function extractArtifactSuggestions(
  content: string
): Array<{
  type: "Task" | "Decision" | "Requirement";
  title: string;
  excerpt: string;
}> {
  const suggestions: Array<{
    type: "Task" | "Decision" | "Requirement";
    title: string;
    excerpt: string;
  }> = [];

  // Look for task patterns
  const taskMatches = content.match(
    /(?:Task|task|TODO|todo|implement|create|build):\s*(.+?)(?:\n|$)/gi
  );
  if (taskMatches) {
    taskMatches.forEach((match) => {
      const title = match.replace(/^(?:Task|task|TODO|todo|implement|create|build):\s*/i, "").trim();
      suggestions.push({
        type: "Task",
        title,
        excerpt: content.substring(0, 100),
      });
    });
  }

  // Look for decision patterns
  const decisionMatches = content.match(
    /(?:Decide|decision|should|should we|consider)\s*(.+?)(?:\n|$)/gi
  );
  if (decisionMatches) {
    decisionMatches.forEach((match) => {
      const title = match.replace(/^(?:Decide|decision|should|should we|consider)\s*/i, "").trim();
      suggestions.push({
        type: "Decision",
        title,
        excerpt: content.substring(0, 100),
      });
    });
  }

  // Look for requirement patterns
  const requirementMatches = content.match(
    /(?:Requirement|must|should have|need):\s*(.+?)(?:\n|$)/gi
  );
  if (requirementMatches) {
    requirementMatches.forEach((match) => {
      const title = match
        .replace(/^(?:Requirement|must|should have|need):\s*/i, "")
        .trim();
      suggestions.push({
        type: "Requirement",
        title,
        excerpt: content.substring(0, 100),
      });
    });
  }

  return suggestions;
}

/**
 * Check if message content contains artifacts
 */
export function hasArtifacts(content: string): boolean {
  return extractArtifactSuggestions(content).length > 0;
}

/**
 * Format artifact for display
 */
export function formatArtifact(
  artifact: ArtifactResult
): string {
  const icons = {
    Task: "✓",
    Decision: "?",
    Requirement: "◆",
  };

  const icon = icons[artifact.artifactType];

  return `${icon} [${artifact.artifactType}] ${artifact.title}`;
}
