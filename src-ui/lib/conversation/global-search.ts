/**
 * Global Search
 *
 * Unified search across all Control data:
 * - Project files and structure
 * - Conversation history
 * - Tasks and decisions
 * - Git commits
 * - Agent run results
 */

import type { GraphRepository, EntityType, GraphEntity } from "@/types/graph";

export type SearchScope =
  | "all"
  | "conversations"
  | "files"
  | "tasks"
  | "commits"
  | "agents"
  | "decisions";

export interface SearchResult {
  type: "conversation" | "file" | "task" | "commit" | "agent" | "decision";
  title: string;
  description?: string;
  entityId: string;
  relevance: number;
  context?: string;
  sourceType: EntityType;
}

export interface SearchQuery {
  text: string;
  scope: SearchScope;
  projectId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Perform unified search across all project data
 */
export async function globalSearch(
  graphRepo: GraphRepository,
  query: SearchQuery
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Get all project graphs
  const projectGraphs = await graphRepo.listProjectGraphs();

  for (const projectGraph of projectGraphs) {
    // Skip if filtering by project
    if (query.projectId && projectGraph.projectId !== query.projectId) {
      continue;
    }

    // Search in conversations
    if (query.scope === "all" || query.scope === "conversations") {
      const convResults = await searchConversations(
        graphRepo,
        projectGraph.id,
        query.text
      );
      results.push(...convResults);
    }

    // Search in files
    if (query.scope === "all" || query.scope === "files") {
      const fileResults = await searchFiles(graphRepo, projectGraph.id, query.text);
      results.push(...fileResults);
    }

    // Search in tasks
    if (query.scope === "all" || query.scope === "tasks") {
      const taskResults = await searchTasks(graphRepo, projectGraph.id, query.text);
      results.push(...taskResults);
    }

    // Search in decisions
    if (query.scope === "all" || query.scope === "decisions") {
      const decisionResults = await searchDecisions(
        graphRepo,
        projectGraph.id,
        query.text
      );
      results.push(...decisionResults);
    }

    // Search in commits
    if (query.scope === "all" || query.scope === "commits") {
      const commitResults = await searchCommits(graphRepo, projectGraph.id, query.text);
      results.push(...commitResults);
    }
  }

  // Sort by relevance and apply pagination
  const sorted = results.sort((a, b) => b.relevance - a.relevance);
  const limit = query.limit || 50;
  const offset = query.offset || 0;

  return sorted.slice(offset, offset + limit);
}

async function searchConversations(
  graphRepo: GraphRepository,
  graphId: any,
  searchText: string
): Promise<SearchResult[]> {
  const results = await graphRepo.query(graphId, {
    types: ["Conversation"],
    search: searchText,
  });

  return results.entities.map((entity) => ({
    type: "conversation" as const,
    title: entity.name,
    description: entity.description,
    entityId: entity.id,
    relevance: calculateRelevance(entity.name, searchText),
    sourceType: entity.type,
  }));
}

async function searchFiles(
  graphRepo: GraphRepository,
  graphId: any,
  searchText: string
): Promise<SearchResult[]> {
  const results = await graphRepo.query(graphId, {
    types: ["File"],
    search: searchText,
  });

  return results.entities.map((entity) => ({
    type: "file" as const,
    title: entity.name,
    description: entity.description,
    entityId: entity.id,
    relevance: calculateRelevance(entity.name, searchText),
    sourceType: entity.type,
  }));
}

async function searchTasks(
  graphRepo: GraphRepository,
  graphId: any,
  searchText: string
): Promise<SearchResult[]> {
  const results = await graphRepo.query(graphId, {
    types: ["Task"],
    search: searchText,
  });

  return results.entities.map((entity) => ({
    type: "task" as const,
    title: entity.name,
    description: entity.description,
    entityId: entity.id,
    relevance: calculateRelevance(entity.name, searchText),
    sourceType: entity.type,
  }));
}

async function searchDecisions(
  graphRepo: GraphRepository,
  graphId: any,
  searchText: string
): Promise<SearchResult[]> {
  const results = await graphRepo.query(graphId, {
    types: ["Decision"],
    search: searchText,
  });

  return results.entities.map((entity) => ({
    type: "decision" as const,
    title: entity.name,
    description: entity.description,
    entityId: entity.id,
    relevance: calculateRelevance(entity.name, searchText),
    sourceType: entity.type,
  }));
}

async function searchCommits(
  graphRepo: GraphRepository,
  graphId: any,
  searchText: string
): Promise<SearchResult[]> {
  const results = await graphRepo.query(graphId, {
    types: ["Commit"],
    search: searchText,
  });

  return results.entities.map((entity) => ({
    type: "commit" as const,
    title: entity.name,
    description: entity.description,
    entityId: entity.id,
    relevance: calculateRelevance(entity.name, searchText),
    sourceType: entity.type,
  }));
}

/**
 * Calculate relevance score for a search result (0-1)
 */
function calculateRelevance(title: string, searchText: string): number {
  const titleLower = title.toLowerCase();
  const queryLower = searchText.toLowerCase();

  if (titleLower === queryLower) {
    return 1.0; // Exact match
  }

  if (titleLower.startsWith(queryLower)) {
    return 0.9; // Starts with
  }

  if (titleLower.includes(queryLower)) {
    return 0.7; // Contains
  }

  // Check for word boundaries
  const words = queryLower.split(/\s+/);
  if (words.every((w) => titleLower.includes(w))) {
    return 0.5; // All words present
  }

  return 0.1; // Partial match
}

/**
 * Highlight search terms in result text
 */
export function highlightSearchTerms(text: string, searchText: string): string {
  const regex = new RegExp(`(${searchText})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

/**
 * Get search suggestions based on query prefix
 */
export async function getSearchSuggestions(
  graphRepo: GraphRepository,
  prefix: string,
  limit: number = 5
): Promise<string[]> {
  if (prefix.length < 2) {
    return [];
  }

  const results = await globalSearch(graphRepo, {
    text: prefix,
    scope: "all",
    limit,
  });

  // Extract unique titles
  const suggestions = new Set(results.map((r) => r.title));
  return Array.from(suggestions).slice(0, limit);
}

/**
 * Group search results by type
 */
export function groupSearchResults(results: SearchResult[]): Record<string, SearchResult[]> {
  const grouped: Record<string, SearchResult[]> = {};

  for (const result of results) {
    if (!grouped[result.type]) {
      grouped[result.type] = [];
    }
    grouped[result.type].push(result);
  }

  return grouped;
}
