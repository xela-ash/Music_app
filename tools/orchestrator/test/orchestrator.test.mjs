import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { config } from "../config.mjs";
import { loadIssueIndex } from "../lib/catalog.mjs";
import { buildAgentArgs } from "../lib/argv.mjs";
import { evaluateGates, mergeCommand } from "../lib/gates.mjs";
import { gateFactsFromPullRequest } from "../lib/github.mjs";
import { MERGE_GATES } from "../lib/gates.mjs";
import { dryRunNextAction, proveFreshContext, runImplementationLoop } from "../lib/loop.mjs";
import { dryRunPrompt, proofPromptA, proofPromptB, reviewPrompt } from "../lib/prompts.mjs";
import { selectNext, skippedReadyItems } from "../lib/queue.mjs";
import { classifyAgentFailure, withRetries } from "../lib/retry.mjs";
import { extractReport } from "../lib/runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const items = loadIssueIndex(path.join(root, config.indexPath));

function passingFacts(overrides = {}) {
  return {
    classification: "AUTONOMOUS-READY",
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
    changedPaths: ["backend/src/assets/service.js"],
    scopeOk: true,
    protectionAllowsMerge: true,
    ...overrides,
  };
}

test("issue index selects MVP-011 before MVP-012", () => {
  assert.equal(items.length, 52);
  const next = selectNext(items, { items: {} });
  assert.equal(next.id, "MVP-011");
  assert.equal(next.issue, 13);
  assert.deepEqual(next.dependencies, ["MVP-010"]);
  const blocked = selectNext(items, { items: { "MVP-011": { status: "blocked", attempts: [] } } });
  assert.equal(blocked.id, "MVP-012");
  assert.equal(selectNext(items.filter((item) => item.id !== "MVP-011"), { items: {} }).id, "MVP-012");
});

test("human-gated and blocked items are not selected", () => {
  const next = selectNext(items, {
    items: {
      "MVP-011": { status: "blocked", attempts: [] },
      "MVP-012": { status: "blocked", attempts: [] },
    },
  });
  assert.equal(next, null);
  const skipped = skippedReadyItems(items, { items: {} });
  assert.ok(skipped.some((item) => item.id === "MVP-009"));
  assert.ok(skipped.every((item) => item.classification !== "AUTONOMOUS-READY"));
});

test("agent invocations cannot resume a conversation", () => {
  assert.throws(() => buildAgentArgs({
    mode: "ask",
    workspace: root,
    sandbox: "enabled",
    prompt: "--resume prior",
  }));
  const args = buildAgentArgs({
    mode: "ask",
    workspace: root,
    sandbox: "enabled",
    prompt: dryRunPrompt(items.find((item) => item.id === "MVP-011")),
  });
  assert.equal(args.includes("--resume"), false);
  assert.equal(args.includes("--continue"), false);
  assert.equal(args.includes("--force"), false);
  const implementArgs = buildAgentArgs({
    mode: "agent",
    workspace: root,
    force: true,
    sandbox: "disabled",
    prompt: "MusicApp implement",
  });
  assert.equal(implementArgs.includes("--mode"), false);
  assert.equal(implementArgs.includes("--force"), true);
  assert.throws(() => buildAgentArgs({
    mode: "ask",
    workspace: root,
    force: true,
    sandbox: "enabled",
    prompt: "MusicApp",
  }));
});

test("second freshness prompt does not carry the first check code", () => {
  const nonce = "orch-secret";
  const second = proofPromptB();
  assert.equal(second.includes(nonce), false);
  assert.equal(proofPromptA(nonce).includes(nonce), true);
  const review = reviewPrompt(items[0], 80);
  assert.equal(review.includes("previous agent transcript"), true);
  assert.equal(review.includes(nonce), false);
});

test("merge gates fail closed and the merge command does not bypass protection", () => {
  assert.equal(evaluateGates(passingFacts()).passed, true);
  const human = evaluateGates(passingFacts({ classification: "HUMAN-DECISION-REQUIRED" }));
  assert.equal(human.passed, false);
  assert.ok(human.failures.some((failure) => failure.id === 1));
  const checks = evaluateGates(passingFacts({ checks: { lint: "passing" } }));
  assert.ok(checks.failures.some((failure) => failure.id === 4));
  const vscode = evaluateGates(passingFacts({ changedPaths: [".vscode/settings.json"] }));
  assert.ok(vscode.failures.some((failure) => failure.id === 14));
  const args = mergeCommand(80);
  assert.deepEqual(args.includes("--admin"), false);
  assert.equal(args[0], "pr");
  assert.equal(args.includes("--squash"), true);
});

