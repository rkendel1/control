import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { logger } from "./logger";
import type {
  Project,
  ProjectsRegistry,
  DiscoveredRepository,
  RepositoryConfig,
} from "./project-types";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const PROJECTS_REGISTRY_PATH = path.join(
  WORKSPACE_ROOT,
  "mission-control",
  "data",
  "projects.json"
);

/**
 * Manages the registry of local development projects.
 * Projects represent logical groupings of repositories that teams
 * work on together.
 */
export class ProjectRegistry {
  private projects = new Map<string, Project>();
  private loaded = false;

  constructor() {
    this.ensureRegistryExists();
    this.load();
  }

  /**
   * Load projects from disk.
   */
  private load(): void {
    try {
      if (!fs.existsSync(PROJECTS_REGISTRY_PATH)) {
        logger.info("projects", "No projects registry found, starting fresh");
        this.loaded = true;
        return;
      }

      const content = fs.readFileSync(PROJECTS_REGISTRY_PATH, "utf-8");
      const data = JSON.parse(content) as ProjectsRegistry;

      this.projects.clear();
      for (const project of data.projects) {
        this.projects.set(project.id, project);
      }

      logger.info("projects", `Loaded ${this.projects.size} projects`);
      this.loaded = true;
    } catch (err) {
      logger.error(
        "projects",
        `Failed to load projects: ${err instanceof Error ? err.message : String(err)}`
      );
      this.loaded = true;
    }
  }

