import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID } from "../lib/control-db";
import { getSecretRedactor } from "../lib/core/secret-redactor";
import { conversationTerminalTransition } from "../lib/task-lifecycle";

type NativeChatEvent={runId:string;eventType:"output"|"completed"|"failed";output?:string;error?:string;exitCode?:number};
const queues=new Map<string,Promise<void>>();

export function useChatRunEvents():void{
  useEffect(()=>{
    let disposed=false,stop:undefined|(()=>void);
    void listen<NativeChatEvent>("agent-chat-event",({payload})=>{
      const prior=queues.get(payload.runId)||Promise.resolve();
      const next=prior.catch(()=>undefined).then(async()=>{
        const db=getControlDatabase(),run=await db.runs.get(payload.runId);if(!run||run.kind!=="conversation")return;
        const safe=(value?:string)=>value?getSecretRedactor().redact(value).redacted:undefined;
        if(payload.eventType==="output"){
          const content=safe(payload.output);if(!content)return;
          const id=createId("run_event");await db.runEvents.insert({id,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,type:"output",content,createdAt:Date.now()},id);
          const current=await db.runs.get(run.id);await db.runs.update(run.id,{summary:[current?.summary,content].filter(Boolean).join("").slice(-100000)});return;
        }
        if(run.status==="stopped")return;
        const now=Date.now(),content=safe(payload.output),error=safe(payload.error);
        const transition=conversationTerminalTransition(payload.eventType,Boolean(content));
        if(transition.runStatus==="completed"&&content){
          if(run.requestMessageId)await db.messages.update(run.requestMessageId,{deliveryStatus:"delivered",error:undefined,runId:run.id});
          const messageId=createId("message");await db.messages.insert({id:messageId,conversationId:run.conversationId!,senderId:run.agentId,role:"assistant",type:"message",content,deliveryStatus:"delivered",runId:run.id,createdAt:now},messageId);
          await db.conversations.update(run.conversationId!,{updatedAt:now});
          await db.runs.update(run.id,{status:"completed",completedAt:now,summary:content,error:undefined,exitCode:payload.exitCode});
          const eventId=createId("run_event");await db.runEvents.insert({id:eventId,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,type:"completed",content:"Conversation response completed",exitCode:payload.exitCode,createdAt:now},eventId);
          const activityId=createId("activity");await db.activity.insert({id:activityId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,runId:run.id,type:"conversation_reply",actor:run.agentId,summary:"Conversation response completed",createdAt:now},activityId);
          const evidenceId=createId("evidence");await db.evidence.insert({id:evidenceId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,runId:run.id,kind:"run_output",summary:"Conversation runtime completed",result:"unknown",provenance:`${run.runtime} conversation run ${run.id}`,createdAt:now},evidenceId);
        }else{
          const message=error||"Conversation runtime failed";
          if(run.requestMessageId)await db.messages.update(run.requestMessageId,{deliveryStatus:"failed",error:message,runId:run.id});
          await db.runs.update(run.id,{status:"failed",completedAt:now,summary:content,error:message,exitCode:payload.exitCode});
          const eventId=createId("run_event");await db.runEvents.insert({id:eventId,runId:run.id,projectId:run.projectId,workId:run.workId,taskId:run.taskId,type:"failed",content:message,exitCode:payload.exitCode,createdAt:now},eventId);
          const inboxId=createId("inbox");await db.inboxItems.insert({id:inboxId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,conversationId:run.conversationId,fromParticipantId:run.agentId,toParticipantId:LOCAL_PARTICIPANT_ID,type:"escalation",title:"Conversation response failed",body:message,status:"open",createdAt:now,updatedAt:now},inboxId);
          const activityId=createId("activity");await db.activity.insert({id:activityId,projectId:run.projectId,workId:run.workId,taskId:run.taskId,runId:run.id,type:"conversation_failed",actor:run.agentId,summary:"Conversation response failed",details:message,createdAt:now},activityId);
        }
      });queues.set(payload.runId,next);void next.catch(error=>console.error("Unable to persist conversation run event",error)).finally(()=>{if(queues.get(payload.runId)===next)queues.delete(payload.runId);});
    }).then(unlisten=>{if(disposed)unlisten();else stop=unlisten;});return()=>{disposed=true;stop?.();};
  },[]);
}
