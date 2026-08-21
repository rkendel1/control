"use client";

import React, { useState, useEffect } from "react";
import Workbench from "./components/Workbench";
import CommandPalette from "./components/CommandPalette";
import "./App.css";

export default function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(!isCommandPaletteOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen]);

  const handleCommand = (commandId: string) => {
    console.log("Executing command:", commandId);
    // Handle command execution here
    switch (commandId) {
      case "open-file":
        console.log("Opening file...");
        break;
      case "search-workspace":
        console.log("Searching workspace...");
        break;
      case "run-tests":
        console.log("Running tests...");
        break;
      case "start-agent":
        console.log("Starting agent...");
        break;
      // Add more command handlers as needed
    }
  };

  return (
    <div className="app">
      <Workbench />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onCommand={handleCommand}
      />
    </div>
  );
}
