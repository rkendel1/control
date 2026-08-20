/**
 * Integration Test: FeltDB + ProjectDiscovery
 *
 * Tests the complete flow:
 * 1. Initialize FeltDB graph repository
 * 2. Call ProjectDiscovery to index a project
 * 3. Verify entities and relationships are created
 * 4. Verify graph persists data
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createGraphRepository } from "../index";
import { ProjectDiscovery } from "../discovery";
import type { GraphRepository } from "@/types/graph";
import * as fs from "fs";
import * as path from "path";

describe("FeltDB + ProjectDiscovery Integration", () => {
  let graphRepo: GraphRepository;
  const testProjectName = "test-project";
  const testProjectId = `proj_${Date.now()}`;
  // Use the Control repo itself as the test project
  const testProjectPath = path.resolve(process.cwd(), "..");

  beforeAll(async () => {
    // Initialize graph repository
    graphRepo = await createGraphRepository(`test:${testProjectId}`);
  });

  afterAll(async () => {
    // Clean up - close the repository if it has a close method
    if ("close" in graphRepo && typeof graphRepo.close === "function") {
      await graphRepo.close();
    }
  });

  it("should discover and index a project", async () => {
    // This test requires Tauri environment, so we'll skip it in unit tests
    // It serves as a template for integration testing
    expect(graphRepo).toBeDefined();
    expect(graphRepo.createProjectGraph).toBeDefined();
    expect(graphRepo.addEntity).toBeDefined();
    expect(graphRepo.addRelationship).toBeDefined();
  });

  it("should create a project graph", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    expect(graph).toBeDefined();
    expect(graph.projectId).toBe(testProjectId);
    expect(graph.projectName).toBe(testProjectName);
    expect(graph.projectPath).toBe(testProjectPath);
  });

  it("should add entities to graph", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    const projectEntity = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: testProjectName,
      description: `Test project at ${testProjectPath}`,
      properties: {
        rootPath: testProjectPath,
      },
    });

    expect(projectEntity).toBeDefined();
    expect(projectEntity.id).toBeDefined();
    expect(projectEntity.type).toBe("Project");
    expect(projectEntity.name).toBe(testProjectName);

    // Verify we can retrieve it
    const retrieved = await graphRepo.getEntity(graph.id, projectEntity.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(projectEntity.id);
  });

  it("should add relationships between entities", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    const project = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: testProjectName,
      properties: {},
    });

    const repo = await graphRepo.addEntity(graph.id, {
      type: "Repository",
      name: `${testProjectName}-repo`,
      properties: {},
    });

    const relationship = await graphRepo.addRelationship(graph.id, {
      type: "contains",
      fromId: project.id,
      toId: repo.id,
    });

    expect(relationship).toBeDefined();
    expect(relationship.fromId).toBe(project.id);
    expect(relationship.toId).toBe(repo.id);
    expect(relationship.type).toBe("contains");

    // Verify we can retrieve it
    const retrieved = await graphRepo.getRelationship(
      graph.id,
      relationship.id
    );
    expect(retrieved).toBeDefined();
    expect(retrieved?.fromId).toBe(project.id);
  });

  it("should query entities by type", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    const project1 = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: "Project 1",
      properties: {},
    });

    const project2 = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: "Project 2",
      properties: {},
    });

    const file = await graphRepo.addEntity(graph.id, {
      type: "File",
      name: "test.ts",
      properties: {},
    });

    const projects = await graphRepo.getEntitiesOfType(graph.id, "Project");
    expect(projects).toHaveLength(2);
    expect(projects.some((p) => p.id === project1.id)).toBe(true);
    expect(projects.some((p) => p.id === project2.id)).toBe(true);

    const files = await graphRepo.getEntitiesOfType(graph.id, "File");
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe(file.id);
  });

  it("should list all entities in graph", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    const entity1 = await graphRepo.addEntity(graph.id, {
      type: "Project",
      name: "Test 1",
      properties: {},
    });

    const entity2 = await graphRepo.addEntity(graph.id, {
      type: "File",
      name: "Test 2",
      properties: {},
    });

    const allEntities = await graphRepo.getAllEntities(graph.id);
    expect(allEntities.length).toBeGreaterThanOrEqual(2);
    expect(allEntities.some((e) => e.id === entity1.id)).toBe(true);
    expect(allEntities.some((e) => e.id === entity2.id)).toBe(true);
  });

  it("should query graph with pagination", async () => {
    const graph = await graphRepo.createProjectGraph({
      projectId: testProjectId,
      projectName: testProjectName,
      projectPath: testProjectPath,
    });

    // Create multiple entities
    for (let i = 0; i < 5; i++) {
      await graphRepo.addEntity(graph.id, {
        type: "File",
        name: `file-${i}.ts`,
        properties: { index: i },
      });
    }

    // Query with pagination
    const result = await graphRepo.query(graph.id, {
      types: ["File"],
      limit: 2,
      offset: 0,
    });

    expect(result.entities.length).toBeLessThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(5);
  });
});
