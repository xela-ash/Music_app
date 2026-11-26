import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { config } from "../config.mjs";
import { loadIssueIndex } from "../lib/catalog.mjs";
import { executeCloudTick, reduceCloudTick } from "../lib/cloud-tick.mjs";
import { evaluateGates } from "../lib/gates.mjs";
import { assessQueue, queueDryRunReport } from "../lib/reconcile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const items = loadIssueIndex(path.join(root, config.indexPath));
const now = Date.parse("2026-11-26T12:00:00Z");

const CLASSIFICATION_LABEL = {
  "AUTONOMOUS-READY": "autonomous-ready",
  "HUMAN-DECISION-REQUIRED": "human-decision-required",
  "EXTERNAL-DEPENDENCY": "external-dependency",
};

function pull(fields) {
  const state = fields.state || "OPEN";
  return {
    isDraft: false,
    baseRefName: "main",
    mergedAt: state === "MERGED" ? "2026-11-04T13:06:27Z" : null,
    ...fields,
    state,
  };
}

function issuesFrom(catalog, overrides = {}) {
  return catalog.map((item) => {
    const override = overrides[item.id] || {};
    const labels = [{ name: CLASSIFICATION_LABEL[item.classification] }];
    if (item.execution === "BLOCKED") labels.push({ name: "blocked" });
    return {
      number: item.issue,
      title: override.title || item.title,
      state: override.state || (item.execution === "MERGED" ? "CLOSED" : "OPEN"),
      labels: override.labels || labels,
    };
  });
}

function controllerState(extra = {}) {
  return {
    version: 1,
    items: {},
    dispatches: [{ issue: "MVP-012", role: "implementer", at: "2026-11-24T07:14:27.046Z" }],
    dispatch: null,
    usageTokens: 33031,
    proof: { result: "ACK", agentId: "bc-proof" },
    ...extra,
  };
}

function liveQueue({ issues, pulls, state } = {}) {
  return assessQueue({
    items,
    issues: issues || issuesFrom(items, { "MVP-012": { state: "CLOSED" } }),
    pulls: pulls || [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
    ],
    state: state || controllerState(),
  });
}

function tick(input) {
  return reduceCloudTick({
    control: { mode: "running" },
    controllerRunId: "controller-1",
    now,
    allowMerge: false,
    ...input,
  });
}

test("stale open and closed issues are merged from verified pull requests", () => {
  const queue = liveQueue();
  assert.equal(queue.ok, true);
  assert.equal(queue.items.find((item) => item.id === "MVP-011").execution, "MERGED");
  assert.equal(queue.items.find((item) => item.id === "MVP-012").execution, "MERGED");
  assert.equal(queue.state.items["MVP-011"].status, "merged");
  assert.equal(queue.state.items["MVP-011"].pr, 110);
  assert.equal(queue.state.items["MVP-012"].pr, 112);
  assert.equal(queue.state.usageTokens, 33031);
  assert.equal(queue.state.dispatches.length, 1);
  assert.equal(queue.state.proof.result, "ACK");
  assert.equal(queue.selection.item.id, "MVP-020");
  assert.equal(queue.intendedAction, "implement");
  assert.equal(queue.corrections.some((correction) => correction.id === "MVP-011" && correction.pr === 110), true);
  assert.equal(queue.corrections.some((correction) => correction.id === "MVP-012" && correction.pr === 112), true);
  const report = queueDryRunReport({ queue: { ...queue, github: "checked" }, controlMode: "stopped", mergeEnabled: false });
  assert.equal(report.mode, "read-only");
  assert.equal(report.agentsCreated, 0);
  assert.equal(report.pullRequestsCreated, 0);
  assert.equal(report.mergeEnabled, false);
  assert.equal(report.armed, false);
  assert.equal(report.next.id, "MVP-020");
});

test("a merged pull request is not implemented again", () => {
  const queue = liveQueue({
    state: controllerState({
      items: { "MVP-011": { status: "implemented", phase: "implement", attempts: [] } },
    }),
  });
  assert.equal(queue.selection.item.id, "MVP-020");
  const created = tick({ state: queue.state, item: queue.selection.item });
  assert.equal(created.effect.type, "create");
  assert.equal(created.effect.dispatch.issue, "MVP-020");
  assert.equal(created.effect.dispatch.role, "implementer");
  assert.equal(created.state.items["MVP-011"].status, "merged");
});

