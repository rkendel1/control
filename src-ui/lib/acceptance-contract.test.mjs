import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("canonical schema includes Work, Intelligence, Skills, Capabilities, Claims and operational memory",async()=>{
  const source=await read("./control-db.ts");
  for(const collection of ["control_work","control_intelligence","control_skills","control_capabilities","control_claims","control_repositories","control_operational_commands","control_documentation"])assert.match(source,new RegExp(collection));
  assert.match(source,/schemaVersion: 16/);
  assert.match(source,/"queued" \| "starting" \| "running"/);
  assert.match(source,/heartbeatAt/);
  assert.doesNotMatch(source,/multiplexFeltChanges/);
  assert.doesNotMatch(source,/subscribe_changes=/);
});

test("ordinary task and conversation flows use automatic Control Intelligence",async()=>{
  const [tasks,coordination,dispatch]=await Promise.all([read("../components/TasksPanel.tsx"),read("../components/CoordinationPanel.tsx"),read("./agent-dispatch.ts")]);
  assert.match(tasks,/Control Intelligence \(automatic\)/);
  assert.doesNotMatch(coordination,/window\.prompt\(`Agent/);
  assert.match(dispatch,/control-intelligence/);
  assert.doesNotMatch(dispatch,/Assign an active agent/);
  assert.match(coordination,/useEffect\(\(\)=>setTab\(initialTab\),\[initialTab\]\)/);
  assert.match(coordination,/scope==="global"\?db\.conversations\.all\(\)/);
  assert.match(coordination,/version!==refreshVersion\.current/);
  assert.match(coordination,/setConversations\(current=>\[conversation/);
  assert.match(coordination,/Turn into task/);
  assert.match(coordination,/task_created_from_conversation/);
  assert.match(coordination,/Saving conversation/);
  assert.doesNotMatch(coordination,/db\.conversations\.get\(id\)/);
  assert.match(coordination,/requestSubmit\(\)/);
  assert.match(coordination,/Starting conversation…/);
  assert.match(coordination,/item\.projectId===conversationScope&&item\.scope!=="global"/);
});

test("Build with AI creates canonical feature Work and opens the running task",async()=>{
  const [builder,workbench,palette]=await Promise.all([read("../components/BuildWithAI.tsx"),read("../components/Workbench.tsx"),read("../components/CommandPalette.tsx")]);
  assert.match(builder,/db\.works\.insert/);
  assert.match(builder,/kind:"feature"/);
  assert.match(builder,/db\.tasks\.insert/);
  assert.match(builder,/await dispatchTask\(taskId\)/);
  assert.match(builder,/cmd_task_attachment_write/);
  assert.match(builder,/Paste, drop, or choose up to 12 images/);
  assert.match(builder,/Reference screenshots/);
  assert.match(builder,/Clarification is read-only/);
  assert.match(builder,/Approve plan & start building/);
  assert.match(builder,/cmd_agent_chat/);
  assert.match(workbench,/✦ Build with AI/);
  assert.match(workbench,/detail:"start-agent"/);
  assert.match(palette,/label: "Build with AI"/);
});

test("repository guidance discovers commands, provenance and documentation drift",async()=>{
  const source=(await read("./operational-memory.ts"))+(await read("../components/Terminal.tsx"));
  assert.match(source,/package\.json#scripts/);
  assert.match(source,/Cargo\.toml/);
  assert.match(source,/possibly-stale/);
  assert.match(source,/lastVerifiedAt/);
});

test("adding or opening a project completes its initial inventory scan",async()=>{
  const workspace=await read("../hooks/useWorkspace.ts");
  assert.match(workspace,/void scanProject\(database,record\)/);
  assert.match(workspace,/setProjects\(allProjects\)[\s\S]*void scanProject\(database,persisted\)/);
  assert.match(workspace,/status:"scanning"/);
});

test("the project selector switches the complete repository context",async()=>{
  const [workspace,workbench]=await Promise.all([read("../hooks/useWorkspace.ts"),read("../components/Workbench.tsx")]);
  assert.match(workspace,/projects\.find\(item=>item\.id===projectId\)/);
  assert.match(workspace,/setGitStatus\(null\)/);
  assert.match(workspace,/setExplorerTree\(\[\]\)/);
  assert.match(workbench,/onChange=\{\(e\) => void switchProject\(e\.target\.value\)\}/);
});

test("task actions remain visible in the narrow intelligence rail",async()=>{
  const [css,panel]=await Promise.all([read("../components/TasksPanel.css"),read("../components/TasksPanel.tsx")]);
  assert.match(css,/container-type:\s*inline-size/);
  assert.match(css,/\.tasks-compose-row \{ display:grid/);
  assert.match(css,/\.tasks-add\{width:auto;white-space:nowrap\}/);
  assert.match(panel,/timed out\. Check the task list before retrying/);
  assert.match(panel,/"Saving task"/);
  assert.match(panel,/creating\?"Adding…":"Add"/);
  assert.match(panel,/setTasks\(current=>current\.some/);
  assert.match(panel,/Global task/);
  assert.match(panel,/scope:taskContext==="global"\?"global":"project"/);
  assert.match(panel,/Restart data connection/);
});

test("startup restores a task whose durable Work committed before its Task record",async()=>{
  const source=await read("./control-db.ts");
  assert.match(source,/work\.kind!=="task"\|\|taskWorkIds\.has\(work\.id\)/);
  assert.match(source,/id=`recovered-\$\{work\.id\}`/);
  assert.match(source,/Restored interrupted task/);
  assert.match(source,/tags:\["recovered"\]/);
});

test("the complete AI workspace expands and restores without unmounting its state",async()=>{
  const [workbench,panel,css]=await Promise.all([read("../components/Workbench.tsx"),read("../components/ControlPanel.tsx"),read("../components/Workbench.css")]);
  assert.match(panel,/↗ Expand/);assert.match(panel,/↙ Restore/);
  assert.match(workbench,/agentExpanded\?"100%"/);
  assert.match(workbench,/event\.key==="Escape"/);
  assert.match(css,/\.workbench\.ai-focus \.terminal-container\{display:none\}/);
});

test("npm maintainers get an interactive, guarded release workflow",async()=>{
  const [release,terminal,operations]=await Promise.all([read("../components/NpmRelease.tsx"),read("../components/Terminal.tsx"),read("../components/OperationalContext.tsx")]);
  for(const command of ["npm whoami","npm pack --dry-run","npm version ${bump}","npm publish --access"])assert.ok(release.includes(command));
  assert.match(release,/window\.confirm/);
  assert.match(release,/private: true/);
  assert.match(release,/login and 2FA remain interactive/);
  assert.match(terminal,/run-terminal-command/);
  assert.match(operations,/<NpmRelease projectId=\{projectId\}/);
});
