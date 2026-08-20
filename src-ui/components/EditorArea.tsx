"use client";

import React, { useState, useRef, useEffect } from "react";
import { EditorTab, Workspace } from "../types";
import MonacoEditor from "./MonacoEditor";
import "./EditorArea.css";

interface EditorAreaProps {
  openFiles: EditorTab[];
  activeFileId?: string;
  currentWorkspace?: Workspace | null;
  onFileClose: (path: string) => void;
  onFileSave: (path: string, content: string) => void;
  onFileModified: (path: string, isDirty: boolean) => void;
  onFileOpen: (path: string) => void;
}

export default function EditorArea({
  openFiles,
  activeFileId,
  currentWorkspace,
  onFileClose,
  onFileSave,
  onFileModified,
  onFileOpen,
}: EditorAreaProps) {
  const [fileContents, setFileContents] = useState<Map<string, string>>(
    new Map()
  );
  const editorRef = useRef<any>(null);

  const activeFile = openFiles.find((f) => f.id === activeFileId) || openFiles[0];

  const handleEditorChange = (content: string) => {
    if (activeFile) {
      setFileContents(new Map(fileContents).set(activeFile.path, content));
      onFileModified(activeFile.path, true);
    }
  };

  const handleSave = () => {
    if (activeFile) {
      const content = fileContents.get(activeFile.path) || "";
      onFileSave(activeFile.path, content);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile, fileContents]);

  if (!currentWorkspace) {
    return (
      <div className="editor-area empty">
        <div className="editor-empty-state">
          <p>No workspace active</p>
        </div>
      </div>
    );
  }

  if (openFiles.length === 0) {
    return (
      <div className="editor-area empty">
        <div className="editor-empty-state">
          <p>No files open</p>
          <p className="secondary">Click a file in the explorer to open it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      {/* Tabs */}
      <div className="editor-tabs">
        {openFiles.map((file) => (
          <div
            key={file.id}
            className={`tab ${activeFileId === file.id ? "active" : ""} ${
              file.isDirty ? "dirty" : ""
            }`}
            onClick={() => onFileOpen(file.path)}
          >
            <span className="tab-name">{file.path.split("/").pop()}</span>
            {file.isDirty && <span className="tab-indicator">●</span>}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onFileClose(file.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      {activeFile && (
        <MonacoEditor
          ref={editorRef}
          path={activeFile.path}
          workspace={currentWorkspace}
          content={fileContents.get(activeFile.path) || ""}
          onChange={handleEditorChange}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
