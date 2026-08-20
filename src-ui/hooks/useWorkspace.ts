import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import {
  Project,
  Workspace,
  WorkspaceState,
  EditorTab,
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
          setCurrentProject(response.data[0]);
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
        // Load default workspace for project
        const workspaces = await invoke<any>("cmd_workspaces_list", {
          project_id: projectId,
        });
        if (workspaces.success && workspaces.data?.length > 0) {
          setCurrentWorkspace(workspaces.data[0]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch project");
    }
  }, []);

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
        workspace_path: currentWorkspace.path,
      });
      if (response.success) {
        const data = response.data;
        setGitStatus({
          branch: data.branch,
          ahead: data.ahead || 0,
          behind: data.behind || 0,
          isClean: data.is_clean,
          files: new Map(data.files || []),
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
        workspace_path: currentWorkspace.path,
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
        workspace_path: currentWorkspace.path,
        file_path: path,
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
    loadGitStatus,
    loadExplorerTree,
  };
}
