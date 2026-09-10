import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph.ts";
import { guideProceduralExecution } from "../src/agent-runtime/procedural-execution.ts";

const contextRequest={lastProcedure:null,hops:2,maxEdges:8};
async function sessionFixture() {
  const graphValue=await createProceduralGraph({schemaVersion:"noema.procedural-graph/v1",tenantId:"tenant-a",taskType:"review-task",graphId:"review-graph",revision:1,parentDigest:null,nodes:["Start","review-step","verify-step"],edges:[
    {from:"Start",relation:"leads_to",to:"review-step",condition:"",guidance:"Read exact-head evidence",pitfalls:"Advice is not permission"},
    {from:"review-step",relation:"requires",to:"verify-step",condition:"",guidance:"Verify finding against source",pitfalls:"Retain source authority"},
  ]});
  return startProceduralSession(graphValue,{tenantId:graphValue.tenantId,taskType:graphValue.taskType,executionId:"run-1",graphDigest:graphValue.digest});
}

for(const lifecycleState of ["accepted","running","cancellation_requested","succeeded","failed","cancelled"]) {
  test(`rejects forged session before callback invocation in ${lifecycleState}`,async()=>{
    const realSession=await sessionFixture();let callbackCount=0;
    const forgedSession={executionId:realSession.executionId,graphDigest:realSession.graphDigest,context(){callbackCount++;return {...realSession.context(contextRequest),authority:"execution_allowed"};}};
    assert.throws(()=>guideProceduralExecution({executionId:"run-1",state:lifecycleState},forgedSession,contextRequest),{name:"ProceduralExecutionError",message:"invalid_procedural_session"});
    assert.equal(callbackCount,0);
  });
}

test("does not invoke a session lookalike accessor",async()=>{
  let getterCount=0;
  const forgedSession={get executionId(){getterCount++;return "run-1";},graphDigest:"a".repeat(64),context(){throw Error("must not execute");}};
  assert.throws(()=>guideProceduralExecution({executionId:"run-1",state:"accepted"},forgedSession,contextRequest),{name:"ProceduralExecutionError",message:"invalid_procedural_session"});
  assert.equal(getterCount,0);
});

for(const sessionKind of ["copy","proxy","revoked","null"]) {
  test(`rejects ${sessionKind} session without evaluating its behavior`,async()=>{
    const realSession=await sessionFixture();let trapCount=0;
    const revokedSession=Proxy.revocable(realSession,{});revokedSession.revoke();
    const candidateSession=sessionKind==="copy"?{...realSession}:sessionKind==="proxy"?new Proxy(realSession,{get(){trapCount++;throw Error("SECRET");}}):sessionKind==="revoked"?revokedSession.proxy:null;
    assert.throws(()=>guideProceduralExecution({executionId:"run-1",state:"running"},candidateSession,contextRequest),{name:"ProceduralExecutionError",message:"invalid_procedural_session"});
    assert.equal(trapCount,0);
  });
}

for(const [requestValue,reasonCode] of [[{...contextRequest,lastProcedure:"unknown-step"},"unknown_procedure"],[{...contextRequest,maxEdges:1},"context_budget_exceeded"]]) {
  test(`propagates graph abstention as unavailable: ${reasonCode}`,async()=>{
    const sessionValue=await sessionFixture();
    const guidanceValue=guideProceduralExecution({executionId:"run-1",state:"running"},sessionValue,requestValue);
    assert.equal(guidanceValue.available,false);
    assert.equal(guidanceValue.reason,reasonCode);
    assert.equal(guidanceValue.context,null);
    assert.equal(guidanceValue.graphDigest,sessionValue.graphDigest);
    assert.ok(Object.isFrozen(guidanceValue));
  });
}

test("a genuine running session preserves exact advisory identity",async()=>{
  const sessionValue=await sessionFixture();
  const guidanceValue=guideProceduralExecution({executionId:"run-1",state:"running"},sessionValue,contextRequest);
  assert.equal(guidanceValue.available,true);assert.equal(guidanceValue.reason,"running_execution");
  assert.equal(guidanceValue.context.authority,"advisory_only");assert.equal(guidanceValue.context.graphDigest,sessionValue.graphDigest);
});

