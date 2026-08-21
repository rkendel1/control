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
});

test("ordinary task and conversation flows use automatic Control Intelligence",async()=>{
  const [tasks,coordination,dispatch]=await Promise.all([read("../components/TasksPanel.tsx"),read("../components/CoordinationPanel.tsx"),read("./agent-dispatch.ts")]);
  assert.match(tasks,/Control Intelligence \(automatic\)/);
  assert.doesNotMatch(coordination,/window\.prompt\(`Agent/);
  assert.match(dispatch,/control-intelligence/);
  assert.doesNotMatch(dispatch,/Assign an active agent/);
  assert.match(coordination,/useEffect\(\(\)=>setTab\(initialTab\),\[initialTab\]\)/);
});

test("repository guidance discovers commands, provenance and documentation drift",async()=>{
  const source=(await read("./operational-memory.ts"))+(await read("../components/Terminal.tsx"));
  assert.match(source,/package\.json#scripts/);
  assert.match(source,/Cargo\.toml/);
  assert.match(source,/possibly-stale/);
  assert.match(source,/lastVerifiedAt/);
});
