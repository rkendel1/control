"use client";

import React, { useState } from "react";
import { GitStatus } from "../types";
import DiffViewer from "./DiffViewer";
import "./GitPanel.css";

interface GitPanelProps {
  gitStatus: GitStatus | null;
}

export default function GitPanel({ gitStatus }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "staged" | "history">(
    "changes"
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");

  if (!gitStatus) {
    return (
      <div className="git-panel">
        <div className="git-empty">No git status available</div>
      </div>
    );
  }

  const unstagedFiles = Array.from(gitStatus.files.entries()).filter(
    ([, status]) => !gitStatus.stagedFiles.has(Array.from(gitStatus.files.keys())[0])
  );
  const changedCount = gitStatus.files.size;
  const stagedCount = gitStatus.stagedFiles.size;

  return (
    <div className="git-panel">
      <div className="git-header">
        <div className="git-branch">
          <span className="branch-icon">🌿</span>
          <span className="branch-name">{gitStatus.branch}</span>
          {!gitStatus.isClean && <span className="modified-indicator">●</span>}
        </div>
        {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
          <div className="git-tracking">
            {gitStatus.ahead > 0 && (
              <span className="ahead">↑ {gitStatus.ahead}</span>
            )}
            {gitStatus.behind > 0 && (
              <span className="behind">↓ {gitStatus.behind}</span>
            )}
          </div>
        )}
      </div>

      <div className="git-tabs">
        <button
          className={`git-tab ${activeTab === "changes" ? "active" : ""}`}
          onClick={() => setActiveTab("changes")}
        >
          Changes <span className="badge">{changedCount}</span>
        </button>
        <button
          className={`git-tab ${activeTab === "staged" ? "active" : ""}`}
          onClick={() => setActiveTab("staged")}
        >
          Staged <span className="badge">{stagedCount}</span>
        </button>
        <button
          className={`git-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      <div className="git-content">
        {activeTab === "changes" && (
          <div className="changes-section">
            {gitStatus.files.size === 0 ? (
              <div className="empty">No changes</div>
            ) : (
              <div className="changes-list">
                {Array.from(gitStatus.files.entries()).map(([path, status]) => (
                  <div
                    key={path}
                    className={`change-item status-${status.status}`}
                    onClick={() => setSelectedFile(path)}
                  >
                    <span className="status-badge">{status.status}</span>
                    <span className="file-path">{path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "staged" && (
          <div className="staged-section">
            {gitStatus.stagedFiles.size === 0 ? (
              <div className="empty">No staged files</div>
            ) : (
              <div className="staged-list">
                {Array.from(gitStatus.stagedFiles).map((path) => (
                  <div key={path} className="staged-item">
                    <span className="checkmark">✓</span>
                    <span className="file-path">{path}</span>
                  </div>
                ))}
              </div>
            )}

            {gitStatus.stagedFiles.size > 0 && (
              <div className="commit-section">
                <textarea
                  className="commit-message"
                  placeholder="Write commit message..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                />
                <button className="commit-button">Commit</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="history-section">
            <div className="commit-item">
              <span className="commit-hash">a91d2f4</span>
              <span className="commit-message">Recent changes</span>
              <span className="commit-time">2 hours ago</span>
            </div>
            <div className="commit-item">
              <span className="commit-hash">b71a91c</span>
              <span className="commit-message">Initial setup</span>
              <span className="commit-time">1 day ago</span>
            </div>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="diff-viewer-modal">
          <div className="modal-header">
            <span>{selectedFile}</span>
            <button
              className="close-button"
              onClick={() => setSelectedFile(null)}
            >
              ×
            </button>
          </div>
          <DiffViewer filePath={selectedFile} />
        </div>
      )}
    </div>
  );
}
