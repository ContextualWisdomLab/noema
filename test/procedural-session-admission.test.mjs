import { test } from "vitest";
import assert from "node:assert/strict";
import * as graphModule from "../src/agent-runtime/procedural-graph.ts";
import { isCanonicalExecutionId } from "../src/runtime-shared/execution-identity.ts";

async function graphFixture() {
  return graphModule.createProceduralGraph({schemaVersion:"noema.procedural-graph/v1",tenantId:"tenant-a",taskType:"review-task",graphId:"review-graph",revision:1,parentDigest:null,nodes:["Start"],edges:[]});
}

for (const executionId of ["run-1", "run@workflow+attempt=1", "_run:attempt#1", "x".repeat(128)]) {
  test(`preserves the runtime owner's canonical execution grammar: ${executionId}`, async () => {
    const graphValue = await graphFixture();
    assert.equal(isCanonicalExecutionId(executionId), true);
    let sessionValue;
    assert.doesNotThrow(() => {sessionValue = graphModule.startProceduralSession(graphValue,{tenantId:graphValue.tenantId,taskType:graphValue.taskType,executionId,graphDigest:graphValue.digest});});
    assert.equal(sessionValue.executionId,executionId);
    assert.equal(sessionValue.context({lastProcedure:null,hops:1,maxEdges:1}).executionId,executionId);
  });
}

for (const executionId of ["", "run 1", "run\n1", "실행-1", "x".repeat(129), null, 1, {}]) {
  test(`rejects noncanonical execution identity ${JSON.stringify(executionId)}`, async () => {
    const graphValue = await graphFixture();
    assert.throws(() => graphModule.startProceduralSession(graphValue,{tenantId:graphValue.tenantId,taskType:graphValue.taskType,executionId,graphDigest:graphValue.digest}),{name:"ProceduralGraphError",message:"invalid_identity"});
  });
}

test("recognizes only locally constructed sessions without inspecting lookalikes", async () => {
  assert.equal(typeof graphModule.assertProceduralSession,"function","session producer must expose its own admission assertion");
  const graphValue=await graphFixture();
  const sessionValue=graphModule.startProceduralSession(graphValue,{tenantId:graphValue.tenantId,taskType:graphValue.taskType,executionId:"run-1",graphDigest:graphValue.digest});
  assert.doesNotThrow(() => graphModule.assertProceduralSession(sessionValue));
  let trapCount=0;
  const proxyValue=new Proxy(sessionValue,{get(){trapCount++;throw Error("untrusted read");},getPrototypeOf(){trapCount++;throw Error("untrusted prototype");}});
  const revokedValue=Proxy.revocable(sessionValue,{});revokedValue.revoke();
  for(const candidateValue of [null,undefined,1,"session",{},graphValue,{...sessionValue},proxyValue,revokedValue.proxy,sessionValue.context]) assert.throws(() => graphModule.assertProceduralSession(candidateValue),{name:"ProceduralGraphError",message:"unadmitted_session"});
  assert.equal(trapCount,0);
  assert.ok(Object.isFrozen(sessionValue));
});
