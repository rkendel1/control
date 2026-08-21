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
import * as path from "path";
import * as os from "os";

/**
 * Factory for creating a graph repository backed by FeltDB
 * Uses persistent file storage in user's data directory
 */
export async function createGraphRepository(
  namespace: string = "control"
): Promise<GraphRepository> {
  // Determine storage path based on platform
  let storagePath: string;

  if (typeof window !== "undefined") {
    // Browser/Tauri context - use app data directory
    // In Tauri, this would be set via tauri::api::path
    storagePath = path.join(os.homedir(), ".control", "graphs");
  } else {
    // Node.js context
    storagePath = path.join(os.homedir(), ".control", "graphs");
  }

  const feltDB = createFeltDB({
    namespace,
    memory: false, // Use persistent file storage
    storePath: storagePath, // FeltDB will create .control/graphs directory
  });

  const repo = new FeltDBGraphRepository(feltDB);
  await repo.initialize();

  return repo;
}
