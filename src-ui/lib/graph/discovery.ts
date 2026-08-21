/**
 * Project Discovery
 *
 * Detects and indexes projects:
 * 1. Git repository detection
 * 2. Filesystem inventory
 * 3. Language detection
 * 4. Git metadata (branches, commits)
 * 5. Populates project graph with initial entities
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  GraphRepository,
  GraphId,
  RepositoryMetadata,
  DirectoryNode,
  GitBranchInfo,
  GitCommitInfo,
} from "@/types/graph";
import {
  makeGraphId,
  makeEntityId,
} from "@/types/graph";

interface DiscoveryContext {
  projectPath: string;
  repository: RepositoryMetadata | null;
  files: Map<string, DirectoryNode>;
}

export class ProjectDiscovery {
  /**
   * Discover and index a project at the given path.
   * Creates entities and relationships in the project graph.
   */
  static async discoverProject(
    graphRepo: GraphRepository,
    projectId: string,
    projectName: string,
    projectPath: string
  ): Promise<void> {
    // Create project graph
    const projectGraph = await graphRepo.createProjectGraph({
      projectId,
      projectName,
      projectPath,
    });

    const graphId = projectGraph.id;

    try {
      // 1. Create Project entity
      const projectEntity = await graphRepo.addEntity(graphId, {
        type: "Project",
        name: projectName,
        description: `Project at ${projectPath}`,
        properties: {
          rootPath: projectPath,
        },
      });

      // 2. Detect and index git repository
      const repoMetadata = await this.detectGitRepository(projectPath);
      if (repoMetadata) {
        const repositoryEntity = await graphRepo.addEntity(graphId, {
          type: "Repository",
          name: projectName,
          description: `Git repository at ${repoMetadata.path}`,
          properties: {
            path: repoMetadata.path,
            isGit: true,
            defaultBranch: repoMetadata.defaultBranch,
            remoteUrl: repoMetadata.remoteUrl,
          },
        });

        // Link Project -> Repository
        await graphRepo.addRelationship(graphId, {
          type: "contains",
          fromId: projectEntity.id,
          toId: repositoryEntity.id,
          label: "root repository",
        });

        // 3. Index Git branches
        const branches = await this.discoverGitBranches(
          projectPath,
          repoMetadata.defaultBranch || "main"
        );
        for (const branch of branches) {
          const branchEntity = await graphRepo.addEntity(graphId, {
            type: "Branch",
            name: branch.name,
            properties: {
              isDefault: branch.isDefault,
              head: branch.head,
            },
          });

          // Link Repository -> Branch
          await graphRepo.addRelationship(graphId, {
            type: "contains",
            fromId: repositoryEntity.id,
            toId: branchEntity.id,
          });
        }

        // 4. Index recent git commits
        const commits = await this.discoverGitCommits(projectPath, 20);
        for (const commit of commits) {
          const commitEntity = await graphRepo.addEntity(graphId, {
            type: "Commit",
            name: commit.shortHash,
            description: commit.message,
            properties: {
              hash: commit.hash,
              shortHash: commit.shortHash,
              author: commit.author,
              timestamp: commit.timestamp,
            },
          });

          // Link Repository -> Commit
          await graphRepo.addRelationship(graphId, {
            type: "contains",
            fromId: repositoryEntity.id,
            toId: commitEntity.id,
          });
        }
      }

      // 5. Index filesystem
      const directoryTree = await this.discoverFilesystem(projectPath);
      if (directoryTree) {
        const rootDirEntity = await graphRepo.addEntity(graphId, {
          type: "Directory",
          name: directoryTree.name,
          properties: {
            path: directoryTree.path,
          },
        });

        // Link Project -> Directory
        await graphRepo.addRelationship(graphId, {
          type: "contains",
          fromId: projectEntity.id,
          toId: rootDirEntity.id,
        });

        // Recursively index directory tree (limited depth)
        await this.indexDirectoryTree(
          graphRepo,
          graphId,
          rootDirEntity.id,
          directoryTree,
          0,
          3
        );
      }

      console.log(`✓ Discovered project: ${projectName} at ${projectPath}`);
    } catch (error) {
      console.error(`Failed to discover project ${projectId}:`, error);
      throw error;
    }
  }

  // ─── Git Detection ────────────────────────────────────────────

  private static async detectGitRepository(
    projectPath: string
  ): Promise<RepositoryMetadata | null> {
    try {
      const response: { success: boolean; data?: any; error?: string } =
        await invoke("cmd_detect_repository", { projectPath });

      if (!response.success || !response.data) {
        return null;
      }

      return {
        path: response.data.path,
        isGitRepository: response.data.is_git,
        defaultBranch: response.data.default_branch,
        remoteUrl: response.data.remote_url,
      };
    } catch (error) {
      console.warn(`Failed to detect git repository at ${projectPath}:`, error);
      return null;
    }
  }

  // ─── Git Branches ────────────────────────────────────────────

  private static async discoverGitBranches(
    projectPath: string,
    defaultBranch: string = "main"
  ): Promise<GitBranchInfo[]> {
    // For now, just return the default branch from the repository
    // In production, could use a git library to enumerate all branches
    return [
      {
        name: defaultBranch,
        isDefault: true,
        head: defaultBranch,
      },
    ];
  }

  // ─── Git Commits ──────────────────────────────────────────────

  private static async discoverGitCommits(
    projectPath: string,
    limit: number = 20
  ): Promise<GitCommitInfo[]> {
    // Placeholder: In production, use git2 or similar
    // For now, return empty list
    return [];
  }

  // ─── Filesystem Scanning ──────────────────────────────────────

  private static async discoverFilesystem(
    projectPath: string
  ): Promise<DirectoryNode | null> {
    try {
      const response: { success: boolean; data?: any; error?: string } =
        await invoke("cmd_scan_directory", {
          path: projectPath,
          maxDepth: 3,
        });

      if (!response.success || !response.data) {
        return null;
      }

      return this.convertFileNodeToDirectoryNode(response.data);
    } catch (error) {
      console.warn(
        `Failed to scan filesystem at ${projectPath}:`,
        error
      );
      return null;
    }
  }

  private static convertFileNodeToDirectoryNode(fileNode: any): DirectoryNode {
    return {
      path: fileNode.path,
      name: fileNode.name,
      isDirectory: fileNode.is_dir,
      children: fileNode.children
        ? fileNode.children.map((child: any) =>
            this.convertFileNodeToDirectoryNode(child)
          )
        : [],
    };
  }

  // ─── Directory Tree Indexing ──────────────────────────────────

  private static async indexDirectoryTree(
    graphRepo: GraphRepository,
    graphId: GraphId,
    parentEntityId: string,
    node: DirectoryNode,
    currentDepth: number,
    maxDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    if (!node.children || node.children.length === 0) {
      return;
    }

    for (const child of node.children) {
      const childEntity = await graphRepo.addEntity(graphId, {
        type: child.isDirectory ? "Directory" : "File",
        name: child.name,
        description: `${child.isDirectory ? "Directory" : "File"} at ${child.path}`,
        properties: {
          path: child.path,
          isDirectory: child.isDirectory,
        },
      });

      // Link parent -> child
      await graphRepo.addRelationship(graphId, {
        type: "contains",
        fromId: makeEntityId(parentEntityId),
        toId: childEntity.id,
      });

      // Recursively index subdirectories
      if (child.isDirectory && currentDepth < maxDepth) {
        await this.indexDirectoryTree(
          graphRepo,
          graphId,
          childEntity.id,
          child,
          currentDepth + 1,
          maxDepth
        );
      }
    }
  }

}
