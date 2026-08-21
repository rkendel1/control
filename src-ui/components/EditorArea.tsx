"use client";

import React, { useState, useRef, useEffect } from "react";
import { EditorTab, Workspace } from "../types";
import MonacoEditor from "./MonacoEditor";
import { invoke } from "../lib/tauri";
import { getControlDatabase } from "../lib/control-db";
import { getSecretRedactor } from "../lib/core/secret-redactor";
import { hasExternalFileConflict } from "../lib/editor-durability";
import "./EditorArea.css";

interface EditorAreaProps {
  openFiles: EditorTab[];
  activeFileId?: string;
  currentWorkspace?: Workspace | null;
  onFileClose: (path: string) => void;
  onFileSave: (path: string, content: string) => Promise<boolean>;
  onFileModified: (path: string, isDirty: boolean) => void;
  onFileOpen: (path: string) => void;
  targetPosition?:{line:number;column:number;revision?:number};
}

export default function EditorArea({
  openFiles,
  activeFileId,
  currentWorkspace,
  onFileClose,
  onFileSave,
  onFileModified,
  onFileOpen,
  targetPosition,
}: EditorAreaProps) {
  const [fileContents, setFileContents] = useState<Map<string, string>>(
    new Map()
  );
  const editorRef = useRef<any>(null);
  const [loadErrors, setLoadErrors] = useState<Map<string, string>>(new Map());
  const [saveConflict,setSaveConflict]=useState<string>();
  const draftTimers=useRef<Map<string,number>>(new Map());
  const pendingDrafts=useRef<Map<string,{projectId:string;path:string;content:string}>>(new Map());
  const diskContents=useRef<Map<string,string>>(new Map());

  const activeFile = openFiles.find((f) => f.id === activeFileId) || openFiles[0];

  const persistDraft=async(id:string,value:{projectId:string;path:string;content:string})=>{const drafts=getControlDatabase().drafts;if(await drafts.exists(id))await drafts.update(id,{content:value.content,updatedAt:Date.now()});else await drafts.insert({id,...value,updatedAt:Date.now()},id);pendingDrafts.current.delete(id);};

  useEffect(()=>{setFileContents(new Map());setLoadErrors(new Map());setSaveConflict(undefined);diskContents.current.clear();return()=>{for(const[id,timer]of draftTimers.current){window.clearTimeout(timer);const pending=pendingDrafts.current.get(id);if(pending)void persistDraft(id,pending);}draftTimers.current.clear();};},[currentWorkspace?.projectId]);

  useEffect(() => {
    if (!activeFile || !currentWorkspace || fileContents.has(activeFile.path)) return;

    let cancelled = false;
    const draftId=`${currentWorkspace.projectId}:${activeFile.path}`;
    void getControlDatabase().drafts.get(draftId).then(async draft=>{
      const response=await invoke<string>("cmd_file_read", {
      workspacePath: currentWorkspace.path,
      filePath: activeFile.path,
      });
      if (cancelled) return;
      if (response.success && response.data !== undefined) {
        diskContents.current.set(activeFile.path,response.data);
        setFileContents((previous) => new Map(previous).set(activeFile.path, draft?.content??response.data!));
        if(draft)onFileModified(activeFile.path,true);
        setLoadErrors((previous) => {
          const next = new Map(previous);
          next.delete(activeFile.path);
          return next;
        });
      } else if(draft){
        setFileContents(previous=>new Map(previous).set(activeFile.path,draft.content));
        onFileModified(activeFile.path,true);
      } else {
        setLoadErrors((previous) =>
          new Map(previous).set(activeFile.path, response.error || "Failed to read file")
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeFile?.path, currentWorkspace?.path, fileContents]);

  useEffect(() => {
    if (!currentWorkspace || openFiles.length === 0) return;
    const handleChange=(event:Event)=>{
      const change=(event as CustomEvent<{workspacePath:string;path:string;eventType:string}>).detail;
      if(change.workspacePath!==currentWorkspace.path)return;
      const file=openFiles.find(item=>item.path===change.path);
      if(!file)return;
      void invoke<string>("cmd_file_read",{workspacePath:currentWorkspace.path,filePath:file.path}).then(response=>{
        if(!response.success||response.data===undefined){
          if(file.isDirty)setSaveConflict(`${file.path} was removed or renamed outside Control. Your recovery draft is preserved.`);
          else {diskContents.current.delete(file.path);setLoadErrors(previous=>new Map(previous).set(file.path,response.error||"File was removed outside Control"));}
          return;
        }
        const editorContent=fileContents.get(file.path);
        if(file.isDirty&&editorContent!==response.data){setSaveConflict(`${file.path} changed outside Control. Review before saving; your editor contents were preserved.`);return;}
        diskContents.current.set(file.path,response.data);
        setLoadErrors(previous=>{const next=new Map(previous);next.delete(file.path);return next;});
        setFileContents(previous=>previous.get(file.path)===response.data?previous:new Map(previous).set(file.path,response.data!));
      });
    };
    window.addEventListener("control-workspace-file-change",handleChange);
    return()=>window.removeEventListener("control-workspace-file-change",handleChange);
  }, [currentWorkspace?.path, openFiles, fileContents]);

  const handleEditorChange = (content: string) => {
    if (activeFile) {
      setFileContents(new Map(fileContents).set(activeFile.path, content));
      onFileModified(activeFile.path, true);
      if(currentWorkspace){const id=`${currentWorkspace.projectId}:${activeFile.path}`,timers=draftTimers.current,prior=timers.get(id);if(prior)window.clearTimeout(prior);if(getSecretRedactor().containsSecrets(content)){timers.delete(id);pendingDrafts.current.delete(id);void getControlDatabase().drafts.delete(id);return;}const pending={projectId:currentWorkspace.projectId,path:activeFile.path,content};pendingDrafts.current.set(id,pending);timers.set(id,window.setTimeout(()=>{void persistDraft(id,pending);timers.delete(id);},300));}
    }
  };

  const handleSave = async () => {
    if (activeFile) {
      const content = fileContents.get(activeFile.path) || "";
      const id=`${currentWorkspace?.projectId}:${activeFile.path}`,timer=draftTimers.current.get(id);if(timer){window.clearTimeout(timer);draftTimers.current.delete(id);}
      pendingDrafts.current.delete(id);
      const disk=await invoke<string>("cmd_file_read",{workspacePath:currentWorkspace!.path,filePath:activeFile.path}),baseline=diskContents.current.get(activeFile.path);
      if(disk.success&&disk.data!==undefined&&hasExternalFileConflict(baseline,disk.data,content)&&!window.confirm(`${activeFile.path} changed outside Control. Overwrite those external changes with your editor contents?`)){setSaveConflict(`Save cancelled: ${activeFile.path} changed outside Control.`);if(!getSecretRedactor().containsSecrets(content))await persistDraft(id,{projectId:currentWorkspace!.projectId,path:activeFile.path,content});return;}
      if(await onFileSave(activeFile.path, content)){diskContents.current.set(activeFile.path,content);setSaveConflict(undefined);await getControlDatabase().drafts.delete(id);}else{const drafts=getControlDatabase().drafts;if(getSecretRedactor().containsSecrets(content)){await drafts.delete(id);return;}if(await drafts.exists(id))await drafts.update(id,{content,updatedAt:Date.now()});else await drafts.insert({id,projectId:currentWorkspace!.projectId,path:activeFile.path,content,updatedAt:Date.now()},id);}
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile, fileContents]);

  if (!currentWorkspace) {
    return (
      <div className="editor-area empty">
        <div className="editor-empty-state">
          <p>No workspace active</p>
        </div>
      </div>
    );
  }

  if (openFiles.length === 0) {
    return (
      <div className="editor-area empty">
        <div className="editor-empty-state">
          <p>No files open</p>
          <p className="secondary">Click a file in the explorer to open it</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-area">
      {saveConflict&&<div className="editor-conflict"><span>{saveConflict}</span><button onClick={()=>setSaveConflict(undefined)}>Dismiss</button></div>}
      {/* Tabs */}
      <div className="editor-tabs">
        {openFiles.map((file) => (
          <div
            key={file.id}
            className={`tab ${activeFileId === file.id ? "active" : ""} ${
              file.isDirty ? "dirty" : ""
            }`}
            onClick={() => onFileOpen(file.path)}
          >
            <span className="tab-name">{file.path.split("/").pop()}</span>
            {file.isDirty && <span className="tab-indicator">●</span>}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                if(!file.isDirty||window.confirm(`Close ${file.path} with unsaved changes? A recovery draft is retained unless it contains sensitive data.`))onFileClose(file.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Editor */}
      {activeFile && (
        loadErrors.has(activeFile.path) ? (
          <div className="editor-empty-state">{loadErrors.get(activeFile.path)}</div>
        ) : (
        <MonacoEditor
          ref={editorRef}
          path={activeFile.path}
          workspace={currentWorkspace}
          content={fileContents.get(activeFile.path) || ""}
          onChange={handleEditorChange}
          onSave={()=>void handleSave()}
          targetPosition={targetPosition}
        />
        )
      )}
    </div>
  );
}