test("transient failures stop after the configured retry limit", async () => {
  let calls = 0;
  const outcome = await withRetries(async () => {
    calls += 1;
    return { exitCode: 1, stderr: "socket hang up", timedOut: false };
  }, { sleep: async () => {} });
  assert.equal(calls, config.maxTransientRetries + 1);
  assert.equal(outcome.failure.kind, "persistent");
  assert.equal(classifyAgentFailure({ exitCode: 1, stderr: "specification ambiguity" }).retry, false);
});

test("freshness proof requires two sessions and does not feed the code forward", async () => {
  const prompts = [];
  const outcome = await proveFreshContext(async (invocation) => {
    prompts.push(invocation.prompt);
    const ack = invocation.prompt.includes("The check code is");
    const sessionId = `session-${prompts.length}`;
    return {
      exitCode: 0,
      sessionId,
      stderr: "",
      timedOut: false,
      result: {
        type: "result",
        session_id: sessionId,
        result: ack
          ? '{"role":"proof","result":"ACK"}'
          : '{"role":"proof","result":"NO_PRIOR_CONTEXT"}',
      },
    };
  });
  assert.equal(outcome.proved, true);
  assert.notEqual(outcome.sessionA, outcome.sessionB);
  assert.equal(prompts[1].includes("The check code is"), false);
});

test("implementation loop uses a new reviewer and stops at the repair limit", async () => {
  const roles = [];
  const merges = [];
  const result = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    runner: async (invocation) => {
      roles.push(invocation.role);
      let body = '{"role":"implementer","issue":"MVP-011","pr":80,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}';
      if (invocation.role === "reviewer") {
        body = '{"role":"reviewer","issue":"MVP-011","pr":80,"head":"abc","defects":[{"summary":"missing hold test"}],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"repair"}';
      }
      if (invocation.role === "repair") {
        assert.equal(invocation.prompt.includes("missing hold test"), true);
        assert.equal(invocation.prompt.includes("implementation run"), false);
      }
      return {
        exitCode: 0,
        sessionId: `s-${roles.length}`,
        stderr: "",
        timedOut: false,
        result: { type: "result", session_id: `s-${roles.length}`, result: body },
      };
    },
    loadGateFacts: async () => passingFacts(),
    merge: async (args) => merges.push(args),
  });
  assert.equal(merges.length, 0);
  assert.equal(result.results[0].status, "blocked");
  assert.equal(result.results[0].phase, "repair-limit");
  assert.equal(roles.filter((role) => role === "reviewer").length, config.maxRepairRounds + 1);
  assert.equal(roles.filter((role) => role === "repair").length, config.maxRepairRounds);
});

test("inline implementer report still yields the pull request number", () => {
  const text = 'Retention tests passed. {"role":"implementer","issue":"MVP-011","pr":110,"head":"abc","commit":"abc","blockers":[],"next_action":"independent review"}MVP-011 is on PR 110.';
  assert.equal(extractReport(text).pr, 110);
});

test("dry-run success reads the proof flag", () => {
  assert.match(dryRunNextAction({ dirty: false, exitCode: 0, proved: true }), /already recorded/);
  assert.match(dryRunNextAction({ dirty: false, exitCode: 0, proved: false }), /still required/);
});

