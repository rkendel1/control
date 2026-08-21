"use client";

import React, { useRef, forwardRef, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { Workspace } from "../types";
import "./MonacoEditor.css";

interface MonacoEditorProps {
  path: string;
  workspace: Workspace;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

const MonacoEditor = forwardRef<HTMLDivElement, MonacoEditorProps>(
  ({ path, workspace, content, onChange, onSave }, ref) => {
    const monaco = useMonaco();
    const editorRef = useRef<any>(null);

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

    const handleEditorDidMount = (editor: any) => {
      editorRef.current = editor;
      editor.addCommand(
        monaco?.KeyMod.CtrlCmd | monaco?.KeyCode.KeyS,
        onSave
      );
    };

    const handleChange = useCallback(
      (value: string | undefined) => {
        if (value !== undefined) {
          onChange(value);
        }
      },
      [onChange]
    );

    return (
      <div className="monaco-editor" ref={ref}>
        <div className="editor-header">
          <span className="file-path">{path}</span>
          <span className="language-badge">{getLanguageFromPath(path)}</span>
        </div>
        <div className="editor-container">
          <Editor
            height="100%"
            language={getLanguageFromPath(path)}
            value={content}
            onChange={handleChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              fontSize: 13,
              fontFamily: "'Fira Code', 'Monaco', monospace",
              tabSize: 2,
              insertSpaces: true,
              lineNumbers: "on",
              bracketPairColorization: {
                enabled: true,
              },
            }}
          />
        </div>
      </div>
    );
  }
);

MonacoEditor.displayName = "MonacoEditor";

export default MonacoEditor;
