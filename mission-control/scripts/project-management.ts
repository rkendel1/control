#!/usr/bin/env node

import { program } from "commander";
import { projectRegistry, RepositoryDiscovery } from "./daemon/project-registry";
import { WorkspaceManager } from "./daemon/workspace-manager";
import type { Project, WorkspaceMode } from "./daemon/project-types";

const packageJson = require("../package.json");

program
  .name("control projects")
  .description("Manage multi-repository projects")
  .version(packageJson.version);

/**
 * List all registered projects
 */
program
  .command("list")
  .description("List all registered projects")
  .action(() => {
    try {
      const projects = projectRegistry.list();

      if (projects.length === 0) {
        console.log("\nNo projects registered.\n");
        console.log("Use 'control projects add <path>' to add a project.\n");
        return;
      }

      console.log("\nLOCAL PROJECTS\n");
      console.log(
        String(
          "Name".padEnd(30) +
            "ID".padEnd(20) +
            "Path".padEnd(40)
        )
      );
      console.log("─".repeat(90));

      for (const project of projects) {
        const repoPath = project.repository?.path || project.repositories?.[0]?.path || "N/A";
        console.log(
          String(
            project.name.padEnd(30) +
              project.id.padEnd(20) +
              (repoPath as string).padEnd(40)
          )
        );
      }

      console.log("");
    } catch (err) {
      console.error("Error listing projects:", err);
      process.exit(1);
    }
  });

/**
 * Add a project to the registry
 */
