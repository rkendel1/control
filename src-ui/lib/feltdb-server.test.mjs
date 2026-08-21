import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {ControlDatabase} from "./control-db.ts";

test("Control round-trips its graph through the authenticated FeltDB HTTP runtime",async()=>{
  const token="control-test-token",collections=new Map();
  const server=http.createServer(async(request,response)=>{
    if(request.headers.authorization!==`Bearer ${token}`||request.headers["feltdb-protocol"]!=="1"){response.writeHead(401,{"content-type":"application/json"});response.end('{"error":"unauthorized"}');return;}
    const url=new URL(request.url,"http://127.0.0.1"),parts=url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if(parts[0]!=="collections"){response.writeHead(404,{"content-type":"application/json"});response.end('{"error":"not found"}');return;}
    const name=parts[1],id=parts[2],records=collections.get(name)||new Map();collections.set(name,records);
    const json=(status,value)=>{response.writeHead(status,{"content-type":"application/json"});response.end(value===undefined?"":JSON.stringify(value));};
    if(request.method==="GET"&&!id){json(200,[...records.values()].map(value=>({value})));return;}
    if(request.method==="GET"&&id){const value=records.get(id);value===undefined?json(404,{error:"not found"}):json(200,{value});return;}
    if(request.method==="DELETE"&&id){records.delete(id);json(204);return;}
    let body="";for await(const chunk of request)body+=chunk;const value=body?JSON.parse(body):{};
    if(request.method==="POST"&&!id){records.set(String(value.id),value);json(201,{value});return;}
    if(request.method==="PATCH"&&id){const updated={...(records.get(id)||{}),...value,id};records.set(id,updated);json(200,{value:updated});return;}
    json(405,{error:"method not allowed"});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{
    const address=server.address();assert.ok(address&&typeof address!=="string");
    const db=new ControlDatabase({mode:"server",serverUrl:`http://127.0.0.1:${address.port}`,token,hasCredential:true});
    await db.initialize();
    assert.equal(db.db.runtime().storage,"remote");
    const now=Date.now(),projectId="remote_project",workId="remote_work",taskId="remote_task";
    await db.projects.insert({id:projectId,name:"Remote project",path:"/tmp/remote",createdAt:now,updatedAt:now},projectId);
    await db.works.insert({id:workId,projectId,title:"Remote Work",intent:"prove transport",kind:"task",status:"captured",createdAt:now,updatedAt:now},workId);
    await db.tasks.insert({id:taskId,workId,projectId,title:"Remote task",description:"",status:"not-started",assignedTo:"developer",priority:"high",urgency:"normal",tags:[],blockedBy:[],acceptanceCriteria:[],feedback:[],createdAt:now,updatedAt:now},taskId);
    const snapshot=await db.exportSnapshot();
    assert.equal(snapshot.collections.tasks.some(record=>record.id===taskId),true);
    await db.removeProjectGraph(projectId);
    assert.equal(await db.tasks.get(taskId),null);
    const restored=await db.importSnapshot(snapshot);
    assert.ok(restored.applied>0);
    assert.equal((await db.tasks.get(taskId))?.workId,workId);
    assert.equal((await db.projects.get(projectId))?.id,projectId);
    await db.removeProjectGraph(projectId);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