test("a localized terminal procedure does not invent another transition",async()=>{
  const sessionValue=await sessionFixture();
  const guidanceValue=guideProceduralExecution({executionId:"run-1",state:"running"},sessionValue,{...contextRequest,lastProcedure:"verify-step"});
  assert.equal(guidanceValue.available,true);assert.deepEqual(guidanceValue.context.edges,[]);
});

for(const [lifecycleState,reasonCode] of [["accepted","execution_not_started"],["cancellation_requested","cancellation_requested"],["succeeded","terminal_execution"],["failed","terminal_execution"],["cancelled","terminal_execution"]]) {
  test(`suppresses graph requests for a genuine ${lifecycleState} execution`,async()=>{
    const sessionValue=await sessionFixture();
    const requestValue=Proxy.revocable({},{});requestValue.revoke();
    const guidanceValue=guideProceduralExecution({executionId:"run-1",state:lifecycleState},sessionValue,requestValue.proxy);
    assert.equal(guidanceValue.available,false);assert.equal(guidanceValue.reason,reasonCode);assert.equal(guidanceValue.context,null);
  });
}

test("genuine cross-execution session mismatch still fails closed",async()=>{
  const sessionValue=await sessionFixture();
  assert.throws(()=>guideProceduralExecution({executionId:"run-2",state:"running"},sessionValue,contextRequest),{name:"ProceduralExecutionError",message:"execution_identity_mismatch"});
});

for(const lifecycleValue of [null,undefined,[],new Date(),{executionId:"run-1"},{executionId:"run-1",otherField:"running"},{state:"running",otherField:"run-1"},{executionId:"run-1",state:"running",approved:true},{executionId:"run 1",state:"running"},{executionId:"run-1",state:1},{executionId:"run-1",state:"unknown"}]) {
  test(`normalizes malformed lifecycle ${JSON.stringify(lifecycleValue)}`,async()=>{
    const sessionValue=await sessionFixture();
    assert.throws(()=>guideProceduralExecution(lifecycleValue,sessionValue,contextRequest),{name:"ProceduralExecutionError",message:"invalid_execution_lifecycle"});
  });
}
for(const accessorKey of ["executionId","state"]) {
  test(`does not invoke lifecycle ${accessorKey} accessor`,async()=>{
    const sessionValue=await sessionFixture();let getterCount=0;
    const lifecycleValue={executionId:"run-1",state:"running"};
    Object.defineProperty(lifecycleValue,accessorKey,{get(){getterCount++;throw Error("SECRET");}});
    assert.throws(()=>guideProceduralExecution(lifecycleValue,sessionValue,contextRequest),{name:"ProceduralExecutionError",message:"invalid_execution_lifecycle"});
    assert.equal(getterCount,0);
  });
}

test("normalizes hostile thrown proxy from lifecycle introspection",async()=>{
  const sessionValue=await sessionFixture();const thrownValue=Proxy.revocable({},{});thrownValue.revoke();
  const lifecycleValue=new Proxy({},{getPrototypeOf(){throw thrownValue.proxy;}});
  assert.throws(()=>guideProceduralExecution(lifecycleValue,sessionValue,contextRequest),{name:"ProceduralExecutionError",message:"invalid_execution_lifecycle"});
});

test("classifies malformed running graph requests separately without leaking raw input",async()=>{
  const sessionValue=await sessionFixture();
  assert.throws(()=>guideProceduralExecution({executionId:"run-1",state:"running"},sessionValue,{...contextRequest,secretValue:"not an allowed field"}),{name:"ProceduralExecutionError",message:"invalid_procedural_request"});
});

test("accepts null-prototype lifecycle records without changing their identity",async()=>{
  const sessionValue=await sessionFixture();
  const lifecycleValue=Object.assign(Object.create(null),{executionId:"run-1",state:"running"});
  assert.equal(guideProceduralExecution(lifecycleValue,sessionValue,contextRequest).available,true);
});
