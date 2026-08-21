/**
 * Global Graph
 *
 * Coordinates across all projects:
 * - Cross-project dependencies
 * - Shared resources and contexts
 * - Agent communication and coordination
 * - Task and decision flow across projects
 *
 * Intentionally shallow (unlike deep project graphs):
 * - Projects (references to project graphs)
 * - Agents (which agents are active)
 * - Shared tasks and decisions
 * - Cross-project relationships
 */

import type { GraphRepository, GraphId, GraphEntity } from "@/types/graph";
import { makeGraphId, makeEntityId } from "@/types/graph";

export interface GlobalGraphContext {
  projectGraphs: Map<string, GraphId>;
  activeAgents: Set<string>;
  sharedTasks: Map<string, string>;
  lastUpdated: number;
}

export class GlobalGraph {
  private static globalGraphId = makeGraphId("global");

  /**
   * Initialize or get the global graph
   */
  static async initialize(graphRepo: GraphRepository): Promise<GraphId> {
    // Try to get existing global graph
    const graphs = await graphRepo.listProjectGraphs();
    const globalGraph = graphs.find((g) => g.projectId === "global");

    if (globalGraph) {
      return globalGraph.id;
    }

    // Create global graph if it doesn't exist
    const graph = await graphRepo.createProjectGraph({
      projectId: "global",
      projectName: "Global Control Graph",
      projectPath: "",
    });

    // Create root entity
    await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: "Global Graph",
      description: "Cross-project coordination layer",
      properties: {
        isGlobal: true,
      },
    });

    return graph.id;
  }

  /**
   * Register a project in the global graph
   */
  static async registerProject(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    projectId: string,
    projectName: string,
    projectGraphId: GraphId
  ): Promise<void> {
    // Create project reference entity
    const projectEntity = await graphRepo.addEntity(globalGraphId, {
      type: "Project",
      name: projectName,
      description: `Reference to project graph ${projectGraphId}`,
      properties: {
        projectId,
        projectGraphId: projectGraphId.toString(),
        registeredAt: Date.now(),
      },
    });

    // Add to root
    const root = (await graphRepo.getEntitiesOfType(globalGraphId, "Project"))[0];
    if (root) {
      await graphRepo.addRelationship(globalGraphId, {
        type: "contains",
        fromId: root.id,
        toId: projectEntity.id,
      });
    }
  }

  /**
   * Register an active agent in global graph
   */
  static async registerAgent(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    agentId: string,
    agentName: string,
    capabilities: string[]
  ): Promise<GraphEntity> {
    return await graphRepo.addEntity(globalGraphId, {
      type: "Agent",
      name: agentName,
      description: `Active agent: ${agentId}`,
      properties: {
        agentId,
        capabilities,
        registeredAt: Date.now(),
        status: "active",
      },
    });
  }

  /**
   * Create a shared task across projects
   */
  static async createSharedTask(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    taskTitle: string,
    assignedAgent: string,
    affectedProjects: string[]
  ): Promise<GraphEntity> {
    const task = await graphRepo.addEntity(globalGraphId, {
      type: "Task",
      name: taskTitle,
      description: `Shared task affecting ${affectedProjects.length} project(s)`,
      properties: {
        assignedAgent,
        affectedProjects,
        createdAt: Date.now(),
        status: "pending",
      },
    });

    // Link to affected projects
    const projects = await graphRepo.getEntitiesOfType(
      globalGraphId,
      "Project"
    );
    for (const project of projects) {
      const projectIdProp = project.properties?.projectId;
      if (affectedProjects.includes(String(projectIdProp))) {
        await graphRepo.addRelationship(globalGraphId, {
          type: "impacts",
          fromId: task.id,
          toId: project.id,
        });
      }
    }

    return task;
  }

  /**
   * Query active agents
   */
  static async getActiveAgents(
    graphRepo: GraphRepository,
    globalGraphId: GraphId
  ): Promise<GraphEntity[]> {
    const agents = await graphRepo.getEntitiesOfType(globalGraphId, "Agent");
    return agents.filter((a) => a.properties?.status === "active");
  }

  /**
   * Query all registered projects
   */
  static async getRegisteredProjects(
    graphRepo: GraphRepository,
    globalGraphId: GraphId
  ): Promise<GraphEntity[]> {
    const projects = await graphRepo.getEntitiesOfType(
      globalGraphId,
      "Project"
    );
    return projects.filter((p) => p.properties?.projectId !== undefined);
  }

  /**
   * Query shared tasks
   */
  static async getSharedTasks(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    status?: string
  ): Promise<GraphEntity[]> {
    const tasks = await graphRepo.getEntitiesOfType(globalGraphId, "Task");
    return status
      ? tasks.filter((t) => t.properties?.status === status)
      : tasks;
  }

  /**
   * Link decision to affected projects
   */
  static async createSharedDecision(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    question: string,
    affectedProjects: string[],
    requestedBy: string
  ): Promise<GraphEntity> {
    const decision = await graphRepo.addEntity(globalGraphId, {
      type: "Decision",
      name: question,
      description: `Decision affecting ${affectedProjects.length} project(s)`,
      properties: {
        affectedProjects,
        requestedBy,
        createdAt: Date.now(),
        status: "pending",
      },
    });

    return decision;
  }

  /**
   * Get context for a specific project
   * Returns entities and relationships relevant to that project
   */
  static async getProjectContext(
    graphRepo: GraphRepository,
    globalGraphId: GraphId,
    projectId: string
  ): Promise<{ project: GraphEntity | null; tasks: GraphEntity[]; decisions: GraphEntity[]; agents: GraphEntity[] }> {
    // Find project entity
    const projects = await graphRepo.getEntitiesOfType(
      globalGraphId,
      "Project"
    );
    const project = projects.find((p) => p.properties?.projectId === projectId);

    if (!project) {
      return { project: null, tasks: [], decisions: [], agents: [] };
    }

    // Get tasks affecting this project
    const tasks = (await graphRepo.getEntitiesOfType(
      globalGraphId,
      "Task"
    )).filter((t) => {
      const affected = t.properties?.affectedProjects as string[] | undefined;
      return affected?.includes(projectId);
    });

    // Get decisions affecting this project
    const decisions = (await graphRepo.getEntitiesOfType(
      globalGraphId,
      "Decision"
    )).filter((d) => {
      const affected = d.properties?.affectedProjects as string[] | undefined;
      return affected?.includes(projectId);
    });

    // Get active agents
    const agents = await this.getActiveAgents(graphRepo, globalGraphId);

    return { project, tasks, decisions, agents };
  }
}
