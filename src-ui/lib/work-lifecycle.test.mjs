import test from "node:test";
import assert from "node:assert/strict";
import {runtimeWorkTransition} from "./work-lifecycle.ts";

test("runtime transitions keep Task and Work state synchronized",()=>{
  assert.deepEqual(runtimeWorkTransition("started"),{taskStatus:"in-progress",workStatus:"active"});
  assert.deepEqual(runtimeWorkTransition("review"),{taskStatus:"review",workStatus:"review"});
  assert.deepEqual(runtimeWorkTransition("awaiting-input"),{taskStatus:"awaiting-input",workStatus:"awaiting-input"});
  assert.deepEqual(runtimeWorkTransition("failed"),{taskStatus:"failed",workStatus:"failed"});
  assert.deepEqual(runtimeWorkTransition("requeued"),{taskStatus:"not-started",workStatus:"reopened"});
  assert.deepEqual(runtimeWorkTransition("resumed"),{taskStatus:"not-started",workStatus:"active"});
  assert.deepEqual(runtimeWorkTransition("handoff"),{taskStatus:"not-started",workStatus:"active"});
});
