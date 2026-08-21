/**
 * Context Engine
 *
 * Derives context from project and global graphs
 * Injects this context into agent prompts and mission-control workflows
 *
 * Flow:
 * 1. Query graphs for relevant entities and relationships
 * 2. Format context into markdown for agent consumption
 * 3. Cache formatted context with version numbers
 * 4. Invalidate cache on graph mutations
 * 5. Expose context via APIs for mission-control daemon
 */

import type { GraphRepository, GraphId, GraphEntity } from "@/types/graph";
import { GlobalGraph } from "./global";

export interface ContextMetadata {
  version: number;
  generatedAt: number;
  projectId: string;
  graphVersion: number;
}

export interface ProjectContext {
  metadata: ContextMetadata;
  summary: string;
  repository: string;
  structure: string;
  recentFiles: string;
  dependencies: string;
  tasks: string;
}

export interface GlobalContext {
  metadata: ContextMetadata;
  summary: string;
  projects: string;
  activeAgents: string;
  sharedTasks: string;
  decisions: string;
}

export class ContextEngine {
  private contextCache = new Map<string, { context: any; version: number }>();

  /**
   * Generate context for a specific project graph
   * This context is injected into agent prompts
   */
  async generateProjectContext(
    graphRepo: GraphRepository,
    projectGraphId: GraphId,
    projectId: string
  ): Promise<ProjectContext> {
    // Check cache
    const cached = this.contextCache.get(`project:${projectId}`);
    if (cached) {
      return cached.context as ProjectContext;
    }

    // Get all entities in project graph
    const allEntities = await graphRepo.getAllEntities(projectGraphId);
    const allRelationships = await graphRepo.getAllRelationships(projectGraphId);

    // Extract key information
    const projectEntity = allEntities.find((e) => e.type === "Project");
    const repositoryEntity = allEntities.find((e) => e.type === "Repository");
    const fileEntities = allEntities.filter((e) => e.type === "File");
    const directoryEntities = allEntities.filter((e) => e.type === "Directory");
    const taskEntities = allEntities.filter((e) => e.type === "Task");
    const dependencyEntities = allEntities.filter(
      (e) => e.type === "Dependency"
    );

    // Build context sections
    const summary = this.buildSummary(projectEntity);
    const repository = this.buildRepositorySection(repositoryEntity);
    const structure = this.buildStructureSection(
      directoryEntities,
      fileEntities
    );
    const recentFiles = this.buildRecentFilesSection(fileEntities);
    const dependencies = this.buildDependenciesSection(dependencyEntities);
    const tasks = this.buildTasksSection(taskEntities);

    const context: ProjectContext = {
      metadata: {
        version: 1,
        generatedAt: Date.now(),
        projectId,
        graphVersion: allEntities.length,
      },
      summary,
      repository,
      structure,
      recentFiles,
      dependencies,
      tasks,
    };

    // Cache the context
    this.contextCache.set(`project:${projectId}`, {
      context,
      version: 1,
    });

    return context;
  }

  /**
   * Generate global context for all projects
   */
  async generateGlobalContext(
    graphRepo: GraphRepository,
    globalGraphId: GraphId
  ): Promise<GlobalContext> {
    const cached = this.contextCache.get("global");
    if (cached) {
      return cached.context as GlobalContext;
    }

    const projects = await GlobalGraph.getRegisteredProjects(
      graphRepo,
      globalGraphId
    );
    const agents = await GlobalGraph.getActiveAgents(graphRepo, globalGraphId);
    const tasks = await GlobalGraph.getSharedTasks(graphRepo, globalGraphId);
    const allEntities = await graphRepo.getAllEntities(globalGraphId);

    const summary = `Control coordination layer. ${projects.length} projects, ${agents.length} active agents, ${tasks.length} shared tasks.`;
    const projectsList = this.buildProjectsListSection(projects);
    const agentsList = this.buildAgentsListSection(agents);
    const tasksList = this.buildTasksListSection(tasks);
    const decisions = `${allEntities.filter((e) => e.type === "Decision").length} pending decisions`;

    const context: GlobalContext = {
      metadata: {
        version: 1,
        generatedAt: Date.now(),
        projectId: "global",
        graphVersion: allEntities.length,
      },
      summary,
      projects: projectsList,
      activeAgents: agentsList,
      sharedTasks: tasksList,
      decisions,
    };

    this.contextCache.set("global", { context, version: 1 });
    return context;
  }

