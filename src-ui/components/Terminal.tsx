"use client";

import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
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
  const [isExecuting, setIsExecuting] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminals]);

  const activeTerminal = terminals.get(activeTerminalId);

  const handleCommand = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (input.trim() && activeTerminal && !isExecuting) {
        setIsExecuting(true);
        const newTerminals = new Map(terminals);
        const terminal = newTerminals.get(activeTerminalId);

        if (terminal) {
          terminal.history.push(`$ ${input}`);
          setTerminals(newTerminals);

          try {
            const response = await invoke<any>("cmd_terminal_execute", {
              session_id: activeTerminalId,
              command: input,
              cwd: terminal.cwd,
            });

            if (response.success && response.data) {
              const output = response.data;
              const lines = output.split("\n").filter((line: string) => line.length > 0);
              terminal.history.push(...lines);
            } else if (response.error) {
              terminal.history.push(`Error: ${response.error}`);
            }
          } catch (error) {
            terminal.history.push(`Command execution failed: ${error}`);
          } finally {
            terminal.history.push("$ ");
            newTerminals.set(activeTerminalId, terminal);
            setTerminals(newTerminals);
            setInput("");
            setIsExecuting(false);
          }
        }
      }
    }
  };

  const createTerminal = async (type: "shell" | "test" | "agent") => {
    const name = type === "shell" ? "zsh" : type === "test" ? "tests" : "agent";
    const cwd = workspace?.path || "~";

    try {
      const response = await invoke<any>("cmd_terminal_create_session", {
        name,
        cwd,
      });

      if (response.success) {
        const id = response.data;
        const newTerminal: TerminalSession = {
          id,
          name,
          type,
          cwd,
          isActive: true,
          history: ["$ "],
        };
        const newTerminals = new Map(terminals);
        newTerminals.set(id, newTerminal);
        setTerminals(newTerminals);
        setActiveTerminalId(id);
      }
    } catch (error) {
      console.error("Failed to create terminal:", error);
    }
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
          onClick={() => void createTerminal("shell")}
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
          disabled={isExecuting}
          autoFocus
          placeholder={`Type command (cwd: ${activeTerminal.cwd})`}
        />
      </div>
    </div>
  );
}