program
  .command("add <path>")
  .description("Add a project to the registry")
  .option("-id, --id <id>", "Project ID (auto-generated if not provided)")
  .option("-n, --name <name>", "Project name")
  .action(async (dirPath: string, options) => {
    try {
      // Discover repository
      const repo = RepositoryDiscovery.getRepositoryMetadata(dirPath);

      if (!repo) {
        console.error(`❌ Not a git repository: ${dirPath}\n`);
        process.exit(1);
      }

      const projectId = options.id || repo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const projectName = options.name || repo.name;

      // Check if project already exists
      if (projectRegistry.get(projectId)) {
        console.error(`❌ Project with ID '${projectId}' already exists\n`);
        process.exit(1);
      }

      const project: Project = {
        id: projectId,
        name: projectName,
        repository: {
          path: dirPath,
          type: "git",
          primary: true,
        },
        workspace: {
          mode: "worktree",
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      projectRegistry.add(project);

      console.log(`✓ Added project: ${projectName} (${projectId})`);
      console.log(`  Repository: ${dirPath}`);
      if (repo.gitUrl) {
        console.log(`  Remote: ${repo.gitUrl}`);
      }
      console.log("");
    } catch (err) {
      console.error(
        `Error adding project: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  });

/**
 * Scan a directory for projects
 */
program
  .command("scan <directory>")
  .description("Scan a directory for git repositories")
  .action(async (directory: string) => {
    try {
      console.log(`\n🔍 Scanning ${directory} for repositories...\n`);

      const repos = await RepositoryDiscovery.scanDirectory(directory);

      if (repos.length === 0) {
        console.log("No repositories found.\n");
        return;
      }

      console.log(`Found ${repos.length} repository(ies):\n`);

      for (const repo of repos) {
        console.log(`📦 ${repo.name}`);
        console.log(`  Path: ${repo.path}`);
        if (repo.gitUrl) {
          console.log(`  Remote: ${repo.gitUrl}`);
        }
        if (repo.defaultBranch) {
          console.log(`  Branch: ${repo.defaultBranch}`);
        }
        if (repo.lastCommit) {
          console.log(`  Last: ${repo.lastCommit.message}`);
        }
        console.log("");
      }

      // Offer to add them
      console.log(
        "Use 'control projects add <path>' to add any of these to your registry.\n"
      );
    } catch (err) {
      console.error("Error scanning directory:", err);
      process.exit(1);
    }
  });

/**
 * Show project details
 */
program
  .command("show <projectId>")
  .description("Show project details")
  .action((projectId: string) => {
    try {
      const project = projectRegistry.get(projectId);

      if (!project) {
        console.error(`❌ Project not found: ${projectId}\n`);
        process.exit(1);
      }

      console.log(`\n📦 ${project.name}\n`);
      console.log(`ID: ${project.id}`);

      if (project.repository) {
        console.log(`Repository: ${project.repository.path}`);
        const gitStatus = WorkspaceManager.getGitStatus(project.repository.path);
        if (gitStatus) {
          console.log(`  Branch: ${gitStatus.branch}`);
          console.log(`  Status: ${gitStatus.isDirty ? "dirty" : "clean"}`);
        }
      }

      if (project.repositories) {
        console.log(`Repositories:`);
        for (const repo of project.repositories) {
          console.log(`  - ${repo.path}`);
        }
      }

      if (project.tags && project.tags.length > 0) {
        console.log(`Tags: ${project.tags.join(", ")}`);
      }

      if (project.runtime) {
        console.log(`Default Runtime: ${project.runtime.type}`);
        if (project.runtime.model) {
          console.log(`  Model: ${project.runtime.model}`);
        }
      }

      if (project.workspace) {
        console.log(`Workspace Mode: ${project.workspace.mode}`);
      }

      console.log("");
    } catch (err) {
      console.error("Error showing project:", err);
      process.exit(1);
    }
  });

/**
 * Remove a project
 */
program
  .command("remove <projectId>")
  .description("Remove a project from the registry")
  .option("-f, --force", "Skip confirmation")
  .action((projectId: string, options) => {
    try {
      const project = projectRegistry.get(projectId);

      if (!project) {
        console.error(`❌ Project not found: ${projectId}\n`);
        process.exit(1);
      }

      if (!options.force) {
        console.log(`\n⚠ Remove project: ${project.name}?`);
        console.log("This only removes it from the registry, not the repository.\n");
        console.log('Use --force to skip confirmation.\n');
        // Note: In actual CLI, would need to implement interactive prompt
        // For now, requiring --force
        process.exit(1);
      }

      projectRegistry.remove(projectId);

      console.log(`✓ Removed project: ${project.name}\n`);
    } catch (err) {
      console.error("Error removing project:", err);
      process.exit(1);
    }
  });

/**
 * List worktrees for a project
 */
program
  .command("worktrees <projectId>")
  .description("List active worktrees for a project")
  .action((projectId: string) => {
    try {
      const project = projectRegistry.get(projectId);

      if (!project) {
        console.error(`❌ Project not found: ${projectId}\n`);
        process.exit(1);
      }

      const repoPath = project.repository?.path;
      if (!repoPath) {
        console.error("Project has no repository configured.\n");
        process.exit(1);
      }

      const worktrees = WorkspaceManager.listWorktrees(repoPath);

      if (worktrees.length === 0) {
        console.log(`\nNo active worktrees for ${project.name}\n`);
        return;
      }

      console.log(`\n🌳 Worktrees for ${project.name}\n`);
      console.log(
        String(
          "Branch".padEnd(20) +
            "Path".padEnd(50) +
            "Status".padEnd(15)
        )
      );
      console.log("─".repeat(85));

      for (const wt of worktrees) {
        const status = wt.prunable ? "prunable" : "active";
        console.log(
          String(
            (wt.branch || "detached").padEnd(20) +
              wt.path.padEnd(50) +
              status.padEnd(15)
          )
        );
      }

      console.log("");
    } catch (err) {
      console.error("Error listing worktrees:", err);
      process.exit(1);
    }
  });

/**
 * Set project runtime
 */
program
  .command("set-runtime <projectId> <runtime>")
  .description("Set the default runtime for a project")
  .option("-m, --model <model>", "Model name (for ollama)")
  .action((projectId: string, runtime: string, options) => {
    try {
      const project = projectRegistry.get(projectId);

      if (!project) {
        console.error(`❌ Project not found: ${projectId}\n`);
        process.exit(1);
      }

      const runtimeConfig = {
        type: runtime as "claude-code" | "ollama" | "command",
        model: options.model,
      };

      projectRegistry.update(projectId, { runtime: runtimeConfig });

      console.log(`✓ Set runtime for ${project.name}: ${runtime}`);
      if (options.model) {
        console.log(`  Model: ${options.model}`);
      }
      console.log("");
    } catch (err) {
      console.error("Error setting runtime:", err);
      process.exit(1);
    }
  });

program.parse(process.argv);