test("a closed issue without a merged pull request fails closed", () => {
  const queue = liveQueue({
    pulls: [pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" })],
  });
  assert.equal(queue.ok, false);
  assert.equal(queue.selection, null);
  assert.match(queue.conflicts.join("\n"), /MVP-012/);
});

test("an open issue that the index calls merged fails closed without a pull request", () => {
  const catalog = items.map((item) => item.id === "MVP-020" ? { ...item, execution: "MERGED" } : item);
  const queue = assessQueue({
    items: catalog,
    issues: issuesFrom(items),
    pulls: [],
    state: controllerState(),
  });
  assert.equal(queue.ok, false);
  assert.match(queue.conflicts.join("\n"), /MVP-020/);
  assert.equal(queue.selection, null);
});

test("dependency order selects MVP-020 only after MVP-011 is verified merged", () => {
  const waiting = liveQueue({
    pulls: [pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" })],
    issues: issuesFrom(items, { "MVP-012": { state: "CLOSED" } }),
  });
  assert.equal(waiting.selection.item.id, "MVP-011");
  const ready = liveQueue();
  assert.equal(ready.selection.item.id, "MVP-020");
  assert.deepEqual(ready.selection.item.dependencies, ["MVP-011", "MVP-019"]);
  const progressed = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 140, title: "[MVP-020] Deliverable and Submission model", state: "MERGED", mergedAt: "2026-11-27T00:00:00Z" }),
    ],
  });
  assert.equal(progressed.selection.item.id, "MVP-021");
  assert.notEqual(progressed.selection.item.id, "MVP-039");
});

test("human-decision and external-dependency items are not selected or merged", () => {
  const queue = liveQueue();
  assert.equal(queue.blockers.some((item) => item.id === "MVP-009"), true);
  assert.equal(queue.blockers.every((item) => item.classification !== "AUTONOMOUS-READY"), true);
  const synthetic = [
    { id: "MVP-001", issue: 3, title: "done", stage: 0, classification: "AUTONOMOUS-READY", dependencies: [], execution: "MERGED" },
    { id: "MVP-002", issue: 4, title: "human", stage: 0, classification: "HUMAN-DECISION-REQUIRED", dependencies: ["MVP-001"], execution: "READY" },
    { id: "MVP-003", issue: 5, title: "external", stage: 0, classification: "EXTERNAL-DEPENDENCY", dependencies: ["MVP-001"], execution: "READY" },
    { id: "MVP-004", issue: 6, title: "waits", stage: 0, classification: "AUTONOMOUS-READY", dependencies: ["MVP-002"], execution: "WAITING-DEPENDENCY" },
    { id: "MVP-006", issue: 8, title: "next", stage: 0, classification: "AUTONOMOUS-READY", dependencies: ["MVP-001"], execution: "READY" },
  ];
  const selected = assessQueue({
    items: synthetic,
    issues: issuesFrom(synthetic),
    pulls: [],
    state: { items: {} },
  });
  assert.equal(selected.selection.item.id, "MVP-006");
  const clearFacts = {
    dependenciesMerged: true,
    acceptanceMapped: true,
    checks: Object.fromEntries(config.requiredChecks.map((name) => [name, "passing"])),
    unresolvedDefects: 0,
    revalidatedHead: true,
    basedOnCurrentMain: true,
    mergeable: "MERGEABLE",
    unresolvedThreads: 0,
    humanDecision: false,
    externalDependency: false,
    specAmbiguity: false,
    engineeringRecords: true,
    changedPaths: ["backend/src/app.js"],
    scopeOk: true,
    protectionAllowsMerge: true,
  };
  const human = evaluateGates({ ...clearFacts, classification: "HUMAN-DECISION-REQUIRED" });
  assert.equal(human.passed, false);
  assert.equal(human.failures.some((failure) => failure.id === 1), true);
  const external = evaluateGates({ ...clearFacts, classification: "EXTERNAL-DEPENDENCY" });
  assert.equal(external.passed, false);
  const governance = evaluateGates({
    ...clearFacts,
    classification: "AUTONOMOUS-READY",
    revalidatedHead: false,
    changedPaths: ["tools/orchestrator/lib/reconcile.mjs"],
    scopeOk: false,
  });
  assert.equal(governance.passed, false);
  assert.equal(governance.failures.some((failure) => failure.id === 6), true);
  assert.equal(governance.failures.some((failure) => failure.id === 14), true);
});

