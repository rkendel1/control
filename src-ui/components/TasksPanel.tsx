"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createId, getControlDatabase, restartControlDatabase, LOCAL_PARTICIPANT_ID, type ControlIntelligence, type ControlEvidence, type ControlInboxItem, type ControlOutcome, type ControlRun, type ControlTask } from "@/lib/control-db";
import { dispatchTask } from "@/lib/agent-dispatch";
import { getSecretRedactor } from "@/lib/core/secret-redactor";
import type {Project} from "@/types";
import "./TasksPanel.css";
import FormDialog from "./FormDialog";
const weights: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const statusInfo:Record<ControlTask["status"],{label:string;detail:string;tone:string}>={
    "not-started":{label:"Queued",detail:"Ready to run",tone:"queued"},
    "in-progress":{label:"Running",detail:"Control Intelligence is working",tone:"running"},
    "awaiting-input":{label:"Needs input",detail:"Waiting for your answer",tone:"attention"},
    review:{label:"Needs review",detail:"Results are ready for you",tone:"review"},
    done:{label:"Completed",detail:"Work was accepted",tone:"completed"},
    failed:{label:"Failed",detail:"Open results to see what went wrong",tone:"failed"},
    stopped:{label:"Stopped",detail:"The run was stopped",tone:"stopped"},
    archived:{label:"Archived",detail:"Hidden from active work",tone:"archived"},
};
type TaskDialog = {mode:"edit"|"feedback"|"complete"|"reopen";task:ControlTask};
export default function TasksPanel({ projectId,projects=[] }: {
    projectId?: string;
    projectPath?: string;
    projects?:Project[];
}) {
    const db = getControlDatabase();
    const safe = (value: string) => getSecretRedactor().redact(value).redacted;
    const [tasks, setTasks] = useState<ControlTask[]>([]), [agents, setAgents] = useState<ControlIntelligence[]>([]);
    const [evidence, setEvidence] = useState<ControlEvidence[]>([]), [outcomes, setOutcomes] = useState<ControlOutcome[]>([]);
    const [runs,setRuns]=useState<ControlRun[]>([]);
    const [title, setTitle] = useState(""), [agentId, setAgentId] = useState(""), [priority, setPriority] = useState<ControlTask["priority"]>("medium"),[modelPreference,setModelPreference]=useState<NonNullable<ControlTask["modelPreference"]>>("auto"),[taskContext,setTaskContext]=useState(projectId||"global");
    const [filter, setFilter] = useState("open"), [sort, setSort] = useState("manual"), [autoRun, setAutoRun] = useState(false), [error, setError] = useState<string>(),[creating,setCreating]=useState(false),[notice,setNotice]=useState<string>();
    const [dialog,setDialog]=useState<TaskDialog>(),[dialogError,setDialogError]=useState<string>(),[savingDialog,setSavingDialog]=useState(false);
    const [taskDraft,setTaskDraft]=useState({description:"",criteria:"",tags:"",blockedBy:[] as string[],note:""});
    const [undoEdit,setUndoEdit]=useState<{task:ControlTask;fields:Pick<ControlTask,"description"|"acceptanceCriteria"|"tags"|"blockedBy">}>();
    const [expandedResults,setExpandedResults]=useState<Set<string>>(()=>new Set());
    const refreshVersion=useRef(0);
    useEffect(()=>{const draft=sessionStorage.getItem("control-task-draft");if(!draft)return;try{const value=JSON.parse(draft) as {title?:string;context?:string};if(value.title)setTitle(value.title);if(value.context)setTaskContext(value.context);}finally{sessionStorage.removeItem("control-task-draft");}},[]);
    const recoverData=async()=>{sessionStorage.setItem("control-task-draft",JSON.stringify({title,context:taskContext}));await restartControlDatabase();};
    const refresh = async () => {const version=++refreshVersion.current,isGlobal=taskContext==="global",contextProjectId=isGlobal?undefined:taskContext;const [allTasks,nextEvidence,nextOutcomes,nextRuns,nextAgents]=await Promise.all([isGlobal?db.tasks.all():contextProjectId?db.tasks.find({projectId:contextProjectId}):Promise.resolve([]),isGlobal?db.evidence.all():contextProjectId?db.evidence.find({projectId:contextProjectId}):Promise.resolve([]),isGlobal?db.outcomes.all():contextProjectId?db.outcomes.find({projectId:contextProjectId}):Promise.resolve([]),isGlobal?db.runs.all():contextProjectId?db.runs.find({projectId:contextProjectId}):Promise.resolve([]),db.intelligence.all()]);if(version!==refreshVersion.current)return;setTasks(allTasks.filter(item=>isGlobal?item.scope==="global":item.scope!=="global"));setEvidence(nextEvidence);setOutcomes(nextOutcomes);setRuns(nextRuns);setAgents(nextAgents.filter(a=>a.status==="active")); };
    useEffect(()=>{if(taskContext!=="global"&&!projects.some(item=>item.id===taskContext))setTaskContext(projectId||"global");},[projectId,projects,taskContext]);
    useEffect(() => { void refresh(); const stops = [db.tasks.subscribe(() => void refresh()), db.intelligence.subscribe(() => void refresh()), db.evidence.subscribe(() => void refresh()), db.outcomes.subscribe(() => void refresh()),db.runs.subscribe(()=>void refresh())]; return () => stops.forEach(stop => stop()); }, [taskContext]);
    const shown = useMemo(() => tasks.filter(t => filter === "all" || (filter === "open" ? !["done", "archived"].includes(t.status) : t.status === filter)).sort((a, b) => sort === "newest" ? b.createdAt - a.createdAt : sort === "status" ? a.status.localeCompare(b.status) : sort==="priority"?weights[a.priority] - weights[b.priority]:(a.order??a.createdAt)-(b.order??b.createdAt)), [tasks, filter, sort]);
    const run = async (task: ControlTask) => {
        setError(undefined);
        try {
            await dispatchTask(task.id);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const create = async () => {
        const requestedTitle=title.trim(),targetProjectId=taskContext==="global"?projectId:taskContext;if(!targetProjectId)return setError("Select a project before adding a task");if(!requestedTitle||creating)return;
        setCreating(true);setError(undefined);setNotice(undefined);
        try{const now = Date.now(), id = createId("task"), workId = createId("work");
        const nextOrder=tasks.reduce((highest,item)=>Math.max(highest,item.order??item.createdAt),0)+1;
        const task: ControlTask = { id, workId, projectId:targetProjectId,scope:taskContext==="global"?"global":"project", title: safe(requestedTitle), description: "", status: "not-started", assignedTo: agentId || undefined, priority, urgency: "normal", tags: [], blockedBy: [], acceptanceCriteria: [], feedback: [], modelPreference,order:nextOrder,createdAt: now, updatedAt: now };
        const bounded=<T,>(operation:Promise<T>,label:string)=>Promise.race([operation,new Promise<never>((_,reject)=>window.setTimeout(()=>reject(new Error(`${label} timed out. Check the task list before retrying.`)),5000))]);
        await bounded(db.works.insert({ id: workId, projectId:targetProjectId, title: task.title, intent: "", kind: "task", status: "captured", createdAt: now, updatedAt: now }, workId),"Creating task context");
        await bounded(db.tasks.insert(task, id),"Saving task");
        setTasks(current=>current.some(item=>item.id===id)?current:[...current,task]);
        setTitle("");setCreating(false);setNotice(`Added ${taskContext==="global"?"global task":`to ${projects.find(item=>item.id===targetProjectId)?.name||"project"}`}: ${task.title}`);window.setTimeout(()=>setNotice(undefined),3500);
        if (task.assignedTo) {
            const inboxId = createId("inbox");
            void db.inboxItems.insert({ id: inboxId, projectId:targetProjectId, workId, taskId: id, fromParticipantId: LOCAL_PARTICIPANT_ID, toParticipantId: task.assignedTo, type: "assignment", title: `Assigned: ${task.title}`, status: "open", createdAt: now, updatedAt: now }, inboxId);
        }
        const eventId = createId("activity");
        void db.activity.insert({ id: eventId, projectId:targetProjectId, workId, taskId: id, type: "task_created", actor: LOCAL_PARTICIPANT_ID, summary: `Task created: ${task.title}`, createdAt: now }, eventId);
        if (autoRun)
            await run(task);
        }catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setCreating(false);}
    };
    const patch = async (task: ControlTask, changes: Partial<ControlTask>) => { const updatedAt = Date.now(); await db.tasks.update(task.id, { ...changes, updatedAt }); if (changes.title !== undefined || changes.description !== undefined || changes.status !== undefined) {
        const status = changes.status === "done" ? "completed" : changes.status === "review" ? "review" : changes.status === "awaiting-input" ? "awaiting-input" : changes.status === "failed" ? "failed" : changes.status === "not-started" && task.status === "done" ? "reopened" : undefined;
        await db.works.update(task.workId, { title: changes.title, intent: changes.description, status, updatedAt, completedAt: changes.completedAt });
    } };
    const assign = async (task: ControlTask, toParticipantId: string) => { const previous = task.assignedTo, now = Date.now(); await patch(task, { assignedTo: toParticipantId || undefined }); if (!toParticipantId || toParticipantId === previous)
        return; const agent = agents.find(item => item.id === toParticipantId), type: ControlInboxItem["type"] = previous ? "handoff" : "assignment", id = createId("inbox"); await db.inboxItems.insert({ id, projectId: task.projectId, workId: task.workId, taskId: task.id, fromParticipantId: previous || LOCAL_PARTICIPANT_ID, toParticipantId, type, title: type === "handoff" ? `${task.title} handed off to ${agent?.name || toParticipantId}` : `${task.title} assigned to ${agent?.name || toParticipantId}`, body: task.description || undefined, status: "open", createdAt: now, updatedAt: now }, id); const activityId = createId("activity"); await db.activity.insert({ id: activityId, projectId: task.projectId, workId: task.workId, taskId: task.id, type: type === "handoff" ? "agent_handoff" : "task_assigned", actor: LOCAL_PARTICIPANT_ID, summary: type === "handoff" ? `${task.title}: ${previous} → ${toParticipantId}` : `${task.title} assigned to ${toParticipantId}`, createdAt: now }, activityId); };
    const openDialog=(mode:TaskDialog["mode"],task:ControlTask)=>{setDialog({mode,task});setDialogError(undefined);setTaskDraft({description:task.description,criteria:task.acceptanceCriteria.join("\n"),tags:task.tags.join(", "),blockedBy:[...task.blockedBy],note:mode==="complete"?(task.description||task.title):mode==="reopen"?"More work is required":""});};
    const saveTaskDialog=async()=>{if(!dialog||savingDialog)return;const {mode,task}=dialog;setSavingDialog(true);setDialogError(undefined);try{
        if(mode==="edit"){const criteria=taskDraft.criteria.split("\n").map(value=>safe(value.trim())).filter(Boolean),tags=[...new Set(taskDraft.tags.split(",").map(value=>safe(value.trim())).filter(Boolean))];setUndoEdit({task,fields:{description:task.description,acceptanceCriteria:task.acceptanceCriteria,tags:task.tags,blockedBy:task.blockedBy}});await patch(task,{description:safe(taskDraft.description.trim()),acceptanceCriteria:criteria,tags,blockedBy:taskDraft.blockedBy});setNotice(`Updated ${task.title}`);}
        else if(mode==="feedback"){const rawContent=taskDraft.note.trim();if(!rawContent)throw new Error("Describe what should change before sending feedback.");const content = safe(rawContent), now = Date.now(), item = { id: createId("feedback"), author: LOCAL_PARTICIPANT_ID, content, createdAt: now }; await patch(task, { feedback: [...task.feedback, item], status: "not-started" }); const outcomeId = createId("outcome"); await db.outcomes.insert({ id: outcomeId, projectId: task.projectId, workId: task.workId, taskId: task.id, status: "reopened", summary: content, evidenceIds: [], createdAt: now }, outcomeId); if (task.assignedTo) {
        const inboxId = createId("inbox");
        await db.inboxItems.insert({ id: inboxId, projectId: task.projectId, workId: task.workId, taskId: task.id, fromParticipantId: LOCAL_PARTICIPANT_ID, toParticipantId: task.assignedTo, type: "feedback", title: `Feedback on ${task.title}`, body: content, status: "open", createdAt: now, updatedAt: now }, inboxId);
    } for(const review of await db.inboxItems.find({workId:task.workId,toParticipantId:LOCAL_PARTICIPANT_ID,type:"review"}))if(review.status==="open"||review.status==="acknowledged")await db.inboxItems.update(review.id,{status:"acted",updatedAt:now,actedAt:now}); const id = createId("activity"); await db.activity.insert({ id, projectId: task.projectId, workId: task.workId, taskId: task.id, type: "feedback_added", actor: LOCAL_PARTICIPANT_ID, summary: `Feedback added: ${task.title}`, details: content, createdAt: now }, id); try{await dispatchTask(task.id);}catch(reason){setError(`Feedback saved, but the revision could not start: ${reason instanceof Error?reason.message:String(reason)}`);}}
        else if(mode==="complete"){if(!taskDraft.note.trim())throw new Error("Add a short completion note.");await db.completeTask(task.id,"manual",safe(taskDraft.note.trim()));}
        else {if(!taskDraft.note.trim())throw new Error("Add a reason for reopening this task.");await db.reopenTask(task.id,safe(taskDraft.note.trim()));}
        setDialog(undefined);
    }catch(reason){setDialogError(reason instanceof Error?reason.message:String(reason));}finally{setSavingDialog(false);}};
    const approve=async(task:ControlTask)=>{try{await db.completeTask(task.id,"approval",`Approved Intelligence work: ${task.title}`);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
    const archive=async(task:ControlTask)=>{try{await db.archiveTask(task.id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}};
    const restore=async(task:ControlTask)=>{try{await db.restoreTask(task.id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}};
    const move=async(task:ControlTask,direction:-1|1)=>{const ordered=[...shown],index=ordered.findIndex(item=>item.id===task.id),target=index+direction;if(index<0||target<0||target>=ordered.length)return;const other=ordered[target],base=Date.now(),firstOrder=task.order??index,secondOrder=other.order??target;await db.tasks.update(task.id,{order:secondOrder,updatedAt:base});await db.tasks.update(other.id,{order:firstOrder,updatedAt:base});setSort("manual");};
    const toggleResults=(taskId:string)=>setExpandedResults(current=>{const next=new Set(current);if(next.has(taskId))next.delete(taskId);else next.add(taskId);return next;});
    const counts=useMemo(()=>({queued:tasks.filter(task=>task.status==="not-started").length,running:tasks.filter(task=>task.status==="in-progress").length,attention:tasks.filter(task=>task.status==="review"||task.status==="awaiting-input"||task.status==="failed").length,completed:tasks.filter(task=>task.status==="done").length}),[tasks]);
    return <div className="tasks-panel">
        {dialog&&<FormDialog title={dialog.mode==="edit"?`Edit ${dialog.task.title}`:dialog.mode==="feedback"?`Request changes to ${dialog.task.title}`:dialog.mode==="complete"?`Complete ${dialog.task.title}`:`Reopen ${dialog.task.title}`} description={dialog.mode==="feedback"?"Your feedback is saved to the Work graph and immediately starts a revision.":undefined} submitLabel={dialog.mode==="feedback"?"Send feedback":dialog.mode==="complete"?"Mark complete":dialog.mode==="reopen"?"Reopen task":"Save changes"} disabled={savingDialog||(dialog.mode!=="edit"&&!taskDraft.note.trim())} onClose={()=>setDialog(undefined)} onSubmit={saveTaskDialog}>
            {dialog.mode==="edit"?<><label>Description<textarea value={taskDraft.description} onChange={event=>setTaskDraft(value=>({...value,description:event.target.value}))}/></label><label>Acceptance criteria<textarea value={taskDraft.criteria} onChange={event=>setTaskDraft(value=>({...value,criteria:event.target.value}))}/><small>One verifiable criterion per line.</small></label><label>Tags<input value={taskDraft.tags} onChange={event=>setTaskDraft(value=>({...value,tags:event.target.value}))} placeholder="frontend, reliability"/></label><fieldset className="task-blocker-field"><legend>Blocked by</legend>{tasks.filter(item=>item.id!==dialog.task.id&&item.status!=="done"&&item.status!=="archived").map(item=><label key={item.id}><input type="checkbox" checked={taskDraft.blockedBy.includes(item.id)} onChange={event=>setTaskDraft(value=>({...value,blockedBy:event.target.checked?[...value.blockedBy,item.id]:value.blockedBy.filter(id=>id!==item.id)}))}/><span>{item.title}</span></label>)}{tasks.every(item=>item.id===dialog.task.id||item.status==="done"||item.status==="archived")&&<small>No open tasks are available as blockers.</small>}</fieldset></>:<label>{dialog.mode==="feedback"?"Requested changes":dialog.mode==="complete"?"Completion note":"Reason"}<textarea value={taskDraft.note} onChange={event=>setTaskDraft(value=>({...value,note:event.target.value}))}/></label>}
            {dialogError&&<div className="field-error" role="alert">{dialogError}</div>}
        </FormDialog>}
        <div className="tasks-compose">
            <label className="task-context"><span>Context</span><select value={taskContext} onChange={event=>setTaskContext(event.target.value)}><option value="global">Global task</option>{projects.map(item=><option key={item.id} value={item.id}>Project · {item.name}</option>)}</select></label>
            <input className="tasks-input" placeholder="Capture a task…" value={title} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>event.key==="Enter"&&void create()}/>
            <div className="tasks-compose-row">
                <select value={agentId} onChange={event=>setAgentId(event.target.value)}><option value="">Control Intelligence (automatic)</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                <select value={priority} onChange={event=>setPriority(event.target.value as ControlTask["priority"])}>{(["critical","high","medium","low"] as const).map(value=><option key={value}>{value}</option>)}</select>
                <select title="Model routing" value={modelPreference} onChange={event=>setModelPreference(event.target.value as NonNullable<ControlTask["modelPreference"]>)}><option value="auto">AI: Automatic</option><option value="local">AI: Local</option><option value="frontier">AI: Frontier</option></select>
                <button className="tasks-add" disabled={creating||!title.trim()} onClick={()=>void create()}>{creating?"Adding…":"Add"}</button>
            </div>
            <label className="auto-dispatch"><input type="checkbox" checked={autoRun} onChange={event=>setAutoRun(event.target.checked)}/> Dispatch immediately</label>
        </div>
        <div className="tasks-controls">
            <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="open">Open</option><option value="not-started">Queued</option><option value="in-progress">Running</option><option value="review">Review</option><option value="done">Done</option><option value="archived">Archived</option><option value="all">All</option></select>
            <select value={sort} onChange={event=>setSort(event.target.value)}><option value="manual">Manual order</option><option value="priority">Priority</option><option value="newest">Newest</option><option value="status">Status</option></select>
        </div>
        <div className="task-status-overview" aria-label="Task status summary"><span><strong>{counts.queued}</strong> queued</span><span><strong>{counts.running}</strong> running</span><span className={counts.attention?"has-attention":""}><strong>{counts.attention}</strong> need you</span><span><strong>{counts.completed}</strong> completed</span></div>
        {error&&<div className="tasks-error">{error}{error.includes("timed out")&&<button onClick={()=>void recoverData()}>Restart data connection</button>}</div>}
        {notice&&<div className="tasks-notice">{notice}{undoEdit&&<button onClick={()=>{void patch(undoEdit.task,undoEdit.fields);setUndoEdit(undefined);setNotice("Edit undone");}}>Undo</button>}</div>}
        <div className="tasks-list">{shown.length===0?<div className="tasks-empty">No matching tasks</div>:shown.map(task=>{
            const workEvidence=evidence.filter(item=>item.workId===task.workId).sort((a,b)=>b.createdAt-a.createdAt),outcome=outcomes.filter(item=>item.workId===task.workId).sort((a,b)=>b.createdAt-a.createdAt)[0],latestRun=runs.filter(item=>item.taskId===task.id).sort((a,b)=>b.startedAt-a.startedAt)[0],status=statusInfo[task.status],expanded=expandedResults.has(task.id),resultSummary=outcome?.summary||latestRun?.error||latestRun?.summary;
            return <div className={`task-item task-${status.tone}`} key={task.id}>
                <div className="task-title">{task.title}</div><span className={`task-status ${status.tone}`}>{status.label}</span>
                <div className="task-state-detail">{status.detail}{task.blockedBy.length?` · blocked by ${task.blockedBy.length} task${task.blockedBy.length===1?"":"s"}`:""}</div><span className={`task-priority ${task.priority}`}>{task.priority}</span>
                {resultSummary&&<div className={`task-result-preview ${outcome?.status||latestRun?.status||"unknown"}`}><strong>{task.status==="review"?"Result ready":task.status==="done"?"Final result":task.status==="failed"?"What went wrong":"Latest result"}</strong><span>{resultSummary.length>180?`${resultSummary.slice(0,180)}…`:resultSummary}</span></div>}
                {(latestRun||outcome||workEvidence.length>0)&&<button className="task-results-toggle" aria-expanded={expanded} onClick={()=>toggleResults(task.id)}>{expanded?"Hide results":`View results${workEvidence.length?` · ${workEvidence.length} evidence`:""}`}</button>}
                {expanded&&<div className="task-results">
                    {outcome&&<section><h4>Outcome <span className={`result-state ${outcome.status}`}>{outcome.status.replace(/_/g," ")}</span></h4><p>{outcome.summary}</p></section>}
                    {latestRun&&<section><h4>Latest run <span className={`result-state ${latestRun.status}`}>{latestRun.status.replace(/-/g," ")}</span></h4><p>{latestRun.runtime}{latestRun.completedAt?` · ${new Date(latestRun.completedAt).toLocaleString()}`:""}</p>{latestRun.routingReason&&<small>{latestRun.routingReason}</small>}{latestRun.error&&<pre className="result-error">{latestRun.error}</pre>}{latestRun.summary&&<pre>{latestRun.summary}</pre>}</section>}
                    {workEvidence.length>0&&<section><h4>Evidence</h4>{workEvidence.map(item=><div className="task-evidence" key={item.id}><span className={`result-state ${item.result}`}>{item.result}</span><div><strong>{item.summary}</strong><small>{item.kind} · {item.provenance}</small></div></div>)}</section>}
                    {!outcome&&!latestRun&&!workEvidence.length&&<p>No result has been recorded yet.</p>}
                </div>}
                {task.description&&<div className="task-meta">{task.description}</div>}
                <select value={task.assignedTo||""} onChange={event=>void assign(task,event.target.value)}><option value="">Control Intelligence (automatic)</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                <select title="Model routing" value={task.modelPreference||"auto"} onChange={event=>void patch(task,{modelPreference:event.target.value as NonNullable<ControlTask["modelPreference"]>})}><option value="auto">AI: Automatic</option><option value="local">AI: Local</option><option value="frontier">AI: Frontier</option></select>
                <div className="task-actions"><button title="Move up" disabled={shown[0]?.id===task.id} onClick={()=>void move(task,-1)}>↑</button><button title="Move down" disabled={shown[shown.length-1]?.id===task.id} onClick={()=>void move(task,1)}>↓</button><button onClick={()=>openDialog("edit",task)}>Edit</button>{!["in-progress","done","review","archived"].includes(task.status)&&<button onClick={()=>void run(task)}>Run</button>}{task.status==="review"&&<><button onClick={()=>void approve(task)}>Approve</button><button onClick={()=>openDialog("feedback",task)}>Feedback</button></>}{!["done","review","archived"].includes(task.status)&&<button onClick={()=>openDialog("complete",task)}>Done</button>}{task.status==="done"&&<button onClick={()=>openDialog("reopen",task)}>Reopen</button>}{task.status!=="in-progress"&&(task.status==="archived"?<button onClick={()=>void restore(task)}>Restore</button>:<button onClick={()=>void archive(task)}>Archive</button>)}</div>
            </div>;
        })}</div>
    </div>;
}
