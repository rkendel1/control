"use client";

import React, { useState, useCallback } from "react";
import { Project, ExplorerNode, GitStatus, Workspace } from "../types";
import FileExplorer from "./FileExplorer";
import GitPanel from "./GitPanel";
import SearchPanel from "./SearchPanel";
import OperationalContext from "./OperationalContext";
import "./Sidebar.css";

type SidebarTab = "explorer" | "git" | "search" | "operations";

interface SidebarProps {
  explorerTree: ExplorerNode[];
  gitStatus: GitStatus | null;
  onFileClick: (path: string,line?:number,column?:number) => void;
  projects: Project[];
  currentProject: Project;
  currentWorkspace: Workspace | null;
  onGitRefresh: () => void;
  onExplorerRefresh: () => void;
  showGeneratedFiles:boolean;
  onShowGeneratedFilesChange:(value:boolean)=>void;
  dirtyPaths:string[];
}

export default function Sidebar({
  explorerTree,
  gitStatus,
  onFileClick,
  projects,
  currentProject,
  currentWorkspace,
  onGitRefresh,
  onExplorerRefresh,
  showGeneratedFiles,
  onShowGeneratedFilesChange,
  dirtyPaths,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("explorer");
  React.useEffect(()=>{const handler=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="search-workspace")setActiveTab("search");else if(command==="commit-changes")setActiveTab("git");else if(command==="open-file")setActiveTab("explorer");};window.addEventListener("control-command",handler);return()=>window.removeEventListener("control-command",handler);},[]);

  const renderTabContent = useCallback(() => {
    switch (activeTab) {
      case "explorer":
        return (
          <FileExplorer
            tree={explorerTree}
            onFileClick={onFileClick}
            gitStatus={gitStatus}
            workspacePath={currentWorkspace?.path}
            onRefresh={onExplorerRefresh}
            showGeneratedFiles={showGeneratedFiles}
            onShowGeneratedFilesChange={onShowGeneratedFilesChange}
          />
        );
      case "git":
        return <GitPanel gitStatus={gitStatus} workspacePath={currentWorkspace?.path} onRefresh={onGitRefresh} dirtyPaths={dirtyPaths} />;
      case "search":
        return (
          <SearchPanel
            workspacePath={currentWorkspace?.path}
            onResultClick={(filePath,line) => onFileClick(filePath,line,1)}
            includeGenerated={showGeneratedFiles}
          />
        );
      case "operations":
        return <OperationalContext projectId={currentProject.id} onOpen={onFileClick}/>;
      default:
        return null;
    }
  }, [activeTab, currentProject?.id, currentWorkspace?.path, explorerTree, gitStatus, onFileClick, onGitRefresh, onExplorerRefresh,showGeneratedFiles,onShowGeneratedFilesChange,dirtyPaths]);

  return (
    <div className="sidebar-container">
      <div className="sidebar-tabs"><div className="nav-scope project-only"><span>Project</span>
        <button
          className={`tab-button ${activeTab === "explorer" ? "active" : ""}`}
          title="File Explorer"
          onClick={() => setActiveTab("explorer")}
        >
          Files
        </button>
        <button
          className={`tab-button ${activeTab === "git" ? "active" : ""}`}
          title="Git Changes"
          onClick={() => setActiveTab("git")}
        >
          Git
        </button>
        <button
          className={`tab-button ${activeTab === "search" ? "active" : ""}`}
          title="Search"
          onClick={() => setActiveTab("search")}
        >
          Search
        </button>
        <button className={`tab-button ${activeTab === "operations" ? "active" : ""}`} title="Operational Context" onClick={() => setActiveTab("operations")}>Ops</button>
        </div>
      </div>

      {renderTabContent()}
    </div>
  );
}
