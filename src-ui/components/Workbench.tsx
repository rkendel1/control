"use client";

import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../hooks/useWorkspace";
import Sidebar from "./Sidebar";
import EditorArea from "./EditorArea";
import Terminal from "./Terminal";
import "./Workbench.css";
import { useRunEvents } from "../hooks/useRunEvents";
import { useRunRecovery } from "../hooks/useRunRecovery";
import { useChatRunEvents } from "../hooks/useChatRunEvents";
import { getControlDatabase,LOCAL_PARTICIPANT_ID,type ControlInboxItem } from "../lib/control-db";
import QuickOpen from "./QuickOpen";
import ControlPanel from "./ControlPanel";
import {invoke} from "../lib/tauri";
import BuildWithAI from "./BuildWithAI";

export default function Workbench() {
  useRunEvents();
  useChatRunEvents();
  useRunRecovery();
  const {
    projects,
    currentProject,
    currentWorkspace,
    workspaceState,
    gitStatus,
    explorerTree,
    showGeneratedFiles,
    setShowGeneratedFiles,
    isLoading,
    error,
    projectScan,
    clearError,
    switchProject,
    openFile,
    closeFile,
    saveFile,
    setFileModified,
    addProject,
    removeProject,
    loadGitStatus,
    loadExplorerTree,
  } = useWorkspace();

  const [sidebarWidth, setSidebarWidth] = useState(340);
  const [agentPanelWidth, setAgentPanelWidth] = useState(350);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [layoutLoaded,setLayoutLoaded]=useState(false);
  const [quickOpen,setQuickOpen]=useState(false);
  const [globalInboxItems,setGlobalInboxItems]=useState<ControlInboxItem[]>([]);
  const [projectNotice,setProjectNotice]=useState<string>();
  const [agentExpanded,setAgentExpanded]=useState(false);
  const [buildingWithAI,setBuildingWithAI]=useState(false);
  const [isResizing, setIsResizing] = useState<
    "sidebar" | "agent" | "terminal" | null
  >(null);

  useEffect(()=>{void getControlDatabase().settings.get("workspace").then(settings=>{if(settings){setSidebarWidth(Math.max(300,settings.layout.sidebarWidth));setAgentPanelWidth(Math.max(300,settings.layout.agentPanelWidth));setTerminalHeight(Math.max(180,Math.min(360,settings.layout.terminalHeight)));}setLayoutLoaded(true);});},[]);
  useEffect(()=>{if(!layoutLoaded)return;const timer=window.setTimeout(()=>{const database=getControlDatabase();void database.settings.get("workspace").then(settings=>settings&&database.settings.update("workspace",{layout:{sidebarWidth,agentPanelWidth,terminalHeight},updatedAt:Date.now()}));},250);return()=>window.clearTimeout(timer);},[layoutLoaded,sidebarWidth,agentPanelWidth,terminalHeight]);
  useEffect(()=>{const database=getControlDatabase(),refresh=()=>void database.inboxItems.all().then(items=>setGlobalInboxItems(items.filter(item=>item.toParticipantId===LOCAL_PARTICIPANT_ID&&(item.status==="open"||item.status==="acknowledged")).sort((a,b)=>b.createdAt-a.createdAt)));refresh();return database.inboxItems.subscribe(refresh);},[]);
  const newInboxItems=globalInboxItems.filter(item=>item.status==="open"),inboxTone=newInboxItems.some(item=>item.type==="escalation")?"urgent":newInboxItems.some(item=>item.type==="question"||item.type==="approval")?"attention":newInboxItems.length?"new":"";

  const handleAddProject = async () => {
    if(Array.from(workspaceState.openFiles.values()).some(file=>file.isDirty)&&!window.confirm("Switch projects with unsaved editor changes? Recovery drafts are retained unless they contain sensitive data."))return;
    let path: string | null = null;

    try {
      const selected = await open({ directory: true, title: "Open Project" });
      if (typeof selected === "string") path = selected;
      else if(Array.isArray(selected)&&typeof selected[0]==="string")path=selected[0];
    } catch(reason) {
      console.error("Project picker failed",reason);
      // Fall back to manual input when dialog is unavailable.
    }

    if (!path) {
      path = window.prompt("Enter absolute path to project folder:", "");
    }

    if (!path) return;

    const added = await addProject(path);
    if (!added) {
      window.alert("Failed to add project. Check the path and try again.");
    } else {setProjectNotice(`Added ${path.split("/").filter(Boolean).pop()||path} to Control`);window.setTimeout(()=>setProjectNotice(undefined),4000);}
  };

  const handleRemoveProject=async()=>{if(!currentProject)return;if(Array.from(workspaceState.openFiles.values()).some(file=>file.isDirty)&&!window.confirm("This project has unsaved editor changes. Continue removing it from Control?"))return;if(!window.confirm(`Remove ${currentProject.name} from Control? Project files will not be deleted.`))return;const removed=await removeProject(currentProject.id);if(!removed)window.alert("Project could not be removed. Stop active work and try again.");};

  useEffect(() => {
    const handleCommand=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="open-file")setQuickOpen(true);else if(command==="build-with-ai")setBuildingWithAI(true);else if(command==="switch-project"){document.querySelector<HTMLSelectElement>(".project-selector")?.focus();}else if(command==="open-project")void handleAddProject();else if(command==="toggle-terminal-size")setTerminalHeight(height=>height>400?220:Math.min(650,Math.round(window.innerHeight*.55)));};
    window.addEventListener("control-command",handleCommand);return()=>window.removeEventListener("control-command",handleCommand);
  },[openFile]);
  useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent<{location:"desktop"|"documents";name:string}>).detail;void (async()=>{const response=await invoke<string>("cmd_project_create",detail);if(!response.success||!response.data){window.alert(response.error||"Could not create project");return;}if(!await addProject(response.data,detail.name))window.alert("The folder was created, but Control could not open it.");})();};window.addEventListener("control-create-project",handler);return()=>window.removeEventListener("control-create-project",handler);},[addProject]);
  useEffect(()=>{if(!agentExpanded)return;const restore=(event:KeyboardEvent)=>{if(event.key==="Escape")setAgentExpanded(false);};window.addEventListener("keydown",restore);return()=>window.removeEventListener("keydown",restore);},[agentExpanded]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      if (isResizing === "sidebar") {
        setSidebarWidth(Math.max(300, Math.min(520, e.clientX)));
      } else if (isResizing === "agent") {
        setAgentPanelWidth(
          Math.max(200, Math.min(500, window.innerWidth - e.clientX))
        );
      } else if (isResizing === "terminal") {
        setTerminalHeight(
          Math.max(100, Math.min(600, window.innerHeight - e.clientY))
        );
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing]);

  if (isLoading) {
    return (
      <div className="workbench-loading">
        <div className="spinner">Loading Control Workbench...</div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="workbench-empty">
        <h2>No Projects</h2>
        <p>Add or open a project to get started.</p>
        {error&&<div className="workbench-inline-error"><span>{error}</span><button onClick={clearError}>Dismiss</button></div>}
        {projectScan&&<div className={`workbench-scan-status ${projectScan.status}`}>{projectScan.message}</div>}
        <button className="header-action" onClick={() => void handleAddProject()}>
          Open Project
        </button>
      </div>
    );
  }

  return (
    <div className={`workbench ${agentExpanded?"ai-focus":""}`}>
      {buildingWithAI&&<BuildWithAI projects={projects} currentProjectId={currentProject.id} onClose={()=>setBuildingWithAI(false)} onStarted={()=>{setBuildingWithAI(false);setAgentExpanded(true);window.dispatchEvent(new CustomEvent("control-command",{detail:"start-agent"}));}}/>}
      {quickOpen&&<QuickOpen tree={explorerTree} onOpen={openFile} onClose={()=>setQuickOpen(false)}/>} 
      {error&&<div className="workbench-error-banner"><span>{error}</span><button onClick={clearError}>Dismiss</button></div>}
      {projectNotice&&<div className="workbench-project-notice">{projectNotice}</div>}
      {projectScan&&<div className={`workbench-scan-status ${projectScan.status}`}>{projectScan.status==="scanning"&&<span className="scan-spinner"/>}{projectScan.message}</div>}
      {/* Header */}
      <header className="workbench-header">
        <div className="header-left">
          <span className="logo">⚙ Control</span>
          <select
            className="project-selector"
            value={currentProject.id}
            onChange={(e) => void switchProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="header-right">
          <button className="header-build-ai" onClick={()=>setBuildingWithAI(true)}>✦ Build with AI</button>
          <button className={`header-global inbox-indicator ${inboxTone}`} onClick={()=>window.dispatchEvent(new CustomEvent("control-command",{detail:"open-global-inbox"}))}>Inbox{globalInboxItems.length?` ${globalInboxItems.length}`:""}{newInboxItems.length>0&&<span className="inbox-new-dot" title={`${newInboxItems.length} new`}/>}</button>
          <button className="header-global" onClick={()=>window.dispatchEvent(new CustomEvent("control-command",{detail:"open-global-intelligence"}))}>Intelligence</button>
          <button className="header-action" onClick={() => void handleAddProject()}>
            Open Project
          </button>
          <button className="header-action" onClick={() => void handleRemoveProject()} title="Remove from Control without deleting files">
            Remove
          </button>
          <span className="git-info">
            {gitStatus?.branch && `${gitStatus.branch}`}
            {gitStatus?.isClean === false && " ●"}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="workbench-main">
        {/* Left Sidebar */}
        <div
          className="sidebar"
          style={{ width: `${sidebarWidth}px` }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Sidebar
            explorerTree={explorerTree}
            gitStatus={gitStatus}
            onFileClick={openFile}
            projects={projects}
            currentProject={currentProject}
            currentWorkspace={currentWorkspace}
            onGitRefresh={loadGitStatus}
            onExplorerRefresh={loadExplorerTree}
            showGeneratedFiles={showGeneratedFiles}
            onShowGeneratedFilesChange={setShowGeneratedFiles}
            dirtyPaths={Array.from(workspaceState.openFiles.values()).filter(file=>file.isDirty).map(file=>file.path)}
          />
          <div
            className="resize-handle resize-handle-right"
            onMouseDown={() => setIsResizing("sidebar")}
          />
        </div>

        {/* Editor Area */}
        <div className="editor-container">
          <EditorArea
            openFiles={Array.from(workspaceState.openFiles.values())}
            activeFileId={workspaceState.activeFileId}
            currentWorkspace={currentWorkspace}
            onFileClose={closeFile}
            onFileSave={saveFile}
            onFileModified={setFileModified}
            onFileOpen={openFile}
            targetPosition={workspaceState.scrollPositions.get(workspaceState.activeFileId||"")}
          />
        </div>

        <div className="agent-panel-container" style={{width:agentExpanded?"100%":`${agentPanelWidth}px`}}>
          <div className="resize-handle resize-handle-left" onMouseDown={()=>setIsResizing("agent")}/>
          <ControlPanel project={currentProject} projects={projects} inboxItems={globalInboxItems} expanded={agentExpanded} onToggleExpanded={()=>setAgentExpanded(value=>!value)}/>
        </div>

      </div>

      {/* Terminal */}
      <div
        className="terminal-container"
        style={{ height: `${terminalHeight}px` }}
      >
        <Terminal workspace={currentWorkspace} />
        <div
          className="resize-handle resize-handle-top"
          onMouseDown={() => setIsResizing("terminal")}
        />
      </div>
    </div>
  );
}
