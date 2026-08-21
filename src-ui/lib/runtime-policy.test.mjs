import test from "node:test";
import assert from "node:assert/strict";
import {runtimePresetError} from "./runtime-policy.ts";

test("runtime configuration rejects policies the native boundary cannot enforce",()=>{
  assert.equal(runtimePresetError("auto","connected"),undefined);
  assert.equal(runtimePresetError("claude-code","observe"),undefined);
  assert.match(runtimePresetError("claude-code","local"),/requires/);
  assert.equal(runtimePresetError("codex","local"),undefined);
  assert.match(runtimePresetError("codex","connected"),/requires/);
  assert.equal(runtimePresetError("opencode","connected"),undefined);
  assert.match(runtimePresetError("opencode","local"),/requires/);
  assert.equal(runtimePresetError("ollama:qwen3-coder","observe"),undefined);
  assert.match(runtimePresetError("ollama","local"),/requires/);
  assert.equal(runtimePresetError("ollama:qwen3-coder","connected"),undefined);
});
