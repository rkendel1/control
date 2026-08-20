/**
 * Control Graph Domain Contract
 *
 * This is the abstraction that Control owns.
 * It is independent of FeltDB implementation details.
 * GraphRepository implementations (FeltDB, SQLite, etc.) adapt to this contract.
 */

// ─── Identifiers ──────────────────────────────────────────────────

export type GraphId = string & { readonly __brand: "GraphId" };
export type EntityId = string & { readonly __brand: "EntityId" };
export type RelationshipId = string & { readonly __brand: "RelationshipId" };

export const makeGraphId = (id: string): GraphId => id as GraphId;
export const makeEntityId = (id: string): EntityId => id as EntityId;
export const makeRelationshipId = (id: string): RelationshipId => id as RelationshipId;

// ─── Entity Types ─────────────────────────────────────────────────

export type EntityType =
  | "Project"
  | "Repository"
  | "Directory"
  | "File"
  | "Symbol"
  | "Dependency"
  | "Task"
  | "Mission"
  | "Requirement"
  | "Decision"
  | "Observation"
  | "Evidence"
  | "Test"
  | "Branch"
  | "Commit"
  | "Workspace"
  | "Agent"
  | "AgentRun";

// ─── Core Entity ──────────────────────────────────────────────────

export interface GraphEntity {
  id: EntityId;
  type: EntityType;
  graphId: GraphId;

  // Core attributes
  name: string;
  description?: string;

  // Status/metadata
  status?: string;
  tags?: string[];

  // Timestamps
  createdAt: number;
  updatedAt: number;

  // Custom properties per entity type
  properties?: Record<string, unknown>;
}

// ─── Relationship Types ───────────────────────────────────────────

export type RelationshipType =
  | "contains"
  | "defines"
  | "imports"
  | "depends_on"
  | "implements"
  | "modifies"
  | "impacts"
  | "belongs_to"
  | "assigned_to"
  | "executed_by"
  | "runs_in"
  | "produced"
  | "verified_by"
  | "satisfies"
  | "derived_from"
  | "caused_by"
  | "related_to"
  | "supersedes"
  | "blocks"
  | "uses"
  | "integrates_with"
  | "consumes"
  | "coordinates";

// ─── Core Relationship ────────────────────────────────────────────

export interface GraphRelationship {
  id: RelationshipId;
  graphId: GraphId;

  type: RelationshipType;
  fromId: EntityId;
  toId: EntityId;

  // Optional metadata
  weight?: number; // for importance/strength
  label?: string;
  properties?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;
}

// ─── Graph Lifecycle ──────────────────────────────────────────────

export interface CreateProjectGraphInput {
  projectId: string;
  projectName: string;
  projectPath: string;
  repositoryPath?: string;
}

export interface ProjectGraph {
  id: GraphId;
  projectId: string;
  projectName: string;
  projectPath: string;

  createdAt: number;
  updatedAt: number;

  entityCount: number;
  relationshipCount: number;
}

// ─── Query Model ──────────────────────────────────────────────────

export interface GraphQuery {
  // Single entity lookup
  entityId?: EntityId;

  // Filter by type(s)
  types?: EntityType[];

  // Filter by relationship type
  relationshipTypes?: RelationshipType[];

  // Traverse relationships
  fromEntity?: EntityId;
  toEntity?: EntityId;

  // Text search
  search?: string;

  // Pagination
  limit?: number;
  offset?: number;

  // Include relationships
  includeRelationships?: boolean;
}

export interface GraphQueryResult {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  total: number;
}

// ─── Graph Repository ─────────────────────────────────────────────

/**
 * GraphRepository is the abstraction layer.
 * Implementations (FeltDB, etc.) must satisfy this contract.
 * Control owns this interface; FeltDB is just one implementation.
 */
export interface GraphRepository {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Project Graph operations
  createProjectGraph(input: CreateProjectGraphInput): Promise<ProjectGraph>;
  getProjectGraph(projectId: string): Promise<ProjectGraph | null>;
  listProjectGraphs(): Promise<ProjectGraph[]>;
  deleteProjectGraph(projectId: string): Promise<void>;

  // Entity operations
  addEntity(
    graphId: GraphId,
    entity: Omit<GraphEntity, "id" | "graphId" | "createdAt" | "updatedAt">
  ): Promise<GraphEntity>;

  getEntity(graphId: GraphId, entityId: EntityId): Promise<GraphEntity | null>;

  updateEntity(
    graphId: GraphId,
    entityId: EntityId,
    patch: Partial<Omit<GraphEntity, "id" | "graphId" | "createdAt">>
  ): Promise<GraphEntity>;

  deleteEntity(graphId: GraphId, entityId: EntityId): Promise<void>;

  // Relationship operations
  addRelationship(
    graphId: GraphId,
    relationship: Omit<GraphRelationship, "id" | "graphId" | "createdAt" | "updatedAt">
  ): Promise<GraphRelationship>;

  getRelationship(
    graphId: GraphId,
    relationshipId: RelationshipId
  ): Promise<GraphRelationship | null>;

  updateRelationship(
    graphId: GraphId,
    relationshipId: RelationshipId,
    patch: Partial<Omit<GraphRelationship, "id" | "graphId" | "createdAt">>
  ): Promise<GraphRelationship>;

  deleteRelationship(graphId: GraphId, relationshipId: RelationshipId): Promise<void>;

  // Querying
  query(graphId: GraphId, query: GraphQuery): Promise<GraphQueryResult>;

  // Bulk operations
  getEntitiesOfType(
    graphId: GraphId,
    type: EntityType
  ): Promise<GraphEntity[]>;

  getRelationshipsFrom(
    graphId: GraphId,
    fromId: EntityId
  ): Promise<GraphRelationship[]>;

  getRelationshipsTo(
    graphId: GraphId,
    toId: EntityId
  ): Promise<GraphRelationship[]>;

  // Graph-wide operations
  getAllEntities(graphId: GraphId): Promise<GraphEntity[]>;
  getAllRelationships(graphId: GraphId): Promise<GraphRelationship[]>;

  // Persistence
  persist(): Promise<void>;
}

// ─── Repository Discovery ─────────────────────────────────────────

export interface RepositoryMetadata {
  path: string;
  isGitRepository: boolean;
  defaultBranch?: string;
  remoteUrl?: string;
}

export interface DirectoryNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: DirectoryNode[];
}

export interface SymbolDefinition {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "const" | "other";
  file: string;
  line: number;
  column: number;
  documentation?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface GitBranchInfo {
  name: string;
  isDefault: boolean;
  head: string;
}
