/**
 * FeltDB Schema Versioning
 *
 * Manages database schema evolution and migrations.
 * Prevents data loss during FeltDB version upgrades.
 * Tracks schema versions, runs migrations, validates compatibility.
 */

import type { WorkspaceBackup, DatabaseMigration, SchemaMigrationInfo } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("storage");

export type SchemaVersion = "1.0.0" | "1.1.0" | "1.2.0" | "2.0.0";

export interface SchemaMigrationStep {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  description: string;
  migrate: (data: Record<string, any>) => Promise<Record<string, any>>;
  validate: (data: Record<string, any>) => boolean;
}

export class SchemaVersioningManager {
  private currentVersion: SchemaVersion = "1.0.0";
  private migrationHistory: SchemaMigrationInfo[] = [];
  private readonly migrations: Map<string, SchemaMigrationStep> = new Map();

  constructor() {
    this.registerMigrations();
  }

  /**
   * Register all known schema migrations
   */
  private registerMigrations(): void {
    // Migration 1.0.0 → 1.1.0: Add timestamps to projects
    this.migrations.set("1.0.0->1.1.0", {
      fromVersion: "1.0.0",
      toVersion: "1.1.0",
      description: "Add timestamps to projects and tasks",
      migrate: async (data: Record<string, any>) => {
        const now = Date.now();

        if (data.projects) {
          data.projects = data.projects.map((p: any) => ({
            ...p,
            createdAt: p.createdAt || now,
            updatedAt: p.updatedAt || now,
          }));
        }

        if (data.tasks) {
          data.tasks = data.tasks.map((t: any) => ({
            ...t,
            createdAt: t.createdAt || now,
            updatedAt: t.updatedAt || now,
          }));
        }

        return data;
      },
      validate: (data: Record<string, any>) => {
        if (data.projects) {
          return data.projects.every((p: any) => p.createdAt && p.updatedAt);
        }
        return true;
      },
    });

    // Migration 1.1.0 → 1.2.0: Add recovery metadata
    this.migrations.set("1.1.0->1.2.0", {
      fromVersion: "1.1.0",
      toVersion: "1.2.0",
      description: "Add recovery metadata to agent runs",
      migrate: async (data: Record<string, any>) => {
        if (data.agentRuns) {
          data.agentRuns = data.agentRuns.map((run: any) => ({
            ...run,
            recoveryState: run.recoveryState || "NORMAL",
            checkpointData: run.checkpointData || null,
          }));
        }
        return data;
      },
      validate: (data: Record<string, any>) => {
        if (data.agentRuns) {
          return data.agentRuns.every((r: any) => r.recoveryState);
        }
        return true;
      },
    });

    // Migration 1.2.0 → 2.0.0: Restructure global graph
    this.migrations.set("1.2.0->2.0.0", {
      fromVersion: "1.2.0",
      toVersion: "2.0.0",
      description: "Restructure global graph to support multi-repository context",
      migrate: async (data: Record<string, any>) => {
        if (data.globalGraph) {
          // Wrap existing graph in new structure
          data.globalGraph = {
            version: "2.0.0",
            repositories: [
              {
                id: "primary",
                name: "main",
                entities: data.globalGraph,
              },
            ],
          };
        }
        return data;
      },
      validate: (data: Record<string, any>) => {
        if (data.globalGraph) {
          return data.globalGraph.version === "2.0.0" && data.globalGraph.repositories;
        }
        return true;
      },
    });
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): SchemaVersion {
    return this.currentVersion;
  }

  /**
   * Check if database needs migration
   */
  needsMigration(databaseVersion: SchemaVersion): boolean {
    const versionOrder: SchemaVersion[] = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"];
    return versionOrder.indexOf(databaseVersion) < versionOrder.indexOf(this.currentVersion);
  }

