/**
 * Daemon Integration
 *
 * Integrates Control graphs with mission-control daemon:
 * - Exports graph context in formats mission-control understands
 * - Provides API for daemon to query project graphs
 * - Injects graph-derived context into agent prompts
 * - Updates mission-control data files with graph insights
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { GraphRepository, GraphId } from "@/types/graph";
import { ContextEngine, getContextEngine } from "./context-engine";
import { GlobalGraph } from "./global";

export interface ContextForAgent {
  projectId: string;
  projectName: string;
  projectPath: string;
  summary: string;
  structure: string;
  tasks: string;
  dependencies: string;
  context: string;
}

export interface DaemonGraphState {
  timestamp: number;
  version: number;
  projects: Array<{
    id: string;
    name: string;
    path: string;
    entityCount: number;
    fileCount: number;
    dirCount: number;
  }>;
  globalGraph: {
    projectCount: number;
    agentCount: number;
    taskCount: number;
  };
}

/**
 * Export graph context for daemon consumption
 */
export async function exportGraphContextForDaemon(
  graphRepo: GraphRepository,
  globalGraphId: GraphId,
  projectId: string,
  projectGraphId: GraphId
): Promise<ContextForAgent> {
  const contextEngine = getContextEngine();

  const projectContext = await contextEngine.generateProjectContext(
    graphRepo,
    projectGraphId,
    projectId
  );

  const markdown = contextEngine.formatProjectContextMarkdown(projectContext);

  return {
    projectId,
    projectName: projectContext.metadata.projectId,
    projectPath: projectContext.metadata.projectId,
    summary: projectContext.summary,
    structure: projectContext.structure,
    tasks: projectContext.tasks,
    dependencies: projectContext.dependencies,
    context: markdown,
  };
}

/**
 * Update mission-control data files with graph insights
 * This allows the daemon to be aware of project structure and context
 */
export async function updateMissionControlContext(
  graphRepo: GraphRepository,
  globalGraphId: GraphId
): Promise<void> {
  try {
    const contextEngine = getContextEngine();
    const globalContext = await contextEngine.generateGlobalContext(
      graphRepo,
      globalGraphId
    );

    // Get mission-control data directory
    const missionControlDir = path.join(
      process.cwd(),
      "mission-control",
      "data"
    );

    // Create ai-context.json that mission-control daemon reads
    const aiContextPath = path.join(missionControlDir, "ai-context.md");

    const markdown = contextEngine.formatGlobalContextMarkdown(globalContext);

    await fs.writeFile(aiContextPath, markdown, "utf-8");

    console.log("✓ Updated mission-control/data/ai-context.md");

    // Also export JSON for programmatic consumption
    const projects = await GlobalGraph.getRegisteredProjects(
      graphRepo,
      globalGraphId
    );
    const agents = await GlobalGraph.getActiveAgents(graphRepo, globalGraphId);
    const tasks = await GlobalGraph.getSharedTasks(graphRepo, globalGraphId);

    const daemonState: DaemonGraphState = {
      timestamp: Date.now(),
      version: 1,
      projects: projects.map((p) => ({
        id: String(p.properties?.projectId || ""),
        name: p.name,
        path: String(p.properties?.path || ""),
        entityCount: 0,
        fileCount: 0,
        dirCount: 0,
      })),
      globalGraph: {
        projectCount: projects.length,
        agentCount: agents.length,
        taskCount: tasks.length,
      },
    };

    const contextJsonPath = path.join(
      missionControlDir,
      "control-graph-state.json"
    );
    await fs.writeFile(contextJsonPath, JSON.stringify(daemonState, null, 2), "utf-8");

    console.log("✓ Updated mission-control/data/control-graph-state.json");
  } catch (error) {
    console.error("Failed to update mission-control context:", error);
    // Don't throw - this is advisory
  }
}

/**
 * Inject graph context into agent system prompt
 * Returns enriched prompt with project-specific context
 */
export async function enrichAgentPrompt(
  basePrompt: string,
  graphRepo: GraphRepository,
  projectGraphId: GraphId,
  projectId: string
): Promise<string> {
  try {
    const contextEngine = getContextEngine();
    const projectContext = await contextEngine.generateProjectContext(
      graphRepo,
      projectGraphId,
      projectId
    );

    const contextMarkdown =
      contextEngine.formatProjectContextMarkdown(projectContext);

    return `${basePrompt}

## Project Context

${contextMarkdown}

This context is from the Control graph and provides real-time project information.
Use it to understand the project structure and make informed decisions.
`;
  } catch (error) {
    console.error("Failed to enrich agent prompt:", error);
    return basePrompt;
  }
}

/**
 * Register an active agent in global graph
 */
export async function registerActiveAgent(
  graphRepo: GraphRepository,
  globalGraphId: GraphId,
  agentId: string,
  agentName: string,
  capabilities: string[]
): Promise<void> {
  await GlobalGraph.registerAgent(
    graphRepo,
    globalGraphId,
    agentId,
    agentName,
    capabilities
  );

  console.log(`✓ Registered agent: ${agentName}`);
}

/**
 * Create shared task in global graph
 */
export async function createSharedTask(
  graphRepo: GraphRepository,
  globalGraphId: GraphId,
  taskTitle: string,
  assignedAgent: string,
  affectedProjects: string[]
): Promise<void> {
  await GlobalGraph.createSharedTask(
    graphRepo,
    globalGraphId,
    taskTitle,
    assignedAgent,
    affectedProjects
  );

  console.log(`✓ Created shared task: ${taskTitle}`);
}

/**
 * Get project context for specific agent
 */
export async function getProjectContextForAgent(
  graphRepo: GraphRepository,
  globalGraphId: GraphId,
  projectId: string
): Promise<string> {
  const context = await GlobalGraph.getProjectContext(
    graphRepo,
    globalGraphId,
    projectId
  );

  if (!context.project) {
    return `Project "${projectId}" not found in control graph.`;
  }

  const lines: string[] = [
    `# Project: ${context.project.name}`,
    "",
    "## Tasks",
    context.tasks.length > 0
      ? context.tasks.map((t) => `- ${t.name}`).join("\n")
      : "No tasks.",
    "",
    "## Decisions Pending",
    context.decisions.length > 0
      ? context.decisions.map((d) => `- ${d.name}`).join("\n")
      : "No pending decisions.",
    "",
    "## Active Agents",
    context.agents.length > 0
      ? context.agents.map((a) => `- ${a.name}`).join("\n")
      : "No active agents.",
  ];

  return lines.join("\n");
}

/**
 * Sync daemon state with graph
 * Called periodically by daemon to keep in sync
 */
export async function syncDaemonState(
  graphRepo: GraphRepository,
  globalGraphId: GraphId
): Promise<DaemonGraphState> {
  const projects = await GlobalGraph.getRegisteredProjects(
    graphRepo,
    globalGraphId
  );
  const agents = await GlobalGraph.getActiveAgents(graphRepo, globalGraphId);
  const tasks = await GlobalGraph.getSharedTasks(graphRepo, globalGraphId);

  return {
    timestamp: Date.now(),
    version: 1,
    projects: projects.map((p) => ({
      id: String(p.properties?.projectId || ""),
      name: p.name,
      path: String(p.properties?.path || ""),
      entityCount: 0,
      fileCount: 0,
      dirCount: 0,
    })),
    globalGraph: {
      projectCount: projects.length,
      agentCount: agents.length,
      taskCount: tasks.length,
    },
  };
}
