"use client";

import React from "react";
import "./DiffViewer.css";

interface DiffViewerProps {
  filePath: string;
  oldContent?: string;
  newContent?: string;
}

export default function DiffViewer({
  filePath,
  oldContent = "",
  newContent = "",
}: DiffViewerProps) {
  // Simple mock diff viewer - in production, use a diff library
  const mockDiff = [
    { type: "context", line: "pub struct Recovery {", number: 10 },
    { type: "context", line: "  state: State,", number: 11 },
    {
      type: "removed",
      line: "  old_data: Vec<u8>,",
      number: 12,
    },
    { type: "added", line: "  state_machine: StateMachine,", number: 13 },
    { type: "context", line: "}", number: 14 },
    { type: "context", line: "", number: 15 },
    { type: "context", line: "impl Recovery {", number: 16 },
    { type: "added", line: "  pub fn new() -> Self {", number: 17 },
    {
      type: "added",
      line: "    Recovery { state_machine: StateMachine::new() }",
      number: 18,
    },
    { type: "added", line: "  }", number: 19 },
  ];

  return (
    <div className="diff-viewer">
      <div className="diff-stats">
        <span className="added">+18 added</span>
        <span className="removed">-5 removed</span>
      </div>
      <table className="diff-table">
        <tbody>
          {mockDiff.map((diff, idx) => (
            <tr key={idx} className={`diff-line diff-${diff.type}`}>
              <td className="line-number old">{diff.type === "removed" ? diff.number : ""}</td>
              <td className="line-number new">{diff.type === "added" ? diff.number : ""}</td>
              <td className="line-content">{diff.line}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