  /**
   * Format context as markdown for agent consumption
   */
  formatProjectContextMarkdown(context: ProjectContext): string {
    return `
# Project Context

Generated: ${new Date(context.metadata.generatedAt).toISOString()}

## Summary
${context.summary}

## Repository
${context.repository}

## Project Structure
${context.structure}

## Recent Files
${context.recentFiles}

## Dependencies
${context.dependencies}

## Tasks & Work Items
${context.tasks}
`;
  }

  /**
   * Format global context as markdown
   */
  formatGlobalContextMarkdown(context: GlobalContext): string {
    return `
# Global Control Context

Generated: ${new Date(context.metadata.generatedAt).toISOString()}

## Summary
${context.summary}

## Projects
${context.projects}

## Active Agents
${context.activeAgents}

## Shared Tasks
${context.sharedTasks}

## Decisions
${context.decisions}
`;
  }

  /**
   * Invalidate cache for a project
   */
  invalidateProjectCache(projectId: string): void {
    this.contextCache.delete(`project:${projectId}`);
    // Also invalidate global cache since it references this project
    this.contextCache.delete("global");
  }

  /**
   * Invalidate all caches
   */
  invalidateAllCaches(): void {
    this.contextCache.clear();
  }

  // ─── Private formatting helpers ──────────────────────────

  private buildSummary(project: GraphEntity | undefined): string {
    if (!project) return "No project entity found.";
    return `**${project.name}** - ${project.description || "Project in Control"}`;
  }

  private buildRepositorySection(repo: GraphEntity | undefined): string {
    if (!repo) return "No repository configured.";
    const path = repo.properties?.path || "Unknown";
    const branch = repo.properties?.defaultBranch || "main";
    const remote = repo.properties?.remoteUrl || "No remote";
    return `- **Path:** ${path}\n- **Default branch:** ${branch}\n- **Remote:** ${remote}`;
  }

  private buildStructureSection(
    directories: GraphEntity[],
    files: GraphEntity[]
  ): string {
    if (directories.length === 0 && files.length === 0) {
      return "No files indexed yet.";
    }
    const dirCount = directories.length;
    const fileCount = files.length;
    return `**${dirCount}** directories, **${fileCount}** files indexed (up to depth 3)`;
  }

  private buildRecentFilesSection(files: GraphEntity[]): string {
    if (files.length === 0) return "No files indexed.";
    return files.slice(0, 10).map((f) => `- ${f.name}`).join("\n") + (files.length > 10 ? `\n- ... and ${files.length - 10} more` : "");
  }

  private buildDependenciesSection(deps: GraphEntity[]): string {
    if (deps.length === 0) return "No dependencies indexed.";
    return deps.slice(0, 5).map((d) => `- ${d.name}`).join("\n") + (deps.length > 5 ? `\n- ... and ${deps.length - 5} more` : "");
  }

  private buildTasksSection(tasks: GraphEntity[]): string {
    if (tasks.length === 0) return "No tasks.";
    const byStatus = new Map<string, number>();
    for (const task of tasks) {
      const status = (task.properties?.status as string) || "unknown";
      byStatus.set(status, (byStatus.get(status) || 0) + 1);
    }
    return Array.from(byStatus.entries())
      .map(([status, count]) => `- **${status}:** ${count}`)
      .join("\n");
  }

  private buildProjectsListSection(projects: GraphEntity[]): string {
    if (projects.length === 0) return "No projects registered.";
    return projects
      .map((p) => `- **${p.name}** (${p.properties?.projectId})`)
      .join("\n");
  }

  private buildAgentsListSection(agents: GraphEntity[]): string {
    if (agents.length === 0) return "No active agents.";
    return agents
      .map((a) => {
        const caps = (a.properties?.capabilities as string[] | undefined) || [];
        return `- **${a.name}** - ${caps.join(", ")}`;
      })
      .join("\n");
  }

  private buildTasksListSection(tasks: GraphEntity[]): string {
    if (tasks.length === 0) return "No shared tasks.";
    return tasks
      .map((t) => `- ${t.name}`)
      .join("\n");
  }
}

// Global singleton
let contextEngineInstance: ContextEngine | null = null;

export function getContextEngine(): ContextEngine {
  if (!contextEngineInstance) {
    contextEngineInstance = new ContextEngine();
  }
  return contextEngineInstance;
}
