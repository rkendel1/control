/**
 * Multi-AI Deliberation
 *
 * Handles parallel requests to multiple AI targets for comparison and deliberation.
 * Useful for weighing different perspectives on architectural decisions.
 */

import type {
  ConversationMessage,
  ResolvedContext,
  TargetOptions,
  AITargetId,
} from "@/types/graph";
import type { AIConversationTarget } from "./ai-target";
import { TargetRegistry } from "./ai-target";

export interface ComparisonResult {
  targetId: AITargetId;
  targetName: string;
  response: string;
  duration: number;
  confidence?: number;
}

export interface DeliberationResult {
  userMessage: string;
  targetResponses: ComparisonResult[];
  agreement: "high" | "moderate" | "low" | "none";
  summary: string;
}

/**
 * Request response from multiple AI targets in parallel
 */
export async function askMultipleTargets(
  message: string,
  conversationHistory: ConversationMessage[],
  context: ResolvedContext,
  targetIds: AITargetId[],
  registry: TargetRegistry,
  options: TargetOptions = {}
): Promise<ComparisonResult[]> {
  const promises = targetIds.map(async (targetId) => {
    const target = registry.getTarget(targetId);
    if (!target) {
      return null;
    }

    const startTime = Date.now();

    try {
      const response = await target.sendMessage(message, conversationHistory, context, options);
      const duration = Date.now() - startTime;

      return {
        targetId,
        targetName: target.name,
        response: response.content,
        duration,
        confidence: 0.8, // Could be improved with target-specific metrics
      };
    } catch (error) {
      return {
        targetId,
        targetName: target.name,
        response: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        duration: Date.now() - startTime,
        confidence: 0,
      };
    }
  });

  const results = await Promise.all(promises);
  return results.filter((r) => r !== null) as ComparisonResult[];
}

/**
 * Analyze agreement between multiple responses
 */
export function analyzeAgreement(responses: ComparisonResult[]): {
  agreement: "high" | "moderate" | "low" | "none";
  similarityScore: number;
} {
  if (responses.length < 2) {
    return { agreement: "none", similarityScore: 0 };
  }

  // Simple text similarity check
  const [first, ...rest] = responses.map((r) => r.response.toLowerCase());

  let totalSimilarity = 0;
  let comparisons = 0;

  for (const response of rest) {
    const similarity = calculateSimilarity(first, response);
    totalSimilarity += similarity;
    comparisons++;
  }

  const averageSimilarity = totalSimilarity / comparisons;

  if (averageSimilarity > 0.7) {
    return { agreement: "high", similarityScore: averageSimilarity };
  } else if (averageSimilarity > 0.5) {
    return { agreement: "moderate", similarityScore: averageSimilarity };
  } else if (averageSimilarity > 0.3) {
    return { agreement: "low", similarityScore: averageSimilarity };
  }

  return { agreement: "none", similarityScore: averageSimilarity };
}

/**
 * Calculate simple text similarity using word overlap
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
  const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.size / union.size;
}

/**
 * Generate deliberation summary
 */
export async function deliberate(
  message: string,
  conversationHistory: ConversationMessage[],
  context: ResolvedContext,
  targetIds: AITargetId[],
  registry: TargetRegistry
): Promise<DeliberationResult> {
  const responses = await askMultipleTargets(
    message,
    conversationHistory,
    context,
    targetIds,
    registry
  );

  const { agreement } = analyzeAgreement(responses);

  // Generate summary based on responses
  const summary = generateDeliberationSummary(responses, agreement);

  return {
    userMessage: message,
    targetResponses: responses,
    agreement,
    summary,
  };
}

/**
 * Generate human-readable summary of deliberation
 */
function generateDeliberationSummary(
  responses: ComparisonResult[],
  agreement: string
): string {
  const lines: string[] = [];

  if (agreement === "high") {
    lines.push(
      "✓ Strong agreement among AI models on this topic."
    );
    lines.push("The consensus suggests a reliable direction.");
  } else if (agreement === "moderate") {
    lines.push("◐ Moderate agreement with some variation.");
    lines.push("Consider the different perspectives below.");
  } else if (agreement === "low") {
    lines.push("◇ Significant differences in perspectives.");
    lines.push("Multiple viable approaches exist.");
  } else {
    lines.push("◆ No clear agreement detected.");
    lines.push("These AI models suggest different directions.");
  }

  lines.push("");
  lines.push("Response times:");
  responses.forEach((r) => {
    lines.push(`  ${r.targetName}: ${r.duration}ms`);
  });

  return lines.join("\n");
}

/**
 * Compare two specific AI responses side-by-side
 */
export function formatComparison(result1: ComparisonResult, result2: ComparisonResult): string {
  return `
## Comparison: ${result1.targetName} vs ${result2.targetName}

### ${result1.targetName}
${result1.response}

### ${result2.targetName}
${result2.response}

---

**Response times:** ${result1.targetName}: ${result1.duration}ms | ${result2.targetName}: ${result2.duration}ms
`;
}
