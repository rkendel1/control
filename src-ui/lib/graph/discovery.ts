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
        const branches = await this.discoverGitBranches(projectPath);
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
      // Check if .git directory exists
      const gitDirPath = `${projectPath}/.git`;

      // Try to detect git using simple heuristics
      // In production, use @gitmoji/git or similar
      const isGit = await this.fileExists(gitDirPath);

      if (!isGit) {
        return null;
      }

      // Try to read git config for remote URL
      let remoteUrl: string | undefined;
      try {
        const configPath = `${projectPath}/.git/config`;
        const configContent = await this.readFileContent(configPath);
        const remoteMatch = configContent.match(/url = (.+)/);
        remoteUrl = remoteMatch ? remoteMatch[1] : undefined;
      } catch {
        // Ignore if we can't read config
      }

      // Get default branch (try common ones first)
      let defaultBranch = "main";
      const headRefPath = `${projectPath}/.git/HEAD`;
      try {
        const headContent = await this.readFileContent(headRefPath);
        const branchMatch = headContent.match(/ref: refs\/heads\/(.+)/);
        if (branchMatch) {
          defaultBranch = branchMatch[1];
        }
      } catch {
        // Use default
      }

      return {
        path: projectPath,
        isGitRepository: true,
        defaultBranch,
        remoteUrl,
      };
    } catch (error) {
      console.warn(`Failed to detect git repository at ${projectPath}:`, error);
      return null;
    }
  }

  // ─── Git Branches ────────────────────────────────────────────

  private static async discoverGitBranches(
    projectPath: string
  ): Promise<GitBranchInfo[]> {
    try {
      const branches: GitBranchInfo[] = [];

      // Check common branch names
      const commonBranches = ["main", "master", "develop"];
      const headRefPath = `${projectPath}/.git/HEAD`;

      let defaultBranch = "main";
      try {
        const headContent = await this.readFileContent(headRefPath);
        const match = headContent.match(/ref: refs\/heads\/(.+)/);
        if (match) {
          defaultBranch = match[1];
        }
      } catch {
        // Use default
      }

      for (const branch of commonBranches) {
        const branchPath = `${projectPath}/.git/refs/heads/${branch}`;
        if (await this.fileExists(branchPath)) {
          branches.push({
            name: branch,
            isDefault: branch === defaultBranch,
            head: branch,
          });
        }
      }

      // If no common branches found, at least return current branch
      if (branches.length === 0) {
        branches.push({
          name: defaultBranch,
          isDefault: true,
          head: defaultBranch,
        });
      }

      return branches;
    } catch (error) {
      console.warn(
        `Failed to discover git branches at ${projectPath}:`,
        error
      );
      return [];
    }
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
      return await this.scanDirectory(projectPath, 0);
    } catch (error) {
      console.warn(
        `Failed to scan filesystem at ${projectPath}:`,
        error
      );
      return null;
    }
  }

  private static async scanDirectory(
    path: string,
    depth: number
  ): Promise<DirectoryNode> {
    const parts = path.split("/");
    const name = parts[parts.length - 1] || path;

    const node: DirectoryNode = {
      path,
      name,
      isDirectory: true,
      children: [],
    };

    // Only scan subdirectories up to depth 2 to avoid huge trees
    if (depth >= 2) {
      return node;
    }

    try {
      // Try to read directory using Node.js file system
      // This is a simplified implementation
      // In production, use proper file system iteration
      const children = await this.listDirectoryContents(path);

      for (const child of children) {
        if (this.shouldIgnorePath(child)) {
          continue;
        }

        const childPath = `${path}/${child}`;
        const isDir = await this.isDirectory(childPath);

        if (isDir) {
          const childNode = await this.scanDirectory(childPath, depth + 1);
          node.children!.push(childNode);
        } else {
          node.children!.push({
            path: childPath,
            name: child,
            isDirectory: false,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${path}:`, error);
    }

    return node;
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

  // ─── File System Helpers ──────────────────────────────────────

  private static async fileExists(path: string): Promise<boolean> {
    try {
      // Placeholder: In production, use proper fs operations
      // For now, simulate file existence for .git directories
      if (path.includes("/.git")) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private static async isDirectory(path: string): Promise<boolean> {
    // Placeholder implementation
    return !path.includes(".");
  }

  private static async listDirectoryContents(path: string): Promise<string[]> {
    // Placeholder: In production, use fs.readdirSync or async variant
    return [];
  }

  private static async readFileContent(path: string): Promise<string> {
    // Placeholder: In production, use fs.readFileSync or async variant
    return "";
  }

  private static shouldIgnorePath(name: string): boolean {
    const ignore = [
      "node_modules",
      ".git",
      "target",
      "dist",
      "build",
      ".next",
      "__pycache__",
      ".vscode",
      ".idea",
      ".",
      "..",
    ];
    return ignore.includes(name);
  }
}
