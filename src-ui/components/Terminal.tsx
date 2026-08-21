"use client";
import React, { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@/lib/tauri";
import { Workspace, TerminalSession } from "../types";
import { createId, getControlDatabase, type ControlTerminal } from "../lib/control-db";
import { getSecretRedactor } from "../lib/core/secret-redactor";
import "./Terminal.css";

interface TerminalProps { workspace: Workspace | null; }
type TerminalEvent = { sessionId:string;eventType:"output"|"completed"|"failed"|"closed";output?:string;exitCode?:number };

function cleanTerminalOutput(output:string):string[]{
  return getSecretRedactor().redact(output).redacted
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g,"")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"")
    .replace(/\x1b[@-_]/g,"")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"")
    .replace(/\r/g,"").split("\n")
    .map(line=>line.replace(/[\uE000-\uF8FF\uFFFD]/g,"")).filter(line=>Boolean(line)&&line.trim()!=="%");
}
function compact(lines:string[]):string[]{return lines.reduce<string[]>((result,line)=>{if(result[result.length-1]!==line)result.push(line);return result;},[]);}

const eventQueues=new Map<string,Promise<void>>();
export default function Terminal({workspace}:TerminalProps){
  const [terminals,setTerminals]=useState<Map<string,TerminalSession>>(new Map());
  const [activeTerminalId,setActiveTerminalId]=useState("");
  const [sessionPids,setSessionPids]=useState<Map<string,number>>(new Map());
  const [sessionRevision,setSessionRevision]=useState(0);
  const [error,setError]=useState<string>();
  const hostRef=useRef<HTMLDivElement>(null),xtermRef=useRef<XTerm>(),fitRef=useRef<FitAddon>();
  const activeIdRef=useRef(""),pendingOutput=useRef<Map<string,string>>(new Map()),writeQueues=useRef<Map<string,Promise<void>>>(new Map());
  const readySessions=useRef<Set<string>>(new Set()),readyWaiters=useRef<Map<string,Array<()=>void>>>(new Map());
  const readinessTimers=useRef<Map<string,number>>(new Map());
  activeIdRef.current=activeTerminalId;

  useEffect(()=>{
    if(!workspace){setTerminals(new Map());return;}
    const collection=getControlDatabase().terminals;
    const load=async()=>{
      let records=await collection.find({projectId:workspace.projectId});
      if(!records.length){const now=Date.now(),id=createId("terminal"),record:ControlTerminal={id,projectId:workspace.projectId,name:"shell",type:"shell",cwd:workspace.path,history:[],isActive:true,createdAt:now,updatedAt:now};await collection.insert(record,id);records=[record];}
      setTerminals(new Map(records.map(record=>[record.id,{id:record.id,name:record.name,type:record.type,cwd:record.cwd,isActive:Boolean(record.isActive),history:compact(record.history.flatMap(cleanTerminalOutput))}])));
      setActiveTerminalId(current=>records.some(record=>record.id===current)?current:records.find(record=>record.isActive)?.id||records[0].id);
    };
    void load();return collection.subscribe(()=>void load());
  },[workspace?.projectId]);

  const activeTerminal=terminals.get(activeTerminalId);
  useEffect(()=>{
    if(!activeTerminal||sessionPids.has(activeTerminal.id))return;
    void invoke<number>("cmd_terminal_session_open",{sessionId:activeTerminal.id,cwd:activeTerminal.cwd}).then(response=>{
      if(response.success&&response.data)setSessionPids(current=>new Map(current).set(activeTerminal.id,response.data!));
      else setError(response.error||"Could not open terminal session");
    });
  },[activeTerminal?.id,activeTerminal?.cwd,sessionRevision]);

  const queueWrite=(sessionId:string,input:string)=>{
    const prior=writeQueues.current.get(sessionId)||Promise.resolve();
    const next=prior.catch(()=>undefined).then(async()=>{if(!readySessions.current.has(sessionId))await new Promise<void>((resolve,reject)=>{const waiters=readyWaiters.current.get(sessionId)||[];waiters.push(resolve);readyWaiters.current.set(sessionId,waiters);window.setTimeout(()=>{const current=readyWaiters.current.get(sessionId)||[],index=current.indexOf(resolve);if(index>=0)current.splice(index,1);reject(new Error("Terminal shell did not become ready"));},10_000);});const response=await invoke<boolean>("cmd_terminal_session_write",{sessionId,input});if(!response.success)throw new Error(response.error||"Terminal input failed");});
    writeQueues.current.set(sessionId,next);void next.catch(reason=>setError(reason instanceof Error?reason.message:String(reason))).finally(()=>{if(writeQueues.current.get(sessionId)===next)writeQueues.current.delete(sessionId);});
  };

  useEffect(()=>{
    let stop:(()=>void)|undefined;
    void listen<TerminalEvent>("terminal-event",({payload})=>{
      if(payload.eventType==="output"&&payload.output){const priorTimer=readinessTimers.current.get(payload.sessionId);if(priorTimer)window.clearTimeout(priorTimer);readinessTimers.current.set(payload.sessionId,window.setTimeout(()=>{readySessions.current.add(payload.sessionId);readinessTimers.current.delete(payload.sessionId);for(const resolve of readyWaiters.current.get(payload.sessionId)||[])resolve();readyWaiters.current.delete(payload.sessionId);if(activeIdRef.current===payload.sessionId&&xtermRef.current){xtermRef.current.options.disableStdin=false;xtermRef.current.focus();}},350));if(activeIdRef.current===payload.sessionId)xtermRef.current?.write(payload.output);}
      const prior=eventQueues.get(payload.sessionId)||Promise.resolve();
      const next=prior.catch(()=>undefined).then(async()=>{
        if(payload.eventType==="output"&&payload.output){
          const combined=(pendingOutput.current.get(payload.sessionId)||"")+payload.output,boundary=combined.lastIndexOf("\n");
          if(boundary<0&&combined.length<4096){pendingOutput.current.set(payload.sessionId,combined);return;}
          const ready=boundary>=0?combined.slice(0,boundary+1):combined;pendingOutput.current.set(payload.sessionId,boundary>=0?combined.slice(boundary+1):"");
          const record=await getControlDatabase().terminals.get(payload.sessionId);if(record)await getControlDatabase().terminals.update(record.id,{history:compact([...record.history,...cleanTerminalOutput(ready)]).slice(-5000),updatedAt:Date.now()});
        }
        if(payload.eventType==="closed"){
          const tail=pendingOutput.current.get(payload.sessionId);pendingOutput.current.delete(payload.sessionId);
          if(tail){const record=await getControlDatabase().terminals.get(payload.sessionId);if(record)await getControlDatabase().terminals.update(record.id,{history:compact([...record.history,...cleanTerminalOutput(tail)]).slice(-5000),updatedAt:Date.now()});}
          const readinessTimer=readinessTimers.current.get(payload.sessionId);if(readinessTimer)window.clearTimeout(readinessTimer);readinessTimers.current.delete(payload.sessionId);readySessions.current.delete(payload.sessionId);readyWaiters.current.delete(payload.sessionId);setSessionPids(current=>{const next=new Map(current);next.delete(payload.sessionId);return next;});setSessionRevision(value=>value+1);
        }
      });
      eventQueues.set(payload.sessionId,next);void next.catch(reason=>setError(reason instanceof Error?reason.message:String(reason))).finally(()=>{if(eventQueues.get(payload.sessionId)===next)eventQueues.delete(payload.sessionId);});
    }).then(unlisten=>stop=unlisten);return()=>stop?.();
  },[]);

  useEffect(()=>{
    const host=hostRef.current,session=terminals.get(activeTerminalId);if(!host||!session)return;
    const terminal=new XTerm({cursorBlink:true,convertEol:false,disableStdin:!readySessions.current.has(session.id),scrollback:5000,fontSize:12,fontFamily:'"Fira Code", "Cascadia Code", monospace',theme:{background:"#1e1e1e",foreground:"#e0e0e0",cursor:"#cccccc"}}),fit=new FitAddon();
    terminal.loadAddon(fit);terminal.open(host);xtermRef.current=terminal;fitRef.current=fit;
    if(session.history.length)terminal.write(session.history.join("\r\n")+"\r\n");
    const send=terminal.onData(data=>{queueWrite(session.id,data);if(data.includes("\r"))window.setTimeout(()=>void invoke<string>("cmd_terminal_session_cwd",{sessionId:session.id}).then(async response=>{if(response.success&&response.data){const record=await getControlDatabase().terminals.get(session.id);if(record&&record.cwd!==response.data)await getControlDatabase().terminals.update(session.id,{cwd:response.data!,updatedAt:Date.now()});}}),100);});
    const resize=terminal.onResize(size=>void invoke("cmd_terminal_session_resize",{sessionId:session.id,rows:size.rows,cols:size.cols}));
    const observer=new ResizeObserver(()=>{try{fit.fit();}catch{/* terminal may be disposing */}});observer.observe(host);requestAnimationFrame(()=>{fit.fit();terminal.focus();});
    return()=>{observer.disconnect();send.dispose();resize.dispose();terminal.dispose();if(xtermRef.current===terminal)xtermRef.current=undefined;if(fitRef.current===fit)fitRef.current=undefined;};
  },[activeTerminalId]);

  const createTerminal=async(type:"shell"|"test"|"agent")=>{
    if(!workspace)return undefined;const now=Date.now(),id=createId("terminal"),name=type==="shell"?"shell":type==="test"?"tests":"agent";
    for(const record of await getControlDatabase().terminals.find({projectId:workspace.projectId}))if(record.isActive)await getControlDatabase().terminals.update(record.id,{isActive:false,updatedAt:now});
    await getControlDatabase().terminals.insert({id,projectId:workspace.projectId,name,type,cwd:workspace.path,history:[],isActive:true,createdAt:now,updatedAt:now},id);setActiveTerminalId(id);return id;
  };
  const selectTerminal=async(id:string)=>{setActiveTerminalId(id);if(!workspace)return;for(const record of await getControlDatabase().terminals.find({projectId:workspace.projectId}))if(Boolean(record.isActive)!==(record.id===id))await getControlDatabase().terminals.update(record.id,{isActive:record.id===id,updatedAt:Date.now()});};
  const closeTerminal=async(id:string)=>{await invoke("cmd_terminal_session_close",{sessionId:id});const readinessTimer=readinessTimers.current.get(id);if(readinessTimer)window.clearTimeout(readinessTimer);readinessTimers.current.delete(id);pendingOutput.current.delete(id);writeQueues.current.delete(id);readySessions.current.delete(id);readyWaiters.current.delete(id);await getControlDatabase().terminals.delete(id);};
  useEffect(()=>{const runTests=async()=>{if(!workspace)return setError("Open a project before running tests");setError(undefined);const response=await invoke<string>("cmd_project_test_command",{workspacePath:workspace.path});if(!response.success||!response.data)return setError(response.error||"No test command detected");const sessionId=activeTerminalId||await createTerminal("test");if(!sessionId)return setError("Could not create a test terminal");queueWrite(sessionId,`${response.data}\r`);};const handler=(event:Event)=>{const command=(event as CustomEvent<string>).detail;if(command==="new-terminal")void createTerminal("shell");else if(command==="run-tests")void runTests();};window.addEventListener("control-command",handler);return()=>window.removeEventListener("control-command",handler);},[workspace?.projectId,workspace?.path,activeTerminalId]);

  if(!activeTerminal)return <div className="terminal-container empty"><p>No terminal active</p></div>;
  return <div className="terminal">
    <div className="terminal-tabs">{Array.from(terminals.values()).map(term=><button key={term.id} className={`terminal-tab ${activeTerminalId===term.id?"active":""}`} onClick={()=>void selectTerminal(term.id)}><span>{term.name}</span><span className="terminal-tab-close" onClick={event=>{event.stopPropagation();void closeTerminal(term.id);}}>×</span></button>)}<button className="terminal-new-button" onClick={()=>void createTerminal("shell")} title="New terminal">+</button><span className="terminal-cwd" title={activeTerminal.cwd}>{activeTerminal.cwd}</span><button className="terminal-stop" onClick={()=>queueWrite(activeTerminal.id,"\u0003")}>Interrupt</button></div>
    {error&&<div className="terminal-error"><span>{error}</span><button onClick={()=>setError(undefined)}>×</button></div>}
    <div className="terminal-xterm" ref={hostRef}/>
  </div>;
}
