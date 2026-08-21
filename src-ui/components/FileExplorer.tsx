"use client";

import React, { useEffect, useState } from "react";
import { ExplorerNode, GitFileStatus, GitStatus } from "../types";
import "./FileExplorer.css";
import { invoke } from "../lib/tauri";

interface FileExplorerProps {
  tree: ExplorerNode[];
  onFileClick: (path: string) => void;
  gitStatus?: GitStatus | null;
  workspacePath?: string;
  onRefresh: () => void;
  showGeneratedFiles:boolean;
  onShowGeneratedFilesChange:(value:boolean)=>void;
}

export default function FileExplorer({
  tree,
  onFileClick,
  gitStatus,
  workspacePath,
  onRefresh,
  showGeneratedFiles,
  onShowGeneratedFilesChange,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["root"])
  );
  const [contextMenu,setContextMenu]=useState<{node:ExplorerNode;x:number;y:number}>();
  useEffect(()=>{if(!contextMenu)return;const close=()=>setContextMenu(undefined),key=(event:KeyboardEvent)=>event.key==="Escape"&&close();window.addEventListener("mousedown",close);window.addEventListener("blur",close);window.addEventListener("keydown",key);return()=>{window.removeEventListener("mousedown",close);window.removeEventListener("blur",close);window.removeEventListener("keydown",key);};},[contextMenu]);

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const createEntry=async(isDirectory:boolean,parentPath="")=>{if(!workspacePath)return;const name=window.prompt(isDirectory?"New folder name or path":"New file name or path")?.trim();if(!name)return;const path=parentPath&&!name.includes("/")?`${parentPath}/${name}`:name;const response=await invoke("cmd_file_create",{workspacePath,filePath:path,isDirectory});if(!response.success)window.alert(response.error);else onRefresh();};
  const renameEntry=async(node:ExplorerNode)=>{if(!workspacePath)return;const parent=node.path.includes("/")?node.path.slice(0,node.path.lastIndexOf("/")+1):"",name=window.prompt("New name",node.name)?.trim();if(!name)return;const next=name.includes("/")?name:`${parent}${name}`;if(next===node.path)return;const response=await invoke("cmd_file_rename",{workspacePath,filePath:node.path,newPath:next});if(!response.success)window.alert(response.error);else onRefresh();};
  const deleteEntry=async(node:ExplorerNode)=>{if(!workspacePath||!window.confirm(`Delete ${node.path}? This cannot be undone.`))return;const response=await invoke("cmd_file_delete",{workspacePath,filePath:node.path});if(!response.success)window.alert(response.error);else onRefresh();};
  const showContextMenu=(event:React.MouseEvent,node:ExplorerNode)=>{event.preventDefault();event.stopPropagation();setContextMenu({node,x:Math.min(event.clientX,window.innerWidth-210),y:Math.min(event.clientY,window.innerHeight-250)});};

  const getGitStatusIcon = (
    status?: GitFileStatus
  ): { icon: string; className: string } => {
    if (!status) return { icon: "", className: "" };
    switch (status.status) {
      case "M":
        return { icon: "M", className: "git-modified" };
      case "A":
        return { icon: "A", className: "git-added" };
      case "D":
        return { icon: "D", className: "git-deleted" };
      case "R":
        return { icon: "R", className: "git-renamed" };
      case "C":
        return { icon: "C", className: "git-copied" };
      case "?":
        return { icon: "?", className: "git-untracked" };
      default:
        return { icon: "", className: "" };
    }
  };

  const getLanguageIcon = (path: string): string => {
    const ext = path.split(".").pop()?.toLowerCase();
    const icons: Record<string, string> = {
      rs: "🦀",
      ts: "📘",
      tsx: "⚛️",
      js: "📙",
      jsx: "⚛️",
      py: "🐍",
      json: "{ }",
      toml: "📦",
      md: "📝",
      yaml: "📋",
      yml: "📋",
      txt: "📄",
      html: "🌐",
      css: "🎨",
      scss: "🎨",
      sql: "🗄️",
      sh: "⌨️",
      bash: "⌨️",
      zsh: "⌨️",
    };
    return icons[ext || ""] || "📄";
  };

  const renderNode = (node: ExplorerNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const gitStat = gitStatus?.files.get(node.path);
    const { icon: statusIcon, className: statusClass } =
      getGitStatusIcon(gitStat);

    if (node.type === "folder") {
      return (
        <div key={node.id} className="explorer-item">
          <div
            className="explorer-folder"
            style={{ paddingLeft: `${depth * 12}px` }}
            onContextMenu={(event)=>showContextMenu(event,node)}
          >
            <button
              className="expand-button"
              onClick={() => toggleFolder(node.id)}
            >
              {isExpanded ? "▼" : "▶"}
            </button>
            <span className="folder-icon">📁</span>
            <span className="folder-name">{node.name}</span>
          </div>
          {isExpanded && node.children && (
            <div className="explorer-children">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={node.id} className="explorer-item">
        <div
          className={`explorer-file ${statusClass || ""}`}
          style={{ paddingLeft: `${(depth + 1) * 12}px` }}
          onClick={() => onFileClick(node.path)}
          onContextMenu={(event)=>showContextMenu(event,node)}
        >
          <span className="file-icon">{getLanguageIcon(node.path)}</span>
          <span className="file-name">{node.name}</span>
          {statusIcon && <span className="git-status-badge">{statusIcon}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="file-explorer">
      <div className="explorer-toolbar"><button onClick={()=>void createEntry(false)} title="New file">+ File</button><button onClick={()=>void createEntry(true)} title="New folder">+ Folder</button><button onClick={onRefresh} title="Refresh">↻</button><button className={showGeneratedFiles?"active":""} onClick={()=>onShowGeneratedFilesChange(!showGeneratedFiles)} title="Show generated and vendor directories">All</button></div>
      {tree.length === 0 ? (
        <div className="explorer-empty">No files</div>
      ) : (
        <div className="explorer-tree">{tree.map((node) => renderNode(node))}</div>
      )}
      {contextMenu&&<div className="explorer-context-menu" style={{left:contextMenu.x,top:contextMenu.y}} onMouseDown={event=>event.stopPropagation()}>
        {contextMenu.node.type==="file"&&<button onClick={()=>{onFileClick(contextMenu.node.path);setContextMenu(undefined);}}>Open</button>}
        {contextMenu.node.type==="folder"&&<><button onClick={()=>{toggleFolder(contextMenu.node.id);setContextMenu(undefined);}}>{expandedFolders.has(contextMenu.node.id)?"Collapse":"Expand"}</button><button onClick={()=>{void createEntry(false,contextMenu.node.path);setContextMenu(undefined);}}>New File</button><button onClick={()=>{void createEntry(true,contextMenu.node.path);setContextMenu(undefined);}}>New Folder</button><div className="context-separator"/></>}
        <button onClick={()=>{void navigator.clipboard.writeText(contextMenu.node.path);setContextMenu(undefined);}}>Copy Relative Path</button>
        <button onClick={()=>{void renameEntry(contextMenu.node);setContextMenu(undefined);}}>Rename…</button>
        <div className="context-separator"/>
        <button className="danger" onClick={()=>{void deleteEntry(contextMenu.node);setContextMenu(undefined);}}>Delete…</button>
      </div>}
    </div>
  );
}
