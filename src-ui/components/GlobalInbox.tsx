import React,{useEffect,useState} from "react";
import {getControlDatabase,type ControlInboxItem,type ControlParticipant,type ControlWork} from "../lib/control-db";
import type {Project} from "../types";
import "./CoordinationPanel.css";

export default function GlobalInbox({items,knownProjects}:{items:ControlInboxItem[];knownProjects:Project[]}){
  const db=getControlDatabase(),[people,setPeople]=useState<ControlParticipant[]>([]),[works,setWorks]=useState<ControlWork[]>([]);
  const refresh=async()=>{const [participants,allWorks]=await Promise.all([db.participants.all(),db.works.all()]);setPeople(participants);setWorks(allWorks);};
  useEffect(()=>{void refresh();const stops=[db.participants.subscribe(()=>void refresh()),db.works.subscribe(()=>void refresh())];return()=>stops.forEach(stop=>stop());},[]);
  const newCount=items.filter(item=>item.status==="open").length;
  return <div className="decision-list global-inbox"><div className="scope-heading"><strong>Global Inbox</strong><span>{newCount} new · {items.length} open across {new Set(items.map(item=>item.projectId)).size} projects</span></div>{!items.length&&<div className="coordination-empty">Global inbox clear</div>}{items.map(item=><div className={`decision-card inbox-card inbox-${item.type} ${item.status==="open"?"is-new":"is-read"}`} key={item.id}><strong><span className="inbox-type-dot"/>{item.type}: {item.title}{item.status==="open"&&<span className="new-label">New</span>}</strong><p>{knownProjects.find(project=>project.id===item.projectId)?.name||"Unknown project"} · {works.find(work=>work.id===item.workId)?.title||"Work"}</p><p>{people.find(person=>person.id===item.fromParticipantId)?.name||item.fromParticipantId} → you</p>{item.body&&<div className="run-summary">{item.body}</div>}<div className="decision-options">{item.status==="open"&&<button onClick={()=>void db.inboxItems.update(item.id,{status:"acknowledged",updatedAt:Date.now()})}>Acknowledge</button>}<button onClick={()=>void db.inboxItems.update(item.id,{status:"acted",updatedAt:Date.now(),actedAt:Date.now()})}>Done</button></div></div>)}</div>;
}
