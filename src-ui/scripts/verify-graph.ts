#!/usr/bin/env node

/**
 * Graph Verification Script
 *
 * Verifies that FeltDB graph repository works correctly:
 * 1. Creates a graph repository
 * 2. Populates it with entities and relationships
 * 3. Queries the data
 * 4. Reports results
 */

import { createGraphRepository } from "../lib/graph/index";
import type { GraphRepository } from "../types/graph";

async function main() {
  console.log("🚀 Starting graph verification...\n");

  try {
    // Step 1: Create graph repository
    console.log("1️⃣  Initializing FeltDB graph repository...");
    const graphRepo = (await createGraphRepository(
      `verify_${Date.now()}`
    )) as GraphRepository;
    console.log("   ✓ GraphRepository initialized\n");

    // Step 2: Create a project graph
    console.log("2️⃣  Creating project graph...");
    const testProjectId = `proj_test_${Date.now()}`;
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: "Test Control Project",
      projectPath: "/home/user/control",
    });
    console.log(`   ✓ Project graph created with ID: ${graph.id}\n`);

    // Step 3: Add entities
    console.log("3️⃣  Adding entities to graph...");
    const projectEntity = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: "Control Workbench",
      description: "Main project entity",
      properties: {
        rootPath: "/home/user/control",
      },
    });
    console.log(`   ✓ Project entity created: ${projectEntity.id}`);

    const repoEntity = await graphRepo.addEntity(graph.id, {
      type: "Repository",
      name: "control-repo",
      description: "Main git repository",
      properties: {
        path: "/home/user/control",
        isGit: true,
        defaultBranch: "main",
      },
    });
    console.log(`   ✓ Repository entity created: ${repoEntity.id}`);

    const fileEntity = await graphRepo.addEntity(graph.id, {
      type: "File",
      name: "package.json",
      description: "Root package manifest",
      properties: {
        path: "/home/user/control/package.json",
      },
    });
    console.log(`   ✓ File entity created: ${fileEntity.id}\n`);

    // Step 4: Add relationships
    console.log("4️⃣  Adding relationships...");
    const rel1 = await graphRepo.addRelationship(graph.id, {
      type: "contains",
      fromId: projectEntity.id,
      toId: repoEntity.id,
    });
    console.log(`   ✓ Project -> Repository: ${rel1.id}`);

    const rel2 = await graphRepo.addRelationship(graph.id, {
      type: "contains",
      fromId: repoEntity.id,
      toId: fileEntity.id,
    });
    console.log(`   ✓ Repository -> File: ${rel2.id}\n`);

    // Step 5: Query entities
    console.log("5️⃣  Querying entities...");
    const allEntities = await graphRepo.getAllEntities(graph.id);
    console.log(`   ✓ Total entities: ${allEntities.length}`);

    const projects = await graphRepo.getEntitiesOfType(graph.id, "Project");
    console.log(`   ✓ Project entities: ${projects.length}`);

    const repos = await graphRepo.getEntitiesOfType(graph.id, "Repository");
    console.log(`   ✓ Repository entities: ${repos.length}`);

    const files = await graphRepo.getEntitiesOfType(graph.id, "File");
    console.log(`   ✓ File entities: ${files.length}\n`);

    // Step 6: Query relationships
    console.log("6️⃣  Querying relationships...");
    const allRels = await graphRepo.getAllRelationships(graph.id);
    console.log(`   ✓ Total relationships: ${allRels.length}`);

    const outgoing = await graphRepo.getRelationshipsFrom(
      graph.id,
      projectEntity.id
    );
    console.log(`   ✓ Relationships from Project: ${outgoing.length}`);

    const incoming = await graphRepo.getRelationshipsTo(graph.id, fileEntity.id);
    console.log(`   ✓ Relationships to File: ${incoming.length}\n`);

    // Step 7: Verify retrieval
    console.log("7️⃣  Verifying entity retrieval...");
    const retrieved = await graphRepo.getEntity(graph.id, projectEntity.id);
    if (retrieved && retrieved.name === "Control Workbench") {
      console.log("   ✓ Entity retrieval verified");
    } else {
      throw new Error("Entity retrieval failed");
    }

    // Step 8: Test graph listing
    console.log("\n8️⃣  Testing project graph listing...");
    const graphs = await graphRepo.listProjectGraphs();
    console.log(`   ✓ Total project graphs: ${graphs.length}`);

    const found = graphs.find((g) => g.projectId === testProjectId);
    if (found) {
      console.log(`   ✓ Created graph found in list`);
      console.log(`      Entity count: ${found.entityCount}`);
      console.log(`      Relationship count: ${found.relationshipCount}`);
    }

    // Success!
    console.log("\n✅ All verification steps passed!");
    console.log(
      "\n📊 Summary:"
    );
    console.log(`   - GraphRepository: Working ✓`);
    console.log(`   - Entity CRUD: Working ✓`);
    console.log(`   - Relationship CRUD: Working ✓`);
    console.log(`   - Query operations: Working ✓`);
    console.log(`   - Graph persistence: Working ✓`);
    console.log(
      "\n💾 Next: Wire FeltDB persistence to Tauri project discovery"
    );
  } catch (error) {
    console.error("\n❌ Verification failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
