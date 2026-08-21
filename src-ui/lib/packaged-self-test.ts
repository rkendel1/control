import { invoke } from "./tauri";
import { createId, getControlDatabase, LOCAL_PARTICIPANT_ID, type ControlTask } from "./control-db";
import { parseDecisionRequest, parseHandoffRequest, terminalTransition } from "./task-lifecycle";
import type { Collection } from "@feltdb/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import React from "react";
import { createRoot } from "react-dom/client";
import QuickOpen from "../components/QuickOpen";
import type { ExplorerNode } from "../types";
type SelfTestConfig = {
    projectPath: string;
    reportPath: string;
};
type Check = {
    name: string;
    passed: boolean;
    detail?: string;
};
type TreeNode = {
    path: string;
    children?: TreeNode[];
};
function paths(nodes: TreeNode[]): string[] { return nodes.flatMap(node => [node.path, ...paths(node.children || [])]); }
export async function packagedSelfTestConfig(): Promise<SelfTestConfig | undefined> {
    const response = await invoke<SelfTestConfig | null>("cmd_self_test_config");
    return response.success && response.data ? response.data : undefined;
}
export async function runPackagedSelfTest(config: SelfTestConfig): Promise<{
    passed: boolean;
    generatedAt: string;
    checks: Check[];
    error?: string;
}> {
    const db = getControlDatabase(), checks: Check[] = [],windowsPlatform=/Windows/i.test(navigator.userAgent);
    const ids: {
        collection: {
            delete(id: string): Promise<unknown>;
        };
        id: string;
    }[] = [];
    const check = (name: string, passed: boolean, detail?: string) => { checks.push({ name, passed, detail }); if (!passed)
        throw new Error(`${name}${detail ? `: ${detail}` : ""}`); };
    const remember = <T extends {
        id: string;
    }>(collection: Collection<T>, value: T) => { ids.push({ collection, id: value.id }); return collection.insert(value, value.id); };
    let error: string | undefined, disposableProjectId: string | undefined;
    try {
        const inspected = await invoke<{
            id: string;
            name: string;
            path: string;
        }>("cmd_project_inspect", { path: config.projectPath, name: "Control packaged self-test" });
        check("project inspection", Boolean(inspected.success && inspected.data?.path), inspected.error);
        const tree = await invoke<TreeNode[]>("cmd_explorer_tree", { workspacePath: config.projectPath, showGenerated: false });
        const visible = paths(tree.data || []);
        check("deep file explorer", tree.success && visible.includes("README.md") && visible.includes("src/nested/self-test.txt"), tree.error || visible.join(", "));
        const file = await invoke<string>("cmd_file_read", { workspacePath: config.projectPath, filePath: "src/nested/self-test.txt" });
        check("file read", file.success && file.data === "CONTROL_FILE_OK\n", file.error || file.data);
        const quickOpenHost=document.createElement("div"),quickOpenTree:ExplorerNode[]=[{id:"src",path:"src",name:"src",type:"folder",children:[{id:"nested",path:"src/nested",name:"nested",type:"folder",children:[{id:"self-test",path:"src/nested/self-test.txt",name:"self-test.txt",type:"file"}]}]}];
        quickOpenHost.style.cssText="position:fixed;left:-10000px;width:800px;height:600px";document.body.appendChild(quickOpenHost);const quickOpenRoot=createRoot(quickOpenHost);let quickOpened="",quickClosed=false;
        try{quickOpenRoot.render(React.createElement(QuickOpen,{tree:quickOpenTree,onOpen:path=>{quickOpened=path;},onClose:()=>{quickClosed=true;}}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const input=quickOpenHost.querySelector<HTMLInputElement>(".palette-input"),result=quickOpenHost.querySelector<HTMLElement>(".result-item");result?.click();check("rendered Quick Open",Boolean(input&&result&&quickOpened==="src/nested/self-test.txt"&&quickClosed));}finally{quickOpenRoot.unmount();quickOpenHost.remove();}
        const fullTree=await invoke<TreeNode[]>("cmd_explorer_tree",{workspacePath:config.projectPath,showGenerated:true}),generatedParentExisted=paths(fullTree.data||[]).includes("node_modules"),hiddenSearchPath=".control-selftest-search.txt",generatedSearchRoot=`node_modules/${createId("control-selftest-search")}`,generatedSearchPath=`${generatedSearchRoot}/result.txt`;let hiddenSearch:{success:boolean;data?:Array<{file_path:string}>;error?:string}={success:false},generatedExcluded=hiddenSearch,generatedIncluded=hiddenSearch;
        try{await invoke("cmd_file_create",{workspacePath:config.projectPath,filePath:hiddenSearchPath,isDirectory:false});await invoke("cmd_file_save",{workspacePath:config.projectPath,filePath:hiddenSearchPath,content:"CONTROL_HIDDEN_SEARCH\n"});await invoke("cmd_file_create",{workspacePath:config.projectPath,filePath:generatedSearchPath,isDirectory:false});await invoke("cmd_file_save",{workspacePath:config.projectPath,filePath:generatedSearchPath,content:"CONTROL_GENERATED_SEARCH\n"});hiddenSearch=await invoke("cmd_search",{workspacePath:config.projectPath,pattern:"CONTROL_HIDDEN_SEARCH",includePatterns:null,caseSensitive:false,wholeWord:false,useRegex:false,includeGenerated:false});generatedExcluded=await invoke("cmd_search",{workspacePath:config.projectPath,pattern:"CONTROL_GENERATED_SEARCH",includePatterns:null,caseSensitive:false,wholeWord:false,useRegex:false,includeGenerated:false});generatedIncluded=await invoke("cmd_search",{workspacePath:config.projectPath,pattern:"CONTROL_GENERATED_SEARCH",includePatterns:null,caseSensitive:false,wholeWord:false,useRegex:false,includeGenerated:true});}finally{await invoke("cmd_file_delete",{workspacePath:config.projectPath,filePath:hiddenSearchPath});await invoke("cmd_file_delete",{workspacePath:config.projectPath,filePath:generatedParentExisted?generatedSearchRoot:"node_modules"});}
        check("workspace search visibility",Boolean(hiddenSearch.success&&hiddenSearch.data?.some(result=>result.file_path===hiddenSearchPath)&&generatedExcluded.success&&!generatedExcluded.data?.length&&generatedIncluded.success&&generatedIncluded.data?.some(result=>result.file_path===generatedSearchPath)),hiddenSearch.error||generatedExcluded.error||generatedIncluded.error);
        const watchedPath="control-selftest-watched.txt";let stopWatchEvent:undefined|(()=>void),resolveWatch:undefined|((passed:boolean)=>void);
        const watchEvent=new Promise<boolean>(resolve=>{resolveWatch=resolve;window.setTimeout(()=>resolve(false),5000);});
        stopWatchEvent=await listen<{workspacePath:string;path:string;eventType:string}>("workspace-file-change",({payload})=>{if(payload.workspacePath===config.projectPath&&payload.path===watchedPath)resolveWatch?.(true);});
        const watching=await invoke<string>("cmd_watch_directory",{workspacePath:config.projectPath});
        const watchedCreate=watching.success?await invoke("cmd_file_create",{workspacePath:config.projectPath,filePath:watchedPath,isDirectory:false}):watching;
        const watchPassed=watchedCreate.success&&await watchEvent;
        await invoke("cmd_unwatch_directory",{workspacePath:config.projectPath});stopWatchEvent();await invoke("cmd_file_delete",{workspacePath:config.projectPath,filePath:watchedPath});
        check("live workspace file events",Boolean(watchPassed),watching.error||watchedCreate.error);
        const git = await invoke<{
            branch: string;
            is_clean: boolean;
        }>("cmd_git_status", { workspacePath: config.projectPath });
        check("Git status", Boolean(git.success && git.data?.branch), git.error);
        const untrackedPath="control-selftest-untracked.txt";
        try{
            const created=await invoke("cmd_file_create",{workspacePath:config.projectPath,filePath:untrackedPath,isDirectory:false});
            const saved=created.success?await invoke("cmd_file_save",{workspacePath:config.projectPath,filePath:untrackedPath,content:"CONTROL_UNTRACKED_DIFF\n"}):created;
            const diff=saved.success?await invoke<string>("cmd_git_diff",{workspacePath:config.projectPath,filePath:untrackedPath,staged:false}):{success:false,error:saved.error};
            check("untracked file review",Boolean(diff.success&&diff.data?.includes("+CONTROL_UNTRACKED_DIFF")),diff.error||diff.data);
        } finally { await invoke("cmd_file_delete",{workspacePath:config.projectPath,filePath:untrackedPath}); }
        const testCommand = await invoke<string>("cmd_project_test_command", { workspacePath: config.projectPath });
        check("test command detection", testCommand.success && testCommand.data === "npm test", testCommand.error || testCommand.data);
        const session = await invoke<string>("cmd_terminal_create_session", { name: "self-test", cwd: config.projectPath });
        const terminal = session.data ? await invoke<string>("cmd_terminal_execute", { sessionId: session.data, command: windowsPlatform?"cd":"pwd", cwd: config.projectPath }) : { success: false, error: session.error };
        check("terminal execution", Boolean(terminal.success && terminal.data?.trim().replace(/\\/g,"/") === config.projectPath.replace(/\\/g,"/")), terminal.error || terminal.data);
        const ptyId=createId("selftest_terminal");let ptyOutput="",stopPty:undefined|(()=>void),resolvePty:undefined|((value:boolean)=>void),resolveShellReady:undefined|(()=>void);
        let ptyReady:Promise<boolean>|undefined;
        const shellReady=new Promise<void>(resolve=>{resolveShellReady=resolve;window.setTimeout(resolve,5000);});let shellReadyTimer:undefined|number,lastPtyOutputAt=0;
        stopPty=await listen<{sessionId:string;eventType:string;output?:string}>("terminal-event",({payload})=>{if(payload.sessionId!==ptyId||!payload.output)return;lastPtyOutputAt=Date.now();if(shellReadyTimer)window.clearTimeout(shellReadyTimer);shellReadyTimer=window.setTimeout(()=>resolveShellReady?.(),350);ptyOutput+=payload.output;if(ptyOutput.includes("__CONTROL_PTY__")&&ptyOutput.includes(config.projectPath))resolvePty?.(true);});
        const ptyOpen=await invoke<number>("cmd_terminal_session_open",{sessionId:ptyId,cwd:config.projectPath});
        const ptyResize=ptyOpen.success?await invoke<boolean>("cmd_terminal_session_resize",{sessionId:ptyId,rows:40,cols:120}):{success:false,error:ptyOpen.error};
        if(ptyResize.success)await shellReady;
        let cdWrite:{success:boolean;data?:boolean;error?:string}=ptyResize.success?await invoke<boolean>("cmd_terminal_session_write",{sessionId:ptyId,input:"cd src\r"}):{success:false,error:ptyResize.error};
        let ptyCwd:{success:boolean;data?:string;error?:string}={success:false,error:cdWrite.error};
        if(cdWrite.success)for(let commandAttempt=0;commandAttempt<3&&!ptyCwd.data?.replace(/\\/g,"/").endsWith("/src");commandAttempt++){if(commandAttempt)cdWrite=await invoke<boolean>("cmd_terminal_session_write",{sessionId:ptyId,input:"cd src\r"});for(let poll=0;poll<60;poll++){ptyCwd=await invoke<string>("cmd_terminal_session_cwd",{sessionId:ptyId});if(ptyCwd.success&&ptyCwd.data?.replace(/\\/g,"/").endsWith("/src"))break;await new Promise(resolve=>window.setTimeout(resolve,50));}}
        if(ptyCwd.success)for(let attempt=0;attempt<40&&Date.now()-lastPtyOutputAt<350;attempt++)await new Promise(resolve=>window.setTimeout(resolve,50));
        ptyReady=new Promise<boolean>(resolve=>{resolvePty=resolve;window.setTimeout(()=>resolve(false),5000);});
        const ptyWrite=ptyCwd.success&&ptyCwd.data?.replace(/\\/g,"/").endsWith("/src")?await invoke<boolean>("cmd_terminal_session_write",{sessionId:ptyId,input:windowsPlatform?"echo __CONTROL_PTY__%CD%\r":"printf '__CONTROL_PTY__%s\\n' \"$PWD\"\r"}):{success:false,error:ptyCwd.error||"Terminal cwd did not change"};
        const ptyPassed=ptyWrite.success&&await ptyReady;await invoke("cmd_terminal_session_close",{sessionId:ptyId});stopPty();
        check("persistent PTY lifecycle",Boolean(ptyPassed&&ptyOutput.replace(/\\/g,"/").includes(`${config.projectPath.replace(/\\/g,"/")}/src`)&&ptyCwd.success&&ptyCwd.data?.replace(/\\/g,"/").endsWith("/src")),ptyCwd.error||ptyWrite.error||ptyOutput);
        const xtermHost=document.createElement("div");xtermHost.style.cssText="position:fixed;left:-10000px;width:640px;height:320px";document.body.appendChild(xtermHost);
        const packagedTerminal=new XTerm({rows:24,cols:80});packagedTerminal.open(xtermHost);packagedTerminal.write("CONTROL_XTERM_OK");
        check("interactive terminal emulator",Boolean(xtermHost.querySelector(".xterm")&&packagedTerminal.rows===24&&packagedTerminal.cols===80));packagedTerminal.dispose();xtermHost.remove();
        const credential=await invoke<boolean>("cmd_secure_credential_self_test");check("OS secure credential round-trip",credential.success&&credential.data===true,credential.error);
        const runtimeInventory=await invoke<Array<{id:string;available:boolean;model?:string}>>("cmd_runtime_availability");
        check("universal runtime discovery",Boolean(runtimeInventory.success&&["claude-code","codex","opencode","ollama"].every(id=>runtimeInventory.data?.some(runtime=>runtime.id===id&&typeof runtime.available==="boolean"))),runtimeInventory.error);
        const ollama=runtimeInventory.data?.find(runtime=>runtime.id==="ollama"),ollamaRunId=createId("selftest_ollama_run");let ollamaEvent:{eventType:string;output?:string;error?:string}|undefined,stopOllama:(()=>void)|undefined;
        if(ollama?.available&&ollama.model){let resolveTerminal:(value:{eventType:string;output?:string;error?:string})=>void=()=>undefined;const terminal=new Promise<{eventType:string;output?:string;error?:string}>(resolve=>resolveTerminal=resolve),timer=window.setTimeout(()=>resolveTerminal({eventType:"failed",error:"Ollama smoke test timed out"}),120_000);stopOllama=await listen<{runId:string;eventType:string;output?:string;error?:string}>("agent-chat-event",({payload})=>{if(payload.runId===ollamaRunId&&["completed","failed"].includes(payload.eventType)){window.clearTimeout(timer);resolveTerminal(payload);}});const started=await invoke<{pid:number;runtime:string}>("cmd_agent_chat",{runId:ollamaRunId,projectPath:config.projectPath,projectName:"Control packaged self-test",agentName:"Local model verifier",agentInstructions:"Follow the requested response format exactly.",history:"",content:"Reply with exactly CONTROL_OLLAMA_OK and nothing else.",preferredRuntime:`ollama:${ollama.model}`,executionTimeoutMinutes:2});if(started.success)ollamaEvent=await terminal;else{window.clearTimeout(timer);ollamaEvent={eventType:"failed",error:started.error};}stopOllama();}
        check("supervised Ollama response",!ollama?.available||Boolean(ollamaEvent?.eventType==="completed"&&ollamaEvent.output?.includes("CONTROL_OLLAMA_OK")),ollama?.available?ollamaEvent?.error:"Ollama is not installed; discovery path verified");
        const localParticipant = await db.participants.get(LOCAL_PARTICIPANT_ID);
        check("durable human identity", localParticipant?.type === "human" && localParticipant.status === "active");
        const developer = await db.agents.get("developer");
        check("durable agent execution policy", Boolean(developer?.executionPolicy && developer.executionPolicy.filesystem === "workspace-write" && !developer.executionPolicy.network&&developer.timeoutMinutes===60));
        check("supervised execution schema", ((await db.metadata.get("database"))?.schemaVersion || 0) >= 13);
        const now = Date.now(), projectId = createId("selftest_project"), workId = createId("selftest_work"), taskId = createId("selftest_task"), agentId = "developer";
        disposableProjectId=projectId;
        await remember(db.projects, { id: projectId, name: "Packaged self-test", path: config.projectPath, createdAt: now, updatedAt: now });
        await remember(db.works, { id: workId, projectId, title: "Verify packaged lifecycle", intent: "Disposable acceptance work", kind: "task", status: "captured", createdAt: now, updatedAt: now });
        const task: ControlTask = { id: taskId, workId, projectId, title: "Verify packaged lifecycle", description: "Disposable acceptance work", status: "not-started", assignedTo: agentId, priority: "high", urgency: "urgent", tags: ["self-test"], blockedBy: [], acceptanceCriteria: ["Produces durable review state"], feedback: [], createdAt: now, updatedAt: now };
        await remember(db.tasks, task);
        const baselineIntegrity=await db.reconcileCanonicalGraph(),repairTaskId=createId("selftest_task"),missingWorkId=createId("selftest_work");
        await remember(db.tasks,{...task,id:repairTaskId,workId:missingWorkId,title:"Repair missing Work"});
        const integrity=await db.reconcileCanonicalGraph();
        check("canonical graph self-repair",integrity.repairs===1&&integrity.issues===baselineIntegrity.issues&&await db.works.exists(missingWorkId));
        const assignmentId = createId("selftest_inbox");
        await remember(db.inboxItems, { id: assignmentId, projectId, workId, taskId, fromParticipantId: LOCAL_PARTICIPANT_ID, toParticipantId: agentId, type: "assignment", title: "Verify packaged lifecycle", status: "open", createdAt: now, updatedAt: now });
        await db.tasks.update(taskId, { assignedTo: "tester", updatedAt: now + 1 });
        const handoffId = createId("selftest_inbox");
        await remember(db.inboxItems, { id: handoffId, projectId, workId, taskId, fromParticipantId: agentId, toParticipantId: "tester", type: "handoff", title: "Handoff packaged lifecycle", status: "open", createdAt: now + 1, updatedAt: now + 1 });
        const received = await db.inboxItems.find({ workId, toParticipantId: "tester" });
        check("durable agent handoff", received.length === 1 && received[0].taskId === taskId && (await db.tasks.get(taskId))?.workId === workId);
        const handoffRequest = parseHandoffRequest('CONTROL_HANDOFF: {"agentId":"tester","message":"Verify the packaged lifecycle","reason":"Implementation complete"}');
        check("structured automatic handoff protocol", handoffRequest?.agentId === "tester" && handoffRequest.message === "Verify the packaged lifecycle");
        await db.inboxItems.update(handoffId, { status: "acted", updatedAt: now + 2, actedAt: now + 2 });
        check("agent inbox action lifecycle", (await db.inboxItems.get(handoffId))?.status === "acted");
        const runId = createId("selftest_run");
        await remember(db.runs, { id: runId, taskId, projectId, workId, agentId, runtime: "self-test", status: "running", pid: 4242, processStartedAt: 123456, startedAt: now });
        await remember(db.changeSets,{id:runId,runId,taskId,projectId,workId,branch:"main",baselineFiles:[],files:[{path:"src/nested/self-test.txt",status:"modified",staged:false,preExisting:false}],capturedAt:now+1,createdAt:now});
        const testResultId=createId("selftest_test_result");
        await remember(db.testResults,{id:testResultId,runId,taskId,projectId,workId,command:"npm test",status:"passed",summary:"packaged fixture",provenance:"agent-reported",createdAt:now+1});
        check("durable review artifacts",(await db.changeSets.get(runId))?.files[0]?.path==="src/nested/self-test.txt"&&(await db.testResults.get(testResultId))?.status==="passed");
        const outputId = createId("selftest_event");
        await remember(db.runEvents, { id: outputId, runId, projectId, workId, taskId, type: "output", content: "CONTROL_RUN_OK", createdAt: now });
        const completed = terminalTransition("completed", false);
        await db.runs.update(runId, { status: completed.runStatus, completedAt: now + 1, summary: "CONTROL_RUN_OK", exitCode: 0 });
        await db.transitionRuntimeWork(taskId,"review",{updatedAt:now+1});
        check("task dispatch to review", (await db.tasks.get(taskId))?.status === "review" && (await db.works.get(workId))?.status === "review" && (await db.runs.get(runId))?.status === "completed" && (await db.runs.get(runId))?.processStartedAt === 123456);
        const feedback = { id: createId("selftest_feedback"), author: "self-test", content: "Add verification", createdAt: now + 2 };
        await db.tasks.update(taskId, { feedback: [feedback], updatedAt: now + 2 });await db.transitionRuntimeWork(taskId,"requeued",{updatedAt:now+2});
        check("feedback and reopen", (await db.tasks.get(taskId))?.feedback[0]?.content === "Add verification");
        const request = parseDecisionRequest('CONTROL_DECISION: {"question":"Ship it?","options":["Yes","No"]}');
        check("agent decision request", request?.question === "Ship it?");
        const decisionId = createId("selftest_decision");
        await remember(db.decisions, { id: decisionId, projectId, workId, taskId, runId, requestedBy: agentId, question: request!.question, context: "review", options: request!.options || [], status: "pending", createdAt: now + 3 });
        await db.decisions.update(decisionId, { status: "answered", answer: "Yes", answeredAt: now + 4 });
        check("durable approval decision", (await db.decisions.get(decisionId))?.answer === "Yes");
        await db.completeTask(taskId,"approval","Approved packaged lifecycle");
        check("approval completion", (await db.tasks.get(taskId))?.status === "done" && (await db.works.get(workId))?.status === "completed");
        check("completion provenance",(await db.evidence.find({workId})).some(item=>item.kind==="review"&&item.result==="passed"&&item.provenance==="Control human review")&&(await db.outcomes.find({workId})).some(item=>item.status==="passed"&&item.summary==="Approved packaged lifecycle"));
        await db.reopenTask(taskId,"Acceptance needs another pass");
        check("reopen provenance",(await db.tasks.get(taskId))?.status==="not-started"&&(await db.works.get(workId))?.status==="reopened"&&(await db.outcomes.find({workId})).some(item=>item.status==="reopened"&&item.summary==="Acceptance needs another pass"));
        await db.completeTask(taskId,"approval","Approved after packaged reopen");
        await db.archiveTask(taskId);await db.restoreTask(taskId);
        check("archive preserves lifecycle",(await db.tasks.get(taskId))?.status==="done"&&(await db.works.get(workId))?.status==="completed");
        const conversationId = createId("selftest_conversation"), messageId = createId("selftest_message");
        await remember(db.conversations, { id: conversationId, projectId, workId, taskId, agentId, title: "Lifecycle review", createdAt: now, updatedAt: now });
        const chatRunId=createId("selftest_chat_run");
        await remember(db.runs,{id:chatRunId,projectId,workId,taskId,kind:"conversation",conversationId,requestMessageId:messageId,agentId,runtime:"self-test",status:"completed",startedAt:now,completedAt:now+1,summary:"Approved"});
        await remember(db.messages, { id: messageId, conversationId, senderId: LOCAL_PARTICIPANT_ID, role: "user", type: "approval", content: "Approved",deliveryStatus:"delivered",runId:chatRunId, createdAt: now });
        const chatEventId=createId("selftest_event");await remember(db.runEvents,{id:chatEventId,runId:chatRunId,projectId,workId,taskId,type:"completed",content:"Conversation response completed",createdAt:now+1});
        check("task-linked conversation", (await db.messages.find({ conversationId })).length === 1 && (await db.messages.get(messageId))?.deliveryStatus==="delivered"&&(await db.conversations.get(conversationId))?.workId === workId);
        check("supervised conversation run",(await db.runs.get(chatRunId))?.conversationId===conversationId&&(await db.messages.get(messageId))?.runId===chatRunId&&(await db.runEvents.find({runId:chatRunId})).length===1);
        const investigationId = createId("selftest_investigation");
        await remember(db.investigations, { id: investigationId, projectId, workId, question: "Is the packaged graph durable?", hypotheses: ["FeltDB preserves links"], sources: ["packaged self-test"], contradictions: [], gaps: [], status: "open", createdAt: now, updatedAt: now });
        await db.investigations.update(investigationId, { status: "concluded", conclusion: "The graph is queryable inside the package", updatedAt: now + 1 });
        check("durable investigation", (await db.investigations.get(investigationId))?.conclusion === "The graph is queryable inside the package");
        const evidenceId = createId("selftest_evidence");
        await remember(db.evidence, { id: evidenceId, projectId, workId, taskId, runId, kind: "test", summary: "Packaged lifecycle verified", result: "passed", provenance: "packaged self-test", createdAt: now });
        const outcomeId = createId("selftest_outcome");
        await remember(db.outcomes, { id: outcomeId, projectId, workId, taskId, status: "passed", summary: "Self-test approved", evidenceIds: [evidenceId], createdAt: now });
        const activityId = createId("selftest_activity");
        await remember(db.activity, { id: activityId, projectId, workId, taskId, runId, type: "task_approved", actor: "self-test", summary: "Approved packaged self-test", createdAt: now });
        check("persistent Work graph", (await db.runEvents.find({ workId })).length === 2 && (await db.runs.find({workId})).length===2&&(await db.changeSets.find({workId})).length===1&&(await db.testResults.find({workId})).length===1&& (await db.activity.find({ workId })).length === 6 && (await db.evidence.find({ workId })).length === 3 && (await db.outcomes.find({ workId })).length === 4 && (await db.inboxItems.find({ workId })).length === 2);
        const snapshot = await db.exportSnapshot();
        check("topology-neutral FeltDB export", snapshot.format === "control-feltdb-snapshot" && snapshot.collections.tasks.some(record => (record as { id?: string }).id === taskId));
        const restored = await db.importSnapshot(snapshot);
        check("restore preserves durable identity", restored.applied > 0 && (await db.tasks.get(taskId))?.workId === workId, `${restored.applied} records`);
        const removal=await db.removeProjectGraph(projectId);
        const graphResidue=(await Promise.all([db.projects.find({id:projectId}),db.works.find({projectId}),db.tasks.find({projectId}),db.inboxItems.find({projectId}),db.runs.find({projectId}),db.runEvents.find({projectId}),db.changeSets.find({projectId}),db.testResults.find({projectId}),db.conversations.find({projectId}),db.decisions.find({projectId}),db.evidence.find({projectId}),db.outcomes.find({projectId}),db.activity.find({projectId}),db.investigations.find({projectId}),db.terminals.find({projectId}),db.drafts.find({projectId})])).flat().length+(await db.messages.find({conversationId})).length;
        check("zero-orphan project removal",removal.deleted>0&&graphResidue===0,`${graphResidue} records remain`);
    }
    catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
    }
    finally {
        if(disposableProjectId){
            try{
                for(const run of await db.runs.find({projectId:disposableProjectId}))if(run.status==="starting"||run.status==="running")await db.runs.update(run.id,{status:"stopped",completedAt:Date.now()});
                if(await db.projects.exists(disposableProjectId))await db.removeProjectGraph(disposableProjectId);
            }catch{/* individual identity cleanup below remains as a fallback */}
        }
        for (const item of ids.reverse()) {
            try {
                await item.collection.delete(item.id);
            }
            catch { /* report cleanup failure through residue check below */ }
        }
    }
    const residue = (await Promise.all([db.projects.all(), db.works.all(), db.tasks.all(), db.inboxItems.all(), db.investigations.all(), db.runs.all(), db.runEvents.all(),db.changeSets.all(),db.testResults.all(), db.conversations.all(), db.decisions.all(), db.evidence.all(), db.outcomes.all(), db.activity.all()])).flat().filter(record => record.id.startsWith("selftest_")).length;
    checks.push({ name: "self-test cleanup", passed: residue === 0, detail: residue ? `${residue} records remain` : undefined });
    if (residue && !error)
        error = `Self-test cleanup left ${residue} records`;
    const result = { passed: !error && checks.every(item => item.passed), generatedAt: new Date().toISOString(), checks, error };
    const written = await invoke("cmd_data_export", { path: config.reportPath, content: JSON.stringify(result, null, 2) });
    if (!written.success)
        return { ...result, passed: false, error: [error, written.error].filter(Boolean).join("; ") };
    return result;
}
