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

const head = "6d75c886d95ee206bcdd4838c99270446a333d9e";
const noPullRequest = `{"role":"implementer","issue":"MVP-012","pr":0,"head":"${head}","commit":"${head}","branch":"cursor/musicapp-mvp-012-implementer-00d0","blockers":[],"next_action":"review"}`;

function agentClient(bodies) {
  return {
    async createAgent(body) {
      bodies.push(body);
      return { agent: { id: body.agentId }, run: { id: "run-new", status: "CREATING" } };
    },
  };
}

test("only a fresh implementation agent requests automatic pull request creation", async () => {
  const bodies = [];
  const client = agentClient(bodies);
  const implementer = await executeCloudTick({
    ...base({ item: { id: "MVP-012" } }),
    client,
    promptFor: () => "implement",
    openPullRequest: async () => {
      throw new Error("review must not open a pull request");
    },
  });
  assert.equal(bodies[0].autoCreatePR, true);
  assert.equal(bodies[0].mode, "agent");

  const reviewer = await executeCloudTick({
    ...base({
      state: { ...implementer.state, dispatch: null, items: { "MVP-012": { phase: "review", pr: 120, attempts: [] } } },
      item: { id: "MVP-012" },
    }),
    client,
    promptFor: () => "review",
  });
  assert.equal(bodies[1].autoCreatePR, false);
  assert.equal(bodies[1].mode, "plan");
  assert.match(bodies[1].repos[0].prUrl, /\/pull\/120$/);

  const repair = await executeCloudTick({
    ...base({
      state: {
        dispatches: [],
        items: { "MVP-012": { phase: "repair", pr: 120, attempts: [{ role: "reviewer", sessionId: "bc-review" }] } },
      },
      item: { id: "MVP-012" },
    }),
    client,
    promptFor: () => "repair",
  });
  assert.equal(bodies[2].autoCreatePR, false);
  assert.equal(bodies[2].mode, "agent");
  assert.match(bodies[2].repos[0].prUrl, /\/pull\/120$/);

  const proof = await executeCloudTick({
    ...base({ action: "prove" }),
    client,
    promptFor: () => "proof",
  });
  assert.equal(proof.effect.dispatch.role, "proof");
  assert.equal(bodies[3].autoCreatePR, false);
  assert.equal(bodies[3].mode, "plan");
  assert.equal(bodies[3].repos[0].prUrl, undefined);
});

test("completed code without a pull request is recovered once and does not merge", async () => {
  const finished = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest,
      git: { branches: [{ repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0" }] },
    },
    usageTokens: 10,
  }));
  assert.equal(finished.effect.type, "open-pr");
  assert.notEqual(finished.effect.reason, "malformed response");
  assert.equal(finished.state.dispatch, null);
  assert.equal(finished.state.items["MVP-012"].phase, "recover-pr");
  assert.equal(finished.state.items["MVP-012"].branch, "cursor/musicapp-mvp-012-implementer-00d0");

  const again = reduceCloudTick(base({
    state: {
      ...finished.state,
      dispatches: Array.from({ length: 4 }, () => ({ issue: "MVP-012", role: "implementer", at: "2026-11-05T00:00:00Z" })),
    },
    item: { id: "MVP-012" },
  }));
  assert.equal(again.effect.type, "open-pr");
  assert.equal(again.effect.dispatch, undefined);

  let opened = 0;
  const recovered = await executeCloudTick({
    ...base({ state: finished.state, item: { id: "MVP-012" } }),
    client: agentClient([]),
    promptFor: () => "implement",
    openPullRequest: async (effect) => {
      opened += 1;
      assert.equal(effect.branch, "cursor/musicapp-mvp-012-implementer-00d0");
      assert.equal(effect.commit, head);
      return 112;
    },
  });
  assert.equal(opened, 1);
  assert.equal(recovered.effect.phase, "review");
  assert.equal(recovered.state.items["MVP-012"].pr, 112);

  const review = await executeCloudTick({
    ...base({ state: { ...recovered.state, dispatch: null }, item: { id: "MVP-012" } }),
    client: agentClient([]),
    promptFor: () => "review",
  });
  assert.equal(review.effect.dispatch.role, "reviewer");
  assert.match(review.effect.dispatch.prUrl, /\/pull\/112$/);

  const denied = reduceCloudTick(base({
    state: {
      ...recovered.state,
      dispatch: null,
      items: {
        "MVP-012": {
          ...recovered.state.items["MVP-012"],
          phase: "gates",
          attempts: [
            { role: "implementer", sessionId: "bc-impl" },
            { role: "reviewer", sessionId: "bc-review" },
          ],
        },
      },
    },
    item: { id: "MVP-012" },
    gates: { passed: true },
    allowMerge: false,
  }));
  assert.equal(denied.effect.reason, "unattended merge is disabled");
  assert.notEqual(denied.effect.type, "merge");
});

