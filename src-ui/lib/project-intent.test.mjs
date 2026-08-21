import test from "node:test";import assert from "node:assert/strict";import{parseCreateProjectIntent}from"./project-intent.ts";
test("understands plain-English project creation",()=>{assert.deepEqual(parseCreateProjectIntent("Let's create a new project at desktop called nougats"),{location:"desktop",name:"nougats"});assert.equal(parseCreateProjectIntent("explain this function"),undefined);});
