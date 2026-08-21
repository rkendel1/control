"use client";
import React,{useEffect,useState} from "react";
import type {Project} from "../types";
import type {ControlInboxItem} from "../lib/control-db";
import CoordinationPanel,{type CoordinationTab} from "./CoordinationPanel";
import TasksPanel from "./TasksPanel";
import GlobalInbox from "./GlobalInbox";
import "./ControlPanel.css";

type ControlPanelTab="chat"|"tasks"|"decisions"|"evidence"|"activity"|"intelligence"|"inbox";
export default function ControlPanel({project,projects,inboxItems,expanded=false,onToggleExpanded}:{project:Project;projects:Project[];inboxItems:ControlInboxItem[];expanded?:boolean;onToggleExpanded?:()=>void}){
  const [tab,setTab]=useState<ControlPanelTab>("chat");
  useEffect(()=>{const handler=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="open-global-inbox")setTab("inbox");else if(command==="open-global-intelligence")setTab("intelligence");else if(command==="start-agent")setTab("tasks");};const inboxHandler=(event:Event)=>{const detail=(event as CustomEvent<{action:string;conversationId?:string;taskId?:string;title?:string}>).detail;if(detail.action==="task"){setTab("tasks");return;}setTab("chat");window.setTimeout(()=>window.dispatchEvent(new CustomEvent("control-conversation-action",{detail})),50);};window.addEventListener("control-command",handler);window.addEventListener("control-inbox-action",inboxHandler);return()=>{window.removeEventListener("control-command",handler);window.removeEventListener("control-inbox-action",inboxHandler);};},[]);
  const coordinationTab=tab as CoordinationTab;
  return <div className="control-panel"><div className="control-panel-heading"><div><span>Control Intelligence</span><small>{expanded?"Focused workspace":"AI workspace"}</small></div><div className="control-panel-heading-actions"><span className="control-online">● Ready</span>{onToggleExpanded&&<button className="control-expand" onClick={onToggleExpanded} title={expanded?"Restore workspace":"Expand AI workspace"} aria-label={expanded?"Restore AI workspace":"Expand AI workspace"}>{expanded?"↙ Restore":"↗ Expand"}</button>}</div></div><div className="control-panel-tabs">{(["chat","tasks","decisions","evidence","activity","intelligence","inbox"] as ControlPanelTab[]).map(item=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}{item==="inbox"&&inboxItems.length?` ${inboxItems.length}`:""}</button>)}</div><div className="control-panel-content">{tab==="tasks"?<TasksPanel projectId={project.id} projectPath={project.path} projects={projects}/>:tab==="inbox"?<GlobalInbox items={inboxItems} knownProjects={projects}/>:<CoordinationPanel key={coordinationTab} project={project} availableProjects={projects} initialTab={coordinationTab} hideNavigation scope="global"/>}</div></div>;
}
