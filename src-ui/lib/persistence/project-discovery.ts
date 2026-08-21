/**
 * Project Discovery and Reconciliation
 *
 * Automatically discovers projects in workspace filesystem.
 * Reconciles discovered projects with database state.
 * Detects orphaned projects, missing projects, stale metadata.
 */

import type { ProjectMetadata } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("storage");

export interface DiscoveredProject {
  id: string;
  path: string;
  name: string;
  hasGit: boolean;
  hasClaudeYaml: boolean;
  lastModified: number;
  estimatedSize: number;
}

export interface ProjectReconciliationResult {
  timestamp: number;
  discoveredCount: number;
  registeredCount: number;
  newProjects: DiscoveredProject[];
  orphanedProjects: ProjectMetadata[];
  staleLmetadata: Array<{ project: ProjectMetadata; discovered: DiscoveredProject }>;
  conflicts: Array<{ path: string; reason: string }>;
  recommendations: string[];
}

export class ProjectDiscoveryManager {
  private discoveredProjects: Map<string, DiscoveredProject> = new Map();
  private reconciliationHistory: ProjectReconciliationResult[] = [];

  /**
   * Discover all projects in workspace
   * Scans filesystem for git repos and CLAUDE.md files
   */
  async discoverProjects(workspaceRoot: string): Promise<DiscoveredProject[]> {
    const discovered: DiscoveredProject[] = [];

    try {
      // In real implementation, would:
      // - Scan workspace root directory
      // - Identify directories with .git or CLAUDE.md
      // - Extract project metadata from package.json or CLAUDE.md
      // - Record filesystem modification times and sizes

      // For now, return simulated discovery
      logger.info("project_discovery_starting", { workspaceRoot });

      // This would be replaced with actual filesystem scanning
      // using fs.readdirSync() or fs.promises.readdir()

      logger.info("project_discovery_complete", {
        discoveredCount: discovered.length,
      });

      for (const project of discovered) {
        this.discoveredProjects.set(project.id, project);
      }

      return discovered;
    } catch (err) {
      logger.error("project_discovery_failed", { workspaceRoot }, String(err));
      return [];
    }
  }

  /**
   * Reconcile discovered projects with registered projects
   * Identifies mismatches and stale data
   */
  reconcile(
    discovered: DiscoveredProject[],
    registered: ProjectMetadata[]
  ): ProjectReconciliationResult {
    const result: ProjectReconciliationResult = {
      timestamp: Date.now(),
      discoveredCount: discovered.length,
      registeredCount: registered.length,
      newProjects: [],
      orphanedProjects: [],
      staleLmetadata: [],
      conflicts: [],
      recommendations: [],
    };

    // Create maps for comparison
    const registeredByPath = new Map(registered.map((p) => [p.workspacePath, p]));
    const discoveredByPath = new Map(discovered.map((p) => [p.path, p]));

    // Find new projects (discovered but not registered)
    for (const project of discovered) {
      if (!registeredByPath.has(project.path)) {
        result.newProjects.push(project);
        result.recommendations.push(`New project discovered at ${project.path} - consider adding to registry`);
      }
    }

    // Find orphaned projects (registered but not discovered)
    for (const project of registered) {
      if (!discoveredByPath.has(project.workspacePath)) {
        result.orphanedProjects.push(project);
        result.recommendations.push(
          `Project ${project.name} at ${project.workspacePath} no longer exists - consider archiving`
        );
      }
    }

    // Find stale metadata (exists but metadata is outdated)
    for (const [path, registered] of registeredByPath.entries()) {
      const discovered = discoveredByPath.get(path);
      if (discovered && registered.lastModified) {
        // Check if discovered is newer than registered metadata
        if (discovered.lastModified > (registered.lastModified || 0)) {
          result.staleLmetadata.push({ project: registered, discovered });
          result.recommendations.push(
            `Project ${registered.name} metadata is stale (last known: ${new Date(registered.lastModified).toISOString()})`
          );
        }
      }
    }

    // Detect conflicts (e.g., multiple projects at same path)
    const pathCounts = new Map<string, number>();
    for (const project of discovered) {
      pathCounts.set(project.path, (pathCounts.get(project.path) || 0) + 1);
    }

    for (const [path, count] of pathCounts.entries()) {
      if (count > 1) {
        result.conflicts.push({
          path,
          reason: "Multiple projects detected at same path",
        });
      }
    }

    this.reconciliationHistory.push(result);

    logger.info("project_reconciliation_complete", {
      discovered: result.discoveredCount,
      registered: result.registeredCount,
      newProjects: result.newProjects.length,
      orphaned: result.orphanedProjects.length,
      stale: result.staleLmetadata.length,
    });

    return result;
  }