test("an open implementation pull request is resumed and a second one is not started", () => {
  const queue = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
    ],
  });
  assert.equal(queue.intendedAction, "review");
  assert.equal(queue.selection.item.id, "MVP-020");
  assert.equal(queue.state.items["MVP-020"].pr, 130);
  const restarted = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
    ],
    state: queue.state,
  });
  assert.equal(restarted.corrections.length, 0);
  assert.equal(restarted.intendedAction, "review");
  const review = tick({ state: restarted.state, item: restarted.selection.item });
  assert.equal(review.effect.type, "create");
  assert.equal(review.effect.dispatch.role, "reviewer");
  assert.match(review.effect.dispatch.prUrl, /\/pull\/130$/);
  const repairState = {
    ...review.state,
    dispatch: null,
    items: {
      ...review.state.items,
      "MVP-020": {
        ...review.state.items["MVP-020"],
        phase: "repair",
        status: "implemented",
        pr: 130,
        attempts: [{ role: "reviewer", sessionId: "bc-review", exitCode: 0, at: "2026-11-26T12:00:00Z" }],
      },
    },
  };
  const repairQueue = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
    ],
    state: repairState,
  });
  assert.equal(repairQueue.intendedAction, "repair");
  const repair = tick({ state: repairQueue.state, item: repairQueue.selection.item });
  assert.equal(repair.effect.dispatch.role, "repair");
  assert.equal(repair.effect.dispatch.issue, "MVP-020");
  const limitedState = {
    ...repairQueue.state,
    dispatch: null,
    items: {
      ...repairQueue.state.items,
      "MVP-020": {
        ...repairQueue.state.items["MVP-020"],
        attempts: [
          { role: "repair", sessionId: "bc-r1" },
          { role: "repair", sessionId: "bc-r2" },
        ],
      },
    },
  };
  const limited = tick({ state: limitedState, item: repairQueue.selection.item });
  assert.equal(limited.effect.reason, "repair limit reached");
  assert.notEqual(limited.effect.type, "create");
  const held = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
    ],
    state: limited.state,
  });
  assert.equal(held.intendedAction, "escalate");
  assert.equal(held.selection.item.id, "MVP-020");
  const escalated = tick({ state: held.state, item: held.selection.item });
  assert.equal(escalated.effect.type, "blocked");
  assert.notEqual(escalated.effect.type, "create");
});

test("a draft or a second open pull request does not start implementation", () => {
  const draft = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null, isDraft: true }),
    ],
  });
  assert.equal(draft.intendedAction, "escalate");
  assert.match(draft.reasons.join(" "), /draft/);
  const duplicate = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
      pull({ number: 131, title: "[MVP-020] Deliverable follow-up", state: "OPEN", mergedAt: null }),
    ],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.selection, null);
  const both = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
      pull({ number: 132, title: "[MVP-020] Deliverable and Submission model", state: "MERGED", mergedAt: "2026-11-27T00:00:00Z" }),
    ],
  });
  assert.equal(both.ok, false);
  assert.match(both.conflicts.join("\n"), /open implementation pull request/);
});

test("a merged status title that names two settled items is not completion evidence", () => {
  const queue = liveQueue({
    pulls: [
      pull({ number: 95, title: "Record MVP-026 merge and mark MVP-029 ready", state: "MERGED", mergedAt: "2026-10-01T11:51:14Z" }),
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
    ],
  });
  assert.equal(queue.ok, true);
  assert.equal(queue.selection.item.id, "MVP-020");
  assert.equal(queue.state.items["MVP-026"], undefined);
  const open = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 150, title: "[MVP-020] and MVP-021 together", state: "OPEN", mergedAt: null }),
    ],
  });
  assert.equal(open.ok, false);
  assert.match(open.conflicts.join("\n"), /more than one MVP id/);
});

