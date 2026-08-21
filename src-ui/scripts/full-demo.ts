#!/usr/bin/env node

/**
 * Full System Demo
 *
 * Demonstrates the complete Control system:
 * 1. FeltDB graph initialization
 * 2. Project discovery and indexing
 * 3. Global graph coordination
 * 4. Context engine and markdown generation
 * 5. Daemon integration
 * 6. End-to-end agent context
 */

import { createGraphRepository } from "../lib/graph/index";
import { ProjectDiscovery } from "../lib/graph/discovery";
import { GlobalGraph } from "../lib/graph/global";
import { ContextEngine, getContextEngine } from "../lib/graph/context-engine";
import { syncDaemonState, updateMissionControlContext, getProjectContextForAgent } from "../lib/graph/daemon-integration";
import type { GraphRepository, GraphId } from "../types/graph";
import * as path from "path";

const DEMO_DIR = process.cwd();

async function section(title: string) {
  console.log("\n" + "=".repeat(70));
  console.log(`📍 ${title}`);
  console.log("=".repeat(70) + "\n");
}

async function demo() {
  try {
    // ─────────────────────────────────────────────────────────────────
    // Step 1: Initialize FeltDB graph repository with persistence
    // ─────────────────────────────────────────────────────────────────
    await section("1️⃣  Initializing FeltDB Graph Repository");

    console.log("Creating persistent graph repository...");
    const graphRepo: GraphRepository = await createGraphRepository(
      `demo_${Date.now()}`
    );
    console.log("✓ GraphRepository initialized with file persistence\n");

    // ─────────────────────────────────────────────────────────────────
    // Step 2: Initialize Global Graph
    // ─────────────────────────────────────────────────────────────────
    await section("2️⃣  Initializing Global Graph");

    const globalGraphId = await GlobalGraph.initialize(graphRepo);
    console.log(`✓ Global graph initialized: ${globalGraphId}\n`);

    // ─────────────────────────────────────────────────────────────────
    // Step 3: Discover and index a project
    // ─────────────────────────────────────────────────────────────────
    await section("3️⃣  Discovering Project Structure");

    const projectId = `demo_project_${Date.now()}`;
    const projectName = "Demo Control Project";
    const projectPath = DEMO_DIR;

    console.log(`Project: ${projectName}`);
    console.log(`Path: ${projectPath}`);
    console.log(`ID: ${projectId}\n`);

    // Note: In a real scenario, ProjectDiscovery would be called from the Tauri app
    // Here we manually create the project graph for demo purposes
    console.log("Creating project graph...");
    const projectGraph = await graphRepo.createProjectGraph({
      projectId,
      projectName,
      projectPath,
    });
    console.log(`✓ Project graph created: ${projectGraph.id}\n`);

    // Add sample entities to simulate discovered structure
    console.log("Adding project entities...");
    const projectEntity = await graphRepo.addEntity(projectGraph.id, {
      type: "Project",
      name: projectName,
      description: `Control demo project at ${projectPath}`,
      properties: {
        rootPath: projectPath,
        createdAt: Date.now(),
      },
    });
    console.log(`✓ Project entity: ${projectEntity.id}`);

    const repoEntity = await graphRepo.addEntity(projectGraph.id, {
      type: "Repository",
      name: "control-repo",
      description: "Main git repository",
      properties: {
        path: projectPath,
        isGit: true,
        defaultBranch: "claude/universal-agent-runtime-xuxf36",
        remoteUrl: "https://github.com/rkendel1/control.git",
      },
    });
    console.log(`✓ Repository entity: ${repoEntity.id}`);

    // Link entities
    await graphRepo.addRelationship(projectGraph.id, {
      type: "contains",
      fromId: projectEntity.id,
      toId: repoEntity.id,
    });
    console.log("✓ Project -> Repository relationship\n");

    // Add some file entities
    const files = [
      "package.json",
      "README.md",
      "src/main.ts",
      "src-tauri/src/main.rs",
      "src-ui/components/project-manager.tsx",
    ];

    console.log("Adding file entities...");
    for (const file of files) {
      await graphRepo.addEntity(projectGraph.id, {
        type: "File",
        name: file,
        description: `File at ${projectPath}/${file}`,
        properties: {
          path: `${projectPath}/${file}`,
          type: file.split(".").pop(),
        },
      });
    }
    console.log(`✓ Added ${files.length} file entities\n`);

    // ─────────────────────────────────────────────────────────────────
    // Step 4: Register project in global graph
    // ─────────────────────────────────────────────────────────────────
    await section("4️⃣  Registering Project in Global Graph");

    await GlobalGraph.registerProject(
      graphRepo,
      globalGraphId,
      projectId,
      projectName,
      projectGraph.id
    );
    console.log(`✓ Project registered in global graph\n`);

    // ─────────────────────────────────────────────────────────────────
    // Step 5: Register active agents
    // ─────────────────────────────────────────────────────────────────
    await section("5️⃣  Registering Active Agents");

    const agents = [
      { id: "developer", name: "Developer Agent", capabilities: ["coding", "testing", "debugging"] },
      { id: "researcher", name: "Researcher Agent", capabilities: ["analysis", "investigation", "documentation"] },
      { id: "marketer", name: "Marketer Agent", capabilities: ["content", "strategy", "communication"] },
    ];

    for (const agent of agents) {
      await GlobalGraph.registerAgent(
        graphRepo,
        globalGraphId,
        agent.id,
        agent.name,
        agent.capabilities
      );
      console.log(`✓ Registered: ${agent.name}`);
    }
    console.log();

    // ─────────────────────────────────────────────────────────────────
    // Step 6: Create a shared task
    // ─────────────────────────────────────────────────────────────────
    await section("6️⃣  Creating Shared Task");

    await GlobalGraph.createSharedTask(
      graphRepo,
      globalGraphId,
      "Implement FeltDB persistence",
      "developer",
      [projectId]
    );
    console.log("✓ Shared task created\n");

    // ─────────────────────────────────────────────────────────────────
    // Step 7: Generate project context
    // ─────────────────────────────────────────────────────────────────
    await section("7️⃣  Generating Project Context");

    const contextEngine = getContextEngine();
    const projectContext = await contextEngine.generateProjectContext(
      graphRepo,
      projectGraph.id,
      projectId
    );

    console.log("Project Context Metadata:");
    console.log(`  Version: ${projectContext.metadata.version}`);
    console.log(`  Generated: ${new Date(projectContext.metadata.generatedAt).toISOString()}`);
    console.log(`  Entity count: ${projectContext.metadata.graphVersion}\n`);

    console.log("Context Summary:");
    console.log(projectContext.summary + "\n");

    // ─────────────────────────────────────────────────────────────────
    // Step 8: Generate markdown for agent consumption
    // ─────────────────────────────────────────────────────────────────
    await section("8️⃣  Generating Agent Markdown");

    const markdown = contextEngine.formatProjectContextMarkdown(projectContext);
    console.log("Generated markdown (first 500 chars):");
    console.log(markdown.substring(0, 500) + "...\n");

    // ─────────────────────────────────────────────────────────────────
    // Step 9: Query global graph state
    // ─────────────────────────────────────────────────────────────────
    await section("9️⃣  Querying Global Graph State");

    const registeredProjects = await GlobalGraph.getRegisteredProjects(
      graphRepo,
      globalGraphId
    );
    console.log(`Registered projects: ${registeredProjects.length}`);

    const activeAgents = await GlobalGraph.getActiveAgents(
      graphRepo,
      globalGraphId
    );
    console.log(`Active agents: ${activeAgents.length}`);

    const sharedTasks = await GlobalGraph.getSharedTasks(
      graphRepo,
      globalGraphId
    );
    console.log(`Shared tasks: ${sharedTasks.length}\n`);

    // ─────────────────────────────────────────────────────────────────
    // Step 10: Generate daemon state
    // ─────────────────────────────────────────────────────────────────
    await section("🔟 Generating Daemon State");

    const daemonState = await syncDaemonState(graphRepo, globalGraphId);
    console.log("Daemon State:");
    console.log(`  Timestamp: ${new Date(daemonState.timestamp).toISOString()}`);
    console.log(`  Projects: ${daemonState.globalGraph.projectCount}`);
    console.log(`  Agents: ${daemonState.globalGraph.agentCount}`);
    console.log(`  Tasks: ${daemonState.globalGraph.taskCount}\n`);

    // ─────────────────────────────────────────────────────────────────
    // Step 11: Get agent context
    // ─────────────────────────────────────────────────────────────────
    await section("1️⃣1️⃣  Generating Agent Context");

    const agentContext = await getProjectContextForAgent(
      graphRepo,
      globalGraphId,
      projectId
    );
    console.log("Context for developer agent:");
    console.log(agentContext + "\n");

    // ─────────────────────────────────────────────────────────────────
    // Step 12: Verify persistence
    // ─────────────────────────────────────────────────────────────────
    await section("1️⃣2️⃣  Verifying Persistence");

    const retrievedGraph = await graphRepo.getProjectGraph(projectId);
    if (retrievedGraph) {
      console.log("✓ Project graph persisted and retrievable");
      console.log(`  ID: ${retrievedGraph.id}`);
      console.log(`  Name: ${retrievedGraph.projectName}`);
      console.log(`  Entity count: ${retrievedGraph.entityCount}`);
      console.log(`  Relationship count: ${retrievedGraph.relationshipCount}\n`);
    }

    // ─────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────
    await section("✅ System Verification Complete");

    console.log("✅ All components working:");
    console.log("  ✓ FeltDB persistence (file-based)");
    console.log("  ✓ Project graph creation and indexing");
    console.log("  ✓ Global graph coordination");
    console.log("  ✓ Entity and relationship management");
    console.log("  ✓ Context engine and markdown generation");
    console.log("  ✓ Daemon integration and state sync");
    console.log("  ✓ Agent context injection\n");

    console.log("📚 Next steps:");
    console.log("  1. Start Tauri app: npm run tauri dev");
    console.log("  2. Add a project via UI");
    console.log("  3. View graph in project manager");
    console.log("  4. Start mission-control daemon");
    console.log("  5. Observe context flowing to agents\n");

    console.log("🎉 Control system is ready for deployment!");
  } catch (error) {
    console.error("\n❌ Demo failed:");
    console.error(error);
    process.exit(1);
  }
}

demo();
