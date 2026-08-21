"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { EmbeddedOperation } from "@feltdb/core";
import { invoke } from "../lib/tauri";
import { createId, getControlDatabase, getControlDataTopology, migrateControlToLocal, migrateControlToServer, LOCAL_PARTICIPANT_ID, type ControlBackup, type ControlActivity, type ControlAgent, type ControlChangeSet, type ControlConversation, type ControlDecision, type ControlEvidence, type ControlInboxItem, type ControlInvestigation, type ControlMessage, type ControlMetadata, type ControlOutcome, type ControlParticipant, type ControlRun, type ControlRunEvent, type ControlTask, type ControlTestResult, type ControlWork } from "../lib/control-db";
import { dispatchTask } from "../lib/agent-dispatch";
import { Project } from "../types";
import "./CoordinationPanel.css";
import { getSecretRedactor } from "../lib/core/secret-redactor";
import {runtimePresetError,type RuntimePreset} from "../lib/runtime-policy";
import {assessModelRouting} from "../lib/model-routing";
import {parseCreateProjectIntent} from "../lib/project-intent";
export type CoordinationTab = "chat" | "intelligence" | "inbox" | "decisions" | "evidence" | "activity";
type RuntimeAvailability = {
    id: string;
    available: boolean;
    path?: string;
    model?: string;
};
type ProviderCredentialStatus={provider:string;environmentVariable:string;configured:boolean};
export default function CoordinationPanel({ project,availableProjects=[project],initialTab="chat",hideNavigation=false,scope="project" }: {
    project: Project;
    availableProjects?:Project[];
    initialTab?:CoordinationTab;
    hideNavigation?:boolean;
    scope?:"global"|"project";
}) {
    const db = getControlDatabase();
    const topology = getControlDataTopology();
    const safe = (value: string) => getSecretRedactor().redact(value).redacted;
    const [tab, setTab] = useState<CoordinationTab>(initialTab), [agents, setAgents] = useState<ControlAgent[]>([]), [tasks, setTasks] = useState<ControlTask[]>([]), [runs, setRuns] = useState<ControlRun[]>([]), [runEvents, setRunEvents] = useState<ControlRunEvent[]>([]), [activity, setActivity] = useState<ControlActivity[]>([]), [conversations, setConversations] = useState<ControlConversation[]>([]), [messages, setMessages] = useState<ControlMessage[]>([]), [decisions, setDecisions] = useState<ControlDecision[]>([]);
    const [works, setWorks] = useState<ControlWork[]>([]), [participants, setParticipants] = useState<ControlParticipant[]>([]), [inboxItems, setInboxItems] = useState<ControlInboxItem[]>([]), [investigations, setInvestigations] = useState<ControlInvestigation[]>([]), [evidence, setEvidence] = useState<ControlEvidence[]>([]), [outcomes, setOutcomes] = useState<ControlOutcome[]>([]);
    const [changeSets,setChangeSets]=useState<ControlChangeSet[]>([]),[testResults,setTestResults]=useState<ControlTestResult[]>([]);
    const [databaseMetadata,setDatabaseMetadata]=useState<ControlMetadata>();
    const [activeId, setActiveId] = useState<string>(), [selectedRunId, setSelectedRunId] = useState<string>(), [input, setInput] = useState(""), [sending, setSending] = useState(false), [error, setError] = useState<string>();
    const [editingAgentId,setEditingAgentId]=useState<string>(),[agentDraft,setAgentDraft]=useState({instructions:"",runtime:"auto",preset:"local" as RuntimePreset,timeout:60});
    const [editingIdentity,setEditingIdentity]=useState(false),[identityName,setIdentityName]=useState("");
    const [creatingConversation,setCreatingConversation]=useState(false),[conversationTitle,setConversationTitle]=useState(""),[conversationContextId,setConversationContextId]=useState("");
    const [conversationScope,setConversationScope]=useState(scope==="global"?"global":project.id);
    const [runtimeAvailability, setRuntimeAvailability] = useState<RuntimeAvailability[]>([]);
    const [providerCredentials,setProviderCredentials]=useState<ProviderCredentialStatus[]>([]),[editingProvider,setEditingProvider]=useState<string>(),[providerSecret,setProviderSecret]=useState("");
    const firstSendInFlight=useRef(false);
    const fallbackAgent=useMemo<ControlAgent>(()=>({id:"control-intelligence",name:"Control Intelligence",description:"Automatic local-first intelligence",instructions:"Help with planning, brainstorming, project creation, and software work.",capabilities:["planning","implementation"],status:"active",timeoutMinutes:60,executionPolicy:{filesystem:"workspace-write",shell:true,network:true},createdAt:Date.now(),updatedAt:Date.now()}),[]);
    const active = useMemo(() => conversations.find(c => c.id === activeId), [conversations, activeId]);
    useEffect(()=>setTab(initialTab),[initialTab]);
    const refresh = async () => { const [a, t, r, runLog, changes,tests,events, c, d, w, people, inbox, i, e, o,metadata] = await Promise.all([db.agents.all(), db.tasks.find({ projectId: project.id }), db.runs.find({ projectId: project.id }), db.runEvents.find({ projectId: project.id }),db.changeSets.find({projectId:project.id}),db.testResults.find({projectId:project.id}), db.activity.find({ projectId: project.id }), db.conversations.find({ projectId: project.id }), db.decisions.find({ projectId: project.id }), db.works.find({ projectId: project.id }), db.participants.all(), db.inboxItems.find({ projectId: project.id }), db.investigations.find({ projectId: project.id }), db.evidence.find({ projectId: project.id }), db.outcomes.find({ projectId: project.id }),db.metadata.get("database")]); setAgents(a); setParticipants(people); setTasks(t); const orderedRuns=r.sort((x, y) => y.startedAt - x.startedAt); setRuns(orderedRuns); setRunEvents(runLog.sort((x,y)=>x.createdAt-y.createdAt));setChangeSets(changes);setTestResults(tests);setDatabaseMetadata(metadata||undefined); setSelectedRunId(id=>orderedRuns.some(item=>item.id===id)?id:orderedRuns[0]?.id); setActivity(events.sort((x, y) => y.createdAt - x.createdAt)); setConversations(c.sort((x, y) => y.updatedAt - x.updatedAt)); setDecisions(d.sort((x, y) => y.createdAt - x.createdAt)); setWorks(w); setInboxItems(inbox.sort((x, y) => y.createdAt - x.createdAt)); setInvestigations(i.sort((x, y) => y.updatedAt - x.updatedAt)); setEvidence(e.sort((x, y) => y.createdAt - x.createdAt)); setOutcomes(o.sort((x, y) => y.createdAt - x.createdAt)); setActiveId(id => c.some(item => item.id === id) ? id : c[0]?.id); };
    const refreshMessages = async (id?: string) => setMessages(id ? (await db.messages.find({ conversationId: id })).sort((a, b) => a.createdAt - b.createdAt) : []);
    useEffect(() => { void refresh(); const stops = [db.agents.subscribe(() => void refresh()), db.participants.subscribe(() => void refresh()), db.tasks.subscribe(() => void refresh()), db.runs.subscribe(() => void refresh()), db.runEvents.subscribe(() => void refresh()),db.changeSets.subscribe(()=>void refresh()),db.testResults.subscribe(()=>void refresh()), db.activity.subscribe(() => void refresh()), db.conversations.subscribe(() => void refresh()), db.decisions.subscribe(() => void refresh()), db.works.subscribe(() => void refresh()), db.inboxItems.subscribe(() => void refresh()), db.investigations.subscribe(() => void refresh()), db.evidence.subscribe(() => void refresh()), db.outcomes.subscribe(() => void refresh()),db.metadata.subscribe(()=>void refresh())]; return () => stops.forEach(stop => stop()); }, [project.id]);
    const refreshProviderCredentials=()=>void invoke<ProviderCredentialStatus[]>("cmd_provider_credentials_list").then(response=>response.success&&response.data&&setProviderCredentials(response.data));
    useEffect(() => { void invoke<RuntimeAvailability[]>("cmd_runtime_availability").then(response => response.success && response.data && setRuntimeAvailability(response.data));refreshProviderCredentials(); }, []);
    const saveProviderCredential=async(provider:string)=>{if(!providerSecret.trim())return setError("API key is required");const response=await invoke("cmd_provider_credential_set",{provider,credential:providerSecret.trim()});if(!response.success)return setError(response.error||"Could not save provider credential");setProviderSecret("");setEditingProvider(undefined);setError(undefined);refreshProviderCredentials();};
    const removeProviderCredential=async(provider:string)=>{const response=await invoke("cmd_provider_credential_delete",{provider});if(!response.success)return setError(response.error||"Could not remove provider credential");refreshProviderCredentials();};
    useEffect(() => {
        void refreshMessages(activeId);
        if (!activeId)
            return;
        return db.messages.subscribe(() => void refreshMessages(activeId));
    }, [activeId]);
    const createConversation = async (requestedTitle?:string):Promise<ControlConversation|undefined> => {
        const activeAgents = agents.filter(item => item.status === "active"), agent = activeAgents.find(item=>item.id==="control-intelligence")||activeAgents[0]||fallbackAgent;
        const title = (requestedTitle||conversationTitle||"New conversation").trim();
        if (!title)
            return;
        if(requestedTitle){
            const existing=conversations.find(item=>item.title===title&&!item.taskId&&(item.scope||"project")===(conversationScope==="global"?"global":"project"));
            if(existing){setActiveId(existing.id);setTab("chat");setError(undefined);return existing;}
        }
        const agentId = agent.id;
        const contexts = [...tasks.map(task => ({ id: task.id, label: task.title, workId: task.workId, taskId: task.id })), ...investigations.map(item => ({ id: item.id, label: item.question, workId: item.workId, taskId: undefined }))];
        const contextId=conversationContextId||undefined, context = contexts.find(item => item.id === contextId);
        if (contextId && !context)
            {setError("Unknown Work context");return;}
        const now = Date.now(), id = createId("conversation"),workId=context?.workId||createId("work");
        const targetProject=availableProjects.find(item=>item.id===conversationScope)||project;
        if(!context)await db.works.insert({id:workId,projectId:targetProject.id,title,intent:"Conversation with Control Intelligence",kind:"investigation",status:"active",createdAt:now,updatedAt:now},workId);
        const conversation:ControlConversation={ id, projectId: targetProject.id, workId, taskId: context?.taskId, agentId, intelligenceId:agentId, title,scope:conversationScope==="global"?"global":"project", createdAt: now, updatedAt: now };
        await db.conversations.insert(conversation, id);
        setActiveId(id);
        setTab("chat");
        setCreatingConversation(false);setConversationTitle("");setConversationContextId("");setError(undefined);
        return conversation;
    };
    const sendMessage = async (rawContent:string,retryMessage?:ControlMessage,conversationOverride?:ControlConversation) => {
        const conversation=conversationOverride||active;
        if (!conversation || !rawContent.trim() || sending)
            return;
        const agent = agents.find(a => a.id === conversation.agentId)||fallbackAgent;
        const content = rawContent.trim(), safeContent = safe(content);
        if(!retryMessage)setInput("");
        setSending(true);
        setError(undefined);
        let userId=retryMessage?.id,runId:string|undefined;
        try {
            const now = Date.now();
            if(userId){
                await db.messages.update(userId,{deliveryStatus:"pending",error:undefined});
                setMessages(current=>current.map(message=>message.id===userId?{...message,deliveryStatus:"pending",error:undefined}:message));
            }
            else {
                userId=createId("message");
                const pendingMessage:ControlMessage={ id: userId, conversationId: conversation.id, senderId: LOCAL_PARTICIPANT_ID, role: "user", type: "message", content: safeContent, deliveryStatus:"pending",createdAt: now };
                setMessages(current=>current.some(message=>message.id===pendingMessage.id)?current:[...current,pendingMessage]);
                await db.messages.insert(pendingMessage, userId);
            }
            await db.conversations.update(conversation.id, { updatedAt: now });
            const history = messages.filter(message=>message.id!==userId).slice(-20).map(m => `${m.role}: ${m.content}`).join("\n");
            const task = tasks.find(item => item.id === conversation.taskId), work = works.find(item => item.id === conversation.workId), investigation = investigations.find(item => item.workId === conversation.workId);
            const targetProject=availableProjects.find(item=>item.id===conversation.projectId)||project;
            const instructions = [agent.instructions,conversation.scope==="global"?`Global conversation. It is not bound to one repository. Known projects: ${availableProjects.map(item=>`${item.name} (${item.path})`).join(", ")}. Brainstorm freely and ask before changing project files.`:"", work ? `Related Work: ${work.title}\nIntent: ${work.intent}` : "", task ? `Related task: ${task.title}\n${task.description}\nAcceptance criteria:\n${task.acceptanceCriteria.map(item => `- ${item}`).join("\n")}` : "", investigation ? `Investigation: ${investigation.question}\nHypotheses: ${investigation.hypotheses.join("; ")}\nSources: ${investigation.sources.join("; ")}\nContradictions: ${investigation.contradictions.join("; ")}\nGaps: ${investigation.gaps.join("; ")}\nConclusion: ${investigation.conclusion || "open"}` : ""].filter(Boolean).join("\n\n");
            if(!conversation.workId)throw new Error("Conversation Work context is unavailable");
            const conversationRuns=runs.filter(item=>item.conversationId===conversation.id),routing=assessModelRouting({title:content,description:history,failedRuns:conversationRuns.filter(item=>item.status==="failed").length});
            const preferredRuntime=agent.runtime||routing.tier;
            runId=createId("run");await db.runs.insert({id:runId,projectId:project.id,workId:conversation.workId,taskId:conversation.taskId,kind:"conversation",conversationId:conversation.id,requestMessageId:userId,agentId:agent.id,runtime:"resolving",routingTier:routing.tier,routingReason:agent.runtime?`${agent.runtime} — Intelligence profile override`:routing.reason,status:"starting",startedAt:now},runId);
            await db.messages.update(userId,{runId});
            const response = await invoke<{pid:number;runtime:string;processStartedAt:number}>("cmd_agent_chat", { runId,projectPath: targetProject.path, projectName: conversation.scope==="global"?"Global workspace":targetProject.name, agentName: agent.name, agentInstructions: instructions, history, content, preferredRuntime,executionTimeoutMinutes:agent.timeoutMinutes });
            if(!response.success||!response.data)throw new Error(response.error || "Agent response failed");
            const launchedRun=await db.runs.get(runId);if(launchedRun?.status==="starting")await db.runs.update(runId,{runtime:response.data.runtime,status:"running",pid:response.data.pid,processStartedAt:response.data.processStartedAt});
            const activityId=createId("activity");await db.activity.insert({id:activityId,projectId:project.id,workId:conversation.workId,taskId:conversation.taskId,runId,type:"conversation_started",actor:agent.id,summary:`${agent.name} started a response in ${conversation.title}`,createdAt:now},activityId);
        }
        catch (reason) {
            const message=safe(reason instanceof Error ? reason.message : String(reason));
            if(userId){await db.messages.update(userId,{deliveryStatus:"failed",error:message});setMessages(current=>current.map(item=>item.id===userId?{...item,deliveryStatus:"failed",error:message}:item));}
            const failedAt=Date.now();if(runId)await db.runs.update(runId,{status:"failed",error:message,completedAt:failedAt});
            const activityId=createId("activity");await db.activity.insert({id:activityId,projectId:project.id,workId:conversation.workId,taskId:conversation.taskId,runId,type:"conversation_failed",actor:agent.id,summary:`Conversation attempt failed in ${conversation.title}`,details:message,createdAt:failedAt},activityId);
            if(conversation.workId){const inboxId=createId("inbox");await db.inboxItems.insert({id:inboxId,projectId:project.id,workId:conversation.workId,taskId:conversation.taskId,conversationId:conversation.id,fromParticipantId:agent.id,toParticipantId:LOCAL_PARTICIPANT_ID,type:"escalation",title:`Conversation failed: ${conversation.title}`,body:message,status:"open",createdAt:failedAt,updatedAt:failedAt},inboxId);}
            setError(message);
        }
        finally {
            setSending(false);
        }
    };
    const send=async()=>{if(!input.trim()||sending||firstSendInFlight.current)return;const projectIntent=parseCreateProjectIntent(input);if(projectIntent&&conversationScope==="global"){if(window.confirm(`Create a new Git project named ${projectIntent.name} in ${projectIntent.location[0].toUpperCase()+projectIntent.location.slice(1)} and open it in Control?`)){setInput("");window.dispatchEvent(new CustomEvent("control-create-project",{detail:projectIntent}));}return;}firstSendInFlight.current=true;try{const conversation=active||await createConversation(conversationScope==="global"?"Global":"General");if(conversation)await sendMessage(input,undefined,conversation);}finally{firstSendInFlight.current=false;}};
    useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent<{action:"reply"|"retry";conversationId?:string;title?:string}>).detail;if(!detail.conversationId)return;void (async()=>{const conversation=await db.conversations.get(detail.conversationId!);if(!conversation){setError("The linked conversation is no longer available");return;}setActiveId(conversation.id);setTab("chat");if(detail.action==="reply"){setInput("");window.setTimeout(()=>document.querySelector<HTMLTextAreaElement>(".chat-input textarea")?.focus(),50);return;}const prior=(await db.messages.find({conversationId:conversation.id})).filter(message=>message.role==="user"&&message.deliveryStatus==="failed").sort((a,b)=>b.createdAt-a.createdAt)[0];if(!prior){setError("No failed message is available to retry");return;}await sendMessage(prior.content,prior,conversation);})();};window.addEventListener("control-conversation-action",handler);return()=>window.removeEventListener("control-conversation-action",handler);});
    const answer = async (decision: ControlDecision, value: string) => {
        const answeredAt = Date.now(), safeValue = safe(value);
        await db.decisions.update(decision.id, { status: "answered", answer: safeValue, answeredAt });
        for (const item of await db.inboxItems.find({ workId: decision.workId, toParticipantId: LOCAL_PARTICIPANT_ID, type: "question" })) {
            if (item.status === "open" || item.status === "acknowledged")
                await db.inboxItems.update(item.id, { status: "acted", updatedAt: answeredAt, actedAt: answeredAt });
        }
        if (decision.runId) {
            const priorRun = await db.runs.get(decision.runId);
            if (priorRun?.status === "awaiting-input") {
                await db.runs.update(priorRun.id, { status: "completed", completedAt: answeredAt, summary: [priorRun.summary, `\n\nDecision answered: ${safeValue}`].filter(Boolean).join("") });
                const eventId = createId("run_event");
                await db.runEvents.insert({ id: eventId, runId: priorRun.id, projectId: priorRun.projectId, workId: priorRun.workId, taskId: priorRun.taskId, type: "decision_answered", content: safeValue, createdAt: answeredAt }, eventId);
            }
        }
        let resumeTaskId:string|undefined;
        if (decision.taskId) {
            const task = await db.tasks.get(decision.taskId);
            if (task?.status === "awaiting-input") {
                await db.transitionRuntimeWork(task.id,"resumed",{updatedAt:answeredAt});
                resumeTaskId=task.id;
            }
        }
        const id = createId("activity");
        await db.activity.insert({ id, projectId: project.id, workId: decision.workId, taskId: decision.taskId, runId: decision.runId, type: "decision_answered", actor: LOCAL_PARTICIPANT_ID, summary: `Decision answered: ${safe(decision.question)}`, details: safeValue, createdAt: answeredAt }, id);
        if(resumeTaskId){
            try { await dispatchTask(resumeTaskId); }
            catch(reason){ setError(`Decision saved, but automatic resume failed: ${reason instanceof Error?reason.message:String(reason)}`); }
        }
    };
    const editAgent = (agent: ControlAgent) => {
        setError(undefined);setEditingAgentId(agent.id);setAgentDraft({instructions:agent.instructions,runtime:agent.runtime||"auto",preset:agent.executionPolicy.network?"connected":agent.executionPolicy.shell?"local":"observe",timeout:agent.timeoutMinutes||60});
    };
    const saveAgent = async (agent:ControlAgent) => {
        const normalized = agentDraft.runtime.trim();
        if (!(["auto", "claude-code", "codex", "opencode", "ollama"].includes(normalized)||normalized.startsWith("ollama:")&&normalized.length>7))
            return setError("Unknown runtime");
        const preset=agentDraft.preset,policyError=runtimePresetError(normalized,preset);if(policyError)return setError(policyError);
        const timeout=Number(agentDraft.timeout);
        if(!Number.isInteger(timeout)||timeout<1||timeout>240)return setError("Timeout must be a whole number from 1 to 240 minutes");
        const executionPolicy: ControlAgent["executionPolicy"] = preset === "observe" ? { filesystem: "read-only", shell: false, network: false } : preset === "connected" ? { filesystem: "workspace-write", shell: true, network: true } : { filesystem: "workspace-write", shell: true, network: false };
        const changes={instructions:safe(agentDraft.instructions.trim()),runtime:normalized==="auto"?undefined:normalized,timeoutMinutes:timeout,executionPolicy,updatedAt:Date.now()};
        await db.agents.update(agent.id,changes);if(await db.intelligence.exists(agent.id))await db.intelligence.update(agent.id,changes);setEditingAgentId(undefined);setError(undefined);
    };
    const createAgent = async () => {
        const name = window.prompt("Agent name")?.trim();
        if (!name)
            return;
        const suggested = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const id = window.prompt("Agent ID", suggested)?.trim();
        if (!id)
            return;
        if (await db.agents.exists(id))
            return setError("That agent ID already exists");
        const description = window.prompt("Agent description", `${name} role`)?.trim() || "";
        const instructions = window.prompt("Agent instructions", `You are the ${name} agent. Complete assigned work carefully and report concrete results.`)?.trim();
        if (!instructions)
            return;
        const now = Date.now(), safeName = safe(name);
        const profile={ id, name: safeName, description: safe(description), instructions: safe(instructions), capabilities: [],timeoutMinutes:60, executionPolicy: { filesystem: "workspace-write" as const, shell: true, network: false }, status: "active" as const, createdAt: now, updatedAt: now };
        await db.agents.insert(profile, id);await db.intelligence.insert({...profile,provider:"auto"},id);
        await db.participants.insert({ id, type: "agent", name: safeName, roles: ["agent"], capabilities: [], status: "active", createdAt: now, updatedAt: now }, id);
    };
    const toggleAgent = async (agent: ControlAgent) => { try{const status = agent.status === "active" ? "disabled" : "active", updatedAt = Date.now(); await db.agents.update(agent.id, { status, updatedAt });if(await db.intelligence.exists(agent.id))await db.intelligence.update(agent.id,{status,updatedAt}); if (await db.participants.exists(agent.id))await db.participants.update(agent.id, { status, updatedAt });setError(undefined);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));} };
    const editLocalParticipant = () => { const participant = participants.find(item => item.id === LOCAL_PARTICIPANT_ID);if(!participant)return setError("Local participant is unavailable");setIdentityName(participant.name);setEditingIdentity(true);setError(undefined);};
    const saveLocalParticipant=async()=>{const participant=participants.find(item=>item.id===LOCAL_PARTICIPANT_ID),name=identityName.trim();if(!participant)return setError("Local participant is unavailable");if(!name)return setError("Display name is required");try{await db.participants.update(participant.id,{name:safe(name),updatedAt:Date.now()});setEditingIdentity(false);setError(undefined);}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}};
    const createInvestigation = async () => {
        const question = window.prompt("Investigation question")?.trim();
        if (!question)
            return;
        const safeQuestion = safe(question), now = Date.now(), workId = createId("work"), id = createId("investigation");
        await db.works.insert({ id: workId, projectId: project.id, title: safeQuestion, intent: safeQuestion, kind: "investigation", status: "active", createdAt: now, updatedAt: now }, workId);
        await db.investigations.insert({ id, projectId: project.id, workId, question: safeQuestion, hypotheses: [], sources: [], contradictions: [], gaps: [], status: "open", createdAt: now, updatedAt: now }, id);
        const activityId = createId("activity");
        await db.activity.insert({ id: activityId, projectId: project.id, workId, type: "investigation_created", actor: LOCAL_PARTICIPANT_ID, summary: `Investigation created: ${safeQuestion}`, createdAt: now }, activityId);
    };
    const addInvestigationItem = async (item: ControlInvestigation, field: "hypotheses" | "sources" | "contradictions" | "gaps", label: string) => {
        const value = window.prompt(label)?.trim();
        if (!value)
            return;
        await db.investigations.update(item.id, { [field]: [...item[field], safe(value)], updatedAt: Date.now() });
    };
    const concludeInvestigation = async (item: ControlInvestigation) => {
        const conclusion = window.prompt("Conclusion", item.conclusion || "")?.trim();
        if (!conclusion)
            return;
        const safeConclusion = safe(conclusion), now = Date.now(), evidenceId = createId("evidence"), outcomeId = createId("outcome");
        await db.investigations.update(item.id, { conclusion: safeConclusion, status: "concluded", updatedAt: now });
        await db.works.update(item.workId, { status: "completed", completedAt: now, updatedAt: now });
        await db.evidence.insert({ id: evidenceId, projectId: item.projectId, workId: item.workId, kind: "source", summary: `Investigation concluded with ${item.sources.length} source(s)`, result: item.sources.length ? "passed" : "unknown", provenance: safe(item.sources.join("\n") || "User conclusion"), createdAt: now }, evidenceId);
        await db.outcomes.insert({ id: outcomeId, projectId: item.projectId, workId: item.workId, status: item.sources.length ? "passed" : "partially_verified", summary: safeConclusion, evidenceIds: [evidenceId], createdAt: now }, outcomeId);
    };
    const exportData = async () => {
        const path = await save({ defaultPath: `control-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: "Control backup", extensions: ["json"] }] });
        if (!path)
            return;
        const backup = await db.exportSnapshot();
        const response = await invoke("cmd_data_export", { path, content: JSON.stringify(backup, null, 2) });
        if (!response.success)
            setError(response.error);
    };
    const importData = async () => {
        const selected = await open({ multiple: false, directory: false, filters: [{ name: "Control backup", extensions: ["json"] }] });
        if (!selected || Array.isArray(selected))
            return;
        const response = await invoke<string>("cmd_data_import", { path: selected });
        if (!response.success || !response.data)
            return setError(response.error || "Import failed");
        try {
            const backup = JSON.parse(response.data) as ControlBackup | {
                format?: string;
                operations?: EmbeddedOperation[];
            };
            let applied = 0;
            if (backup.format === "control-feltdb-snapshot")
                applied = (await db.importSnapshot(backup as ControlBackup)).applied;
            else if (backup.format === "control-feltdb-operations" && Array.isArray(backup.operations)) {
                if (db.topology.mode !== "local")
                    throw new Error("Legacy operation backups must be restored in local mode before migrating");
                applied = (await db.db.applyOperations(backup.operations)).applied;
            }
            else
                throw new Error("Not a Control FeltDB backup");
            const id = createId("activity");
            await db.activity.insert({ id, type: "data_imported", actor: LOCAL_PARTICIPANT_ID, summary: `Imported Control backup (${applied} records)`, createdAt: Date.now() }, id);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const configureRemote = async () => {
        const serverUrl = window.prompt("FeltDB server URL (HTTPS, or localhost HTTP)", topology.serverUrl || "")?.trim();
        if (!serverUrl)
            return;
        const token = window.prompt("FeltDB access token (stored only in the OS credential store)")?.trim();
        if (!token || !window.confirm("Copy all current Control records to this FeltDB server and use it after restart?"))
            return;
        setError(undefined);
        try {
            const count = await migrateControlToServer(serverUrl, token);
            window.alert(`Migrated ${count} records. Control will restart using the server.`);
            window.location.reload();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const configureLocal = async () => {
        if (!window.confirm("Copy the current server state to this machine and return to local FeltDB?"))
            return;
        setError(undefined);
        try {
            const count = await migrateControlToLocal();
            window.alert(`Migrated ${count} records. Control will restart in local mode.`);
            window.location.reload();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    const openInbox = inboxItems.filter(item => item.status === "open" || item.status === "acknowledged");
    const inboxCount = openInbox.length + decisions.filter(item => item.status === "pending").length + tasks.filter(item => ["review", "awaiting-input", "failed"].includes(item.status)).length + runs.filter(item => item.status === "interrupted").length;
    const runArtifacts=(run:ControlRun)=>{const changes=changeSets.find(item=>item.runId===run.id),tests=testResults.filter(item=>item.runId===run.id);return <div className="run-artifacts">
        <div className="run-artifact-heading">Changes · {changes?.files.length||0}{changes?.branch?` · ${changes.branch}`:""}</div>
        {changes?.files.map(file=><button className="run-change" key={file.path} onClick={event=>{event.stopPropagation();window.dispatchEvent(new CustomEvent("control-command",{detail:"commit-changes"}));}}><span>{file.status} {file.path}</span><small>{file.staged?"staged":file.preExisting?"pre-existing":"new in run"}</small></button>)}
        {changes?.capturedAt&&changes.files.length===0&&<div className="run-artifact-empty">No uncommitted changes at completion</div>}
        <div className="run-artifact-heading">Tests · {tests.length}</div>
        {tests.map(test=><div className={`run-test ${test.status}`} key={test.id}><span>{test.status} · {test.command}</span>{test.summary&&<small>{test.summary}</small>}<small>{test.provenance}</small></div>)}
        {!tests.length&&<div className="run-artifact-empty">No structured test result reported</div>}
    </div>;};
    const stopRun=async(run:ControlRun)=>{if(!run.pid)return;const response=await invoke("cmd_agent_run_stop",{pid:run.pid,expectedProcessStartedAt:run.processStartedAt});if(!response.success)return setError(response.error);const now=Date.now();await db.runs.update(run.id,{status:"stopped",completedAt:now,error:"Stopped by user"});if(run.kind==="conversation"){if(run.requestMessageId)await db.messages.update(run.requestMessageId,{deliveryStatus:"failed",error:"Response stopped by user",runId:run.id});await db.works.update(run.workId,{status:"active",updatedAt:now});}else if(run.taskId){await db.transitionRuntimeWork(run.taskId,"requeued",{updatedAt:now});}const id=createId("activity");await db.activity.insert({id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,runId:run.id,type:"run_stopped",actor:LOCAL_PARTICIPANT_ID,summary:run.kind==="conversation"?"Conversation response stopped":"Agent run stopped",createdAt:now},id);};
    return <div className="coordination-panel">
        {!hideNavigation&&<div className="coordination-tabs">{(["chat","intelligence","inbox","decisions","evidence","activity"] as CoordinationTab[]).map(item=><button key={item} className={tab===item?"active":""} onClick={()=>setTab(item)}>{item}{item==="inbox"&&inboxCount?` ${inboxCount}`:""}</button>)}</div>}
        {error&&<div className="coordination-error">{error}</div>}
        {tab==="chat"&&<div className="chat-pane">
            <div className="conversation-scope"><label>Scope</label><select value={conversationScope} onChange={event=>{setConversationScope(event.target.value);setActiveId(undefined);}}><option value="global">Global · brainstorming and new projects</option>{availableProjects.map(item=><option key={item.id} value={item.id}>Project · {item.name}</option>)}</select></div>
            <div className="conversation-toolbar"><select value={activeId||""} onChange={event=>setActiveId(event.target.value||undefined)}><option value="">No conversation</option>{conversations.map(item=><option key={item.id} value={item.id}>{item.title}{conversations.filter(candidate=>candidate.title===item.title).length>1?` · ${new Date(item.createdAt).toLocaleString()}`:""}</option>)}</select><button title="New conversation" onClick={()=>setCreatingConversation(value=>!value)}>+</button></div>
            {creatingConversation&&<div className="conversation-create"><input autoFocus placeholder="Conversation title" value={conversationTitle} onChange={event=>setConversationTitle(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void createConversation();}}/><select value={conversationContextId} onChange={event=>setConversationContextId(event.target.value)}><option value="">Project conversation</option>{tasks.map(task=><option key={task.id} value={task.id}>Task: {task.title}</option>)}{investigations.map(item=><option key={item.id} value={item.id}>Investigation: {item.question}</option>)}</select><div className="decision-options"><button disabled={!conversationTitle.trim()} onClick={()=>void createConversation()}>Create</button><button onClick={()=>setCreatingConversation(false)}>Cancel</button></div></div>}
            <div className="conversation-context">{active?`${agents.find(agent=>agent.id===active.agentId)?.name||fallbackAgent.name} · ${active.scope==="global"?"Global":availableProjects.find(item=>item.id===active.projectId)?.name||project.name}${active.taskId?` · ${tasks.find(task=>task.id===active.taskId)?.title||"task"}`:""}`:conversationScope==="global"?"Brainstorm, work across projects, or create a new project in English":`Start a conversation about ${availableProjects.find(item=>item.id===conversationScope)?.name||project.name}`}</div>
            <div className="message-list">{messages.map(message=><div key={message.id} className={`message ${message.role} ${message.deliveryStatus||"delivered"}`}><span className="message-sender">{message.role==="user"?participants.find(item=>item.id===message.senderId)?.name||"You":agents.find(item=>item.id===message.senderId)?.name||message.senderId}{message.deliveryStatus==="pending"?" · sending":message.deliveryStatus==="failed"?" · failed":""}</span><div>{message.content}</div>{message.deliveryStatus==="failed"&&<div className="message-failure"><span>{message.error}</span><button disabled={sending} onClick={()=>void sendMessage(message.content,message)}>Retry</button></div>}</div>)}{sending&&<div className="message-status">Control Intelligence is working…</div>}</div>
            <div className="chat-input"><textarea value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}} placeholder={active?"Message Control Intelligence…":"Type a message to start a conversation…"} disabled={sending}/><button disabled={!input.trim()||sending} onClick={()=>void send()}>Send</button></div>
        </div>}
        {tab==="intelligence"&&<div className="agent-list">
            <div className="agent-directory-label">Current human</div>{participants.filter(item=>item.type==="human").map(person=><div className="agent-card" key={person.id}><div className="agent-card-title"><span>{person.name}</span><span className="agent-state active">{person.id}</span></div><p>{person.roles.join(" · ")}</p>{person.id===LOCAL_PARTICIPANT_ID&&(editingIdentity?<div className="intelligence-editor"><label>Display name<input autoFocus value={identityName} onChange={event=>setIdentityName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void saveLocalParticipant();}}/></label><div className="decision-options"><button onClick={()=>void saveLocalParticipant()}>Save</button><button onClick={()=>setEditingIdentity(false)}>Cancel</button></div></div>:<button onClick={editLocalParticipant}>Edit identity</button>)}</div>)}
            <div className="agent-directory-label">Detected runtimes</div>{runtimeAvailability.map(runtime=><div className="agent-card" key={runtime.id}><div className="agent-card-title"><span>{runtime.id}</span><span className={`agent-state ${runtime.available?"active":"disabled"}`}>{runtime.available?"ready":"missing"}</span></div>{runtime.path&&<p>{runtime.path}{runtime.model?` · ${runtime.model}`:""}</p>}</div>)}
            <div className="agent-directory-label">Provider credentials · OS keychain</div>{providerCredentials.map(item=><div className="agent-card" key={item.provider}><div className="agent-card-title"><span>{item.provider}</span><span className={`agent-state ${item.configured?"active":"disabled"}`}>{item.configured?"configured":"not configured"}</span></div><p>{item.environmentVariable} · secret value is never stored in FeltDB</p>{editingProvider===item.provider?<div className="intelligence-editor"><label>API key<input autoFocus type="password" autoComplete="off" value={providerSecret} onChange={event=>setProviderSecret(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void saveProviderCredential(item.provider);}}/></label><div className="decision-options"><button onClick={()=>void saveProviderCredential(item.provider)}>Save to keychain</button><button onClick={()=>{setEditingProvider(undefined);setProviderSecret("");}}>Cancel</button></div></div>:<div className="decision-options"><button onClick={()=>{setEditingProvider(item.provider);setProviderSecret("");}}>Set key</button>{item.configured&&<button onClick={()=>void removeProviderCredential(item.provider)}>Remove</button>}</div>}</div>)}
            <div className="agent-directory-label">Run history · {runs.length}</div>{runs.map(run=><div className={`agent-card run-card ${selectedRunId===run.id?"selected":""}`} key={run.id} onClick={()=>setSelectedRunId(run.id)}><div className="agent-card-title"><span>{tasks.find(task=>task.id===run.taskId)?.title||conversations.find(item=>item.id===run.conversationId)?.title||run.id}</span><span className={`agent-state ${run.status}`}>{run.status}</span></div><p>{agents.find(agent=>agent.id===run.agentId)?.name||run.agentId} · {run.runtime} · {new Date(run.startedAt).toLocaleString()}</p>{selectedRunId===run.id&&runArtifacts(run)}{selectedRunId===run.id&&<div className="run-timeline">{runEvents.filter(event=>event.runId===run.id).map(event=><div className="run-event" key={event.id}><span>{event.type.replace(/_/g," ")} · {new Date(event.createdAt).toLocaleTimeString()}</span>{event.content&&<div>{event.content}</div>}</div>)}{runEvents.every(event=>event.runId!==run.id)&&<div className="coordination-empty">No run events recorded</div>}</div>}{run.summary&&<div className="run-summary">{run.summary}</div>}{run.error&&<div className="coordination-error">{run.error}</div>}{["starting","running"].includes(run.status)&&run.pid&&<button onClick={event=>{event.stopPropagation();void stopRun(run);}}>Stop</button>}</div>)}
            <div className="agent-directory-label">Intelligence profiles (advanced) <button onClick={()=>void createAgent()}>+</button></div>{agents.map(agent=><div className="agent-card" key={agent.id}><div className="agent-card-title"><span>{agent.name}</span><span className={`agent-state ${agent.status}`}>{agent.status}</span></div><p>{agent.description}</p><div className="capabilities">{agent.runtime||"auto"} · {agent.executionPolicy.filesystem} · shell {agent.executionPolicy.shell?"on":"off"} · network {agent.executionPolicy.network?"on":"off"} · timeout {agent.timeoutMinutes||60}m · {agent.capabilities.join(" · ")}</div>{editingAgentId===agent.id?<div className="intelligence-editor"><label>Instructions<textarea value={agentDraft.instructions} onChange={event=>setAgentDraft(value=>({...value,instructions:event.target.value}))}/></label><label>Runtime<select value={agentDraft.runtime} onChange={event=>setAgentDraft(value=>({...value,runtime:event.target.value}))}><option value="auto">Automatic</option><option value="claude-code">Claude Code</option><option value="codex">Codex</option><option value="opencode">OpenCode</option><option value="ollama">Ollama</option></select></label><label>Execution policy<select value={agentDraft.preset} onChange={event=>setAgentDraft(value=>({...value,preset:event.target.value as RuntimePreset}))}><option value="observe">Observe</option><option value="local">Local workspace</option><option value="connected">Connected</option></select></label><label>Timeout (minutes)<input type="number" min="1" max="240" value={agentDraft.timeout} onChange={event=>setAgentDraft(value=>({...value,timeout:Number(event.target.value)}))}/></label><div className="decision-options"><button onClick={()=>void saveAgent(agent)}>Save</button><button onClick={()=>setEditingAgentId(undefined)}>Cancel</button></div></div>:<div className="decision-options"><button onClick={()=>editAgent(agent)}>Configure</button><button onClick={()=>void toggleAgent(agent)}>{agent.status==="active"?"Disable":"Enable"}</button></div>}</div>)}
        </div>}
        {tab==="inbox"&&<div className="decision-list">
            {inboxCount===0&&<div className="coordination-empty">Inbox clear</div>}
            {openInbox.map(item=><div className="decision-card" key={item.id}><strong>{item.type}: {item.title}</strong><p>{participants.find(person=>person.id===item.fromParticipantId)?.name||item.fromParticipantId} → {participants.find(person=>person.id===item.toParticipantId)?.name||item.toParticipantId} · {works.find(work=>work.id===item.workId)?.title||"Work"}</p>{item.body&&<div className="run-summary">{item.body}</div>}<div className="decision-options">{item.status==="open"&&<button onClick={()=>void db.inboxItems.update(item.id,{status:"acknowledged",updatedAt:Date.now()})}>Acknowledge</button>}<button onClick={()=>void db.inboxItems.update(item.id,{status:"acted",updatedAt:Date.now(),actedAt:Date.now()})}>Done</button></div></div>)}
            {decisions.filter(item=>item.status==="pending").map(item=><div className="decision-card" key={item.id}><strong>Question: {item.question}</strong><p>{works.find(work=>work.id===item.workId)?.title||"Work"}</p><button onClick={()=>setTab("decisions")}>Answer</button></div>)}
            {tasks.filter(item=>["review","awaiting-input","failed"].includes(item.status)).map(item=><div className="decision-card" key={item.id}><strong>{item.status==="review"?"Ready for review":item.status==="awaiting-input"?"Awaiting input":"Run failed"}: {item.title}</strong><p>{agents.find(agent=>agent.id===item.assignedTo)?.name||"Unassigned"}</p><button onClick={()=>window.dispatchEvent(new CustomEvent("control-command",{detail:"start-agent"}))}>Open task</button></div>)}
            {runs.filter(item=>item.status==="interrupted").map(item=><div className="decision-card" key={item.id}><strong>Interrupted Run</strong><p>{tasks.find(task=>task.id===item.taskId)?.title||item.taskId}</p><button onClick={()=>setTab("intelligence")}>Inspect Run</button></div>)}
        </div>}
        {tab==="decisions"&&<div className="decision-list">{decisions.length===0&&<div className="coordination-empty">No decisions</div>}{decisions.map(decision=><div className="decision-card" key={decision.id}><strong>{decision.question}</strong>{decision.context&&<p>{decision.context}</p>}{decision.status==="pending"?<div className="decision-options">{decision.options.map(option=><button key={option} onClick={()=>void answer(decision,option)}>{option}</button>)}<button onClick={()=>{const value=window.prompt("Your answer")?.trim();if(value)void answer(decision,value);}}>Custom…</button></div>:<div className="decision-answer">Answered: {decision.answer}</div>}</div>)}</div>}
        {tab==="evidence"&&<div className="decision-list">
            <div className="decision-options"><button onClick={()=>void createInvestigation()}>New investigation</button></div>
            {investigations.map(item=><div className="decision-card" key={item.id}><strong>{item.question}</strong><p>{item.status} · {item.hypotheses.length} hypotheses · {item.sources.length} sources · {item.gaps.length} gaps</p>{item.hypotheses.map(value=><div key={`h-${value}`}>Hypothesis: {value}</div>)}{item.sources.map(value=><div key={`s-${value}`}>Source: {value}</div>)}{item.contradictions.map(value=><div key={`c-${value}`}>Contradiction: {value}</div>)}{item.gaps.map(value=><div key={`g-${value}`}>Gap: {value}</div>)}{item.conclusion&&<div className="decision-answer">Conclusion: {item.conclusion}</div>}{item.status==="open"&&<div className="decision-options"><button onClick={()=>void addInvestigationItem(item,"hypotheses","Hypothesis")}>+ Hypothesis</button><button onClick={()=>void addInvestigationItem(item,"sources","Source URL or citation")}>+ Source</button><button onClick={()=>void addInvestigationItem(item,"contradictions","Contradiction")}>+ Contradiction</button><button onClick={()=>void addInvestigationItem(item,"gaps","Evidence gap")}>+ Gap</button><button onClick={()=>void concludeInvestigation(item)}>Conclude</button></div>}</div>)}
            <div className="agent-directory-label">Evidence · {evidence.length}</div>{evidence.map(item=><div className="decision-card" key={item.id}><strong>{item.summary}</strong><p>{works.find(work=>work.id===item.workId)?.title||"Work"} · {item.kind} · {item.result}</p><div className="run-summary">{item.provenance}</div></div>)}
            <div className="agent-directory-label">Outcomes · {outcomes.length}</div>{outcomes.map(item=><div className="decision-card" key={item.id}><strong>{item.status}: {item.summary}</strong><p>{works.find(work=>work.id===item.workId)?.title||"Work"} · {item.evidenceIds.length} evidence</p></div>)}
        </div>}
        {tab==="activity"&&<div className="decision-list"><div className="decision-card"><strong>Data location: {topology.mode==="local"?"This machine (IndexedDB)":topology.serverUrl}</strong><p>Runtime: {db.db.runtime().runtime} · storage: {db.db.runtime().storage} · durable {db.db.runtime().durable?"yes":"no"} · credentials: {topology.mode==="server"?"OS secure store":"none required"}</p><p>Canonical graph: {databaseMetadata?.integrityIssues?`${databaseMetadata.integrityIssues} unresolved issue(s)`:"healthy"} · repaired {databaseMetadata?.integrityRepairs||0} at startup</p><div className="decision-options"><button onClick={()=>void configureRemote()}>Use FeltDB server</button>{topology.mode==="server"&&<button onClick={()=>void configureLocal()}>Return to local</button>}</div></div><div className="decision-options"><button onClick={()=>void exportData()}>Export backup</button><button onClick={()=>void importData()}>Import backup</button></div>{activity.length===0&&<div className="coordination-empty">No activity yet</div>}{activity.slice(0,100).map(event=><div className="decision-card" key={event.id}><strong>{event.summary}</strong><p>{participants.find(item=>item.id===event.actor)?.name||event.actor} · {new Date(event.createdAt).toLocaleString()}</p>{event.details&&<div className="run-summary">{event.details}</div>}</div>)}</div>}
    </div>;
}
