import assert from "node:assert/strict";
import test from "node:test";
import { createCloudClient, createOrRecover, interpretCloudRun, pushedBranch, usageTokens } from "../lib/cloud-api.mjs";
import { agentIdFor, executeCloudTick, reduceCloudTick } from "../lib/cloud-tick.mjs";
import { acceptanceMapped, evaluateGates } from "../lib/gates.mjs";
import { containsIssueId, ensurePullRequest, selectRecoveredPullRequest, survivingChangedPaths, verifyRecoveredPullRequest } from "../lib/github.mjs";

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

test("stop keeps an active dispatch until cancellation and a later tick does not create one", () => {
  const running = reduceCloudTick(base({ action: "prove" }));
  const withRun = {
    ...running.state,
    dispatch: { ...running.state.dispatch, runId: "run-live" },
  };
  const inspected = reduceCloudTick(base({ state: withRun, action: "stop" }));
  assert.equal(inspected.effect.type, "inspect");
  assert.equal(inspected.state.dispatch.runId, "run-live");
  const active = reduceCloudTick(base({
    state: withRun,
    action: "stop",
    observation: { disposition: "pending", status: "RUNNING" },
  }));
  assert.equal(active.effect.cancel, true);
  assert.equal(active.state.dispatch.runId, "run-live");
  const released = reduceCloudTick(base({
    state: withRun,
    action: "stop",
    observation: { disposition: "finished", status: "FINISHED" },
  }));
  assert.equal(released.effect.cancel, false);
  assert.equal(released.state.dispatch, null);
  assert.equal(released.state.dispatches.length, withRun.dispatches.length);
  const later = reduceCloudTick(base({
    state: released.state,
    control: { mode: "stopped" },
    action: "prove",
  }));
  assert.equal(later.effect.type, "halt");
  assert.equal(later.effect.cancel, false);
  assert.notEqual(later.effect.type, "create");
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

test("an existing pull request is kept for repair and when the run already recorded one", async () => {
  const repair = reduceCloudTick(base({
    state: {
      dispatches: [],
      items: { "MVP-012": { phase: "repair", pr: 112, head: "older", attempts: [] } },
      dispatch: { issue: "MVP-012", role: "repair", attempt: 1, agentId: "bc-repair", runId: "run-r" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest.replace('"role":"implementer"', '"role":"repair"'),
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
  assert.equal(repair.effect.type, "open-pr");
  assert.equal(repair.effect.allowCreate, false);
  assert.equal(repair.effect.candidate, 112);
  assert.equal(repair.state.items["MVP-012"].phase, "recover-pr");
  assert.equal(repair.state.items["MVP-012"].pr, 112);

  const missing = await executeCloudTick({
    ...base({ state: repair.state, item: { id: "MVP-012" } }),
    client: agentClient([]),
    promptFor: () => "repair",
    openPullRequest: async (effect) => {
      assert.equal(effect.allowCreate, false);
      throw new Error("repair pull request was not found");
    },
  });
  assert.equal(missing.effect.reason, "repair pull request was not found");
  assert.equal(missing.state.items["MVP-012"].phase, "recover-pr");
  assert.equal(missing.state.items["MVP-012"].pr, 112);

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
  assert.equal(adopted.effect.type, "open-pr");
  assert.equal(adopted.effect.allowCreate, true);
  assert.equal(adopted.effect.candidate, null);
  assert.equal(adopted.state.items["MVP-012"].pr, undefined);
  assert.notEqual(adopted.state.items["MVP-012"].phase, "review");
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

const criterion = "A submitted verification reaches `approved`/`rejected` only through an Administrator action, fully audited";
const recoveryExpected = {
  repoUrl: "https://github.com/xela-ash/Music_app",
  branch: "cursor/musicapp-mvp-012-implementer-00d0",
  commit: head,
  issue: "MVP-012",
  criteria: [criterion],
};
const verifiedPull = {
  number: 112,
  url: "https://github.com/xela-ash/Music_app/pull/112",
  headRefName: "cursor/musicapp-mvp-012-implementer-00d0",
  headRefOid: head,
  title: "[MVP-012] Identity verification routes",
  body: `MVP-012\n\n## Acceptance\n- ${criterion}\n  Test: backend/test/verification.http.test.js`,
};

test("a different repository, branch, commit, or issue cannot be adopted", () => {
  assert.equal(pushedBranch({
    branches: [{ repoUrl: "https://github.com/notxela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0", prUrl: "https://github.com/notxela-ash/Music_app/pull/9" }],
  }, "https://github.com/xela-ash/Music_app"), null);
  const wrong = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest,
      git: {
        branches: [{
          repoUrl: "https://github.com/notxela-ash/Music_app",
          branch: "cursor/other",
          prUrl: "https://github.com/notxela-ash/Music_app/pull/9",
        }],
      },
    },
    usageTokens: 2,
  }));
  assert.equal(wrong.effect.reason, "pull request identity does not match");
  assert.equal(wrong.state.items["MVP-012"].pr, undefined);
  const later = reduceCloudTick(base({ state: wrong.state, item: { id: "MVP-012" } }));
  assert.equal(later.effect.reason, "pull request identity does not match");
  assert.equal(later.state.dispatch, null);

  const mismatched = { ...verifiedPull, headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  const selected = selectRecoveredPullRequest([mismatched, { ...verifiedPull, number: 9, url: "https://github.com/xela-ash/Music_app/pull/9", headRefName: "cursor/other" }], recoveryExpected, { allowCreate: true });
  assert.equal(selected.error, "acceptance mapping is missing");
  assert.equal(selected.create, undefined);
});

test("repair does not create a pull request when the stored number is missing", async () => {
  const finished = reduceCloudTick(base({
    state: {
      dispatches: [],
      items: { "MVP-012": { phase: "repair", attempts: [] } },
      dispatch: { issue: "MVP-012", role: "repair", attempt: 1, agentId: "bc-repair", runId: "run-r" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest.replace('"role":"implementer"', '"role":"repair"'),
      git: { branches: [{ repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0", prUrl: "https://github.com/xela-ash/Music_app/pull/9" }] },
    },
    usageTokens: 2,
  }));
  assert.equal(finished.effect.allowCreate, false);
  assert.equal(finished.effect.candidate, null);
  const calls = [];
  const stopped = await executeCloudTick({
    ...base({ state: finished.state, item: { id: "MVP-012" } }),
    client: agentClient([]),
    promptFor: () => "repair",
    openPullRequest: async (effect) => {
      assert.equal(effect.allowCreate, false);
      const selected = selectRecoveredPullRequest([], recoveryExpected, { allowCreate: effect.allowCreate, entries: effect.acceptance, changedPaths: [] });
      calls.push(selected);
      throw new Error(selected.error);
    },
  });
  assert.equal(stopped.effect.reason, "repair pull request was not found");
  assert.equal(calls[0].create, undefined);
  assert.equal(stopped.state.items["MVP-012"].pr, undefined);
  const paths = ["backend/test/verification.http.test.js"];
  const found = selectRecoveredPullRequest([verifiedPull], recoveryExpected, { allowCreate: false, changedPaths: paths });
  assert.equal(found.number, 112);
  assert.equal(found.create, undefined);
  const hinted = selectRecoveredPullRequest([
    verifiedPull,
    { ...verifiedPull, number: 9, url: "https://github.com/xela-ash/Music_app/pull/9", headRefOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  ], recoveryExpected, { allowCreate: false, changedPaths: paths });
  assert.equal(hinted.number, 112);
  const lookalike = {
    ...verifiedPull,
    number: 7,
    url: "https://github.com/xela-ash/Music_app/pull/7",
    title: "MVP-0120",
    body: `MVP-0120\n\n## Acceptance\n- ${criterion}\n  Test: backend/test/verification.http.test.js`,
  };
  assert.equal(containsIssueId("MVP-012a recovered", "MVP-012"), false);
  assert.equal(containsIssueId("[MVP-012] routes", "MVP-012"), true);
  assert.equal(verifyRecoveredPullRequest({ ...lookalike, title: "MVP-012a", body: lookalike.body.replaceAll("MVP-0120", "MVP-012a") }, recoveryExpected), false);
  assert.equal(verifyRecoveredPullRequest(lookalike, recoveryExpected), false);
  assert.deepEqual(survivingChangedPaths([
    { filename: "backend/test/verification.http.test.js", status: "removed" },
    { filename: "backend/src/verification/routes.js", status: "modified" },
  ]), ["backend/src/verification/routes.js"]);
  assert.equal(selectRecoveredPullRequest([lookalike], recoveryExpected, { allowCreate: false, changedPaths: paths }).error, "repair pull request was not found");
  const missingFile = selectRecoveredPullRequest([verifiedPull], recoveryExpected, {
    allowCreate: false,
    changedPaths: ["backend/test/other.test.js"],
  });
  assert.equal(missingFile.number, undefined);
  assert.equal(missingFile.error, "acceptance mapping is missing");
  const nested = selectRecoveredPullRequest([{
    ...verifiedPull,
    body: "MVP-012\n\n## Acceptance\n- User can save a draft\n  Test: backend/test/verification.http.test.js",
  }], { ...recoveryExpected, criteria: ["User can save"] }, { allowCreate: false, changedPaths: paths });
  assert.equal(nested.number, undefined);
});

test("a recovered pull request maps every acceptance criterion and the merge gate still rejects an unmapped body", async () => {
  const issueBody = `# Acceptance Criteria\n\n- [ ] ${criterion}\n- [ ] Every acceptance criterion above is mapped to at least one named test in the PR description\n\n# Testing Requirements\n`;
  const entries = [{ criterion, test: "backend/test/verification.http.test.js" }];
  let createdBody = "";
  const number = await ensurePullRequest({
    issue: "MVP-012",
    issueNumber: 14,
    branch: "cursor/musicapp-mvp-012-implementer-00d0",
    commit: head,
    head,
    allowCreate: true,
    acceptance: entries,
  }, {
    runGh(args) {
      if (args[0] === "issue") return JSON.stringify({ body: issueBody });
      if (args[0] === "pr" && args[1] === "list") return "[]";
      if (args[0] === "api") {
        return JSON.stringify({ files: [{ filename: "backend/test/verification.http.test.js" }] });
      }
      if (args[0] === "pr" && args[1] === "create") {
        createdBody = args[args.indexOf("--body") + 1];
        return "https://github.com/xela-ash/Music_app/pull/112\n";
      }
      if (args[0] === "pr" && args[1] === "view") {
        return JSON.stringify({ ...verifiedPull, body: createdBody });
      }
      throw new Error(`unexpected gh ${args.join(" ")}`);
    },
  });
  assert.equal(number, 112);
  assert.equal(acceptanceMapped(createdBody, "MVP-012"), true);
  assert.match(createdBody, new RegExp(criterion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(createdBody, /backend\/test\/verification\.http\.test\.js/);
  const mapped = evaluateGates({
    classification: "AUTONOMOUS-READY",
    dependenciesMerged: true,
    acceptanceMapped: acceptanceMapped(createdBody, "MVP-012"),
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
    changedPaths: ["backend/src/verification/routes.js"],
    scopeOk: true,
    protectionAllowsMerge: true,
  });
  assert.equal(mapped.failures.some((failure) => failure.id === 3), false);
  const unmapped = evaluateGates({
    ...{
      classification: "AUTONOMOUS-READY",
      dependenciesMerged: true,
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
      changedPaths: ["backend/src/verification/routes.js"],
      scopeOk: true,
      protectionAllowsMerge: true,
    },
    acceptanceMapped: acceptanceMapped(`MVP-012\n## Acceptance\n${criterion}`, "MVP-012"),
  });
  assert.ok(unmapped.failures.some((failure) => failure.id === 3));
  const repairCreate = selectRecoveredPullRequest([], recoveryExpected, {
    allowCreate: false,
    entries,
    changedPaths: ["backend/test/verification.http.test.js"],
  });
  assert.equal(repairCreate.error, "repair pull request was not found");
  assert.equal(repairCreate.create, undefined);

  let removedOnly;
  try {
    ensurePullRequest({
      issue: "MVP-012",
      issueNumber: 14,
      branch: "cursor/musicapp-mvp-012-implementer-00d0",
      commit: head,
      allowCreate: true,
      acceptance: entries,
    }, {
      runGh(args) {
        if (args[0] === "issue") return JSON.stringify({ body: issueBody });
        if (args[0] === "pr" && args[1] === "list") {
          return JSON.stringify([{
            ...verifiedPull,
            body: `MVP-012\n\n## Acceptance\n- ${criterion}\n  Test: backend/test/verification.http.test.js`,
          }]);
        }
        if (args[0] === "api") {
          return JSON.stringify({ files: [{ filename: "backend/test/verification.http.test.js", status: "removed" }] });
        }
        throw new Error(`unexpected gh ${args.join(" ")}`);
      },
    });
    removedOnly = new Error("deleted test file was accepted");
  } catch (error) {
    removedOnly = error;
  }
  assert.equal(removedOnly.message, "acceptance mapping is missing");
});

test("an edited recovered body is read back and a missing branch is not guessed", async () => {
  const issueBody = `# Acceptance Criteria\n\n- [ ] ${criterion}\n`;
  const entries = [{ criterion, test: "backend/test/verification.http.test.js" }];
  const calls = [];
  const number = await ensurePullRequest({
    issue: "MVP-012",
    issueNumber: 14,
    branch: "cursor/musicapp-mvp-012-implementer-00d0",
    commit: head,
    allowCreate: true,
    acceptance: entries,
  }, {
    runGh(args) {
      calls.push(args[1] || args[0]);
      if (args[0] === "issue") return JSON.stringify({ body: issueBody });
      if (args[0] === "pr" && args[1] === "list") {
        return JSON.stringify([{ ...verifiedPull, body: "MVP-012\n\n## Acceptance\n- pending" }]);
      }
      if (args[0] === "api") {
        return JSON.stringify({ files: [{ filename: "backend/test/verification.http.test.js", status: "added" }] });
      }
      if (args[0] === "pr" && args[1] === "edit") return "";
      if (args[0] === "pr" && args[1] === "view") return JSON.stringify(verifiedPull);
      throw new Error(`unexpected gh ${args.join(" ")}`);
    },
  });
  assert.equal(number, 112);
  assert.ok(calls.includes("edit"));
  assert.ok(calls.includes("view"));

  let stale;
  try {
    ensurePullRequest({
      issue: "MVP-012",
      issueNumber: 14,
      branch: "cursor/musicapp-mvp-012-implementer-00d0",
      commit: head,
      allowCreate: true,
      acceptance: entries,
    }, {
      runGh(args) {
        if (args[0] === "issue") return JSON.stringify({ body: issueBody });
        if (args[0] === "pr" && args[1] === "list") {
          return JSON.stringify([{ ...verifiedPull, body: "MVP-012\n\n## Acceptance\n- pending" }]);
        }
        if (args[0] === "api") {
          return JSON.stringify({ files: [{ filename: "backend/test/verification.http.test.js", status: "modified" }] });
        }
        if (args[0] === "pr" && args[1] === "edit") return "";
        if (args[0] === "pr" && args[1] === "view") {
          return JSON.stringify({ ...verifiedPull, body: "MVP-012\n\n## Acceptance\n- pending" });
        }
        throw new Error(`unexpected gh ${args.join(" ")}`);
      },
    });
    stale = new Error("stale body was accepted");
  } catch (error) {
    stale = error;
  }
  assert.equal(stale.message, "acceptance mapping is missing");

  const omitted = noPullRequest.replace(`,"branch":"cursor/musicapp-mvp-012-implementer-00d0"`, "");
  const guessed = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: omitted,
      git: {
        branches: [
          { repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/other" },
          { repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0" },
        ],
      },
    },
    usageTokens: 1,
  }));
  assert.equal(guessed.effect.reason, "pull request identity does not match");
  assert.equal(guessed.state.items["MVP-012"].branch, undefined);
  assert.equal(guessed.effect.dispatch, undefined);

  const named = reduceCloudTick(base({
    state: {
      dispatches: [],
      dispatch: { issue: "MVP-012", role: "implementer", attempt: 1, agentId: "bc-impl", runId: "run-a" },
    },
    observation: {
      disposition: "finished",
      result: noPullRequest,
      git: {
        branches: [
          { repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/other" },
          { repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0" },
        ],
      },
    },
    usageTokens: 1,
  }));
  assert.equal(named.effect.branch, "cursor/musicapp-mvp-012-implementer-00d0");
});

const staleRunId = "run-bd20a206-7e0d-4f75-9ee2-1e08b6904835";
const staleAgentId = "bc-06f0032e-ea1b-4be1-a8e3-5ea69c503d70";

function staleDispatchState() {
  return {
    items: {
      "MVP-011": { status: "merged", phase: "done", pr: 110, attempts: [{ role: "implementer", sessionId: "bc-older" }] },
    },
    dispatches: [
      { issue: "proof", role: "proof", at: "2026-11-24T06:25:39.951Z" },
      { issue: "MVP-012", role: "implementer", at: "2026-11-24T07:14:27.046Z" },
    ],
    usageTokens: 33031,
    proof: { result: "ACK", agentId: "bc-43809325-7e8c-42cf-a8f5-13a3817715b3" },
    lock: { runId: "45346428861", until: "2026-11-24T07:34:27.046Z" },
    dispatch: {
      issue: "MVP-012",
      role: "implementer",
      attempt: 1,
      prUrl: null,
      agentId: staleAgentId,
      runId: staleRunId,
      status: "RUNNING",
      at: "2026-11-24T07:14:27.046Z",
    },
  };
}

function assertHistoryKept(before, after) {
  assert.deepEqual(after.dispatches, before.dispatches);
  assert.equal(after.usageTokens, before.usageTokens);
  assert.deepEqual(after.proof, before.proof);
  assert.deepEqual(after.items, before.items);
  assert.deepEqual(after.lock, before.lock);
}

test("stop releases a finished run without cancelling and keeps history", async () => {
  for (const status of ["FINISHED", "ERROR", "CANCELLED", "EXPIRED"]) {
    const before = staleDispatchState();
    const calls = [];
    const result = await executeCloudTick({
      ...base({ state: before, action: "stop", allowMerge: false }),
      client: {
        async getRun(agentId, runId) {
          calls.push(["getRun", agentId, runId]);
          return { id: runId, status, result: "merged through pull request 112" };
        },
        async cancelRun() {
          throw new Error("finished run must not be cancelled");
        },
        async createAgent() {
          throw new Error("stop must not dispatch");
        },
      },
      promptFor: () => "implement",
    });
    assert.equal(result.effect.type, "halt");
    assert.equal(result.effect.cancel, false);
    assert.equal(result.effect.reason, "finished run released");
    assert.equal(result.state.dispatch, null);
    assert.notEqual(result.effect.type, "merge");
    assertHistoryKept(before, result.state);
    assert.deepEqual(calls, [["getRun", staleAgentId, staleRunId]]);
  }
});

test("stop releases an idle agent when the run read fails and does not cancel", async () => {
  const before = staleDispatchState();
  const calls = [];
  const result = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        calls.push("getRun");
        throw Object.assign(new Error("Cloud Agents API 404"), { status: 404 });
      },
      async getAgent(agentId) {
        calls.push(["getAgent", agentId]);
        return { id: agentId, status: "IDLE", latestRunId: staleRunId };
      },
      async cancelRun() {
        throw new Error("idle agent must not be cancelled");
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(result.effect.reason, "finished run released");
  assert.equal(result.state.dispatch, null);
  assertHistoryKept(before, result.state);
  assert.deepEqual(calls, ["getRun", ["getAgent", staleAgentId]]);

  const transient = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        throw Object.assign(new Error("Cloud Agents API 500"), { status: 500 });
      },
      async getAgent() {
        return { id: staleAgentId, status: "IDLE", latestRunId: staleRunId };
      },
      async cancelRun() {
        throw new Error("a failed read must not cancel");
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(transient.effect.reason, "API error");
  assert.equal(transient.state.dispatch.runId, staleRunId);
  assertHistoryKept(before, transient.state);

  const otherRun = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        throw Object.assign(new Error("Cloud Agents API 404"), { status: 404 });
      },
      async getAgent() {
        return { id: staleAgentId, status: "IDLE", latestRunId: "run-other" };
      },
      async cancelRun() {
        throw new Error("another run must not be cancelled");
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(otherRun.effect.reason, "API error");
  assert.equal(otherRun.state.dispatch.runId, staleRunId);
  assertHistoryKept(before, otherRun.state);
});

test("stop of an active run clears the dispatch only after cancellation is acknowledged", async () => {
  const before = staleDispatchState();
  const calls = [];
  const runs = [
    { id: staleRunId, status: "RUNNING" },
    { id: staleRunId, status: "CANCELLED" },
  ];
  const result = await executeCloudTick({
    ...base({ state: before, action: "stop", allowMerge: false }),
    client: {
      async getRun(agentId, runId) {
        calls.push(["getRun", agentId, runId]);
        return runs.shift();
      },
      async cancelRun(agentId, runId) {
        calls.push(["cancel", agentId, runId]);
        return { id: runId };
      },
      async createAgent() {
        throw new Error("stop must not dispatch");
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(result.effect.type, "halt");
  assert.equal(result.effect.reason, "cancellation acknowledged");
  assert.equal(result.state.dispatch, null);
  assert.notEqual(result.effect.type, "merge");
  assertHistoryKept(before, result.state);
  assert.deepEqual(calls, [
    ["getRun", staleAgentId, staleRunId],
    ["cancel", staleAgentId, staleRunId],
    ["getRun", staleAgentId, staleRunId],
  ]);
});

test("stop keeps an active dispatch when cancellation is not acknowledged", async () => {
  const before = staleDispatchState();
  const mismatched = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        return { id: staleRunId, status: "RUNNING" };
      },
      async cancelRun() {
        return { id: "run-other" };
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(mismatched.effect.type, "blocked");
  assert.equal(mismatched.effect.reason, "cancellation was not acknowledged");
  assert.equal(mismatched.state.dispatch.runId, staleRunId);
  assert.equal(mismatched.state.dispatch.status, "RUNNING");
  assertHistoryKept(before, mismatched.state);

  const stillRunning = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        return { id: staleRunId, status: "RUNNING" };
      },
      async cancelRun() {
        return { id: staleRunId };
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(stillRunning.effect.reason, "cancellation was not acknowledged");
  assert.equal(stillRunning.state.dispatch.agentId, staleAgentId);
  assertHistoryKept(before, stillRunning.state);

  const refused = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        return { id: staleRunId, status: "RUNNING" };
      },
      async cancelRun() {
        throw Object.assign(new Error("Cloud Agents API 500"), { status: 500 });
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(refused.effect.reason, "API error");
  assert.equal(refused.state.dispatch.runId, staleRunId);
  assertHistoryKept(before, refused.state);
});

test("a cancel conflict releases the dispatch only when the run is already terminal", async () => {
  const before = staleDispatchState();
  let reads = 0;
  const finishedDuringCancel = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        reads += 1;
        return { id: staleRunId, status: reads === 1 ? "RUNNING" : "FINISHED", result: "done" };
      },
      async cancelRun() {
        throw Object.assign(new Error("Cloud Agents API 409"), { status: 409, body: { code: "run_not_cancellable" } });
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(finishedDuringCancel.effect.reason, "finished run released");
  assert.equal(finishedDuringCancel.state.dispatch, null);
  assertHistoryKept(before, finishedDuringCancel.state);

  const stillActive = await executeCloudTick({
    ...base({ state: before, action: "stop" }),
    client: {
      async getRun() {
        return { id: staleRunId, status: "WAITING_FOR_BACKGROUND_WORK" };
      },
      async cancelRun() {
        throw Object.assign(new Error("Cloud Agents API 409"), { status: 409 });
      },
    },
    promptFor: () => "implement",
  });
  assert.equal(stillActive.effect.reason, "API error");
  assert.equal(stillActive.state.dispatch.status, "RUNNING");
  assertHistoryKept(before, stillActive.state);
});
