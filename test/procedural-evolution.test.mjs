import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import {
  assessProceduralCandidate,
  assertProceduralCandidateDecision,
} from "../src/agent-runtime/procedural-evolution.ts";

const raw = () => ({schemaVersion:"noema.procedural-graph/v1", tenantId:"tenant-a",taskType:"repair",graphId:"g",revision:1,parentDigest:null,nodes:["Start","check"],edges:[{from:"Start",relation:"requires",to:"check",condition:"",guidance:"Check evidence",pitfalls:""}]});
const context = "c".repeat(64);
const fail = code => error => error.name === "ProceduralGraphError" && error.message === code;
async function fixture() {
  const baseline = await createProceduralGraph(raw());
  const candidateInput = raw(); candidateInput.revision = 2; candidateInput.parentDigest = baseline.digest; candidateInput.edges[0].guidance = "Check exact-head evidence";
  const candidate = await createProceduralGraph(candidateInput);
  const plan = {contextDigest:context, minimumCases:2, trainingCaseIds:["train-1"], holdoutCaseIds:["val-1","val-2"]};
  const receipt = (graph, score) => ({graphDigest:graph.digest, contextDigest:context, observations:[{caseId:"val-1",score,safetyViolations:0},{caseId:"val-2",score,safetyViolations:0}]});
  return {baseline,candidate,plan,baselineReceipt:receipt(baseline,0.5),candidateReceipt:receipt(candidate,0.75),rejectedKeys:[]};
}

test("non-decreasing paired score is eligible for external approval, never activation", async () => {
  const data = await fixture(); const decision = await assessProceduralCandidate(data);
  assert.equal(decision.eligibleForApproval, true); assert.equal(decision.activationAuthorized, false);
  assert.equal(decision.reason,"validation_non_regression"); assert.equal(decision.baselineMean,0.5); assert.equal(decision.candidateMean,0.75);
  assert.match(decision.rejectionKey,/^[0-9a-f]{64}$/); assert.ok(Object.isFrozen(decision));
});

test("only a locally screened candidate decision is admitted to later authority boundaries", async () => {
  const data = await fixture(); const decision = await assessProceduralCandidate(data);
  assert.doesNotThrow(() => assertProceduralCandidateDecision(decision));
  const forged = Object.freeze({...decision});
  assert.throws(() => assertProceduralCandidateDecision(forged), fail("unadmitted_decision"));
});

test("accepts an equal measured score without claiming statistical improvement", async () => {
  const data = await fixture(); data.candidateReceipt.observations.forEach(x => {x.score=0.5;});
  assert.equal((await assessProceduralCandidate(data)).eligibleForApproval,true);
});

test("score regression retains the baseline", async () => {
  const data = await fixture(); data.candidateReceipt.observations[0].score=0;
  const decision = await assessProceduralCandidate(data);
  assert.equal(decision.eligibleForApproval,false); assert.equal(decision.reason,"score_regression");
});

test("any candidate safety violation defeats even a perfect score", async () => {
  const data = await fixture(); data.candidateReceipt.observations[0].safetyViolations=1;
  data.candidateReceipt.observations.forEach(x => {x.score=1;});
  assert.equal((await assessProceduralCandidate(data)).reason,"safety_violation");
});

test("rejection memory is exact-base and evaluation-context scoped", async () => {
  const data = await fixture(); const first = await assessProceduralCandidate(data);
  data.rejectedKeys = [first.rejectionKey];
  assert.equal((await assessProceduralCandidate(data)).reason,"previously_rejected");
  data.plan.contextDigest = data.baselineReceipt.contextDigest = data.candidateReceipt.contextDigest = "d".repeat(64);
  const next = await assessProceduralCandidate(data);
  assert.notEqual(next.rejectionKey,first.rejectionKey); assert.equal(next.eligibleForApproval,true);
});

test("equivalent reordered graph cannot evade rejection memory", async () => {
  const data = await fixture(); const first = await assessProceduralCandidate(data);
  const changed = raw(); changed.revision=2; changed.parentDigest=data.baseline.digest; changed.nodes.reverse(); changed.edges[0].guidance="Check exact-head evidence";
  data.candidate = await createProceduralGraph(changed); data.rejectedKeys=[first.rejectionKey];
  assert.equal((await assessProceduralCandidate(data)).reason,"previously_rejected");
});

test("no-op revision is not evolution", async () => {
  const data = await fixture(); const same=raw(); same.revision=2; same.parentDigest=data.baseline.digest;
  data.candidate=await createProceduralGraph(same); data.candidateReceipt.graphDigest=data.candidate.digest;
  assert.equal((await assessProceduralCandidate(data)).reason,"unchanged_graph");
});

