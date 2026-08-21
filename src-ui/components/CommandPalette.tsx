"use client";

import React, { useState, useEffect, useCallback } from "react";
import "./CommandPalette.css";

interface Command {
  id: string;
  label: string;
  description: string;
  category: string;
  action: () => void;
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand: (commandId: string) => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onCommand,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = [
    { id: "open-project", label: "Open Project", description: "Add a project folder", category: "Project", action: () => onCommand("open-project") },
    {
      id: "open-file",
      label: "Open File",
      description: "Open a file from the workspace",
      category: "File",
      action: () => onCommand("open-file"),
      shortcut: "⌘P",
    },
    {
      id: "search-workspace",
      label: "Search Workspace",
      description: "Search for text in files",
      category: "Search",
      action: () => onCommand("search-workspace"),
      shortcut: "⌘Shift+F",
    },
    {
      id: "run-tests",
      label: "Run Tests",
      description: "Run test suite",
      category: "Run",
      action: () => onCommand("run-tests"),
    },
    {
      id: "start-agent",
      label: "Open Tasks",
      description: "Open task triage to start or review agent work",
      category: "Agent",
      action: () => onCommand("start-agent"),
    },
    {
      id: "commit-changes",
      label: "Open Git Changes",
      description: "Review, stage, and commit project changes",
      category: "Git",
      action: () => onCommand("commit-changes"),
    },
    {
      id: "new-terminal",
      label: "New Terminal",
      description: "Open a new terminal session",
      category: "Terminal",
      action: () => onCommand("new-terminal"),
      shortcut: "Ctrl+`",
    },
    {
      id: "switch-project",
      label: "Switch Project",
      description: "Switch to another project",
      category: "Project",
      action: () => onCommand("switch-project"),
    },
  ];

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(search.toLowerCase()) ||
      cmd.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, filteredCommands.length - 1)
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
        }
      }
    },
    [filteredCommands, selectedIndex, onClose]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-header">
          <span className="palette-icon">⌘</span>
          <input
            type="text"
            className="palette-input"
            placeholder="Type command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </div>

        <div className="palette-results">
          {filteredCommands.length === 0 ? (
            <div className="no-results">No commands found</div>
          ) : (
            <div className="results-list">
              {filteredCommands.map((cmd, idx) => (
                <div
                  key={cmd.id}
                  className={`result-item ${selectedIndex === idx ? "selected" : ""}`}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                >
                  <div className="result-main">
                    <span className="result-label">{cmd.label}</span>
                    <span className="result-category">{cmd.category}</span>
                  </div>
                  <div className="result-secondary">
                    <span className="result-description">
                      {cmd.description}
                    </span>
                    {cmd.shortcut && (
                      <span className="result-shortcut">{cmd.shortcut}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="palette-footer">
          <span className="footer-hint">
            <kbd>↑↓</kbd> to navigate · <kbd>Enter</kbd> to select ·{" "}
            <kbd>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