test("a recorded pull request is kept when its title omits the MVP id", () => {
  const resumed = liveQueue({
    state: controllerState({
      items: { "MVP-020": { status: "implemented", phase: "review", pr: 130, attempts: [] } },
    }),
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "recovered implementation", state: "OPEN", mergedAt: null, body: "notes without an id" }),
    ],
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.selection.item.id, "MVP-020");
  assert.equal(resumed.intendedAction, "review");
  const merged = liveQueue({
    state: controllerState({
      items: { "MVP-011": { status: "implemented", phase: "gates", pr: 110, attempts: [] } },
    }),
    pulls: [
      pull({ number: 110, title: "asset retention", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
    ],
  });
  assert.equal(merged.ok, true);
  assert.equal(merged.state.items["MVP-011"].status, "merged");
  assert.equal(merged.selection.item.id, "MVP-020");
  const wrongTitle = liveQueue({
    state: controllerState({
      items: { "MVP-020": { status: "implemented", phase: "review", pr: 131, attempts: [] } },
    }),
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 131, title: "[MVP-021] Deliverable validation", state: "OPEN", mergedAt: null }),
    ],
  });
  assert.equal(wrongTitle.ok, false);
  assert.match(wrongTitle.conflicts.join("\n"), /title matches MVP-021/);
});

test("an open pull request is not implemented again when only its body names the issue", () => {
  const resumed = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({
        number: 130,
        title: "recovered implementation",
        state: "OPEN",
        mergedAt: null,
        body: "Implements MVP-020\nDepends on MVP-011",
      }),
    ],
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.selection.item.id, "MVP-020");
  assert.equal(resumed.intendedAction, "review");
  const ambiguous = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({
        number: 131,
        title: "two features",
        state: "OPEN",
        mergedAt: null,
        body: "MVP-020 and MVP-021",
      }),
    ],
  });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.selection, null);
  assert.match(ambiguous.conflicts.join("\n"), /body matches more than one unsettled MVP id/);
  const recordedMerge = liveQueue({
    state: controllerState({
      items: { "MVP-011": { status: "merged", phase: "merged", pr: 110, attempts: [] } },
    }),
    pulls: [
      pull({ number: 110, title: "asset retention", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({
        number: 130,
        title: "recovered implementation",
        state: "OPEN",
        mergedAt: null,
        body: "Implements MVP-020\nDepends on MVP-011",
      }),
    ],
  });
  assert.equal(recordedMerge.ok, true);
  assert.equal(recordedMerge.selection.item.id, "MVP-020");
  assert.equal(recordedMerge.intendedAction, "review");
  const settledBody = liveQueue({
    state: controllerState({
      items: { "MVP-011": { status: "merged", phase: "merged", pr: 110, attempts: [] } },
    }),
    pulls: [
      pull({ number: 110, title: "asset retention", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 131, title: "status note", state: "OPEN", mergedAt: null, body: "MVP-011 is already merged" }),
    ],
  });
  assert.equal(settledBody.ok, true);
  assert.equal(settledBody.selection.item.id, "MVP-020");
  assert.equal(settledBody.intendedAction, "implement");
});

test("lookalike titles and body-only mentions are not merge evidence", () => {
  const lookalike = liveQueue({
    issues: issuesFrom(items, { "MVP-012": { state: "CLOSED" } }),
    pulls: [
      pull({ number: 110, title: "[MVP-0110] not this item", state: "MERGED" }),
      pull({ number: 111, title: "retention notes", state: "MERGED", body: "See MVP-011 for the merged work." }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
    ],
  });
  assert.equal(lookalike.ok, true);
  assert.notEqual(lookalike.state.items["MVP-011"]?.status, "merged");
  assert.equal(lookalike.selection.item.id, "MVP-011");
});

test("missing or contradictory GitHub data selects nothing", () => {
  const missing = assessQueue({ items, issues: null, pulls: null, state: controllerState() });
  assert.equal(missing.ok, false);
  assert.equal(missing.intendedAction, "stop");
  assert.match(missing.conflicts[0], /unavailable/);
  const incomplete = assessQueue({
    items: items.slice(0, 1),
    issues: issuesFrom(items.slice(0, 1)),
    pulls: [],
    state: { items: {} },
    issueLimit: 1,
  });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.conflicts.join("\n"), /incomplete/);
  const mismatched = liveQueue({
    issues: issuesFrom(items, {
      "MVP-012": { state: "CLOSED" },
      "MVP-020": { labels: [{ name: "human-decision-required" }] },
    }),
  });
  assert.equal(mismatched.ok, false);
  assert.match(mismatched.conflicts.join("\n"), /MVP-020/);
  const claimed = liveQueue({
    state: controllerState({ items: { "MVP-039": { status: "merged", phase: "merged", attempts: [] } } }),
  });
  assert.equal(claimed.ok, false);
  assert.match(claimed.conflicts.join("\n"), /MVP-039/);
});

