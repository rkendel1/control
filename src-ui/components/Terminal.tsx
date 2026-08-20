"use client";

import React, { useState, useRef, useEffect } from "react";
import { Workspace, TerminalSession } from "../types";
import "./Terminal.css";

interface TerminalProps {
  workspace: Workspace | null;
}

export default function Terminal({ workspace }: TerminalProps) {
  const [terminals, setTerminals] = useState<Map<string, TerminalSession>>(
    new Map([
      [
        "shell",
        {
          id: "shell",
          name: "zsh",
          type: "shell",
          cwd: workspace?.path || "~",
          isActive: true,
          history: ["$ "],
        },
      ],
    ])
  );
  const [activeTerminalId, setActiveTerminalId] = useState("shell");
  const [input, setInput] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminals]);

  const activeTerminal = terminals.get(activeTerminalId);

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.trim()) {
        const newTerminals = new Map(terminals);
        const terminal = newTerminals.get(activeTerminalId);
        if (terminal) {
          terminal.history.push(`$ ${input}`);
          // Simulate command execution
          if (input.startsWith("cargo test")) {
            terminal.history.push("running tests...");
            terminal.history.push("✓ All tests passed");
          } else if (input === "git status") {
            terminal.history.push("On branch main");
            terminal.history.push("nothing to commit");
          } else {
            terminal.history.push(`Output for: ${input}`);
          }
          terminal.history.push("$ ");
          newTerminals.set(activeTerminalId, terminal);
          setTerminals(newTerminals);
        }
        setInput("");
      }
    }
  };

  const createTerminal = (type: "shell" | "test" | "agent") => {
    const id = `${type}-${Date.now()}`;
    const newTerminal: TerminalSession = {
      id,
      name: type === "shell" ? "zsh" : type === "test" ? "tests" : "agent",
      type,
      cwd: workspace?.path || "~",
      isActive: false,
      history: ["$ "],
    };
    const newTerminals = new Map(terminals);
    newTerminals.set(id, newTerminal);
    setTerminals(newTerminals);
    setActiveTerminalId(id);
  };

  if (!activeTerminal) {
    return (
      <div className="terminal-container empty">
        <p>No terminal active</p>
      </div>
    );
  }

  return (
    <div className="terminal">
      <div className="terminal-tabs">
        {Array.from(terminals.values()).map((term) => (
          <button
            key={term.id}
            className={`terminal-tab ${activeTerminalId === term.id ? "active" : ""}`}
            onClick={() => setActiveTerminalId(term.id)}
          >
            {term.name}
          </button>
        ))}
        <button
          className="terminal-new-button"
          onClick={() => createTerminal("shell")}
          title="New terminal"
        >
          +
        </button>
      </div>

      <div className="terminal-output" ref={outputRef}>
        {activeTerminal.history.map((line, idx) => (
          <div key={idx} className="terminal-line">
            {line}
          </div>
        ))}
      </div>

      <div className="terminal-input-line">
        <span className="terminal-prompt">$</span>
        <input
          type="text"
          className="terminal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleCommand}
          autoFocus
          placeholder={`Type command (cwd: ${activeTerminal.cwd})`}
        />
      </div>
    </div>
  );
}
