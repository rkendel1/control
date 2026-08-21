import test from "node:test";
import assert from "node:assert/strict";
import {hasExternalFileConflict} from "./editor-durability.ts";

test("save conflicts only when disk diverged from both baseline and editor",()=>{
  assert.equal(hasExternalFileConflict("old","external","mine"),true);
  assert.equal(hasExternalFileConflict("old","old","mine"),false);
  assert.equal(hasExternalFileConflict("old","mine","mine"),false);
  assert.equal(hasExternalFileConflict(undefined,"external","mine"),false);
});
