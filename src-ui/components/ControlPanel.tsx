"use client";
import React,{useEffect,useState} from "react";
import type {Project} from "../types";
import type {ControlInboxItem} from "../lib/control-db";
import CoordinationPanel,{type CoordinationTab} from "./CoordinationPanel";
import TasksPanel from "./TasksPanel";
import GlobalInbox from "./GlobalInbox";
import "./ControlPanel.css";

type ControlPanelTab="chat"|"tasks"|"decisions"|"evidence"|"activity"|"intelligence"|"inbox";
export default function ControlPanel({project,projects,inboxItems}:{project:Project;projects:Project[];inboxItems:ControlInboxItem[]}){
  const [tab,setTab]=useState<ControlPanelTab>("chat");
  useEffect(()=>{const handler=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="open-global-inbox")setTab("inbox");else if(command==="open-global-intelligence")setTab("intelligence");else if(command==="start-agent")setTab("tasks");};window.addEventListener("control-command",handler);return()=>window.removeEventListener("control-command",handler);},[]);
  const coordinationTab=tab as CoordinationTab;
  return <div className="control-panel"><div className="control-panel-heading"><div><span>Control Intelligence</span><small>AI workspace</small></div><span className="control-online">● Ready</span></div><div className="control-panel-tabs">{(["chat","tasks","decisions","evidence","activity","intelligence","inbox"] as ControlPanelTab[]).map(item=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}{item==="inbox"&&inboxItems.length?` ${inboxItems.length}`:""}</button>)}</div><div className="control-panel-content">{tab==="tasks"?<TasksPanel projectId={project.id} projectPath={project.path}/>:tab==="inbox"?<GlobalInbox items={inboxItems} knownProjects={projects}/>:<CoordinationPanel key={coordinationTab} project={project} initialTab={coordinationTab} hideNavigation/>}</div></div>;
}
