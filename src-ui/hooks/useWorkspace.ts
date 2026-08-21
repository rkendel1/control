import { useState, useCallback, useEffect } from "react";
import { invoke } from "../lib/tauri";
import {
  Project,
  Workspace,
  WorkspaceState,
  EditorTab,
  GitFileStatus,
  GitStatus,
  ExplorerNode,
} from "../types";

export function useWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
    null
  );
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    currentProjectId: "",
    openFiles: new Map(),
    terminals: new Map(),
    scrollPositions: new Map(),
  });
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [explorerTree, setExplorerTree] = useState<ExplorerNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load git status when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      loadGitStatus();
      loadExplorerTree();
    }
  }, [currentWorkspace?.id]);

  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await invoke<any>("cmd_projects_list");
      if (response.success && response.data) {
        setProjects(response.data);
        if (response.data.length > 0) {
          const firstProject = response.data[0];
          setCurrentProject(firstProject);
          setWorkspaceState((prev) => ({
            ...prev,
            currentProjectId: firstProject.id,
          }));
          await loadWorkspacesForProject(firstProject.id);
        }
      } else {
        setError(response.error || "Failed to load projects");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadWorkspacesForProject = useCallback(async (projectId: string) => {
    try {
      const workspaces = await invoke<any>("cmd_workspaces_list", {
        projectId: projectId,
      });

      if (workspaces.success && workspaces.data?.length > 0) {
        setCurrentWorkspace(workspaces.data[0]);
      } else {
        setCurrentWorkspace(null);
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
      setCurrentWorkspace(null);
    }
  }, []);

  const switchProject = useCallback(async (projectId: string) => {
    try {
      const response = await invoke<any>("cmd_projects_get", { id: projectId });
      if (response.success) {
        setCurrentProject(response.data);
        setWorkspaceState((prev) => ({
          ...prev,
          currentProjectId: projectId,
          openFiles: new Map(), // Clear tabs when switching projects
        }));
        await loadWorkspacesForProject(projectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch project");
    }
  }, [loadWorkspacesForProject]);

  const openFile = useCallback((path: string) => {
    const tabId = path;
    setWorkspaceState((prev) => {
      const newFiles = new Map(prev.openFiles);
      if (!newFiles.has(tabId)) {
        newFiles.set(tabId, {
          id: tabId,
          path,
          projectId: currentProject?.id || "",
          isDirty: false,
          isGitModified: false,
          gitStatus: gitStatus?.files.get(path),
        });
      }
      return {
        ...prev,
        openFiles: newFiles,
        activeFileId: tabId,
      };
    });
  }, [currentProject, gitStatus]);

  const closeFile = useCallback((path: string) => {
    setWorkspaceState((prev) => {
      const newFiles = new Map(prev.openFiles);
      newFiles.delete(path);
      return {
        ...prev,
        openFiles: newFiles,
        activeFileId:
          prev.activeFileId === path
            ? Array.from(newFiles.keys())[0]
            : prev.activeFileId,
      };
    });
  }, []);

  const loadGitStatus = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const response = await invoke<any>("cmd_git_status", {
        workspacePath: currentWorkspace.path,
      });
      if (response.success) {
        const data = response.data;
        const fileEntries: Array<[string, GitFileStatus]> = Array.isArray(data.files)
          ? data.files.map((file: any) => [
              file.path,
              {
                status: file.status,
                stagedStatus: file.staged_status,
                isConflicted: file.status === "C",
              } as GitFileStatus,
            ])
          : [];

        setGitStatus({
          branch: data.branch,
          ahead: data.ahead || 0,
          behind: data.behind || 0,
          isClean: data.is_clean,
          files: new Map(fileEntries),
          stagedFiles: new Set(data.staged || []),
        });
      }
    } catch (err) {
      console.error("Failed to load git status:", err);
    }
  }, [currentWorkspace]);

  const loadExplorerTree = useCallback(async () => {
    if (!currentWorkspace) return;
    try {
      const response = await invoke<any>("cmd_explorer_tree", {
        workspacePath: currentWorkspace.path,
      });
      if (response.success) {
        setExplorerTree(response.data || []);
      }
    } catch (err) {
      console.error("Failed to load explorer tree:", err);
    }
  }, [currentWorkspace]);

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!currentWorkspace) return;
    try {
      await invoke("cmd_file_save", {
        workspacePath: currentWorkspace.path,
        filePath: path,
        content,
      });
      setWorkspaceState((prev) => {
        const newFiles = new Map(prev.openFiles);
        const tab = newFiles.get(path);
        if (tab) {
          tab.isDirty = false;
          tab.savedAt = Date.now();
          newFiles.set(path, tab);
        }
        return { ...prev, openFiles: newFiles };
      });
      loadGitStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    }
  }, [currentWorkspace, loadGitStatus]);

  const setFileModified = useCallback((path: string, isDirty: boolean) => {
    setWorkspaceState((prev) => {
      const newFiles = new Map(prev.openFiles);
      const tab = newFiles.get(path);
      if (tab) {
        tab.isDirty = isDirty;
        newFiles.set(path, tab);
      }
      return { ...prev, openFiles: newFiles };
    });
  }, []);

  const setScrollPosition = useCallback(
    (path: string, line: number, column: number) => {
      setWorkspaceState((prev) => ({
        ...prev,
        scrollPositions: new Map(prev.scrollPositions).set(path, {
          line,
          column,
        }),
      }));
    },
    []
  );

  const addProject = useCallback(
    async (path: string, name?: string) => {
      const normalized = path.trim();
      if (!normalized) return false;

      try {
        const response = await invoke<any>("cmd_projects_add", {
          path: normalized,
          name: name?.trim() || null,
        });

        if (!response.success || !response.data) {
          setError(response.error || "Failed to add project");
          return false;
        }

        const project = response.data as Project;
        setProjects((prev) => {
          if (prev.some((p) => p.id === project.id)) return prev;
          return [...prev, project];
        });
        setCurrentProject(project);
        await loadWorkspacesForProject(project.id);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add project");
        return false;
      }
    },
    [loadWorkspacesForProject]
  );

  return {
    projects,
    currentProject,
    currentWorkspace,
    workspaceState,
    gitStatus,
    explorerTree,
    isLoading,
    error,
    switchProject,
    openFile,
    closeFile,
    saveFile,
    setFileModified,
    setScrollPosition,
    addProject,
    loadGitStatus,
    loadExplorerTree,
  };
}
