import assert from "node:assert/strict";
import test from "node:test";
import { createCloudClient, createOrRecover, interpretCloudRun, usageTokens } from "../lib/cloud-api.mjs";
import { agentIdFor, executeCloudTick, reduceCloudTick } from "../lib/cloud-tick.mjs";
import { evaluateGates } from "../lib/gates.mjs";

const now = Date.parse("2026-11-05T00:00:00Z");

function base(overrides = {}) {
  return {
    state: { items: {}, dispatches: [], usageTokens: 0 },
    control: { mode: "running" },
    controllerRunId: "run-1",
    now,
    allowMerge: false,
    ...overrides,
  };
}

const implementerReport = '{"role":"implementer","issue":"MVP-012","pr":120,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}';
const reviewerReport = '{"role":"reviewer","issue":"MVP-012","pr":120,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}';

test("cloud client creates a new agent and recovers a conflicting id without a follow-up", async () => {
  const calls = [];
  const client = createCloudClient({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method, authorization: options.headers.authorization });
      if (options.method === "POST" && url.endsWith("/v1/agents")) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ code: "agent_id_conflict" }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "bc-recovered", latestRunId: "run-existing", status: "ACTIVE" }),
      };
    },
  });
  assert.deepEqual(Object.keys(client).sort(), ["cancelRun", "createAgent", "getAgent", "getRun", "getUsage"]);
  const recovered = await createOrRecover(client, { agentId: "bc-recovered", prompt: { text: "new context" } });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.run.id, "run-existing");
  assert.equal(calls.some((call) => call.url.includes("/runs") && call.method === "POST"), false);
  assert.equal(calls[0].authorization, "Bearer test-key");
});

test("malformed, missing, and failed cloud runs do not advance", () => {
  assert.equal(interpretCloudRun(null).reason, "missing agent status");
  assert.equal(interpretCloudRun({ status: "FINISHED" }).reason, "malformed response");
  assert.equal(interpretCloudRun({ status: "ERROR" }).disposition, "failed");
  assert.equal(interpretCloudRun({ status: "RUNNING", result: "partial" }).disposition, "pending");
  assert.equal(usageTokens({}), null);
});

test("a second controller cannot dispatch while the lock is held", () => {
  const first = reduceCloudTick(base({ action: "prove" }));
  const second = reduceCloudTick(base({
    state: first.state,
    controllerRunId: "run-2",
    action: "prove",
  }));
  assert.equal(first.effect.type, "create");
  assert.equal(second.effect.type, "blocked");
  assert.match(second.effect.reason, /lock/);
});

test("recovery reuses the unpublished cloud agent id", () => {
  const created = reduceCloudTick(base({ action: "prove" }));
  const retry = reduceCloudTick(base({ state: created.state, action: "prove" }));
  assert.equal(retry.effect.type, "create");
  assert.equal(retry.effect.dispatch.agentId, created.effect.dispatch.agentId);
  assert.equal(retry.state.dispatches.length, created.state.dispatches.length);
});

test("stop cancels an active agent and a later tick does not create one", () => {
  const running = reduceCloudTick(base({ action: "prove" }));
  const withRun = {
    ...running.state,
    dispatch: { ...running.state.dispatch, runId: "run-live" },
  };
  const stopped = reduceCloudTick(base({ state: withRun, action: "stop" }));
  assert.equal(stopped.effect.type, "halt");
  assert.equal(stopped.effect.cancel, true);
  const later = reduceCloudTick(base({
    state: stopped.state,
    control: { mode: "stopped" },
    action: "prove",
  }));
  assert.equal(later.effect.type, "halt");
  assert.equal(later.effect.cancel, false);
});

