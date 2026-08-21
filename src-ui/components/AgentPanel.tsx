"use client";

import React, { useState } from "react";
import { AgentRun } from "../types";
import "./AgentPanel.css";

export default function AgentPanel() {
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([
    {
      id: "run-1",
      taskId: "task-142",
      status: "idle",
      model: "Qwen3-Coder 30B",
      runtime: "Ollama",
      startedAt: Date.now(),
      activity: [
        {
          id: "act-1",
          timestamp: Date.now() - 60000,
          action: "Reading files",
          severity: "info",
        },
        {
          id: "act-2",
          timestamp: Date.now() - 45000,
          action: "Analyzing code",
          severity: "info",
        },
      ],
      filesChanged: new Map(),
    },
  ]);

  const currentRun = agentRuns[0];

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case "running":
        return "⚙";
      case "paused":
        return "⏸";
      case "stopped":
        return "⏹";
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      default:
        return "○";
    }
  };

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  return (
    <div className="agent-panel">
      <div className="agent-header">
        <h3>Agent Activity</h3>
        <div className="agent-controls">
          <button className="agent-button" title="Pause">
            ⏸
          </button>
          <button className="agent-button" title="Stop">
            ⏹
          </button>
        </div>
      </div>

      {currentRun && (
        <div className="agent-content">
          <div className="agent-info">
            <div className="agent-status">
              <span className={`status-icon ${currentRun.status}`}>
                {getStatusIcon(currentRun.status)}
              </span>
              <div className="agent-details">
                <span className="agent-name">{currentRun.model}</span>
                <span className="agent-runtime">{currentRun.runtime}</span>
              </div>
            </div>

            <div className="agent-task">
              <span className="task-label">Current Task</span>
              <span className="task-id">{currentRun.taskId}</span>
            </div>

            <div className="divider"></div>

            <div className="activity-section">
              <span className="section-label">Activity</span>
              <div className="activity-log">
                {currentRun.activity.map((act) => (
                  <div
                    key={act.id}
                    className={`activity-item severity-${act.severity}`}
                  >
                    <span className="time">{formatTime(act.timestamp)}</span>
                    <span className="message">{act.action}</span>
                    {act.fileChanges && act.fileChanges.length > 0 && (
                      <div className="file-changes">
                        {act.fileChanges.map((change, idx) => (
                          <div key={idx} className="file-change">
                            <span className="path">{change.path}</span>
                            <span className="stats">
                              +{change.added} -{change.removed}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="divider"></div>

            <div className="files-section">
              <span className="section-label">Files Changed</span>
              <div className="files-list">
                {currentRun.filesChanged.size === 0 ? (
                  <p className="empty">No files changed</p>
                ) : (
                  Array.from(currentRun.filesChanged.entries()).map(
                    ([path, stats]) => (
                      <div key={path} className="file-item">
                        <span className="file-path">✓ {path}</span>
                        <span className="file-stats">
                          +{stats.added} -{stats.removed}
                        </span>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!currentRun && (
        <div className="agent-empty">
          <p>No active agent run</p>
        </div>
      )}
    </div>
  );
}
