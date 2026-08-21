import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID } from "./control-db";
import { getSecretRedactor } from "./core/secret-redactor";
import { invoke } from "./tauri";

export type DispatchResult = { runId: string; runtime: string; pid: number; processStartedAt: number };
const dispatchingTasks=new Set<string>();

export async function dispatchTask(taskId: string): Promise<DispatchResult> {
  if(dispatchingTasks.has(taskId))throw new Error("Task dispatch is already in progress");
  dispatchingTasks.add(taskId);
  try {
  const db=getControlDatabase(),task=await db.tasks.get(taskId);
  if(!task)throw new Error("Task no longer exists");
  const agent=task.assignedTo?await db.agents.get(task.assignedTo):undefined;
  const project=await db.projects.get(task.projectId);
  if(!agent||agent.status!=="active")throw new Error("Assign an active agent before running");
  if(!project?.path)throw new Error("Open the task project before running");
  const activeRuns=(await db.runs.find({taskId})).filter(run=>run.status==="starting"||run.status==="running");
  if(activeRuns.length)throw new Error("Task already has an active agent run");
  const blockers=await Promise.all(task.blockedBy.map(id=>db.tasks.get(id)));
  if(blockers.some(blocker=>blocker?.status!=="done"))throw new Error("Task has unfinished dependencies");

  const now=Date.now(),runId=createId("run");
  await db.runs.insert({id:runId,taskId:task.id,projectId:task.projectId,workId:task.workId,agentId:agent.id,runtime:"resolving",status:"starting",startedAt:now},runId);
  const git=await invoke<{branch:string;files:Array<{path:string}>}>("cmd_git_status",{workspacePath:project.path});
  await db.changeSets.insert({id:runId,runId,taskId:task.id,projectId:task.projectId,workId:task.workId,branch:git.data?.branch||"unknown",baselineFiles:(git.data?.files||[]).map(file=>file.path),files:[],createdAt:now},runId);
  const answered=await db.decisions.find({taskId:task.id,status:"answered"});
  const inbox=(await db.inboxItems.find({workId:task.workId,toParticipantId:agent.id})).filter(item=>item.status==="open"||item.status==="acknowledged");
  const context=[task.description,task.acceptanceCriteria.length?`Acceptance criteria:\n${task.acceptanceCriteria.map(item=>`- ${item}`).join("\n")}`:"",task.tags.length?`Tags: ${task.tags.join(", ")}`:"",task.feedback.length?`User feedback:\n${task.feedback.map(item=>`- ${item.content}`).join("\n")}`:"",answered.length?`Answered decisions:\n${answered.map(item=>`- ${item.question}: ${item.answer}`).join("\n")}`:"",inbox.length?`Agent inbox for this Work:\n${inbox.map(item=>`- ${item.type} from ${item.fromParticipantId}: ${item.title}${item.body?` — ${item.body}`:""}`).join("\n")}`:""].filter(Boolean).join("\n\n");
  const response=await invoke<{pid:number;runtime:string;processStartedAt:number}>("cmd_agent_run_start",{runId,taskId:task.id,title:task.title,description:context,projectPath:project.path,agentName:agent.name,agentInstructions:agent.instructions,preferredRuntime:agent.runtime,executionFilesystem:agent.executionPolicy.filesystem,executionShell:agent.executionPolicy.shell,executionNetwork:agent.executionPolicy.network,executionTimeoutMinutes:agent.timeoutMinutes});
  if(!response.success||!response.data){
    const failedAt=Date.now(),message=getSecretRedactor().redact(response.error||"Dispatch failed").redacted;
    await db.runs.update(runId,{status:"failed",error:message,completedAt:failedAt});
    await db.transitionRuntimeWork(task.id,"failed",{updatedAt:failedAt});
    const inboxId=createId("inbox");
    await db.inboxItems.insert({id:inboxId,projectId:task.projectId,workId:task.workId,taskId:task.id,fromParticipantId:agent.id,toParticipantId:LOCAL_PARTICIPANT_ID,type:"escalation",title:`Dispatch failed: ${task.title}`,body:message,status:"open",createdAt:failedAt,updatedAt:failedAt},inboxId);
    const failureId=createId("activity");
    await db.activity.insert({id:failureId,projectId:task.projectId,workId:task.workId,taskId:task.id,runId,type:"run_failed",actor:"system",summary:`Could not dispatch: ${task.title}`,details:message,createdAt:failedAt},failureId);
    throw new Error(message);
  }
  const currentRun=await db.runs.get(runId);
  if(currentRun?.status==="starting")await db.runs.update(runId,{runtime:response.data.runtime,status:"running",pid:response.data.pid,processStartedAt:response.data.processStartedAt});
  const currentTask=await db.tasks.get(task.id);
  if(currentTask?.status==="not-started")await db.transitionRuntimeWork(task.id,"started",{updatedAt:now});
  for(const item of inbox)await db.inboxItems.update(item.id,{status:"acted",updatedAt:now,actedAt:now});
  const activityId=createId("activity");
  await db.activity.insert({id:activityId,projectId:task.projectId,workId:task.workId,taskId:task.id,runId,type:"run_started",actor:agent.id,summary:`${agent.name} started: ${task.title}`,createdAt:now},activityId);
  return {runId,runtime:response.data.runtime,pid:response.data.pid,processStartedAt:response.data.processStartedAt};
  } finally {
    dispatchingTasks.delete(taskId);
  }
}