test("case order does not alter paired evaluation", async () => {
  const data = await fixture(); data.candidateReceipt.observations.reverse();
  assert.equal((await assessProceduralCandidate(data)).eligibleForApproval,true);
});

for (const [label, mutate, code] of [
  ["train/holdout overlap", x => {x.plan.trainingCaseIds=["val-1"];}, "holdout_leakage"],
  ["too few cases", x => {x.plan.minimumCases=3;}, "insufficient_cases"],
  ["empty holdout", x => {x.plan.holdoutCaseIds=[];}, "invalid_array"],
  ["duplicate holdout", x => {x.plan.holdoutCaseIds=["val-1","val-1"];}, "duplicate_case"],
  ["duplicate training", x => {x.plan.trainingCaseIds=["train-1","train-1"];}, "duplicate_case"],
  ["missing paired case", x => {x.candidateReceipt.observations.pop();}, "case_set_mismatch"],
  ["different case", x => {x.candidateReceipt.observations[0].caseId="val-3";}, "case_set_mismatch"],
  ["duplicate observation", x => {x.candidateReceipt.observations[1].caseId="val-1";}, "duplicate_case"],
  ["stale graph receipt", x => {x.candidateReceipt.graphDigest=x.baseline.digest;}, "receipt_mismatch"],
  ["different model/tool/rubric context", x => {x.candidateReceipt.contextDigest="d".repeat(64);}, "receipt_mismatch"],
  ["old baseline context", x => {x.baselineReceipt.contextDigest="d".repeat(64);}, "receipt_mismatch"],
  ["non-finite score", x => {x.candidateReceipt.observations[0].score=NaN;}, "invalid_score"],
  ["infinite score", x => {x.candidateReceipt.observations[0].score=Infinity;}, "invalid_score"],
  ["score above one", x => {x.candidateReceipt.observations[0].score=1.1;}, "invalid_score"],
  ["negative score", x => {x.candidateReceipt.observations[0].score=-0.1;}, "invalid_score"],
  ["string score", x => {x.candidateReceipt.observations[0].score="1";}, "invalid_score"],
  ["invalid safety count", x => {x.candidateReceipt.observations[0].safetyViolations=-1;}, "invalid_integer"],
  ["missing observation", x => {delete x.candidateReceipt.observations;}, "invalid_record"],
  ["extra authority field", x => {x.candidateReceipt.approved=true;}, "invalid_record"],
  ["forged admitted graph", x => {x.candidate={...x.candidate};}, "unadmitted_graph"],
  ["malformed memory", x => {x.rejectedKeys=["main"];}, "invalid_digest"],
]) test(`fails closed on ${label}`, async () => {
  const data=await fixture(); mutate(data); await assert.rejects(() => assessProceduralCandidate(data),fail(code));
});

for (const [field,value] of [["tenantId","other"],["taskType","other"],["graphId","other"],["revision",3],["parentDigest","a".repeat(64)]])
  test(`refuses candidate lineage mismatch ${field}`,async () => {
    const data=await fixture(); const changed=raw(); changed.revision=2; changed.parentDigest=data.baseline.digest; changed[field]=value;
    data.candidate=await createProceduralGraph(changed); data.candidateReceipt.graphDigest=data.candidate.digest;
    await assert.rejects(() => assessProceduralCandidate(data),fail("candidate_lineage_mismatch"));
  });

test("refuses raw evaluator trap errors", async () => {
  const {proxy,revoke}=Proxy.revocable({},{}); revoke();
  await assert.rejects(() => assessProceduralCandidate(proxy),fail("unreadable_input"));
});

test("rejection identity binds the actual case partition and minimum count", async () => {
  const data = await fixture(); const first = await assessProceduralCandidate(data);
  data.rejectedKeys = [first.rejectionKey];
  data.plan.trainingCaseIds = ["train-2"];
  const next = await assessProceduralCandidate(data);
  assert.notEqual(next.rejectionKey, first.rejectionKey);
  data.plan.minimumCases = 1;
  assert.notEqual((await assessProceduralCandidate(data)).rejectionKey, next.rejectionKey);
});

test("canonical rejection identity ignores only partition ordering", async () => {
  const data = await fixture(); data.plan.trainingCaseIds.push("train-2");
  const first = await assessProceduralCandidate(data);
  data.plan.trainingCaseIds.reverse(); data.plan.holdoutCaseIds.reverse();
  assert.equal((await assessProceduralCandidate(data)).rejectionKey, first.rejectionKey);
});
