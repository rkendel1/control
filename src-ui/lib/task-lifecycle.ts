import type { ControlRun, ControlTask } from "./control-db";

export type DecisionRequest = { question: string; context?: string; options?: string[] };
export type HandoffRequest = { agentId: string; message: string; reason?: string };
export type TestReport = { command: string; status: "passed"|"failed"|"skipped"; summary?: string };
export type FramedOutput = { ready:string; pending:string };

export function frameRunOutput(pending:string,chunk:string,flush=false):FramedOutput{
  const combined=pending+chunk;
  if(flush)return {ready:combined,pending:""};
  const boundary=combined.lastIndexOf("\n");
  if(boundary<0&&combined.length<4096)return {ready:"",pending:combined};
  return boundary>=0?{ready:combined.slice(0,boundary+1),pending:combined.slice(boundary+1)}:{ready:combined,pending:""};
}

function lastMarker(output: string | undefined, name: string): string | undefined {
  if (!output) return undefined;
  const matches = [...output.matchAll(new RegExp(`(?:^|\\n)${name}:\\s*(\\{[^\\n]+\\})`, "g"))];
  return matches.length?matches[matches.length-1][1]:undefined;
}

export function parseDecisionRequest(output?: string): DecisionRequest | undefined {
  const marker=lastMarker(output,"CONTROL_DECISION");
  if(!marker)return undefined;
  try {
    const value=JSON.parse(marker) as Partial<DecisionRequest>;
    if(typeof value.question!=="string"||!value.question.trim())return undefined;
    return {question:value.question.trim(),context:typeof value.context==="string"?value.context:undefined,options:Array.isArray(value.options)?value.options.filter((item):item is string=>typeof item==="string"):undefined};
  } catch {
    return undefined;
  }
}

export function parseHandoffRequest(output?: string): HandoffRequest | undefined {
  const marker=lastMarker(output,"CONTROL_HANDOFF");
  if(!marker)return undefined;
  try {
    const value=JSON.parse(marker) as Partial<HandoffRequest>;
    if(typeof value.agentId!=="string"||!value.agentId.trim()||typeof value.message!=="string"||!value.message.trim())return undefined;
    return {agentId:value.agentId.trim(),message:value.message.trim(),reason:typeof value.reason==="string"&&value.reason.trim()?value.reason.trim():undefined};
  } catch {
    return undefined;
  }
}

export function parseTestReports(output?:string):TestReport[]{
  if(!output)return [];
  const reports:TestReport[]=[];
  for(const match of output.matchAll(/(?:^|\n)CONTROL_TEST:\s*(\{[^\n]+\})/g)){
    try {
      const value=JSON.parse(match[1]) as Partial<TestReport>;
      if(typeof value.command!=="string"||!value.command.trim()||!value.status||!["passed","failed","skipped"].includes(value.status))continue;
      reports.push({command:value.command.trim(),status:value.status,summary:typeof value.summary==="string"&&value.summary.trim()?value.summary.trim():undefined});
    } catch { /* malformed agent reports are ignored */ }
  }
  return reports;
}

export function terminalTransition(eventType:"completed"|"failed",decisionRequested:boolean):{
  runStatus:ControlRun["status"];
  taskStatus:ControlTask["status"];
  isTerminal:boolean;
}{
  if(decisionRequested)return {runStatus:"awaiting-input",taskStatus:"awaiting-input",isTerminal:false};
  return eventType==="completed"
    ? {runStatus:"completed",taskStatus:"review",isTerminal:true}
    : {runStatus:"failed",taskStatus:"failed",isTerminal:true};
}

export function shouldRecoverRun(run:Pick<ControlRun,"status"|"pid"|"startedAt">,processRunning:boolean|undefined,now:number):boolean{
  if(!["starting","running"].includes(run.status))return false;
  if(!run.pid)return now-run.startedAt>=30_000;
  return processRunning===false;
}

export function recoveryAction(
  run: Pick<ControlRun,"status"|"pid"|"processStartedAt"|"startedAt"|"heartbeatAt">,
  processRunning: boolean|undefined,
  existedAtStartup: boolean,
  now: number,
): "wait"|"interrupt"|"terminate-orphan" {
  if(!["starting","running"].includes(run.status))return "wait";
  if(!run.pid)return now-run.startedAt>=30_000?"interrupt":"wait";
  if(processRunning===false){
    if(!existedAtStartup&&now-Math.max(run.heartbeatAt||0,run.startedAt)<30_000)return "wait";
    return "interrupt";
  }
  if(existedAtStartup&&processRunning===true)return run.processStartedAt?"terminate-orphan":"interrupt";
  return "wait";
}

export function conversationTerminalTransition(eventType:"completed"|"failed",hasResponse:boolean):{
  runStatus:"completed"|"failed";
  deliveryStatus:"delivered"|"failed";
}{
  return eventType==="completed"&&hasResponse
    ?{runStatus:"completed",deliveryStatus:"delivered"}
    :{runStatus:"failed",deliveryStatus:"failed"};
}
