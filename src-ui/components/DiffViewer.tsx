"use client";
import React,{useState} from "react";
import "./DiffViewer.css";

export default function DiffViewer({ patch,before,now }: { patch: string;before:string;now:string }) {
  const [view,setView]=useState<"changes"|"before"|"now"|"split">("changes");
  const lines=patch.split("\n");
  const added=lines.filter(line=>line.startsWith("+")&&!line.startsWith("+++")).length;
  const removed=lines.filter(line=>line.startsWith("-")&&!line.startsWith("---")).length;
  const file=(content:string,label:string)=><div className="file-version"><div className="file-version-label">{label}</div><pre>{content||"(file does not exist)"}</pre></div>;
  return <div className="diff-viewer"><div className="diff-toolbar"><div className="diff-stats"><span className="added">+{added} added</span><span className="removed">-{removed} removed</span></div><div className="diff-modes">{(["changes","before","now","split"] as const).map(mode=><button key={mode} className={view===mode?"active":""} onClick={()=>setView(mode)}>{mode}</button>)}</div></div>{view==="before"?file(before,"Before · HEAD"):view==="now"?file(now,"Now · working tree"):view==="split"?<div className="diff-split">{file(before,"Before · HEAD")}{file(now,"Now · working tree")}</div>:<table className="diff-table"><tbody>{lines.map((line,index)=>{const type=line.startsWith("+")&&!line.startsWith("+++")?"added":line.startsWith("-")&&!line.startsWith("---")?"removed":line.startsWith("@@")?"hunk":"context";return <tr key={index} className={`diff-line diff-${type}`}><td className="line-number old">{index+1}</td><td className="line-content"><pre>{line||" "}</pre></td></tr>;})}</tbody></table>}</div>;
}