test("a missing branch or a reported blocker does not dispatch another implementation agent", () => {
  const blocked = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest.replace('"blockers":[]', '"blockers":["approval required"]'),
    },
    usageTokens: 4,
  }));
  assert.equal(blocked.effect.reason, "completed without pull request");
  assert.equal(blocked.state.items["MVP-012"].phase, "recover-pr");
  const recorded = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest.replace('"blockers":[]', '"blockers":["approval required"]'),
      git: { branches: [{ repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0", prUrl: "https://github.com/xela-ash/Music_app/pull/112" }] },
    },
    usageTokens: 1,
  }));
  assert.equal(recorded.effect.reason, "completed without pull request");
  assert.equal(recorded.state.items["MVP-012"].pr, undefined);
  assert.equal(recorded.state.dispatch, null);
  const retry = reduceCloudTick(base({ state: blocked.state, item: { id: "MVP-012" } }));
  assert.equal(retry.effect.type, "blocked");
  assert.equal(retry.effect.reason, "completed without pull request");
  assert.equal(retry.state.dispatch, null);
});

test("an existing pull request is kept for repair and when the run already recorded one", () => {
  const repair = reduceCloudTick(base({
    state: {
      dispatches: [],
      items: { "MVP-012": { phase: "repair", pr: 112, head: "older", attempts: [] } },
      dispatch: { issue: "MVP-012", role: "repair", attempt: 1, agentId: "bc-repair", runId: "run-r" },
    },
    observation: { disposition: "finished", result: noPullRequest.replace('"role":"implementer"', '"role":"repair"') },
    usageTokens: 3,
  }));
  assert.equal(repair.effect.phase, "review");
  assert.equal(repair.state.items["MVP-012"].pr, 112);
  assert.notEqual(repair.effect.type, "open-pr");

  const adopted = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest,
      git: {
        branches: [{
          repoUrl: "https://github.com/xela-ash/Music_app",
          branch: "cursor/musicapp-mvp-012-implementer-00d0",
          prUrl: "https://github.com/xela-ash/Music_app/pull/112",
        }],
      },
    },
    usageTokens: 3,
  }));
  assert.equal(adopted.effect.phase, "review");
  assert.equal(adopted.state.items["MVP-012"].pr, 112);
  assert.notEqual(adopted.effect.type, "open-pr");
});

test("pull request recovery failure stays on the same branch and does not create an agent", async () => {
  const bodies = [];
  const failed = await executeCloudTick({
    ...base({
      state: {
        dispatches: [],
        items: {
          "MVP-012": {
            phase: "recover-pr",
            status: "implemented",
            branch: "cursor/musicapp-mvp-012-implementer-00d0",
            head,
            commit: head,
            attempts: [],
          },
        },
      },
      item: { id: "MVP-012" },
    }),
    client: agentClient(bodies),
    promptFor: () => "implement",
    openPullRequest: async () => {
      throw new Error("github unavailable");
    },
  });
  assert.equal(failed.effect.reason, "pull request recovery failed");
  assert.equal(failed.state.items["MVP-012"].phase, "recover-pr");
  assert.equal(bodies.length, 0);
  const retry = await executeCloudTick({
    ...base({ state: failed.state, item: { id: "MVP-012" } }),
    client: agentClient(bodies),
    promptFor: () => "implement",
    openPullRequest: async () => 112,
  });
  assert.equal(bodies.length, 0);
  assert.equal(retry.state.items["MVP-012"].pr, 112);
  assert.equal(retry.state.items["MVP-012"].phase, "review");
});
