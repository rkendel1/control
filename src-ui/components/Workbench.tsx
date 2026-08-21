"use client";

import React, { useState, useEffect } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import Sidebar from "./Sidebar";
import EditorArea from "./EditorArea";
import AgentPanel from "./AgentPanel";
import Terminal from "./Terminal";
import "./Workbench.css";

export default function Workbench() {
  const {
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
    addProject,
  } = useWorkspace();

  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [agentPanelWidth, setAgentPanelWidth] = useState(280);
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [isResizing, setIsResizing] = useState<
    "sidebar" | "agent" | "terminal" | null
  >(null);

  const handleAddProject = async () => {
    const path = window.prompt("Enter absolute path to project folder:", "");
    if (!path) return;

    const added = await addProject(path);
    if (!added) {
      window.alert("Failed to add project. Check the path and try again.");
    }
  };

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

  if (error) {
    return (
      <div className="workbench-error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="workbench-empty">
        <h2>No Projects</h2>
        <p>Add or open a project to get started.</p>
      </div>
    );
  }

  return (
    <div className="workbench">
      {/* Header */}
      <header className="workbench-header">
        <div className="header-left">
          <span className="logo">⚙ Control</span>
          <select
            className="project-selector"
            value={currentProject.id}
            onChange={(e) => switchProject(e.target.value)}
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
          />
        </div>

        {/* Right Agent Panel */}
        <div
          className="agent-panel-container"
          style={{ width: `${agentPanelWidth}px` }}
        >
          <AgentPanel />
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