  /**
   * Perform database migration with full validation
   */
  async migrate(
    data: Record<string, any>,
    fromVersion: SchemaVersion
  ): Promise<{
    success: boolean;
    data?: Record<string, any>;
    message: string;
    stepsExecuted?: number;
  }> {
    try {
      const migrationPath = this.calculateMigrationPath(fromVersion, this.currentVersion);

      if (migrationPath.length === 0) {
        return {
          success: true,
          data,
          message: "No migration needed",
          stepsExecuted: 0,
        };
      }

      logger.info("schema_migration_starting", { fromVersion, toVersion: this.currentVersion });

      let currentData = JSON.parse(JSON.stringify(data)); // Deep clone
      let stepCount = 0;

      for (const step of migrationPath) {
        const migration = this.migrations.get(`${step.from}->${step.to}`);
        if (!migration) {
          return {
            success: false,
            message: `Migration ${step.from}->${step.to} not found`,
          };
        }

        // Execute migration
        currentData = await migration.migrate(currentData);

        // Validate result
        if (!migration.validate(currentData)) {
          return {
            success: false,
            message: `Validation failed for migration ${step.from}->${step.to}`,
          };
        }

        stepCount++;
        this.migrationHistory.push({
          id: `mig_${Date.now()}`,
          fromVersion: step.from,
          toVersion: step.to,
          description: migration.description,
          timestamp: Date.now(),
          success: true,
        });

        logger.info("schema_migration_step_complete", {
          step: `${step.from}->${step.to}`,
          stepNumber: stepCount,
        });
      }

      this.currentVersion = this.currentVersion;

      logger.info("schema_migration_complete", {
        fromVersion,
        toVersion: this.currentVersion,
        steps: stepCount,
      });

      return {
        success: true,
        data: currentData,
        message: "Migration completed successfully",
        stepsExecuted: stepCount,
      };
    } catch (err) {
      logger.error("schema_migration_failed", { fromVersion }, String(err));
      return {
        success: false,
        message: `Migration failed: ${String(err)}`,
      };
    }
  }

  /**
   * Calculate migration path from source to target version
   */
  private calculateMigrationPath(
    from: SchemaVersion,
    to: SchemaVersion
  ): Array<{ from: SchemaVersion; to: SchemaVersion }> {
    const versionOrder: SchemaVersion[] = ["1.0.0", "1.1.0", "1.2.0", "2.0.0"];
    const fromIndex = versionOrder.indexOf(from);
    const toIndex = versionOrder.indexOf(to);

    if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
      return [];
    }

    const path: Array<{ from: SchemaVersion; to: SchemaVersion }> = [];
    for (let i = fromIndex; i < toIndex; i++) {
      path.push({
        from: versionOrder[i],
        to: versionOrder[i + 1],
      });
    }

    return path;
  }

  /**
   * Validate schema compatibility
   */
  async validateSchema(data: Record<string, any>, version: SchemaVersion): Promise<{
    valid: boolean;
    issues: string[];
    canAutoRepair: boolean;
  }> {
    const issues: string[] = [];

    // Check required top-level collections
    const requiredCollections = ["projects", "tasks", "conversations"];
    for (const collection of requiredCollections) {
      if (!Array.isArray(data[collection])) {
        issues.push(`Missing or invalid collection: ${collection}`);
      }
    }

    // Version-specific validation
    if (version === "2.0.0") {
      if (data.globalGraph && !data.globalGraph.repositories) {
        issues.push("globalGraph missing repositories array (2.0.0 required)");
      }
    }

    // Check entity integrity
    if (data.tasks && Array.isArray(data.tasks)) {
      for (const task of data.tasks) {
        if (!task.id || !task.title) {
          issues.push(`Task missing required fields: ${JSON.stringify(task).slice(0, 50)}`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      canAutoRepair: issues.length <= 3, // Can repair minor issues
    };
  }

  /**
   * Get migration history
   */
  getMigrationHistory(): SchemaMigrationInfo[] {
    return [...this.migrationHistory];
  }

  /**
   * Export schema information
   */
  exportSchemaInfo(): {
    currentVersion: SchemaVersion;
    supportedVersions: SchemaVersion[];
    migrationCount: number;
    lastMigration?: SchemaMigrationInfo;
  } {
    return {
      currentVersion: this.currentVersion,
      supportedVersions: ["1.0.0", "1.1.0", "1.2.0", "2.0.0"],
      migrationCount: this.migrationHistory.length,
      lastMigration: this.migrationHistory[this.migrationHistory.length - 1],
    };
  }
}

// Global instance
let schemaManager: SchemaVersioningManager | null = null;

/**
 * Get or create schema versioning manager
 */
export function getSchemaVersioningManager(): SchemaVersioningManager {
  if (!schemaManager) {
    schemaManager = new SchemaVersioningManager();
  }
  return schemaManager;
}