test("review and repair are different cloud agents from implementation", () => {
  const implementer = agentIdFor("MVP-012", "implementer", 1);
  const reviewer = agentIdFor("MVP-012", "reviewer", 1);
  const repair = agentIdFor("MVP-012", "repair", 1);
  assert.notEqual(implementer, reviewer);
  assert.notEqual(reviewer, repair);
  const finished = reduceCloudTick(base({
    state: {
      items: {},
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: implementer, runId: "run-a" },
    },
    observation: { disposition: "finished", result: implementerReport },
    usageTokens: 10,
  }));
  const review = reduceCloudTick(base({ state: finished.state, item: { id: "MVP-012" } }));
  assert.equal(review.effect.type, "create");
  assert.equal(review.effect.dispatch.role, "reviewer");
  assert.notEqual(review.effect.dispatch.agentId, implementer);
  assert.match(review.effect.dispatch.prUrl, /\/pull\/120$/);
});

test("incomplete review flags, missing CI, and a failed gate do not merge", () => {
  const missingFlag = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "reviewer", attempt: 1, agentId: "bc-review", runId: "run-b" },
    },
    observation: {
      disposition: "finished",
      result: reviewerReport.replace('"human_decision":false', '"human_decision":true'),
    },
    usageTokens: 5,
  }));
  assert.equal(missingFlag.effect.type, "blocked");

  const ready = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "reviewer", attempt: 1, agentId: "bc-review", runId: "run-b" },
      items: { "MVP-012": { phase: "review", pr: 120, attempts: [{ role: "implementer", sessionId: "bc-impl" }] } },
    },
    observation: { disposition: "finished", result: reviewerReport },
    usageTokens: 5,
  }));
  const noEvidence = reduceCloudTick(base({ state: ready.state, item: { id: "MVP-012" } }));
  assert.equal(noEvidence.effect.reason, "missing CI evidence");
  const denied = reduceCloudTick(base({
    state: ready.state,
    item: { id: "MVP-012" },
    gates: { passed: false },
    allowMerge: true,
  }));
  assert.equal(denied.effect.reason, "merge gates failed");
  const disabled = reduceCloudTick(base({
    state: ready.state,
    item: { id: "MVP-012" },
    gates: { passed: true },
    allowMerge: false,
  }));
  assert.equal(disabled.effect.reason, "unattended merge is disabled");
});

test("an API error while polling fails closed and keeps the dispatch", async () => {
  const result = await executeCloudTick({
    ...base(),
    state: {
      dispatches: [],
      dispatch: { issue: "proof", role: "proof", attempt: 1, agentId: "bc-proof", runId: "run-z" },
    },
    client: {
      async getRun() {
        throw new Error("network");
      },
      async getUsage() {
        return { totalUsage: { totalTokens: 1 } };
      },
    },
    promptFor: () => "proof",
  });
  assert.equal(result.effect.reason, "API error");
  assert.equal(result.state.dispatch.runId, "run-z");
});

test("omitted review flags and secret paths fail the merge gates", () => {
  const missing = evaluateGates({
    classification: "AUTONOMOUS-READY",
    dependenciesMerged: true,
    acceptanceMapped: true,
    checks: { lint: "passing", "frontend-test": "passing", "backend-test": "passing", "migration-dry-run": "passing" },
    unresolvedDefects: 0,
    revalidatedHead: true,
    basedOnCurrentMain: true,
    mergeable: "MERGEABLE",
    unresolvedThreads: 0,
    engineeringRecords: true,
    changedPaths: ["backend/src/app.js"],
    scopeOk: true,
    protectionAllowsMerge: true,
  });
  assert.ok(missing.failures.some((failure) => failure.id === 10));
  assert.ok(missing.failures.some((failure) => failure.id === 11));
  assert.ok(missing.failures.some((failure) => failure.id === 12));
  const secret = evaluateGates({
    classification: "AUTONOMOUS-READY",
    dependenciesMerged: true,
    acceptanceMapped: true,
    checks: { lint: "passing", "frontend-test": "passing", "backend-test": "passing", "migration-dry-run": "passing" },
    unresolvedDefects: 0,
    revalidatedHead: true,
    basedOnCurrentMain: true,
    mergeable: "MERGEABLE",
    unresolvedThreads: 0,
    humanDecision: false,
    externalDependency: false,
    specAmbiguity: false,
    engineeringRecords: true,
    changedPaths: [".env"],
    scopeOk: true,
    protectionAllowsMerge: true,
  });
  assert.ok(secret.failures.some((failure) => failure.id === 14));
});
