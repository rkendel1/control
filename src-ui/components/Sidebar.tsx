"use client";

import React, { useState, useCallback } from "react";
import { Project, ExplorerNode, GitStatus, Workspace } from "../types";
import FileExplorer from "./FileExplorer";
import GitPanel from "./GitPanel";
import SearchPanel from "./SearchPanel";
import TasksPanel from "./TasksPanel";
import "./Sidebar.css";

type SidebarTab = "explorer" | "git" | "search" | "tasks";

interface SidebarProps {
  explorerTree: ExplorerNode[];
  gitStatus: GitStatus | null;
  onFileClick: (path: string) => void;
  projects: Project[];
  currentProject: Project;
  currentWorkspace: Workspace | null;
}

export default function Sidebar({
  explorerTree,
  gitStatus,
  onFileClick,
  projects,
  currentProject,
  currentWorkspace,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("explorer");

  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case "explorer":
        return (
          <FileExplorer
            tree={explorerTree}
            onFileClick={onFileClick}
            gitStatus={gitStatus}
          />
        );
      case "git":
        return <GitPanel gitStatus={gitStatus} />;
      case "search":
        return (
          <SearchPanel
            workspacePath={currentWorkspace?.path}
            onResultClick={(filePath) => onFileClick(filePath)}
          />
        );
      case "tasks":
        return <TasksPanel projectId={currentProject?.id} />;
      default:
        return null;
    }
  }, [activeTab, currentProject?.id, currentWorkspace?.path, explorerTree, gitStatus, onFileClick]);

  return (
    <div className="sidebar-container">
      <div className="sidebar-tabs">
        <button
          className={`tab-button ${activeTab === "explorer" ? "active" : ""}`}
          title="File Explorer"
          onClick={() => setActiveTab("explorer")}
        >
          📁
        </button>
        <button
          className={`tab-button ${activeTab === "git" ? "active" : ""}`}
          title="Git Changes"
          onClick={() => setActiveTab("git")}
        >
          🌿
        </button>
        <button
          className={`tab-button ${activeTab === "search" ? "active" : ""}`}
          title="Search"
          onClick={() => setActiveTab("search")}
        >
          🔍
        </button>
        <button
          className={`tab-button ${activeTab === "tasks" ? "active" : ""}`}
          title="Tasks"
          onClick={() => setActiveTab("tasks")}
        >
          ✓
        </button>
      </div>

      {renderTabContent()}
    </div>
  );
}
