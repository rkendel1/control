"use client";
import React,{useEffect,useMemo,useState} from "react";
import type {ExplorerNode} from "../types";
import {filterQuickOpenPaths,quickOpenPaths} from "../lib/quick-open";
import "./CommandPalette.css";

export default function QuickOpen({tree,onOpen,onClose}:{tree:ExplorerNode[];onOpen:(path:string)=>void;onClose:()=>void}){
  const [query,setQuery]=useState(""),[selected,setSelected]=useState(0),paths=useMemo(()=>quickOpenPaths(tree),[tree]);
  const filtered=useMemo(()=>filterQuickOpenPaths(paths,query),[paths,query]);
  useEffect(()=>setSelected(0),[query]);
  const choose=(path?:string)=>{if(path){onOpen(path);onClose();}};
  return <div className="command-palette-overlay" onClick={onClose}><div className="command-palette" onClick={event=>event.stopPropagation()}>
    <div className="palette-header"><span className="palette-icon">⌘P</span><input className="palette-input" autoFocus placeholder="Search files by path…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Escape")onClose();else if(event.key==="ArrowDown"){event.preventDefault();setSelected(value=>Math.min(value+1,filtered.length-1));}else if(event.key==="ArrowUp"){event.preventDefault();setSelected(value=>Math.max(value-1,0));}else if(event.key==="Enter"){event.preventDefault();choose(filtered[selected]);}}}/></div>
    <div className="palette-results">{filtered.length?<div className="results-list">{filtered.map((path,index)=><div key={path} className={`result-item ${index===selected?"selected":""}`} onMouseEnter={()=>setSelected(index)} onClick={()=>choose(path)}><div className="result-main"><span className="result-label">{path.split("/").pop()}</span><span className="result-category">{path}</span></div></div>)}</div>:<div className="no-results">{paths.length?"No matching files":"No files in this project"}</div>}</div>
    <div className="palette-footer"><span className="footer-hint"><kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</span></div>
  </div></div>;
}
