/**
 * FeltDB Adapter for GraphRepository
 *
 * This adapter implements the Control GraphRepository contract
 * using @feltdb/core@0.4.7 as the persistence substrate.
 *
 * Design:
 * - Two collections: "graph:entities" and "graph:relationships"
 * - Each collection stores JSON documents keyed by graph ID
 * - Queries reconstruct the graph in memory from collection data
 */

import { StateFirstDB, Collection } from "@feltdb/core";
import type {
  GraphRepository,
  GraphId,
  EntityId,
  RelationshipId,
  GraphEntity,
  GraphRelationship,
  GraphQuery,
  GraphQueryResult,
  CreateProjectGraphInput,
  ProjectGraph,
  EntityType,
  RelationshipType,
} from "@/types/graph";
import {
  makeGraphId,
  makeEntityId,
  makeRelationshipId,
} from "@/types/graph";

// ─── Internal Storage Types ───────────────────────────────────

interface StoredEntity extends Omit<GraphEntity, "id" | "graphId"> {
  id: EntityId;
  graphId: GraphId;
}

interface StoredRelationship extends Omit<GraphRelationship, "id" | "graphId"> {
  id: RelationshipId;
  graphId: GraphId;
}

interface StoredProjectGraph extends ProjectGraph {
  // Additional metadata for storage
  isActive: boolean;
}

// ─── FeltDB Graph Repository Implementation ────────────────────

export class FeltDBGraphRepository implements GraphRepository {
  private db: StateFirstDB;
  private entitiesCollection: Collection<StoredEntity> | null = null;
  private relationshipsCollection: Collection<StoredRelationship> | null = null;
  private projectsCollection: Collection<StoredProjectGraph> | null = null;

  private initialized = false;

  constructor(feltDB: StateFirstDB) {
    this.db = feltDB;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Get or create collections
    this.entitiesCollection = this.db.collection<StoredEntity>("graph:entities");
    this.relationshipsCollection = this.db.collection<StoredRelationship>(
      "graph:relationships"
    );
    this.projectsCollection = this.db.collection<StoredProjectGraph>(
      "graph:projects"
    );

    // Create indexes for common queries
    this.entitiesCollection.createIndex({
      name: "graphId_idx",
      type: "hash",
      field: "graphId",
    });

    this.entitiesCollection.createIndex({
      name: "type_idx",
      type: "hash",
      field: "type",
    });

    this.relationshipsCollection.createIndex({
      name: "graphId_idx",
      type: "hash",
      field: "graphId",
    });

    this.relationshipsCollection.createIndex({
      name: "fromId_idx",
      type: "hash",
      field: "fromId",
    });

    this.relationshipsCollection.createIndex({
      name: "toId_idx",
      type: "hash",
      field: "toId",
    });

    this.projectsCollection.createIndex({
      name: "projectId_idx",
      type: "hash",
      field: "projectId",
    });

    this.initialized = true;
  }

  async close(): Promise<void> {
    if (this.entitiesCollection) {
      this.entitiesCollection.close();
    }
    if (this.relationshipsCollection) {
      this.relationshipsCollection.close();
    }
    if (this.projectsCollection) {
      this.projectsCollection.close();
    }
    this.initialized = false;
  }

  // ─── Project Graph Lifecycle ──────────────────────────────────

  async createProjectGraph(
    input: CreateProjectGraphInput
  ): Promise<ProjectGraph> {
    await this.ensureInitialized();

    const graphId = makeGraphId(`graph:${input.projectId}`);
    const now = Date.now();

    const projectGraph: StoredProjectGraph = {
      id: graphId,
      projectId: input.projectId,
      projectName: input.projectName,
      projectPath: input.projectPath,
      createdAt: now,
      updatedAt: now,
      entityCount: 0,
      relationshipCount: 0,
      isActive: true,
    };

    const id = await this.projectsCollection!.insert(projectGraph, graphId);

    return {
      id: graphId,
      projectId: input.projectId,
      projectName: input.projectName,
      projectPath: input.projectPath,
      createdAt: now,
      updatedAt: now,
      entityCount: 0,
      relationshipCount: 0,
    };
  }

  async getProjectGraph(projectId: string): Promise<ProjectGraph | null> {
    await this.ensureInitialized();

    const graphs = await this.projectsCollection!.find({
      projectId,
      isActive: true,
    });

    if (graphs.length === 0) return null;

    const stored = graphs[0];
    return {
      id: stored.id,
      projectId: stored.projectId,
      projectName: stored.projectName,
      projectPath: stored.projectPath,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      entityCount: stored.entityCount,
      relationshipCount: stored.relationshipCount,
    };
  }

