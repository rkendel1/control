"use client";

import React, { useState } from "react";
import { ExplorerNode, GitFileStatus, GitStatus } from "../types";
import "./FileExplorer.css";

interface FileExplorerProps {
  tree: ExplorerNode[];
  onFileClick: (path: string) => void;
  gitStatus?: GitStatus | null;
}

export default function FileExplorer({
  tree,
  onFileClick,
  gitStatus,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["root"])
  );

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

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
      {tree.length === 0 ? (
        <div className="explorer-empty">No files</div>
      ) : (
        <div className="explorer-tree">{tree.map((node) => renderNode(node))}</div>
      )}
    </div>
  );
}
