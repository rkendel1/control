"use client";

import React, { useState, useEffect } from "react";
import Workbench from "./components/Workbench";
import CommandPalette from "./components/CommandPalette";
import "./App.css";

export default function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier=e.metaKey||e.ctrlKey,key=e.key.toLowerCase();
      if (modifier && (key === "k" || (e.shiftKey && key === "p"))) {
        e.preventDefault();
        setIsCommandPaletteOpen(current=>!current);
      } else if(modifier&&!e.shiftKey&&key==="p"){
        e.preventDefault();window.dispatchEvent(new CustomEvent("control-command",{detail:"open-file"}));
      } else if(modifier&&e.shiftKey&&key==="f"){
        e.preventDefault();window.dispatchEvent(new CustomEvent("control-command",{detail:"search-workspace"}));
      } else if(e.ctrlKey&&key==="`"){
        e.preventDefault();window.dispatchEvent(new CustomEvent("control-command",{detail:"new-terminal"}));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCommand = (commandId: string) => {
    window.dispatchEvent(new CustomEvent("control-command", { detail: commandId }));
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
