import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID } from "../lib/control-db";
import { dispatchTask } from "../lib/agent-dispatch";
import { invoke } from "../lib/tauri";
import { frameRunOutput, parseDecisionRequest, parseHandoffRequest, parseTestReports, terminalTransition } from "../lib/task-lifecycle";
import { getSecretRedactor } from "../lib/core/secret-redactor";
type NativeRunEvent = {
    runId: string;
    eventType: "output" | "completed" | "failed";
    output?: string;
    error?: string;
    exitCode?: number;
};
const pendingRunOutput = new Map<string, string>();
const runEventQueues = new Map<string,Promise<void>>();
export function useRunEvents(): void {
    useEffect(() => {
        let disposed = false;
        let stop: undefined | (() => void);
        void listen<NativeRunEvent>("agent-run-event", ({ payload }) => {
            const previous=runEventQueues.get(payload.runId)||Promise.resolve();
            const next=previous.catch(()=>undefined).then(async()=>{
            const db = getControlDatabase();
            const run = await db.runs.get(payload.runId);
            if (!run || run.kind === "conversation" || !run.taskId)
                return;
            const redact = (value?: string) => value ? getSecretRedactor().redact(value).redacted : undefined;
            if (payload.eventType === "output") {
                if (!payload.output)
                    return;
                const framed=frameRunOutput(pendingRunOutput.get(run.id)||"",payload.output);
                pendingRunOutput.set(run.id,framed.pending);
                if(!framed.ready)
                    return;
                const content=redact(framed.ready)||"";
                const eventId = createId("run_event");
                await db.runEvents.insert({ id: eventId, runId: run.id, projectId: run.projectId, workId: run.workId, taskId: run.taskId, type: "output", content, createdAt: Date.now() }, eventId);
                const current=await db.runs.get(run.id),summary=[current?.summary,content].filter(Boolean).join("");
                await db.runs.update(run.id, { summary: summary.slice(-100000) });
                return;
            }
            // A deliberate stop wins over the process' non-zero exit event.
            if (run.status === "stopped") {
                const tail=frameRunOutput(pendingRunOutput.get(run.id)||"","",true).ready;
                pendingRunOutput.delete(run.id);
                if(tail){const content=redact(tail)||"",eventId=createId("run_event"),current=await db.runs.get(run.id);await db.runEvents.insert({id:eventId,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,type:"output",content,createdAt:Date.now()},eventId);await db.runs.update(run.id,{summary:[current?.summary,content].filter(Boolean).join("").slice(-100000)});}
                return;
            }
            const completedAt = Date.now();
            const tail=frameRunOutput(pendingRunOutput.get(run.id)||"","",true).ready;
            pendingRunOutput.delete(run.id);
            if(tail){const tailId=createId("run_event"),content=redact(tail)||"";await db.runEvents.insert({id:tailId,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,type:"output",content,createdAt:completedAt},tailId);}
            const currentRun=await db.runs.get(run.id);
            const finalOutput=payload.output||[currentRun?.summary,redact(tail)].filter(Boolean).join("");
            const project=await db.projects.get(run.projectId);
            const changeSet=await db.changeSets.get(run.id);
            if(project&&changeSet){
                const git=await invoke<{branch:string;files:Array<{path:string;status:string;staged_status?:string}>}>("cmd_git_status",{workspacePath:project.path});
                if(git.success&&git.data)await db.changeSets.update(run.id,{branch:git.data.branch,files:git.data.files.map(file=>({path:file.path,status:file.status,staged:Boolean(file.staged_status),preExisting:changeSet.baselineFiles.includes(file.path)})),capturedAt:completedAt});
            }
            for(const report of parseTestReports(finalOutput)){
                const testId=createId("test_result");
                await db.testResults.insert({id:testId,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,command:redact(report.command)||"test",status:report.status,summary:redact(report.summary),provenance:"agent-reported",createdAt:completedAt},testId);
                const testEvidenceId=createId("evidence");
                await db.evidence.insert({id:testEvidenceId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,runId:run.id,kind:"test",summary:`${report.status}: ${redact(report.command)||"test"}`,result:report.status==="passed"?"passed":report.status==="failed"?"failed":"unknown",provenance:`Agent-reported test result${report.summary?`: ${redact(report.summary)}`:""}`,createdAt:completedAt},testEvidenceId);
            }
            const request = parseDecisionRequest(finalOutput), decisionRequested = Boolean(request);
            const handoff = !decisionRequested&&payload.eventType==="completed"?parseHandoffRequest(finalOutput):undefined;
            let acceptedHandoff: typeof handoff;
            let handoffProblem: string|undefined;
            if(handoff){
                const target=await db.agents.get(handoff.agentId);
                const priorHandoffs=(await db.activity.find({workId:run.workId})).filter(item=>item.type==="agent_handoff").length;
                if(!target||target.status!=="active")handoffProblem=`Agent ${handoff.agentId} is not active`;
                else if(target.id===run.agentId)handoffProblem="An agent cannot hand work to itself";
                else if(priorHandoffs>=6)handoffProblem="Automatic handoff limit reached for this Work";
                else acceptedHandoff=handoff;
            }
            if (request) {
                const decisionId = createId("decision");
                await db.decisions.insert({ id: decisionId, projectId: run.projectId, workId: run.workId, taskId: run.taskId, runId: run.id, requestedBy: run.agentId, question: redact(request.question) || "Decision required", context: redact(request.context) || "", options: (request.options || []).map(option => redact(option) || ""), status: "pending", createdAt: completedAt }, decisionId);
            }
            const needsHuman=decisionRequested||Boolean(handoffProblem);
            const transition = terminalTransition(payload.eventType, needsHuman);
            const terminalEventId = createId("run_event");
            await db.runEvents.insert({ id: terminalEventId, runId: run.id, projectId: run.projectId, workId: run.workId, taskId: run.taskId, type: decisionRequested ? "decision_requested" : acceptedHandoff ? "handoff" : payload.eventType, content: redact(handoffProblem||payload.error)||(payload.eventType==="completed"?"Process completed":undefined), exitCode: payload.exitCode, createdAt: completedAt }, terminalEventId);
            await db.runs.update(run.id, {
                status: transition.runStatus,
                completedAt: transition.isTerminal ? completedAt : undefined,
                summary: redact(finalOutput),
                error: redact(payload.error),
                exitCode: payload.exitCode,
            });
            await db.transitionRuntimeWork(run.taskId,acceptedHandoff?"handoff":needsHuman?"awaiting-input":payload.eventType==="completed"?"review":"failed",{assignedTo:acceptedHandoff?.agentId,updatedAt:completedAt});
            const inboxId=createId("inbox");
            if(acceptedHandoff){
                await db.inboxItems.insert({id:inboxId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,fromParticipantId:run.agentId,toParticipantId:acceptedHandoff.agentId,type:"handoff",title:`Handoff from ${run.agentId}`,body:redact([acceptedHandoff.message,acceptedHandoff.reason].filter(Boolean).join(" — ")),status:"open",createdAt:completedAt,updatedAt:completedAt},inboxId);
            } else {
                await db.inboxItems.insert({ id: inboxId, projectId: run.projectId, workId: run.workId, taskId: run.taskId, fromParticipantId: run.agentId, toParticipantId: LOCAL_PARTICIPANT_ID, type: decisionRequested ? "question" : payload.eventType === "completed"&&!handoffProblem ? "review" : "escalation", title: decisionRequested ? (redact(request?.question) || "Agent needs a decision") : handoffProblem ? "Agent handoff needs attention" : payload.eventType === "completed" ? "Agent work is ready for review" : "Agent run failed", body: redact(handoffProblem||payload.error), status: "open", createdAt: completedAt, updatedAt: completedAt }, inboxId);
            }
            const evidenceId = createId("evidence");
            await db.evidence.insert({ id: evidenceId, projectId: run.projectId, workId: run.workId, taskId: run.taskId, runId: run.id, kind: "run_output", summary: payload.eventType === "completed" ? "Agent process completed" : "Agent process failed", result: payload.eventType === "failed" ? "failed" : "unknown", provenance: `${run.runtime} run ${run.id}`, createdAt: completedAt }, evidenceId);
            const id = createId("activity");
            await db.activity.insert({
                id,
                projectId: run.projectId,
                workId: run.workId,
                taskId: run.taskId,
                runId: run.id,
                type: acceptedHandoff?"agent_handoff":decisionRequested ? "decision_requested" : `run_${payload.eventType}`,
                actor: run.agentId,
                summary: acceptedHandoff?`${run.agentId} handed Work to ${acceptedHandoff.agentId}`:handoffProblem?`Agent handoff paused: ${handoffProblem}`:decisionRequested ? "Agent needs a decision before work can continue" : payload.eventType === "completed" ? "Agent run completed and is ready for review" : "Agent run failed",
                details: redact(acceptedHandoff?.message||payload.error || payload.output),
                createdAt: completedAt,
            }, id);
            if(acceptedHandoff){
                try { await dispatchTask(run.taskId); }
                catch { /* shared dispatch records the durable escalation */ }
            }
            });
            runEventQueues.set(payload.runId,next);
            void next.catch(error=>console.error("Unable to persist agent run event",error)).finally(()=>{if(runEventQueues.get(payload.runId)===next)runEventQueues.delete(payload.runId);});
        }).then((unlisten) => {
            if (disposed)
                unlisten();
            else
                stop = unlisten;
        });
        return () => { disposed = true; stop?.(); };
    }, []);
}
