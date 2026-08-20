/**
 * Control Graph Module
 *
 * Provides the GraphRepository abstraction and FeltDB implementation.
 * This is the foundation for project graphs and global graph.
 */

export * from "@/types/graph";
export { FeltDBGraphRepository } from "./FeltDBGraphRepository";

import { createFeltDB } from "@feltdb/core";
import { FeltDBGraphRepository } from "./FeltDBGraphRepository";
import type { GraphRepository } from "@/types/graph";

/**
 * Factory for creating a graph repository backed by FeltDB
 */
export async function createGraphRepository(
  namespace: string = "control"
): Promise<GraphRepository> {
  const feltDB = createFeltDB({
    namespace,
    memory: true, // Start with in-memory for now; can switch to persistent file storage later
  });

  const repo = new FeltDBGraphRepository(feltDB);
  await repo.initialize();

  return repo;
}