  /**
   * Save projects to disk.
   */
  private save(): void {
    try {
      const dir = path.dirname(PROJECTS_REGISTRY_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const registry: ProjectsRegistry = {
        projects: Array.from(this.projects.values()),
        version: "1.0",
      };

      fs.writeFileSync(
        PROJECTS_REGISTRY_PATH,
        JSON.stringify(registry, null, 2),
        "utf-8"
      );
      logger.info("projects", `Saved ${this.projects.size} projects`);
    } catch (err) {
      logger.error(
        "projects",
        `Failed to save projects: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }

  /**
   * Create projects registry if it doesn't exist.
   */
  private ensureRegistryExists(): void {
    if (!fs.existsSync(PROJECTS_REGISTRY_PATH)) {
      const dir = path.dirname(PROJECTS_REGISTRY_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const registry: ProjectsRegistry = {
        projects: [],
        version: "1.0",
      };

      fs.writeFileSync(
        PROJECTS_REGISTRY_PATH,
        JSON.stringify(registry, null, 2),
        "utf-8"
      );
    }
  }

  /**
   * Add a project to the registry.
   */
  add(project: Project): void {
    if (this.projects.has(project.id)) {
      throw new Error(`Project with id '${project.id}' already exists`);
    }

    this.projects.set(project.id, project);
    this.save();

    logger.info("projects", `Added project: ${project.name} (${project.id})`);
  }

  /**
   * Update a project.
   */
  update(id: string, updates: Partial<Project>): void {
    const project = this.projects.get(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    const updated: Project = {
      ...project,
      ...updates,
      id: project.id, // Never allow ID change
      createdAt: project.createdAt, // Never allow creation time change
      updatedAt: new Date().toISOString(),
    };

    this.projects.set(id, updated);
    this.save();

    logger.info("projects", `Updated project: ${id}`);
  }

  /**
   * Get a project by ID.
   */
  get(id: string): Project | null {
    return this.projects.get(id) ?? null;
  }

  /**
   * List all projects.
   */
  list(): Project[] {
    return Array.from(this.projects.values());
  }

  /**
   * Find projects by repository path.
   */
  findByRepositoryPath(repoPath: string): Project[] {
    const normalized = path.normalize(repoPath);
    const results: Project[] = [];

    for (const project of this.projects.values()) {
      if (
        project.repository &&
        path.normalize(project.repository.path) === normalized
      ) {
        results.push(project);
      }

      if (project.repositories) {
        for (const repo of project.repositories) {
          if (path.normalize(repo.path) === normalized) {
            results.push(project);
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Search projects by name or tag.
   */
  search(query: string): Project[] {
    const lower = query.toLowerCase();
    const results: Project[] = [];

    for (const project of this.projects.values()) {
      if (
        project.name.toLowerCase().includes(lower) ||
        project.id.toLowerCase().includes(lower) ||
        project.tags?.some((tag) => tag.toLowerCase().includes(lower))
      ) {
        results.push(project);
      }
    }

    return results;
  }

  /**
   * Remove a project from the registry.
   */
  remove(id: string): void {
    if (!this.projects.has(id)) {
      throw new Error(`Project not found: ${id}`);
    }

    this.projects.delete(id);
    this.save();

    logger.info("projects", `Removed project: ${id}`);
  }
}

/**
 * Discovers git repositories in a directory.
 */
export class RepositoryDiscovery {
  /**
   * Scan a directory recursively for git repositories.
   * Returns the first level of repos found.
   */
  static async scanDirectory(dirPath: string): Promise<DiscoveredRepository[]> {
    const repos: DiscoveredRepository[] = [];
    const maxDepth = 3;

    const scan = (current: string, depth: number): void => {
      if (depth > maxDepth) return;
      if (!fs.existsSync(current)) return;

      try {
        const entries = fs.readdirSync(current);

        for (const entry of entries) {
          // Skip hidden and system directories
          if (entry.startsWith(".") && entry !== ".git") continue;

          const fullPath = path.join(current, entry);
          const stat = fs.statSync(fullPath);

          if (!stat.isDirectory()) continue;

          // Check if this is a git repository
          const gitDir = path.join(fullPath, ".git");
          if (fs.existsSync(gitDir)) {
            const repo = this.getRepositoryMetadata(fullPath);
            if (repo) {
              repos.push(repo);
            }
            // Don't recurse into git repos
            continue;
          }

          // Recurse if within depth limit
          if (depth < maxDepth) {
            scan(fullPath, depth + 1);
          }
        }
      } catch (err) {
        logger.debug(
          "discovery",
          `Error scanning ${current}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    scan(dirPath, 0);
    return repos;
  }

  /**
   * Get metadata about a git repository.
   */
  static getRepositoryMetadata(repoPath: string): DiscoveredRepository | null {
    try {
      const gitDir = path.join(repoPath, ".git");
      if (!fs.existsSync(gitDir)) {
        return null;
      }

      const name = path.basename(repoPath);

      try {
        // Get git URL
        let gitUrl: string | undefined;
        try {
          gitUrl = execSync("git config --get remote.origin.url", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
        } catch {
          /* no remote */
        }

        // Get default branch
        let defaultBranch: string | undefined;
        try {
          defaultBranch = execSync(
            "git rev-parse --abbrev-ref HEAD",
            {
              cwd: repoPath,
              encoding: "utf-8",
              timeout: 5000,
            }
          ).trim();
        } catch {
          /* can't determine */
        }

        // Check for uncommitted changes
        let hasUncommittedChanges = false;
        try {
          const status = execSync("git status --porcelain", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();
          hasUncommittedChanges = status.length > 0;
        } catch {
          /* can't determine */
        }

        // Get last commit
        let lastCommit: DiscoveredRepository["lastCommit"];
        try {
          const hash = execSync("git rev-parse HEAD", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();

          const message = execSync("git log -1 --format=%s", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();

          const timestamp = execSync("git log -1 --format=%ai", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();

          lastCommit = { hash, message, timestamp };
        } catch {
          /* can't determine */
        }

        // Count active worktrees
        let activeWorktrees = 0;
        try {
          const list = execSync("git worktree list --porcelain", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 5000,
          }).trim();

          // Each line is a worktree (first is main checkout)
          activeWorktrees = list.split("\n").filter((line) => line).length - 1;
        } catch {
          /* can't determine */
        }

        return {
          path: repoPath,
          name,
          gitUrl,
          defaultBranch,
          hasUncommittedChanges,
          activeWorktrees: activeWorktrees > 0 ? activeWorktrees : undefined,
          lastCommit,
        };
      } catch (err) {
        logger.debug(
          "discovery",
          `Error getting metadata for ${repoPath}: ${err instanceof Error ? err.message : String(err)}`
        );
        return { path: repoPath, name, hasUncommittedChanges: false };
      }
    } catch (err) {
      logger.debug(
        "discovery",
        `Error discovering repo at ${repoPath}: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }
}

// Global singleton
export const projectRegistry = new ProjectRegistry();