  async listProjectGraphs(): Promise<ProjectGraph[]> {
    await this.ensureInitialized();

    const graphs = await this.projectsCollection!.find({ isActive: true });

    return graphs.map((stored) => ({
      id: stored.id,
      projectId: stored.projectId,
      projectName: stored.projectName,
      projectPath: stored.projectPath,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      entityCount: stored.entityCount,
      relationshipCount: stored.relationshipCount,
    }));
  }

  async deleteProjectGraph(projectId: string): Promise<void> {
    await this.ensureInitialized();

    const projectGraph = await this.getProjectGraph(projectId);
    if (!projectGraph) return;

    // Mark as inactive rather than delete
    await this.projectsCollection!.update(projectGraph.id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // Delete all entities and relationships in this graph
    const entities = await this.entitiesCollection!.find({
      graphId: projectGraph.id,
    });

    for (const entity of entities) {
      await this.entitiesCollection!.delete(entity.id);
    }

    const relationships = await this.relationshipsCollection!.find({
      graphId: projectGraph.id,
    });

    for (const rel of relationships) {
      await this.relationshipsCollection!.delete(rel.id);
    }
  }

  // ─── Entity Operations ────────────────────────────────────────

  async addEntity(
    graphId: GraphId,
    entity: Omit<GraphEntity, "id" | "graphId" | "createdAt" | "updatedAt">
  ): Promise<GraphEntity> {
    await this.ensureInitialized();

    const id = makeEntityId(`${graphId}:entity:${Date.now()}:${Math.random()}`);
    const now = Date.now();

    const stored: StoredEntity = {
      ...entity,
      id,
      graphId,
      createdAt: now,
      updatedAt: now,
    };

    await this.entitiesCollection!.insert(stored, id);

    // Update entity count
    await this.updateGraphMetadata(graphId, "entityCount", 1);

    return {
      ...stored,
      id,
      graphId,
    };
  }

  async getEntity(
    graphId: GraphId,
    entityId: EntityId
  ): Promise<GraphEntity | null> {
    await this.ensureInitialized();

    const entity = await this.entitiesCollection!.get(entityId);
    if (!entity || entity.graphId !== graphId) return null;

    return {
      ...entity,
      id: entity.id,
      graphId: entity.graphId,
    };
  }

  async updateEntity(
    graphId: GraphId,
    entityId: EntityId,
    patch: Partial<Omit<GraphEntity, "id" | "graphId" | "createdAt">>
  ): Promise<GraphEntity> {
    await this.ensureInitialized();

    const entity = await this.getEntity(graphId, entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found in graph ${graphId}`);
    }

    const updated = {
      ...patch,
      updatedAt: Date.now(),
    };

    await this.entitiesCollection!.update(entityId, updated);

    return {
      ...entity,
      ...updated,
    };
  }

  async deleteEntity(graphId: GraphId, entityId: EntityId): Promise<void> {
    await this.ensureInitialized();

    const entity = await this.getEntity(graphId, entityId);
    if (!entity) return;

    await this.entitiesCollection!.delete(entityId);

    // Delete related relationships
    const fromRels = await this.relationshipsCollection!.find({
      graphId,
      fromId: entityId,
    });

    const toRels = await this.relationshipsCollection!.find({
      graphId,
      toId: entityId,
    });

    for (const rel of [...fromRels, ...toRels]) {
      await this.relationshipsCollection!.delete(rel.id);
    }

    // Update counts
    await this.updateGraphMetadata(graphId, "entityCount", -1);
    await this.updateGraphMetadata(
      graphId,
      "relationshipCount",
      -(fromRels.length + toRels.length)
    );
  }

  // ─── Relationship Operations ──────────────────────────────────

  async addRelationship(
    graphId: GraphId,
    relationship: Omit<
      GraphRelationship,
      "id" | "graphId" | "createdAt" | "updatedAt"
    >
  ): Promise<GraphRelationship> {
    await this.ensureInitialized();

    const id = makeRelationshipId(
      `${graphId}:rel:${Date.now()}:${Math.random()}`
    );
    const now = Date.now();

    const stored: StoredRelationship = {
      ...relationship,
      id,
      graphId,
      createdAt: now,
      updatedAt: now,
    };

    await this.relationshipsCollection!.insert(stored, id);

    // Update relationship count
    await this.updateGraphMetadata(graphId, "relationshipCount", 1);

    return {
      ...stored,
      id,
      graphId,
    };
  }

  async getRelationship(
    graphId: GraphId,
    relationshipId: RelationshipId
  ): Promise<GraphRelationship | null> {
    await this.ensureInitialized();

    const rel = await this.relationshipsCollection!.get(relationshipId);
    if (!rel || rel.graphId !== graphId) return null;

    return {
      ...rel,
      id: rel.id,
      graphId: rel.graphId,
    };
  }

  async updateRelationship(
    graphId: GraphId,
    relationshipId: RelationshipId,
    patch: Partial<
      Omit<GraphRelationship, "id" | "graphId" | "createdAt">
    >
  ): Promise<GraphRelationship> {
    await this.ensureInitialized();

    const rel = await this.getRelationship(graphId, relationshipId);
    if (!rel) {
      throw new Error(
        `Relationship ${relationshipId} not found in graph ${graphId}`
      );
    }

    const updated = {
      ...patch,
      updatedAt: Date.now(),
    };

    await this.relationshipsCollection!.update(relationshipId, updated);

    return {
      ...rel,
      ...updated,
    };
  }

  async deleteRelationship(
    graphId: GraphId,
    relationshipId: RelationshipId
  ): Promise<void> {
    await this.ensureInitialized();

    const rel = await this.getRelationship(graphId, relationshipId);
    if (!rel) return;

    await this.relationshipsCollection!.delete(relationshipId);

    // Update count
    await this.updateGraphMetadata(graphId, "relationshipCount", -1);
  }

  // ─── Query Operations ─────────────────────────────────────────

  async query(
    graphId: GraphId,
    query: GraphQuery
  ): Promise<GraphQueryResult> {
    await this.ensureInitialized();

    let entities: GraphEntity[] = [];

    if (query.entityId) {
      // Single entity lookup
      const entity = await this.getEntity(graphId, query.entityId);
      if (entity) entities = [entity];
    } else if (query.types && query.types.length > 0) {
      // Filter by entity types
      const allEntities = await this.entitiesCollection!.find({ graphId });
      entities = allEntities.filter((e) => query.types!.includes(e.type));
    } else if (query.search) {
      // Text search
      const allEntities = await this.entitiesCollection!.find({ graphId });
      entities = allEntities.filter(
        (e) =>
          e.name.toLowerCase().includes(query.search!.toLowerCase()) ||
          e.description?.toLowerCase().includes(query.search!.toLowerCase())
      );
    } else {
      // All entities in graph
      entities = await this.entitiesCollection!.find({ graphId });
    }

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    const paginatedEntities = entities.slice(offset, offset + limit);

    // Load relationships if requested
    let relationships: GraphRelationship[] = [];
    if (query.includeRelationships) {
      relationships = await this.relationshipsCollection!.find({ graphId });
    }

    return {
      entities: paginatedEntities,
      relationships,
      total: entities.length,
    };
  }

  // ─── Bulk Operations ──────────────────────────────────────────

  async getEntitiesOfType(
    graphId: GraphId,
    type: EntityType
  ): Promise<GraphEntity[]> {
    await this.ensureInitialized();

    const entities = await this.entitiesCollection!.find({ graphId, type });
    return entities;
  }

  async getRelationshipsFrom(
    graphId: GraphId,
    fromId: EntityId
  ): Promise<GraphRelationship[]> {
    await this.ensureInitialized();

    const rels = await this.relationshipsCollection!.find({
      graphId,
      fromId,
    });
    return rels;
  }

  async getRelationshipsTo(
    graphId: GraphId,
    toId: EntityId
  ): Promise<GraphRelationship[]> {
    await this.ensureInitialized();

    const rels = await this.relationshipsCollection!.find({ graphId, toId });
    return rels;
  }

  async getAllEntities(graphId: GraphId): Promise<GraphEntity[]> {
    await this.ensureInitialized();

    return this.entitiesCollection!.find({ graphId });
  }

  async getAllRelationships(graphId: GraphId): Promise<GraphRelationship[]> {
    await this.ensureInitialized();

    return this.relationshipsCollection!.find({ graphId });
  }

  // ─── Persistence ──────────────────────────────────────────────

  async persist(): Promise<void> {
    // FeltDB persists automatically, but this method exists for compatibility
    // with other potential backends that require explicit persistence
    await this.ensureInitialized();
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async updateGraphMetadata(
    graphId: GraphId,
    field: "entityCount" | "relationshipCount",
    delta: number
  ): Promise<void> {
    const project = await this.projectsCollection!.find({
      id: graphId,
    });

    if (project.length > 0) {
      const current = project[0];
      const newValue = Math.max(
        0,
        (current[field] || 0) + delta
      );
      await this.projectsCollection!.update(graphId, {
        [field]: newValue,
        updatedAt: Date.now(),
      });
    }
  }
}
