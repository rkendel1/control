"use client";

import React, { useEffect, useRef, forwardRef } from "react";
import { Workspace } from "../types";
import "./MonacoEditor.css";

interface MonacoEditorProps {
  path: string;
  workspace: Workspace;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

// Mock Monaco Editor - in production, use @monaco-editor/react
const MonacoEditor = forwardRef<HTMLDivElement, MonacoEditorProps>(
  ({ path, workspace, content, onChange, onSave }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      // In production, initialize Monaco Editor here
      if (textareaRef.current && content) {
        textareaRef.current.value = content;
      }
    }, [path, content]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    };

    const getLanguageFromPath = (p: string): string => {
      const ext = p.split(".").pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        rs: "rust",
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        py: "python",
        json: "json",
        yaml: "yaml",
        yml: "yaml",
        html: "html",
        css: "css",
        scss: "scss",
        sql: "sql",
        md: "markdown",
        sh: "shell",
        bash: "shell",
        zsh: "shell",
      };
      return langMap[ext || ""] || "plaintext";
    };

    return (
      <div className="monaco-editor" ref={containerRef}>
        <div className="editor-info">
          <span className="file-path">{path}</span>
          <span className="language">{getLanguageFromPath(path)}</span>
        </div>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={content}
          onChange={handleChange}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              onSave();
            }
          }}
          spellCheck="false"
        />
      </div>
    );
  }
);

MonacoEditor.displayName = "MonacoEditor";

export default MonacoEditor;
