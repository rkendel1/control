/**
 * Entity References
 *
 * Parses messages for references to Control entities (files, tasks, symbols, etc.)
 * and automatically includes their context in AI requests.
 */

import type { GraphRepository, EntityType, EntityId, EntityReference } from "@/types/graph";
import { makeEntityId } from "@/types/graph";

export interface ParsedReference {
  type: EntityType;
  identifier: string;
  entityId?: EntityId;
  excerpt?: string;
}

/**
 * Parse message for entity references using markdown syntax
 * Examples:
 *   [file: src/main.ts]
 *   [task: Implement graph layer]
 *   [symbol: GraphRepository]
 *   [commit: abc1234]
 */
export function parseEntityReferences(content: string): ParsedReference[] {
  const references: ParsedReference[] = [];

  // Regex to match [type: identifier] patterns
  const refRegex = /\[(\w+):\s*([^\]]+)\]/g;
  let match;

  while ((match = refRegex.exec(content)) !== null) {
    const type = match[1].toLowerCase();
    const identifier = match[2].trim();

    const validTypes: EntityType[] = [
      "File",
      "Directory",
      "Task",
      "Symbol",
      "Commit",
      "Branch",
      "Requirement",
      "Decision",
    ];

    const entityType = validTypes.find((t) => t.toLowerCase() === type);
    if (entityType) {
      references.push({
        type: entityType,
        identifier,
      });
    }
  }

  return references;
}

/**
 * Resolve entity references to actual entities in the graph
 */
export async function resolveEntityReferences(
  graphRepo: GraphRepository,
  graphId: any,
  references: ParsedReference[]
): Promise<EntityReference[]> {
  const resolved: EntityReference[] = [];

  for (const ref of references) {
    try {
      // Query for the entity by name/identifier
      const result = await graphRepo.query(graphId, {
        types: [ref.type],
        search: ref.identifier,
        limit: 1,
      });

      if (result.entities.length > 0) {
        const entity = result.entities[0];
        resolved.push({
          type: entity.type,
          entityId: entity.id,
          excerpt: entity.description || entity.name,
        });
      }
    } catch (error) {
      // If resolution fails, include reference anyway (unresolved)
      console.warn(`Failed to resolve entity reference: ${ref.type}:${ref.identifier}`);
    }
  }

  return resolved;
}

/**
 * Extract context for referenced entities
 */
export async function extractReferencedContext(
  graphRepo: GraphRepository,
  graphId: any,
  references: EntityReference[]
): Promise<string> {
  const lines: string[] = [];

  if (references.length === 0) {
    return "";
  }

  lines.push("## Referenced Entities Context\n");

  for (const ref of references) {
    try {
      const entity = await graphRepo.getEntity(graphId, ref.entityId);
      if (entity) {
        lines.push(`### ${entity.type}: ${entity.name}`);

        if (entity.description) {
          lines.push(entity.description);
        }

        if (entity.properties) {
          const propsStr = JSON.stringify(entity.properties, null, 2);
          if (propsStr.length > 200) {
            lines.push("```json");
            lines.push(propsStr.substring(0, 200) + "...");
            lines.push("```");
          } else {
            lines.push("```json");
            lines.push(propsStr);
            lines.push("```");
          }
        }

        lines.push("");
      }
    } catch (error) {
      console.error(`Error extracting entity context: ${error}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format entity references for display in UI
 */
export function formatReferencesForDisplay(references: EntityReference[]): string[] {
  return references.map((ref) => `${ref.type}: ${ref.excerpt || "..."}`);
}

/**
 * Add entity references to a conversation message's context
 */
export async function enrichContextWithReferences(
  baseContext: string,
  references: EntityReference[],
  graphRepo: GraphRepository,
  graphId: any
): Promise<string> {
  const referencedContext = await extractReferencedContext(graphRepo, graphId, references);

  if (referencedContext) {
    return `${baseContext}\n\n${referencedContext}`;
  }

  return baseContext;
}

/**
 * Validate that referenced entities exist
 */
export async function validateEntityReferences(
  graphRepo: GraphRepository,
  graphId: any,
  references: EntityReference[]
): Promise<{
  valid: EntityReference[];
  invalid: string[];
}> {
  const valid: EntityReference[] = [];
  const invalid: string[] = [];

  for (const ref of references) {
    try {
      const entity = await graphRepo.getEntity(graphId, ref.entityId);
      if (entity) {
        valid.push(ref);
      } else {
        invalid.push(`${ref.type}:${ref.entityId}`);
      }
    } catch (error) {
      invalid.push(`${ref.type}:${ref.entityId}`);
    }
  }

  return { valid, invalid };
}
