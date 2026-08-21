"use client";
import React from "react";
import "./DiffViewer.css";

export default function DiffViewer({ patch }: { patch: string }) {
  const lines=patch.split("\n");
  const added=lines.filter(line=>line.startsWith("+")&&!line.startsWith("+++")).length;
  const removed=lines.filter(line=>line.startsWith("-")&&!line.startsWith("---")).length;
  return <div className="diff-viewer"><div className="diff-stats"><span className="added">+{added} added</span><span className="removed">-{removed} removed</span></div><table className="diff-table"><tbody>{lines.map((line,index)=>{const type=line.startsWith("+")&&!line.startsWith("+++")?"added":line.startsWith("-")&&!line.startsWith("---")?"removed":line.startsWith("@@")?"hunk":"context";return <tr key={index} className={`diff-line diff-${type}`}><td className="line-number old">{index+1}</td><td className="line-content"><pre>{line||" "}</pre></td></tr>;})}</tbody></table></div>;
}
