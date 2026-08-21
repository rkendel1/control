import test from "node:test";
import assert from "node:assert/strict";
import {assessModelRouting} from "./model-routing.ts";

test("routine coding stays local",()=>assert.equal(assessModelRouting({title:"Add empty state to task list"}).tier,"local"));
test("architecture and high-risk work consults frontier models",()=>{
  assert.equal(assessModelRouting({title:"Design authorization architecture"}).tier,"frontier");
  assert.equal(assessModelRouting({title:"Migrate production database schema"}).tier,"frontier");
});
test("repeated failures escalate and explicit choices win",()=>{
  assert.equal(assessModelRouting({title:"Fix button",failedRuns:2}).tier,"frontier");
  assert.equal(assessModelRouting({title:"Design distributed architecture",preference:"local"}).tier,"local");
});