test("an active dispatch survives a restart and blocks the next issue", () => {
  const queued = liveQueue();
  const state = {
    ...queued.state,
    dispatch: { issue: "MVP-012", role: "reviewer", attempt: 1, agentId: "bc-review", runId: "run-b" },
  };
  const restarted = liveQueue({ state });
  assert.equal(restarted.intendedAction, "poll");
  assert.equal(restarted.selection.item.id, "MVP-020");
  const polled = tick({ state: restarted.state, item: restarted.selection.item });
  assert.equal(polled.effect.type, "poll");
  assert.equal(polled.effect.dispatch.issue, "MVP-012");
  assert.notEqual(polled.effect.type, "create");
});

test("token and daily limits still stop a new agent", () => {
  assert.equal(config.maxCloudDispatchesPerDay, 4);
  assert.equal(config.maxTrackedTokens, 2_000_000);
  assert.equal(config.maxActiveAgents, 1);
  assert.equal(config.maxRepairRounds, 2);
  const queue = liveQueue();
  const ceiling = tick({
    state: { ...queue.state, usageTokens: config.maxTrackedTokens },
    item: queue.selection.item,
  });
  assert.equal(ceiling.effect.reason, "tracked token ceiling reached");
  assert.notEqual(ceiling.effect.type, "create");
  const daily = tick({
    state: {
      ...queue.state,
      dispatches: Array.from({ length: 4 }, () => ({ issue: "MVP-020", role: "implementer", at: "2026-11-26T11:00:00Z" })),
    },
    item: queue.selection.item,
  });
  assert.equal(daily.effect.reason, "daily cloud dispatch limit reached");
  assert.notEqual(daily.effect.type, "create");
});

test("a failed cloud API call does not switch to another issue", async () => {
  const queue = liveQueue();
  const result = await executeCloudTick({
    state: queue.state,
    control: { mode: "running" },
    controllerRunId: "controller-1",
    now,
    allowMerge: false,
    item: queue.selection.item,
    client: {
      async createAgent() {
        throw new Error("network");
      },
    },
    promptFor: () => "implement the selected issue",
  });
  assert.equal(result.effect.reason, "API error");
  assert.equal(result.state.dispatch.issue, "MVP-020");
  assert.equal(result.state.dispatch.role, "implementer");
  assert.equal(result.state.items["MVP-011"].status, "merged");
  const retry = tick({ state: { ...result.state, dispatch: null }, item: queue.selection.item });
  assert.equal(retry.effect.dispatch.issue, "MVP-020");
  assert.equal(retry.effect.dispatch.role, "implementer");
});

test("gates still require the current head and refuse unattended merge", () => {
  const queue = liveQueue({
    pulls: [
      pull({ number: 110, title: "[MVP-011] Asset retention, hold, and deletion engine", state: "MERGED" }),
      pull({ number: 112, title: "[MVP-012] Identity verification routes", state: "MERGED", mergedAt: "2026-11-26T04:52:31Z" }),
      pull({ number: 130, title: "[MVP-020] Deliverable and Submission model", state: "OPEN", mergedAt: null }),
    ],
    state: controllerState({
      items: {
        "MVP-020": {
          status: "implemented",
          phase: "gates",
          pr: 130,
          attempts: [
            { role: "implementer", sessionId: "bc-impl" },
            { role: "reviewer", sessionId: "bc-review" },
          ],
        },
      },
    }),
  });
  assert.equal(queue.intendedAction, "gates");
  const missing = tick({ state: queue.state, item: queue.selection.item });
  assert.equal(missing.effect.reason, "missing CI evidence");
  const refused = tick({
    state: queue.state,
    item: queue.selection.item,
    gates: { passed: true },
    allowMerge: false,
  });
  assert.equal(refused.effect.reason, "unattended merge is disabled");
  assert.notEqual(refused.effect.type, "merge");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/orchestrator.yml"), "utf8");
  assert.equal(workflow.includes("ORCHESTRATOR_ALLOW_MERGE"), false);
  assert.equal(workflow.includes("ORCHESTRATOR_CLOUD_TRIAL"), false);
  assert.equal(workflow.includes("dry-run"), true);
});
