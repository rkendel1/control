"use client";

/**
 * Project Manager
 *
 * Main UI for Control:
 * - List discovered projects
 * - Add new projects with discovery
 * - View project graphs
 * - Access project context
 * - Coordinate across projects
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Folder,
  GitBranch,
  Loader,
  Plus,
  File,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  path: string;
  isGit: boolean;
  branch?: string;
  fileCount: number;
  dirCount: number;
  entityCount: number;
}

interface DiscoveryState {
  status: "idle" | "discovering" | "complete" | "error";
  progress: string;
  error?: string;
}

export function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryState>({
    status: "idle",
    progress: "",
  });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response: any = await invoke("cmd_projects_list");
      if (response.success) {
        // For now, show empty list - will be populated as projects are added
        setProjects([]);
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  const handleAddProject = async () => {
    try {
      setDiscovery({ status: "discovering", progress: "Opening folder..." });

      // Open file picker
      const selected = await open({
        directory: true,
        title: "Select Project Folder",
      });

      if (!selected) return;

      const projectPath = String(selected);
      const projectName = projectPath.split("/").pop() || "Untitled Project";
      const projectId = `proj_${Date.now()}`;

      setDiscovery({
        status: "discovering",
        progress: "Discovering project structure...",
      });

      // Initialize project (filesystem scan + git detection + graph creation)
      const response: any = await invoke("cmd_initialize_project", {
        projectId,
        projectName,
        projectPath,
      });

      if (response.success) {
        const newProject: Project = {
          id: response.data.project_id,
          name: response.data.project_name,
          path: response.data.project_path,
          isGit: response.data.is_git,
          branch: response.data.default_branch,
          fileCount: response.data.file_count,
          dirCount: response.data.dir_count,
          entityCount: response.data.entity_count,
        };

        setProjects((prev) => [...prev, newProject]);
        setDiscovery({
          status: "complete",
          progress: `✓ Discovered: ${response.data.file_count} files, ${response.data.dir_count} directories`,
        });

        setTimeout(() => {
          setDiscovery({ status: "idle", progress: "" });
        }, 2000);
      } else {
        setDiscovery({
          status: "error",
          progress: response.error || "Discovery failed",
        });
      }
    } catch (error) {
      setDiscovery({
        status: "error",
        progress: String(error),
      });
    }
  };

  return (
    <div className="h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Control Workbench
          </h1>
          <p className="text-lg text-slate-600">
            Universal agent runtime for project coordination
          </p>
        </div>

        {/* Add Project Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Discover and manage projects in your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Discovery Status */}
            {discovery.status !== "idle" && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  {discovery.status === "discovering" && (
                    <Loader className="w-4 h-4 animate-spin text-blue-600" />
                  )}
                  {discovery.status === "complete" && (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  )}
                  {discovery.status === "error" && (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span
                    className={
                      discovery.status === "error"
                        ? "text-red-600"
                        : discovery.status === "complete"
                          ? "text-green-600"
                          : "text-blue-600"
                    }
                  >
                    {discovery.progress}
                  </span>
                </div>
              </div>
            )}

            {/* Projects List */}
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-6">No projects discovered yet</p>
                <Button
                  onClick={handleAddProject}
                  disabled={discovery.status === "discovering"}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Project
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="p-4 border rounded-lg hover:bg-slate-100 cursor-pointer transition"
                    onClick={() => setSelectedProject(project)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">
                          {project.name}
                        </h3>
                        <p className="text-sm text-slate-500">{project.path}</p>
                        <div className="flex gap-3 mt-2">
                          {project.isGit && (
                            <Badge variant="outline" className="gap-1">
                              <GitBranch className="w-3 h-3" />
                              {project.branch || "main"}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="gap-1">
                            <File className="w-3 h-3" />
                            {project.fileCount} files
                          </Badge>
                          <Badge variant="secondary" className="gap-1">
                            <Folder className="w-3 h-3" />
                            {project.dirCount} dirs
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  onClick={handleAddProject}
                  disabled={discovery.status === "discovering"}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Project
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Project Details */}
        {selectedProject && (
          <Card>
            <CardHeader>
              <CardTitle>{selectedProject.name}</CardTitle>
              <CardDescription>Project graph and context</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Path</h4>
                  <p className="text-sm text-slate-600">{selectedProject.path}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Files</h4>
                    <p className="text-2xl font-bold text-slate-900">
                      {selectedProject.fileCount}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">
                      Directories
                    </h4>
                    <p className="text-2xl font-bold text-slate-900">
                      {selectedProject.dirCount}
                    </p>
                  </div>
                </div>

                {selectedProject.isGit && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">
                      Repository
                    </h4>
                    <p className="text-sm text-slate-600">
                      Default branch: <code>{selectedProject.branch}</code>
                    </p>
                  </div>
                )}

                <div className="text-sm text-slate-500">
                  <p>Graph entities: {selectedProject.entityCount}</p>
                  <p>Ready for agent context injection</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Footer */}
        <div className="mt-8 text-center text-sm text-slate-500">
          <p>
            💾 Using persistent FeltDB storage at{" "}
            <code>~/.control/graphs</code>
          </p>
        </div>
      </div>
    </div>
  );
}