test("each merge gate fails on its own fact", () => {
  assert.deepEqual(MERGE_GATES.map((gate) => gate.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const cases = [
    [{ classification: "HUMAN-DECISION-REQUIRED" }, 1],
    [{ dependenciesMerged: false }, 2],
    [{ acceptanceMapped: false }, 3],
    [{ checks: { lint: "passing" } }, 4],
    [{ unresolvedDefects: 1 }, 5],
    [{ revalidatedHead: false }, 6],
    [{ basedOnCurrentMain: false }, 7],
    [{ mergeable: "CONFLICTING" }, 8],
    [{ unresolvedThreads: 1 }, 9],
    [{ humanDecision: true }, 10],
    [{ externalDependency: true }, 11],
    [{ specAmbiguity: true }, 12],
    [{ engineeringRecords: false }, 13],
    [{ changedPaths: [".vscode/extensions.json"] }, 14],
    [{ protectionAllowsMerge: false }, 15],
  ];
  for (const [patch, id] of cases) {
    const result = evaluateGates(passingFacts(patch));
    assert.equal(result.passed, false);
    assert.ok(result.failures.some((failure) => failure.id === id), `gate ${id}`);
  }
});

test("orchestrator paths are outside MVP scope", () => {
  const facts = gateFactsFromPullRequest({
    item: items.find((item) => item.id === "MVP-011"),
    review: { head: "new", defects: [] },
    pr: {
      body: "MVP-011\nAcceptance mapped to asset-retention.test.js\nNo significant engineering decision",
      baseRefName: "main",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      headRefOid: "new",
      files: [
        { path: "backend/src/assets/service.js" },
        { path: "docs/20-engineering/engineering-build-record.md" },
        { path: "tools/orchestrator/cli.mjs" },
      ],
      statusCheckRollup: config.requiredChecks.map((name) => ({ name, conclusion: "SUCCESS", headSha: "new" })),
    },
    threadsUnresolved: 0,
    dependenciesMerged: true,
  });
  assert.equal(facts.scopeOk, false);
  assert.ok(evaluateGates(facts).failures.some((failure) => failure.id === 14));
});

test("a single-issue restriction does not continue after MVP-011", async () => {
  const seen = [];
  const result = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 5,
    only: "MVP-011",
    runner: async (invocation) => {
      seen.push(invocation.prompt.slice(0, 40));
      return { exitCode: 1, stderr: "specification ambiguity", sessionId: null, timedOut: false, result: null };
    },
    loadGateFacts: async () => passingFacts(),
    merge: async () => {
      throw new Error("should not merge");
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(result.results[0].issue, "MVP-011");
  assert.equal(result.stopped, "idle");
});

test("merge requires a distinct reviewer session", async () => {
  const merges = [];
  const shared = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    waitForChecks: async () => ({ passing: true, failed: [], pending: [] }),
    runner: async (invocation) => ({
      exitCode: 0,
      sessionId: "same-session",
      stderr: "",
      timedOut: false,
      result: {
        type: "result",
        session_id: "same-session",
        result: invocation.role === "reviewer"
          ? '{"role":"reviewer","issue":"MVP-011","pr":80,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}'
          : '{"role":"implementer","issue":"MVP-011","pr":80,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}',
      },
    }),
    loadGateFacts: async () => passingFacts(),
    merge: async (args) => merges.push(args),
  });
  assert.equal(merges.length, 0);
  assert.equal(shared.results[0].phase, "review-session");

  const separate = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    waitForChecks: async () => ({ passing: true, failed: [], pending: [] }),
    runner: async (invocation) => {
      const sessionId = invocation.role === "reviewer" ? "review-session" : "implement-session";
      return {
        exitCode: 0,
        sessionId,
        stderr: "",
        timedOut: false,
        result: {
          type: "result",
          session_id: sessionId,
          result: invocation.role === "reviewer"
            ? '{"role":"reviewer","issue":"MVP-011","pr":80,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}'
            : '{"role":"implementer","issue":"MVP-011","pr":80,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}',
        },
      };
    },
    loadGateFacts: async () => passingFacts(),
    merge: async (args) => merges.push(args),
  });
  assert.equal(separate.results[0].status, "merged");
  assert.equal(merges.length, 1);
  assert.equal(merges[0].includes("--admin"), false);
});

test("gate facts fail closed when the head reviewed is stale", () => {
  const facts = gateFactsFromPullRequest({
    item: items.find((item) => item.id === "MVP-011"),
    review: { head: "old", defects: [], human_decision: false },
    pr: {
      body: "MVP-011\nAcceptance mapped to asset-retention.test.js",
      baseRefName: "main",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      headRefOid: "new",
      files: [{ path: "backend/src/assets/service.js" }],
      statusCheckRollup: config.requiredChecks.map((name) => ({ name, conclusion: "SUCCESS" })),
    },
    threadsUnresolved: 0,
    dependenciesMerged: true,
  });
  const gates = evaluateGates(facts);
  assert.equal(gates.passed, false);
  assert.ok(gates.failures.some((failure) => failure.id === 6));
  assert.ok(gates.failures.some((failure) => failure.id === 13));
});

test("a later malformed object does not replace a valid embedded report", () => {
  const text = [
    'Retention tests passed.',
    '{"role":"implementer","issue":"MVP-011","pr":110,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}',
    'MVP-011 is on PR 110.',
    '{"role":"implementer","pr":"not-a-number"}',
  ].join(" ");
  assert.equal(extractReport(text).pr, 110);
  assert.equal(extractReport("I opened pull request 110 without a report"), null);
  assert.equal(extractReport('{"role":"reviewer","defects":[]}'), null);
});

test("malformed reviewer output does not merge", async () => {
  const merges = [];
  const result = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    runner: async (invocation) => ({
      exitCode: 0,
      sessionId: `${invocation.role}-session`,
      stderr: "",
      timedOut: false,
      result: {
        type: "result",
        session_id: `${invocation.role}-session`,
        result: invocation.role === "reviewer"
          ? "Review complete. No defects. {\"role\":\"reviewer\"}"
          : '{"role":"implementer","issue":"MVP-011","pr":110,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}',
      },
    }),
    loadGateFacts: async () => passingFacts(),
    merge: async () => merges.push(true),
  });
  assert.equal(merges.length, 0);
  assert.equal(result.results[0].status, "blocked");
  assert.equal(result.results[0].phase, "review-report");
});