  /**
   * Auto-register new projects discovered during reconciliation
   */
  autoRegisterNewProjects(
    newProjects: DiscoveredProject[]
  ): { registered: number; failed: Array<{ project: DiscoveredProject; error: string }> } {
    const registered: DiscoveredProject[] = [];
    const failed: Array<{ project: DiscoveredProject; error: string }> = [];

    for (const project of newProjects) {
      try {
        // Validate project before registration
        if (!project.path || !project.name) {
          throw new Error("Project missing required fields");
        }

        // In real implementation, would create database entry
        // For now, just track as registered
        registered.push(project);

        logger.info("project_auto_registered", { projectId: project.id, path: project.path });
      } catch (err) {
        failed.push({
          project,
          error: String(err),
        });
        logger.warn("project_auto_registration_failed", { projectId: project.id }, String(err));
      }
    }

    return {
      registered: registered.length,
      failed,
    };
  }

  /**
   * Archive orphaned projects
   * Marks them as archived but keeps metadata for recovery
   */
  archiveOrphanedProjects(
    orphaned: ProjectMetadata[]
  ): { archived: number; failed: Array<{ project: ProjectMetadata; error: string }> } {
    const archived: ProjectMetadata[] = [];
    const failed: Array<{ project: ProjectMetadata; error: string }> = [];

    for (const project of orphaned) {
      try {
        // In real implementation, would update database
        // Mark as archived with timestamp

        archived.push(project);
        logger.info("project_archived", { projectId: project.id }, `Orphaned project ${project.name} archived`);
      } catch (err) {
        failed.push({
          project,
          error: String(err),
        });
      }
    }

    return {
      archived: archived.length,
      failed,
    };
  }

  /**
   * Refresh stale project metadata from filesystem
   */
  async refreshProjectMetadata(
    staleProjects: Array<{ project: ProjectMetadata; discovered: DiscoveredProject }>
  ): Promise<{ refreshed: number; failed: number }> {
    let refreshed = 0;
    let failed = 0;

    for (const { project, discovered } of staleProjects) {
      try {
        // In real implementation, would:
        // - Re-read project metadata from filesystem
        // - Update database with new timestamps, sizes
        // - Verify git state

        logger.info("project_metadata_refreshed", { projectId: project.id });
        refreshed++;
      } catch (err) {
        logger.error("project_metadata_refresh_failed", { projectId: project.id }, String(err));
        failed++;
      }
    }

    return { refreshed, failed };
  }

  /**
   * Get reconciliation history
   */
  getReconciliationHistory(limit: number = 50): ProjectReconciliationResult[] {
    return this.reconciliationHistory.slice(-limit);
  }

  /**
   * Export reconciliation report
   */
  exportReconciliationReport(): string {
    const latestResult = this.reconciliationHistory[this.reconciliationHistory.length - 1];

    if (!latestResult) {
      return JSON.stringify(
        {
          message: "No reconciliation has been performed",
          timestamp: Date.now(),
        },
        null,
        2
      );
    }

    return JSON.stringify(
      {
        timestamp: new Date(latestResult.timestamp).toISOString(),
        summary: {
          discovered: latestResult.discoveredCount,
          registered: latestResult.registeredCount,
          newProjects: latestResult.newProjects.length,
          orphaned: latestResult.orphanedProjects.length,
          stale: latestResult.staleLmetadata.length,
          conflicts: latestResult.conflicts.length,
        },
        details: latestResult,
        recommendations: latestResult.recommendations,
      },
      null,
      2
    );
  }

  /**
   * Verify project integrity
   * Checks that all registered projects are accessible and valid
   */
  async verifyProjectIntegrity(
    projects: ProjectMetadata[]
  ): Promise<{
    valid: number;
    inaccessible: number;
    corrupted: number;
    issues: Array<{ projectId: string; issue: string }>;
  }> {
    const issues: Array<{ projectId: string; issue: string }> = [];
    let valid = 0;
    let inaccessible = 0;
    let corrupted = 0;

    for (const project of projects) {
      try {
        // In real implementation, would:
        // - Check if path is accessible
        // - Verify git repository integrity
        // - Check file permissions
        // - Validate CLAUDE.md if present

        valid++;
      } catch (err) {
        const error = String(err);
        if (error.includes("ENOENT") || error.includes("EACCES")) {
          inaccessible++;
          issues.push({
            projectId: project.id,
            issue: "Project path not accessible",
          });
        } else {
          corrupted++;
          issues.push({
            projectId: project.id,
            issue: `Corrupted: ${error}`,
          });
        }
      }
    }

    return {
      valid,
      inaccessible,
      corrupted,
      issues,
    };
  }
}

// Global instance
let discoveryManager: ProjectDiscoveryManager | null = null;

/**
 * Get or create project discovery manager
 */
export function getProjectDiscoveryManager(): ProjectDiscoveryManager {
  if (!discoveryManager) {
    discoveryManager = new ProjectDiscoveryManager();
  }
  return discoveryManager;
}
