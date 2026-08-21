import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import { getControlDatabase, type ControlProject } from "../lib/control-db";
import { refreshOperationalMemory } from "../lib/operational-memory";
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
  const [showGeneratedFiles,setShowGeneratedFiles]=useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectScan,setProjectScan]=useState<{projectId:string;projectName:string;status:"scanning"|"complete"|"failed";message:string}|null>(null);

  const scanProject=useCallback(async(database:ReturnType<typeof getControlDatabase>,project:ControlProject)=>{
    setProjectScan({projectId:project.id,projectName:project.name,status:"scanning",message:`Scanning ${project.name}: files, Git, commands, dependencies, and project guidance…`});
    try{
      await refreshOperationalMemory(database,project);
      setProjectScan({projectId:project.id,projectName:project.name,status:"complete",message:`${project.name} inventory is ready`});
      window.setTimeout(()=>setProjectScan(current=>current?.projectId===project.id&&current.status==="complete"?null:current),4000);
    }catch(reason){
      const message=reason instanceof Error?reason.message:String(reason);
      setProjectScan({projectId:project.id,projectName:project.name,status:"failed",message:`${project.name} was added, but its initial scan failed: ${message}`});
    }
  },[]);

  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const database=getControlDatabase();
      const [launchResponse,forgetResponse]=await Promise.all([invoke<string[]>("cmd_launch_projects"),invoke<string[]>("cmd_launch_forget_projects")]);
      for(const path of forgetResponse.data||[]){const project=(await database.projects.all()).find(item=>item.path===path);if(project)await database.removeProjectGraph(project.id);}
      let launchedProjectId:string|undefined;
      for(const path of launchResponse.data||[]){
        const inspected=await invoke<Project>("cmd_project_inspect",{path,name:null});
        if(!inspected.success||!inspected.data){setError(inspected.error||`Failed to open ${path}`);continue;}
        const existing=(await database.projects.all()).find(item=>item.path===inspected.data!.path),timestamp=Date.now();
        const record:ControlProject=existing||{...inspected.data,createdAt:timestamp,updatedAt:timestamp};
        if(!existing)await database.projects.insert(record,record.id);
        void scanProject(database,record);
        launchedProjectId=record.id;
      }
      const records = await database.projects.all();
      const loadedProjects = records.map(toProject);
      setProjects(loadedProjects);
      if (loadedProjects.length > 0) {
          const settings=await database.settings.get("workspace");
          const restoredProject=loadedProjects.find(project=>project.id===launchedProjectId)||loadedProjects.find(project=>project.id===settings?.activeProjectId)||loadedProjects[0];
          const restoredFiles=settings?.openFilesByProject[restoredProject.id]||[];
          setCurrentProject(restoredProject);
          setWorkspaceState((prev) => ({
            ...prev,
            currentProjectId: restoredProject.id,
            openFiles: tabsFor(restoredProject,restoredFiles),
            activeFileId:settings?.activeFileByProject[restoredProject.id]||restoredFiles[0],
          }));
          setCurrentWorkspace(toWorkspace(restoredProject));
          if(settings&&settings.activeProjectId!==restoredProject.id)await database.settings.update("workspace",{activeProjectId:restoredProject.id,updatedAt:Date.now()});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [scanProject]);

  const switchProject = useCallback(async (projectId: string) => {
    try {
      const selected=projects.find(item=>item.id===projectId);
      if(!selected)throw new Error("The selected project is not in Control's project list");
      const database=getControlDatabase();
      setCurrentProject(selected);
      setCurrentWorkspace(toWorkspace(selected));
      setGitStatus(null);
      setExplorerTree([]);
      setWorkspaceState(prev=>({...prev,currentProjectId:projectId,openFiles:new Map(),activeFileId:undefined}));
      const record=await database.projects.get(projectId)||(await database.projects.all()).find(item=>item.id===projectId||item.path===selected.path);
      if(!record)throw new Error(`${selected.name} is listed in Control but missing from FeltDB`);
      const settings=await database.settings.get("workspace"),files=settings?.openFilesByProject[projectId]||[];
      setWorkspaceState(prev=>prev.currentProjectId!==projectId?prev:{...prev,openFiles:tabsFor(selected,files),activeFileId:settings?.activeFileByProject[projectId]||files[0]});
      if(settings)await database.settings.update("workspace",{activeProjectId:projectId,updatedAt:Date.now()});
      void scanProject(database,record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch project");
    }
  }, [projects,scanProject]);

  const openFile = useCallback((path: string,line?:number,column=1) => {
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
      if(currentProject){const database=getControlDatabase();void database.settings.get("workspace").then(settings=>settings&&database.settings.update("workspace",{activeProjectId:currentProject.id,openFilesByProject:{...settings.openFilesByProject,[currentProject.id]:Array.from(newFiles.keys())},activeFileByProject:{...settings.activeFileByProject,[currentProject.id]:tabId},updatedAt:Date.now()}));}
      return {
        ...prev,
        openFiles: newFiles,
        activeFileId: tabId,
        scrollPositions:line?new Map(prev.scrollPositions).set(path,{line,column,revision:Date.now()}):prev.scrollPositions,
      };
    });
  }, [currentProject, gitStatus]);

  const closeFile = useCallback((path: string) => {
    setWorkspaceState((prev) => {
      const newFiles = new Map(prev.openFiles);
      newFiles.delete(path);
      const activeFileId=prev.activeFileId === path ? Array.from(newFiles.keys())[0] : prev.activeFileId;
      if(currentProject){const database=getControlDatabase();void database.settings.get("workspace").then(settings=>settings&&database.settings.update("workspace",{openFilesByProject:{...settings.openFilesByProject,[currentProject.id]:Array.from(newFiles.keys())},activeFileByProject:{...settings.activeFileByProject,[currentProject.id]:activeFileId},updatedAt:Date.now()}));}
      return {
        ...prev,
        openFiles: newFiles,
        activeFileId,
      };
    });
  }, [currentProject]);

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
                hasWorktreeChanges:file.has_worktree_changes,
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
        showGenerated:showGeneratedFiles,
      });
      if (response.success) {
        setExplorerTree(response.data || []);
      }
    } catch (err) {
      console.error("Failed to load explorer tree:", err);
    }
  }, [currentWorkspace,showGeneratedFiles]);

  const saveFile = useCallback(async (path: string, content: string):Promise<boolean> => {
    if (!currentWorkspace) return false;
    try {
      const response = await invoke("cmd_file_save", {
        workspacePath: currentWorkspace.path,
        filePath: path,
        content,
      });
      if (!response.success) {
        setError(response.error || "Failed to save file");
        return false;
      }
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
      return false;
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
          revision:Date.now(),
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
        const response = await invoke<any>("cmd_project_inspect", {
          path: normalized,
          name: name?.trim() || null,
        });

        if (!response.success || !response.data) {
          setError(response.error || "Failed to add project");
          return false;
        }

        const inspectedProject = response.data as Project;
        const database = getControlDatabase();
        const existing = (await database.projects.all()).find((item) => item.path === inspectedProject.path);
        const timestamp = Date.now();
        const record: ControlProject = existing || { ...inspectedProject, createdAt: timestamp, updatedAt: timestamp };
        if (!existing) await database.projects.insert(record, record.id);
        const persisted=await database.projects.get(record.id);
        if(!persisted)throw new Error("FeltDB did not persist the selected project");
        const project = toProject(persisted),allProjects=(await database.projects.all()).map(toProject);
        if(!allProjects.some(item=>item.id===project.id))throw new Error("The selected project is missing from the Control project index");
        setProjects(allProjects);
        const settings=await database.settings.get("workspace"),files=settings?.openFilesByProject[project.id]||[];
        setCurrentProject(project);
        setWorkspaceState((prev) => ({
          ...prev,
          currentProjectId: project.id,
          openFiles: tabsFor(project,files),
          activeFileId:settings?.activeFileByProject[project.id]||files[0],
        }));
        setCurrentWorkspace(toWorkspace(project));
        if(settings)await database.settings.update("workspace",{activeProjectId:project.id,updatedAt:Date.now()});
        setError(null);
        void scanProject(database,persisted);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add project");
        return false;
      }
    },
    [scanProject]
  );

  const removeProject = useCallback(async (projectId: string) => {
    const database=getControlDatabase();
    try{await database.removeProjectGraph(projectId);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));return false;}
    const remaining=(await database.projects.all()).map(toProject);
    const next=remaining[0]||null;const settings=await database.settings.get("workspace");if(settings){const openFilesByProject={...settings.openFilesByProject},activeFileByProject={...settings.activeFileByProject};delete openFilesByProject[projectId];delete activeFileByProject[projectId];await database.settings.update("workspace",{activeProjectId:next?.id,openFilesByProject,activeFileByProject,updatedAt:Date.now()});}setCurrentProject(next);setCurrentWorkspace(next?toWorkspace(next):null);setWorkspaceState(prev=>({...prev,currentProjectId:next?.id||"",openFiles:new Map(),activeFileId:undefined}));setError(null);return true;
  },[]);

  useEffect(() => {
    void loadProjects();
    const projectsCollection = getControlDatabase().projects;
    return projectsCollection.subscribe(() => {
      void projectsCollection.all().then(records=>setProjects(records.map(toProject)));
    });
  }, [loadProjects]);

  useEffect(() => {
    if (!currentWorkspace) return;
    void loadGitStatus();
    void loadExplorerTree();
    let disposed=false,watchRegistered=false,stop:undefined|(()=>void),refreshTimer:undefined|number;
    const workspacePath=currentWorkspace.path;
    void listen<{workspacePath:string;path:string;eventType:string;timestamp:number}>("workspace-file-change",({payload})=>{
      if(payload.workspacePath!==workspacePath)return;
      window.dispatchEvent(new CustomEvent("control-workspace-file-change",{detail:payload}));
      if(refreshTimer)window.clearTimeout(refreshTimer);
      refreshTimer=window.setTimeout(()=>{void loadGitStatus();void loadExplorerTree();},120);
    }).then(unlisten=>{if(disposed)unlisten();else stop=unlisten;});
    void invoke<string>("cmd_watch_directory",{workspacePath}).then(response=>{
      if(response.success)watchRegistered=true;
      if(disposed&&watchRegistered){watchRegistered=false;void invoke("cmd_unwatch_directory",{workspacePath});}
      else if(!response.success)setError(response.error||"Workspace file watching is unavailable");
    });
    return ()=>{disposed=true;stop?.();if(refreshTimer)window.clearTimeout(refreshTimer);if(watchRegistered){watchRegistered=false;void invoke("cmd_unwatch_directory",{workspacePath});}};
  }, [currentWorkspace, loadGitStatus, loadExplorerTree]);

  useEffect(() => {
    if (currentWorkspace) void loadExplorerTree();
  }, [currentWorkspace, showGeneratedFiles, loadExplorerTree]);

  return {
    projects,
    currentProject,
    currentWorkspace,
    workspaceState,
    gitStatus,
    explorerTree,
    showGeneratedFiles,
    setShowGeneratedFiles,
    isLoading,
    error,
    projectScan,
    clearError:()=>setError(null),
    switchProject,
    openFile,
    closeFile,
    saveFile,
    setFileModified,
    setScrollPosition,
    addProject,
    removeProject,
    loadGitStatus,
    loadExplorerTree,
  };
}

function toProject(record: ControlProject): Project {
  return {
    id: record.id,
    name: record.name,
    path: record.path,
    description: record.description,
    runtime: record.runtime,
  };
}

function tabsFor(project:Project,paths:string[]):Map<string,EditorTab>{return new Map(paths.map(path=>[path,{id:path,path,projectId:project.id,isDirty:false,isGitModified:false}]));}

function toWorkspace(project: Project): Workspace {
  return {
    id: `workspace_${project.id}`,
    projectId: project.id,
    path: project.path,
    mode: "direct",
  };
}
