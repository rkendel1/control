import test from "node:test";
import assert from "node:assert/strict";
import {conversationTerminalTransition,frameRunOutput,parseDecisionRequest,parseHandoffRequest,parseTestReports,recoveryAction,shouldRecoverRun,terminalTransition} from "./task-lifecycle.ts";

test("successful work enters review",()=>{
  assert.deepEqual(terminalTransition("completed",false),{runStatus:"completed",taskStatus:"review",isTerminal:true});
});

test("agents can request a structured handoff",()=>{
  assert.deepEqual(parseHandoffRequest('done\nCONTROL_HANDOFF: {"agentId":"tester","message":"Verify the fix","reason":"Implementation complete"}'),{agentId:"tester",message:"Verify the fix",reason:"Implementation complete"});
  assert.deepEqual(parseHandoffRequest('CONTROL_HANDOFF: {"agentId":"old","message":"ignore"}\nCONTROL_HANDOFF: {"agentId":"reviewer","message":"Review this"}'),{agentId:"reviewer",message:"Review this",reason:undefined});
  assert.equal(parseHandoffRequest('CONTROL_HANDOFF: {"agentId":"tester"}'),undefined);
});

test("agent test evidence is structured and rejects malformed reports",()=>{
  assert.deepEqual(parseTestReports('CONTROL_TEST: {"command":"npm test","status":"passed","summary":"42 tests"}\nCONTROL_TEST: {"command":"npm run lint","status":"failed"}'),[
    {command:"npm test",status:"passed",summary:"42 tests"},{command:"npm run lint",status:"failed",summary:undefined}
  ]);
  assert.deepEqual(parseTestReports('CONTROL_TEST: {"command":"npm test","status":"unknown"}'),[]);
});

test("stream output preserves complete lines and flushes the final partial line",()=>{
  assert.deepEqual(frameRunOutput("","partial"),{ready:"",pending:"partial"});
  assert.deepEqual(frameRunOutput("partial"," line\nnext"),{ready:"partial line\n",pending:"next"});
  assert.deepEqual(frameRunOutput("next","",true),{ready:"next",pending:""});
  assert.deepEqual(frameRunOutput("","x".repeat(4096)),{ready:"x".repeat(4096),pending:""});
});

test("failed work becomes an actionable failure",()=>{
  assert.deepEqual(terminalTransition("failed",false),{runStatus:"failed",taskStatus:"failed",isTerminal:true});
});

test("a decision pauses rather than completes work",()=>{
  assert.deepEqual(terminalTransition("completed",true),{runStatus:"awaiting-input",taskStatus:"awaiting-input",isTerminal:false});
  assert.deepEqual(parseDecisionRequest('progress\nCONTROL_DECISION: {"question":"Choose API","options":["A","B"]}'),{question:"Choose API",context:undefined,options:["A","B"]});
  assert.equal(parseDecisionRequest("CONTROL_DECISION: nope"),undefined);
});

test("recovery allows dispatch startup but resolves dead processes",()=>{
  const now=100_000;
  assert.equal(shouldRecoverRun({status:"starting",startedAt:now-1_000},undefined,now),false);
  assert.equal(shouldRecoverRun({status:"starting",startedAt:now-31_000},undefined,now),true);
  assert.equal(shouldRecoverRun({status:"running",pid:42,startedAt:now-1_000},true,now),false);
  assert.equal(shouldRecoverRun({status:"running",pid:42,startedAt:now-1_000},false,now),true);
});

test("restart recovery terminates only identity-bearing startup orphans",()=>{
  const now=100_000;
  assert.equal(recoveryAction({status:"running",pid:42,processStartedAt:500,startedAt:1},true,true,now),"terminate-orphan");
  assert.equal(recoveryAction({status:"running",pid:42,startedAt:1},true,true,now),"interrupt");
  assert.equal(recoveryAction({status:"running",pid:42,processStartedAt:500,startedAt:1},true,false,now),"wait");
  assert.equal(recoveryAction({status:"running",pid:42,processStartedAt:500,startedAt:1},false,true,now),"interrupt");
});

test("conversation execution delivers only a completed non-empty response",()=>{
  assert.deepEqual(conversationTerminalTransition("completed",true),{runStatus:"completed",deliveryStatus:"delivered"});
  assert.deepEqual(conversationTerminalTransition("completed",false),{runStatus:"failed",deliveryStatus:"failed"});
  assert.deepEqual(conversationTerminalTransition("failed",true),{runStatus:"failed",deliveryStatus:"failed"});
});
