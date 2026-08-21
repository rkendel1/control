import test from "node:test";
import assert from "node:assert/strict";
import {applyEditorTarget} from "./editor-navigation.ts";

test("search navigation positions, reveals, and focuses Monaco",()=>{
  const calls=[];applyEditorTarget({setPosition:value=>calls.push(["position",value]),revealLineInCenter:value=>calls.push(["reveal",value]),focus:()=>calls.push(["focus"])},{line:42,column:3});
  assert.deepEqual(calls,[["position",{lineNumber:42,column:3}],["reveal",42],["focus"]]);
});
