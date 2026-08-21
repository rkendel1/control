"use client";

import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../hooks/useWorkspace";
import Sidebar from "./Sidebar";
import EditorArea from "./EditorArea";
import CoordinationPanel from "./CoordinationPanel";
import Terminal from "./Terminal";
import "./Workbench.css";
import { useRunEvents } from "../hooks/useRunEvents";
import { useRunRecovery } from "../hooks/useRunRecovery";
import { useChatRunEvents } from "../hooks/useChatRunEvents";
import { getControlDatabase } from "../lib/control-db";
import QuickOpen from "./QuickOpen";

export default function Workbench() {
  useRunEvents();
  useChatRunEvents();
  useRunRecovery();
  const {
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
    clearError,
    switchProject,
    openFile,
    closeFile,
    saveFile,
    setFileModified,
    addProject,
    removeProject,
    loadGitStatus,
    loadExplorerTree,
  } = useWorkspace();

  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [agentPanelWidth, setAgentPanelWidth] = useState(280);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [layoutLoaded,setLayoutLoaded]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [isResizing, setIsResizing] = useState<
    "sidebar" | "agent" | "terminal" | null
  >(null);

  useEffect(()=>{void getControlDatabase().settings.get("workspace").then(settings=>{if(settings){setSidebarWidth(settings.layout.sidebarWidth);setAgentPanelWidth(settings.layout.agentPanelWidth);setTerminalHeight(settings.layout.terminalHeight);}setLayoutLoaded(true);});},[]);
  useEffect(()=>{if(!layoutLoaded)return;const timer=window.setTimeout(()=>{const database=getControlDatabase();void database.settings.get("workspace").then(settings=>settings&&database.settings.update("workspace",{layout:{sidebarWidth,agentPanelWidth,terminalHeight},updatedAt:Date.now()}));},250);return()=>window.clearTimeout(timer);},[layoutLoaded,sidebarWidth,agentPanelWidth,terminalHeight]);

  const handleAddProject = async () => {
    if(Array.from(workspaceState.openFiles.values()).some(file=>file.isDirty)&&!window.confirm("Switch projects with unsaved editor changes? Recovery drafts are retained unless they contain sensitive data."))return;
    let path: string | null = null;

    try {
      const selected = await open({ directory: true, title: "Open Project" });
      if (typeof selected === "string") {
        path = selected;
      }
    } catch {
      // Fall back to manual input when dialog is unavailable.
    }

    if (!path) {
      path = window.prompt("Enter absolute path to project folder:", "");
    }

    if (!path) return;

    const added = await addProject(path);
    if (!added) {
      window.alert("Failed to add project. Check the path and try again.");
    }
  };

  const handleRemoveProject=async()=>{if(!currentProject)return;if(Array.from(workspaceState.openFiles.values()).some(file=>file.isDirty)&&!window.confirm("This project has unsaved editor changes. Continue removing it from Control?"))return;if(!window.confirm(`Remove ${currentProject.name} from Control? Project files will not be deleted.`))return;const removed=await removeProject(currentProject.id);if(!removed)window.alert("Project could not be removed. Stop active work and try again.");};

  useEffect(() => {
    const handleCommand=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="open-file")setQuickOpen(true);else if(command==="switch-project"){document.querySelector<HTMLSelectElement>(".project-selector")?.focus();}else if(command==="open-project")void handleAddProject();};
    window.addEventListener("control-command",handleCommand);return()=>window.removeEventListener("control-command",handleCommand);
  },[openFile]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      if (isResizing === "sidebar") {
        setSidebarWidth(Math.max(200, Math.min(500, e.clientX)));
      } else if (isResizing === "agent") {
        setAgentPanelWidth(
          Math.max(200, Math.min(500, window.innerWidth - e.clientX))
        );
      } else if (isResizing === "terminal") {
        setTerminalHeight(
          Math.max(100, Math.min(600, window.innerHeight - e.clientY))
        );
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing]);

  if (isLoading) {
    return (
      <div className="workbench-loading">
        <div className="spinner">Loading Control Workbench...</div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="workbench-empty">
        <h2>No Projects</h2>
        <p>Add or open a project to get started.</p>
        {error&&<div className="workbench-inline-error"><span>{error}</span><button onClick={clearError}>Dismiss</button></div>}
        <button className="header-action" onClick={() => void handleAddProject()}>
          Open Project
        </button>
      </div>
    );
  }

  return (
    <div className="workbench">
      {quickOpen&&<QuickOpen tree={explorerTree} onOpen={openFile} onClose={()=>setQuickOpen(false)}/>} 
      {error&&<div className="workbench-error-banner"><span>{error}</span><button onClick={clearError}>Dismiss</button></div>}
      {/* Header */}
      <header className="workbench-header">
        <div className="header-left">
          <span className="logo">⚙ Control</span>
          <select
            className="project-selector"
            value={currentProject.id}
            onChange={(e) => {if(Array.from(workspaceState.openFiles.values()).some(file=>file.isDirty)&&!window.confirm("Switch projects with unsaved editor changes? Recovery drafts are retained unless they contain sensitive data.")){e.currentTarget.value=currentProject.id;return;}void switchProject(e.target.value);}}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="header-right">
          <button className="header-action" onClick={() => void handleAddProject()}>
            Open Project
          </button>
          <button className="header-action" onClick={() => void handleRemoveProject()} title="Remove from Control without deleting files">
            Remove
          </button>
          <span className="git-info">
            {gitStatus?.branch && `${gitStatus.branch}`}
            {gitStatus?.isClean === false && " ●"}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="workbench-main">
        {/* Left Sidebar */}
        <div
          className="sidebar"
          style={{ width: `${sidebarWidth}px` }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Sidebar
            explorerTree={explorerTree}
            gitStatus={gitStatus}
            onFileClick={openFile}
            projects={projects}
            currentProject={currentProject}
            currentWorkspace={currentWorkspace}
            onGitRefresh={loadGitStatus}
            onExplorerRefresh={loadExplorerTree}
            showGeneratedFiles={showGeneratedFiles}
            onShowGeneratedFilesChange={setShowGeneratedFiles}
          />
          <div
            className="resize-handle resize-handle-right"
            onMouseDown={() => setIsResizing("sidebar")}
          />
        </div>

        {/* Editor Area */}
        <div className="editor-container">
          <EditorArea
            openFiles={Array.from(workspaceState.openFiles.values())}
            activeFileId={workspaceState.activeFileId}
            currentWorkspace={currentWorkspace}
            onFileClose={closeFile}
            onFileSave={saveFile}
            onFileModified={setFileModified}
            onFileOpen={openFile}
            targetPosition={workspaceState.scrollPositions.get(workspaceState.activeFileId||"")}
          />
        </div>

        {/* Right Agent Panel */}
        <div
          className="agent-panel-container"
          style={{ width: `${agentPanelWidth}px` }}
        >
          <CoordinationPanel project={currentProject} />
          <div
            className="resize-handle resize-handle-left"
            onMouseDown={() => setIsResizing("agent")}
          />
        </div>
      </div>

      {/* Terminal */}
      <div
        className="terminal-container"
        style={{ height: `${terminalHeight}px` }}
      >
        <Terminal workspace={currentWorkspace} />
        <div
          className="resize-handle resize-handle-top"
          onMouseDown={() => setIsResizing("terminal")}
        />
      </div>
    </div>
  );
}
