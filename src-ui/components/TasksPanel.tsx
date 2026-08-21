"use client";
import React, { useEffect, useMemo, useState } from "react";
import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID, type ControlAgent, type ControlEvidence, type ControlInboxItem, type ControlOutcome, type ControlTask } from "@/lib/control-db";
import { dispatchTask } from "@/lib/agent-dispatch";
import { getSecretRedactor } from "@/lib/core/secret-redactor";
import "./TasksPanel.css";
const weights: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export default function TasksPanel({ projectId }: {
    projectId?: string;
    projectPath?: string;
}) {
    const db = getControlDatabase();
    const safe = (value: string) => getSecretRedactor().redact(value).redacted;
    const [tasks, setTasks] = useState<ControlTask[]>([]), [agents, setAgents] = useState<ControlAgent[]>([]);
    const [evidence, setEvidence] = useState<ControlEvidence[]>([]), [outcomes, setOutcomes] = useState<ControlOutcome[]>([]);
    const [title, setTitle] = useState(""), [agentId, setAgentId] = useState("developer"), [priority, setPriority] = useState<ControlTask["priority"]>("medium");
    const [filter, setFilter] = useState("open"), [sort, setSort] = useState("priority"), [autoRun, setAutoRun] = useState(false), [error, setError] = useState<string>();
    const refresh = async () => { setTasks(projectId ? await db.tasks.find({ projectId }) : []); setEvidence(projectId ? await db.evidence.find({ projectId }) : []); setOutcomes(projectId ? await db.outcomes.find({ projectId }) : []); setAgents((await db.agents.all()).filter(a => a.status === "active")); };
    useEffect(() => { void refresh(); const stops = [db.tasks.subscribe(() => void refresh()), db.agents.subscribe(() => void refresh()), db.evidence.subscribe(() => void refresh()), db.outcomes.subscribe(() => void refresh())]; return () => stops.forEach(stop => stop()); }, [projectId]);
    const shown = useMemo(() => tasks.filter(t => filter === "all" || (filter === "open" ? !["done", "archived"].includes(t.status) : t.status === filter)).sort((a, b) => sort === "newest" ? b.createdAt - a.createdAt : sort === "status" ? a.status.localeCompare(b.status) : weights[a.priority] - weights[b.priority]), [tasks, filter, sort]);
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
        if (!projectId || !title.trim())
            return;
        const now = Date.now(), id = createId("task"), workId = createId("work");
        const task: ControlTask = { id, workId, projectId, title: safe(title.trim()), description: "", status: "not-started", assignedTo: agentId || undefined, priority, urgency: "normal", tags: [], blockedBy: [], acceptanceCriteria: [], feedback: [], createdAt: now, updatedAt: now };
        await db.works.insert({ id: workId, projectId, title: task.title, intent: "", kind: "task", status: "captured", createdAt: now, updatedAt: now }, workId);
        await db.tasks.insert(task, id);
        if (task.assignedTo) {
            const inboxId = createId("inbox");
            await db.inboxItems.insert({ id: inboxId, projectId, workId, taskId: id, fromParticipantId: LOCAL_PARTICIPANT_ID, toParticipantId: task.assignedTo, type: "assignment", title: `Assigned: ${task.title}`, status: "open", createdAt: now, updatedAt: now }, inboxId);
        }
        const eventId = createId("activity");
        await db.activity.insert({ id: eventId, projectId, workId, taskId: id, type: "task_created", actor: LOCAL_PARTICIPANT_ID, summary: `Task created: ${task.title}`, createdAt: now }, eventId);
        setTitle("");
        if (autoRun)
            await run(task);
    };
    const patch = async (task: ControlTask, changes: Partial<ControlTask>) => { const updatedAt = Date.now(); await db.tasks.update(task.id, { ...changes, updatedAt }); if (changes.title !== undefined || changes.description !== undefined || changes.status !== undefined) {
        const status = changes.status === "done" ? "completed" : changes.status === "review" ? "review" : changes.status === "awaiting-input" ? "awaiting-input" : changes.status === "failed" ? "failed" : changes.status === "not-started" && task.status === "done" ? "reopened" : undefined;
        await db.works.update(task.workId, { title: changes.title, intent: changes.description, status, updatedAt, completedAt: changes.completedAt });
    } };
    const assign = async (task: ControlTask, toParticipantId: string) => { const previous = task.assignedTo, now = Date.now(); await patch(task, { assignedTo: toParticipantId || undefined }); if (!toParticipantId || toParticipantId === previous)
        return; const agent = agents.find(item => item.id === toParticipantId), type: ControlInboxItem["type"] = previous ? "handoff" : "assignment", id = createId("inbox"); await db.inboxItems.insert({ id, projectId: task.projectId, workId: task.workId, taskId: task.id, fromParticipantId: previous || LOCAL_PARTICIPANT_ID, toParticipantId, type, title: type === "handoff" ? `${task.title} handed off to ${agent?.name || toParticipantId}` : `${task.title} assigned to ${agent?.name || toParticipantId}`, body: task.description || undefined, status: "open", createdAt: now, updatedAt: now }, id); const activityId = createId("activity"); await db.activity.insert({ id: activityId, projectId: task.projectId, workId: task.workId, taskId: task.id, type: type === "handoff" ? "agent_handoff" : "task_assigned", actor: LOCAL_PARTICIPANT_ID, summary: type === "handoff" ? `${task.title}: ${previous} → ${toParticipantId}` : `${task.title} assigned to ${toParticipantId}`, createdAt: now }, activityId); };
    const edit = async (task: ControlTask) => {
        const description = window.prompt("Task description", task.description);
        if (description === null)
            return;
        const criteria = window.prompt("Acceptance criteria (one per line)", task.acceptanceCriteria.join("\n"));
        if (criteria === null)
            return;
        const tags = window.prompt("Tags (comma separated)", task.tags.join(", "));
        if (tags === null)
            return;
        const blockers = window.prompt(`Blocking task IDs (comma separated)\nAvailable:\n${tasks.filter(item => item.id !== task.id).map(item => `${item.id} — ${item.title}`).join("\n")}`, task.blockedBy.join(", "));
        if (blockers === null)
            return;
        await patch(task, { description: safe(description.trim()), acceptanceCriteria: criteria.split("\n").map(value => safe(value.trim())).filter(Boolean), tags: tags.split(",").map(value => safe(value.trim())).filter(Boolean), blockedBy: blockers.split(",").map(value => value.trim()).filter(Boolean) });
    };
    const feedback = async (task: ControlTask) => { const rawContent = window.prompt("What should the agent change?")?.trim(); if (!rawContent)
        return; const content = safe(rawContent), now = Date.now(), item = { id: createId("feedback"), author: LOCAL_PARTICIPANT_ID, content, createdAt: now }; await patch(task, { feedback: [...task.feedback, item], status: "not-started" }); const outcomeId = createId("outcome"); await db.outcomes.insert({ id: outcomeId, projectId: task.projectId, workId: task.workId, taskId: task.id, status: "reopened", summary: content, evidenceIds: [], createdAt: now }, outcomeId); if (task.assignedTo) {
        const inboxId = createId("inbox");
        await db.inboxItems.insert({ id: inboxId, projectId: task.projectId, workId: task.workId, taskId: task.id, fromParticipantId: LOCAL_PARTICIPANT_ID, toParticipantId: task.assignedTo, type: "feedback", title: `Feedback on ${task.title}`, body: content, status: "open", createdAt: now, updatedAt: now }, inboxId);
    } for(const review of await db.inboxItems.find({workId:task.workId,toParticipantId:LOCAL_PARTICIPANT_ID,type:"review"}))if(review.status==="open"||review.status==="acknowledged")await db.inboxItems.update(review.id,{status:"acted",updatedAt:now,actedAt:now}); const id = createId("activity"); await db.activity.insert({ id, projectId: task.projectId, workId: task.workId, taskId: task.id, type: "feedback_added", actor: LOCAL_PARTICIPANT_ID, summary: `Feedback added: ${task.title}`, details: content, createdAt: now }, id); if(!task.assignedTo){setError("Feedback saved. Assign an agent to start the revision.");return;} try{await dispatchTask(task.id);}catch(reason){setError(`Feedback saved, but the revision could not start: ${reason instanceof Error?reason.message:String(reason)}`);} };
    const approve=async(task:ControlTask)=>{try{await db.completeTask(task.id,"approval",`Approved agent work: ${task.title}`);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
    const complete=async(task:ControlTask)=>{const note=window.prompt("Completion note (what was accomplished?)",task.description||task.title);if(note===null)return;try{await db.completeTask(task.id,"manual",safe(note));}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
    const reopen=async(task:ControlTask)=>{const reason=window.prompt("Why is this task being reopened?","More work is required");if(reason===null)return;try{await db.reopenTask(task.id,safe(reason));}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}};
    const archive=async(task:ControlTask)=>{try{await db.archiveTask(task.id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}};
    const restore=async(task:ControlTask)=>{try{await db.restoreTask(task.id);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}};
    return <div className="tasks-panel">
        <div className="tasks-compose">
            <input className="tasks-input" placeholder="Capture a task…" value={title} onChange={event=>setTitle(event.target.value)} onKeyDown={event=>event.key==="Enter"&&void create()}/>
            <div className="tasks-compose-row">
                <select value={agentId} onChange={event=>setAgentId(event.target.value)}><option value="">Unassigned</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                <select value={priority} onChange={event=>setPriority(event.target.value as ControlTask["priority"])}>{(["critical","high","medium","low"] as const).map(value=><option key={value}>{value}</option>)}</select>
                <button className="tasks-add" onClick={()=>void create()}>Add</button>
            </div>
            <label className="auto-dispatch"><input type="checkbox" checked={autoRun} onChange={event=>setAutoRun(event.target.checked)}/> Dispatch immediately</label>
        </div>
        <div className="tasks-controls">
            <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="open">Open</option><option value="not-started">Queued</option><option value="in-progress">Running</option><option value="review">Review</option><option value="done">Done</option><option value="archived">Archived</option><option value="all">All</option></select>
            <select value={sort} onChange={event=>setSort(event.target.value)}><option value="priority">Priority</option><option value="newest">Newest</option><option value="status">Status</option></select>
        </div>
        {error&&<div className="tasks-error">{error}</div>}
        <div className="tasks-list">{shown.length===0?<div className="tasks-empty">No matching tasks</div>:shown.map(task=>{
            const workEvidence=evidence.filter(item=>item.workId===task.workId),outcome=outcomes.filter(item=>item.workId===task.workId).sort((a,b)=>b.createdAt-a.createdAt)[0];
            return <div className="task-item" key={task.id}>
                <div className="task-title">{task.title}</div><span className={`task-priority ${task.priority}`}>{task.priority}</span>
                <div className="task-meta">{task.status}{task.blockedBy.length?` · ${task.blockedBy.length} blockers`:""}{task.tags.length?` · ${task.tags.join(", ")}`:""}</div>
                <div className="task-meta">Work · {workEvidence.length} evidence{outcome?` · outcome ${outcome.status}`:""}</div>
                {task.description&&<div className="task-meta">{task.description}</div>}
                <select value={task.assignedTo||""} onChange={event=>void assign(task,event.target.value)}><option value="">Unassigned</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
                <div className="task-actions"><button onClick={()=>void edit(task)}>Edit</button>{!["in-progress","done","review","archived"].includes(task.status)&&<button onClick={()=>void run(task)}>Run</button>}{task.status==="review"&&<><button onClick={()=>void approve(task)}>Approve</button><button onClick={()=>void feedback(task)}>Feedback</button></>}{!["done","review","archived"].includes(task.status)&&<button onClick={()=>void complete(task)}>Done</button>}{task.status==="done"&&<button onClick={()=>void reopen(task)}>Reopen</button>}{task.status!=="in-progress"&&(task.status==="archived"?<button onClick={()=>void restore(task)}>Restore</button>:<button onClick={()=>void archive(task)}>Archive</button>)}</div>
            </div>;
        })}</div>
    </div>;
}
