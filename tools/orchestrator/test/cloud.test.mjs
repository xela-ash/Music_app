import assert from "node:assert/strict";
import test from "node:test";
import { createCloudClient, createOrRecover, interpretCloudRun, pushedBranch, usageTokens } from "../lib/cloud-api.mjs";
import { agentIdFor, executeCloudTick, reduceCloudTick } from "../lib/cloud-tick.mjs";
import { acceptanceMapped, evaluateGates } from "../lib/gates.mjs";
import { ensurePullRequest, selectRecoveredPullRequest } from "../lib/github.mjs";

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
  assert.equal(adopted.effect.candidate, 112);
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
      git: { branches: [{ repoUrl: "https://github.com/xela-ash/Music_app", branch: "cursor/musicapp-mvp-012-implementer-00d0" }] },
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
  const found = selectRecoveredPullRequest([verifiedPull], recoveryExpected, { allowCreate: false });
  assert.equal(found.number, 112);
  assert.equal(found.create, undefined);
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
});
