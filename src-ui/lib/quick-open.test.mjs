import test from "node:test";
import assert from "node:assert/strict";
import {filterQuickOpenPaths,quickOpenPaths} from "./quick-open.ts";

test("quick open indexes nested files and filters path terms",()=>{
  const paths=quickOpenPaths([{id:"src",path:"src",name:"src",type:"folder",children:[{id:"a",path:"src/deep/App.tsx",name:"App.tsx",type:"file"}]},{id:"readme",path:"README.md",name:"README.md",type:"file"}]);
  assert.deepEqual(paths,["src/deep/App.tsx","README.md"]);
  assert.deepEqual(filterQuickOpenPaths(paths,"deep app"),["src/deep/App.tsx"]);
  assert.deepEqual(filterQuickOpenPaths(paths,"read"),["README.md"]);
});