test("resume reviews an existing pull request without a second implementation", async () => {
  const roles = [];
  const merges = [];
  const resumed = await runImplementationLoop({
    items,
    state: {
      items: {
        "MVP-011": {
          status: "blocked",
          pr: 110,
          attempts: [{ role: "implementer", sessionId: "implement-session", exitCode: 0 }],
        },
      },
    },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    resumePr: 110,
    waitForChecks: async () => ({ passing: true, failed: [], pending: [] }),
    runner: async (invocation) => {
      roles.push(invocation.role);
      return {
        exitCode: 0,
        sessionId: "review-session",
        stderr: "",
        timedOut: false,
        result: {
          type: "result",
          session_id: "review-session",
          result: '{"role":"reviewer","issue":"MVP-011","pr":110,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}',
        },
      };
    },
    loadGateFacts: async () => passingFacts(),
    merge: async (args) => merges.push(args),
  });
  assert.deepEqual(roles, ["reviewer"]);
  assert.equal(resumed.results[0].status, "merged");
  assert.equal(merges.length, 1);

  const missingImplementer = await runImplementationLoop({
    items,
    state: { items: { "MVP-011": { status: "blocked", attempts: [] } } },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    resumePr: 110,
    waitForChecks: async () => ({ passing: true, failed: [], pending: [] }),
    runner: async () => ({
      exitCode: 0,
      sessionId: "review-only",
      stderr: "",
      timedOut: false,
      result: {
        type: "result",
        session_id: "review-only",
        result: '{"role":"reviewer","issue":"MVP-011","pr":110,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}',
      },
    }),
    loadGateFacts: async () => passingFacts(),
    merge: async () => merges.push("unexpected"),
  });
  assert.equal(missingImplementer.results[0].phase, "review-session");
  assert.equal(merges.length, 1);
});

test("pause stops before the next agent execution", async () => {
  const result = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "paused" }),
    maxItems: 1,
    runner: async () => {
      throw new Error("paused loop must not start an agent");
    },
    loadGateFacts: async () => passingFacts(),
    merge: async () => {
      throw new Error("paused loop must not merge");
    },
  });
  assert.equal(result.stopped, "paused");
  assert.equal(result.results.length, 0);
});

test("continuous start stays disabled and a human-gated item is not executed", async () => {
  const start = spawnSync(process.execPath, ["tools/orchestrator/cli.mjs", "start"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(start.status, 0);
  assert.match(start.stdout, /continuous loop is disabled/);
  const wrongItem = spawnSync(process.execPath, ["tools/orchestrator/cli.mjs", "once", "--only", "MVP-012"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(wrongItem.status, 0);
  assert.match(wrongItem.stdout, /only --only MVP-011/);

  const merges = [];
  const human = await runImplementationLoop({
    items: items.filter((item) => item.id === "MVP-009"),
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    runner: async () => {
      throw new Error("human-gated item must not start an agent");
    },
    loadGateFacts: async () => passingFacts({ classification: "EXTERNAL-DEPENDENCY" }),
    merge: async () => merges.push(true),
  });
  assert.equal(human.stopped, "idle");
  assert.equal(merges.length, 0);
});

test("failed required checks do not merge after the repair budget is spent", async () => {
  const merges = [];
  const result = await runImplementationLoop({
    items,
    state: { items: {} },
    readControl: () => ({ mode: "running" }),
    maxItems: 1,
    only: "MVP-011",
    waitForChecks: async () => ({ passing: false, failed: ["backend-test"], pending: [] }),
    runner: async (invocation) => ({
      exitCode: 0,
      sessionId: `${invocation.role}-session`,
      stderr: "",
      timedOut: false,
      result: {
        type: "result",
        session_id: `${invocation.role}-session`,
        result: invocation.role === "reviewer"
          ? '{"role":"reviewer","issue":"MVP-011","pr":110,"head":"abc","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"merge"}'
          : '{"role":"implementer","issue":"MVP-011","pr":110,"head":"abc","commit":"abc","blockers":[],"next_action":"review"}',
      },
    }),
    loadGateFacts: async () => passingFacts(),
    merge: async () => merges.push(true),
  });
  assert.equal(merges.length, 0);
  assert.equal(result.results[0].status, "blocked");
  assert.equal(result.results[0].phase, "checks");
});
