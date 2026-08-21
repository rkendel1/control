/**
 * Context Resolver
 *
 * Gathers and resolves context for AI conversations.
 * Supports 5 modes: Current, Project, Global, Task, Full.
 */

import type {
  GraphRepository,
  GraphId,
  ContextMode,
  ResolvedContext,
  CurrentWorkspaceContext,
  ProjectContextData,
  GlobalContextData,
  TaskContextData,
  EntityId,
} from "@/types/graph";
import { ContextEngine, getContextEngine } from "./context-engine";
import { GlobalGraph } from "./global";

export class ContextResolver {
  constructor(private graphRepo: GraphRepository) {}

  async resolveContext(
    mode: ContextMode,
    projectId?: string,
    taskId?: string,
    workspaceContext?: CurrentWorkspaceContext
  ): Promise<ResolvedContext> {
    let markdown = "";
    let projectContext: ProjectContextData | undefined;
    let globalContext: GlobalContextData | undefined;
    let taskContext: TaskContextData | undefined;
    let currentWorkspace: CurrentWorkspaceContext | undefined;

    switch (mode) {
      case "Current":
        if (workspaceContext) {
          currentWorkspace = workspaceContext;
          markdown = this.formatCurrentContext(workspaceContext);
        }
        break;

      case "Project":
        if (projectId) {
          projectContext = await this.getProjectContext(projectId);
          markdown = this.formatProjectContext(projectContext);
        }
        break;

      case "Global":
        globalContext = await this.getGlobalContext();
        markdown = this.formatGlobalContext(globalContext);
        break;

      case "Task":
        if (taskId) {
          taskContext = await this.getTaskContext(taskId);
          markdown = this.formatTaskContext(taskContext);
        }
        break;

      case "Full":
        // Gather everything
        if (workspaceContext) {
          currentWorkspace = workspaceContext;
        }
        if (projectId) {
          projectContext = await this.getProjectContext(projectId);
        }
        globalContext = await this.getGlobalContext();
        if (taskId) {
          taskContext = await this.getTaskContext(taskId);
        }

        markdown = [
          currentWorkspace ? this.formatCurrentContext(currentWorkspace) : "",
          projectContext ? this.formatProjectContext(projectContext) : "",
          globalContext ? this.formatGlobalContext(globalContext) : "",
          taskContext ? this.formatTaskContext(taskContext) : "",
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");
        break;
    }

    return {
      mode,
      currentWorkspace,
      projectContext,
      globalContext,
      taskContext,
      injectedMarkdown: markdown,
    };
  }

  private async getProjectContext(projectId: string): Promise<ProjectContextData | null> {
    const projectGraph = await this.graphRepo.getProjectGraph(projectId);
    if (!projectGraph) {
      return null;
    }

    const contextEngine = getContextEngine();
    const context = await contextEngine.generateProjectContext(
      this.graphRepo,
      projectGraph.id,
      projectId
    );

    return {
      projectId,
      projectName: context.metadata.projectId || projectId,
      projectPath: context.metadata.projectId || "",
      summary: context.summary,
      structure: context.structure,
      dependencies: context.dependencies,
      recentFiles: [],
      entityCount: projectGraph.entityCount,
    };
  }

  private async getGlobalContext(): Promise<GlobalContextData> {
    const projects = await this.graphRepo.listProjectGraphs();

    // For each project, try to create a project registration in global graph
    // This is a simplified version - full version would query global graph
    const projectList = projects.map((p) => ({
      id: p.projectId,
      name: p.projectName,
    }));

    return {
      allProjects: projectList,
      activeAgents: [],
      sharedTasks: [],
      projectCount: projects.length,
      agentCount: 0,
      taskCount: 0,
    };
  }

  private async getTaskContext(taskId: string): Promise<TaskContextData | null> {
    // Query for task entity across all graphs
    const allGraphs = await this.graphRepo.listProjectGraphs();

    for (const graph of allGraphs) {
      const result = await this.graphRepo.query(graph.id, {
        types: ["Task"],
      });

      const taskEntity = result.entities.find((e) => e.id === (taskId as any));
      if (taskEntity) {
        const props = taskEntity.properties as Record<string, unknown>;

        return {
          taskId,
          title: taskEntity.name,
          description: taskEntity.description || "",
          relatedFiles: (props.relatedFiles as string[]) || [],
          blockedBy: (props.blockedBy as string[]) || [],
          assignedTo: (props.assignedTo as string) || "unassigned",
          estimatedMinutes: props.estimatedMinutes as number | undefined,
        };
      }
    }

    return null;
  }

  private formatCurrentContext(context: CurrentWorkspaceContext): string {
    const lines: string[] = ["# Current Workspace Context"];

    if (context.openFiles.length > 0) {
      lines.push("## Open Files");
      lines.push(context.openFiles.map((f) => `- ${f}`).join("\n"));
    }

    if (context.selectedText) {
      lines.push("## Selected Text");
      lines.push("```");
      lines.push(context.selectedText.substring(0, 500));
      lines.push("```");
    }

    if (context.gitStatus) {
      lines.push("## Git Status");
      lines.push(`Branch: ${context.gitStatus.branch}`);
      lines.push(`Dirty: ${context.gitStatus.isDirty ? "Yes" : "No"}`);

      if (context.gitStatus.uncommittedChanges.length > 0) {
        lines.push("### Uncommitted Changes");
        lines.push(
          context.gitStatus.uncommittedChanges.map((f) => `- ${f}`).join("\n")
        );
      }
    }

    return lines.join("\n");
  }

  private formatProjectContext(context: ProjectContextData): string {
    const lines: string[] = [
      `# Project: ${context.projectName}`,
      "",
      "## Summary",
      context.summary,
      "",
      "## Structure",
      context.structure,
      "",
      "## Dependencies",
      context.dependencies,
      "",
      "## Statistics",
      `- Entity Count: ${context.entityCount}`,
      `- Recent Files: ${context.recentFiles.length}`,
    ];

    return lines.join("\n");
  }

  private formatGlobalContext(context: GlobalContextData): string {
    const lines: string[] = [
      "# Global Workspace Overview",
      "",
      "## Projects",
      `Total: ${context.projectCount}`,
    ];

    if (context.allProjects.length > 0) {
      lines.push("### Project List");
      lines.push(context.allProjects.map((p) => `- ${p.name} (${p.id})`).join("\n"));
    }

    lines.push("");
    lines.push("## Active Agents");
    lines.push(`Count: ${context.agentCount}`);

    if (context.activeAgents.length > 0) {
      lines.push(context.activeAgents.map((a) => `- ${a}`).join("\n"));
    }

    lines.push("");
    lines.push("## Shared Tasks");
    lines.push(`Count: ${context.taskCount}`);

    if (context.sharedTasks.length > 0) {
      lines.push(context.sharedTasks.map((t) => `- ${t}`).join("\n"));
    }

    return lines.join("\n");
  }

  private formatTaskContext(context: TaskContextData): string {
    const lines: string[] = [
      `# Task: ${context.title}`,
      "",
      "## Description",
      context.description,
      "",
      "## Details",
      `- Task ID: ${context.taskId}`,
      `- Assigned To: ${context.assignedTo}`,
    ];

    if (context.estimatedMinutes) {
      lines.push(`- Estimated Time: ${context.estimatedMinutes} minutes`);
    }

    if (context.relatedFiles.length > 0) {
      lines.push("");
      lines.push("## Related Files");
      lines.push(context.relatedFiles.map((f) => `- ${f}`).join("\n"));
    }

    if (context.blockedBy.length > 0) {
      lines.push("");
      lines.push("## Blocked By");
      lines.push(context.blockedBy.map((b) => `- ${b}`).join("\n"));
    }

    return lines.join("\n");
  }
}

let contextResolverInstance: ContextResolver | null = null;

export function createContextResolver(graphRepo: GraphRepository): ContextResolver {
  contextResolverInstance = new ContextResolver(graphRepo);
  return contextResolverInstance;
}

export function getContextResolver(): ContextResolver {
  if (!contextResolverInstance) {
    throw new Error("ContextResolver not initialized");
  }
  return contextResolverInstance;
}
