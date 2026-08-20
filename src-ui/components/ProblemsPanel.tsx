"use client";

import React, { useState, useCallback } from "react";
import { ProblemItem } from "../types";
import "./ProblemsPanel.css";

interface ProblemsPanelProps {
  problems?: ProblemItem[];
  onProblemClick?: (problem: ProblemItem) => void;
}

export default function ProblemsPanel({
  problems = [],
  onProblemClick = () => {},
}: ProblemsPanelProps) {
  const [filter, setFilter] = useState<"all" | "errors" | "warnings">("all");

  const mockProblems: ProblemItem[] = [
    {
      id: "err-1",
      file: "src/recovery.rs",
      line: 184,
      column: 17,
      severity: "error",
      message: "mismatched types: expected `bool`, found `State`",
      source: "compiler",
      code: "E0308",
    },
    {
      id: "err-2",
      file: "src/recovery.rs",
      line: 217,
      column: 5,
      severity: "error",
      message: "unreachable code",
      source: "compiler",
      code: "E0001",
    },
    {
      id: "warn-1",
      file: "tests/recovery_test.rs",
      line: 91,
      column: 5,
      severity: "warning",
      message: "unused variable `x`",
      source: "lint",
    },
    {
      id: "warn-2",
      file: "tests/recovery_test.rs",
      line: 112,
      column: 10,
      severity: "warning",
      message: "expected `;`, found `}`",
      source: "compiler",
    },
  ];

  const allProblems = problems.length > 0 ? problems : mockProblems;

  const filteredProblems =
    filter === "all"
      ? allProblems
      : allProblems.filter((p) => p.severity === filter);

  const errorCount = allProblems.filter((p) => p.severity === "error").length;
  const warningCount = allProblems.filter(
    (p) => p.severity === "warning"
  ).length;

  const getSeverityIcon = (severity: string): string => {
    switch (severity) {
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
        return "ℹ";
      default:
        return "●";
    }
  };

  return (
    <div className="problems-panel">
      <div className="problems-header">
        <h3>Problems</h3>
        <div className="problems-stats">
          {errorCount > 0 && (
            <span className="stat error">
              {getSeverityIcon("error")} {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="stat warning">
              {getSeverityIcon("warning")} {warningCount}
            </span>
          )}
        </div>
      </div>

      <div className="problems-filter">
        <button
          className={`filter-button ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({allProblems.length})
        </button>
        <button
          className={`filter-button ${filter === "errors" ? "active" : ""}`}
          onClick={() => setFilter("errors")}
        >
          Errors ({errorCount})
        </button>
        <button
          className={`filter-button ${filter === "warnings" ? "active" : ""}`}
          onClick={() => setFilter("warnings")}
        >
          Warnings ({warningCount})
        </button>
      </div>

      <div className="problems-list">
        {filteredProblems.length === 0 ? (
          <div className="problems-empty">
            <p>No problems found</p>
          </div>
        ) : (
          filteredProblems.map((problem) => (
            <div
              key={problem.id}
              className={`problem-item severity-${problem.severity}`}
              onClick={() => onProblemClick(problem)}
            >
              <div className="problem-icon">
                {getSeverityIcon(problem.severity)}
              </div>
              <div className="problem-content">
                <div className="problem-message">{problem.message}</div>
                <div className="problem-location">
                  <span className="file">{problem.file}</span>
                  <span className="position">
                    {problem.line}:{problem.column}
                  </span>
                  {problem.code && (
                    <span className="code">[{problem.code}]</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
