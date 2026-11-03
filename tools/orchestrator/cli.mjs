#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mjs";
import { applyGitHubIssues, findStatusConflicts, loadIssueIndex } from "./lib/catalog.mjs";
import { fetchOpenIssueSnapshot, loadGateFacts, waitForRequiredChecks } from "./lib/github.mjs";
import { dryRunNextAction, invocationArgs, proveFreshContext, runDryItem, runImplementationLoop } from "./lib/loop.mjs";
import { selectNext, skippedReadyItems } from "./lib/queue.mjs";
import { agentLogDir, resolveAgentBin, runAgent } from "./lib/runner.mjs";
import {
  loadControl,
  loadProof,
  loadState,
  pidAlive,
  saveControl,
  saveProof,
  saveState,
} from "./lib/state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2] || "help";

function emit(value) {
  console.log(JSON.stringify(value, null, 2));
}

function gitPorcelain() {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "git status failed");
  return result.stdout;
}

function loadCatalog() {
  const indexItems = loadIssueIndex(path.join(root, config.indexPath));
  let liveItems = indexItems;
  let conflicts = [];
  let github = "unchecked";
  try {
    const issues = fetchOpenIssueSnapshot();
    liveItems = applyGitHubIssues(indexItems, issues);
    conflicts = findStatusConflicts(indexItems, liveItems);
    github = "checked";
  } catch (error) {
    github = `unavailable: ${error.message}`;
  }
  return { indexItems, liveItems, conflicts, github };
}

function makeRunner(workspace = root) {
  const bin = resolveAgentBin();
  return async (invocation) => {
    const args = invocationArgs(workspace, invocation);
    return runAgent({
      bin,
      args,
      cwd: workspace,
      timeoutMs: invocation.timeoutMs || 30 * 60 * 1000,
      logDir: agentLogDir(root),
    });
  };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function statusReport() {
  const catalog = loadCatalog();
  const state = loadState(root);
  const control = loadControl(root);
  const proof = loadProof(root);
  const next = catalog.conflicts.length === 0 ? selectNext(catalog.liveItems, state) : null;
  return {
    command: "status",
    baseline: config.baseline,
    head: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
    control: control.mode,
    github: catalog.github,
    conflicts: catalog.conflicts,
    freshContextProved: Boolean(proof?.proved),
    next: next ? { id: next.id, issue: next.issue, title: next.title } : null,
    skipped: skippedReadyItems(catalog.liveItems, state),
    items: state.items,
  };
}

async function prove() {
  const outcome = await proveFreshContext(makeRunner());
  if (!outcome.proved) {
    emit({ command: "prove-fresh", proved: false, reason: outcome.reason, sessionA: outcome.sessionA, sessionB: outcome.sessionB });
    process.exitCode = 1;
    return;
  }
  saveProof(root, outcome);
  emit({ command: "prove-fresh", ...outcome });
}

async function dryRun() {
  const before = gitPorcelain();
  const catalog = loadCatalog();
  if (catalog.conflicts.length > 0) {
    emit({ command: "dry-run", status: "blocked", conflicts: catalog.conflicts });
    process.exitCode = 1;
    return;
  }
  const item = selectNext(catalog.liveItems, loadState(root));
  if (!item) {
    emit({ command: "dry-run", status: "idle", reason: "No dependency-ready AUTONOMOUS-READY issue" });
    return;
  }
  const outcome = await runDryItem(makeRunner(), item);
  const after = gitPorcelain();
  const dirty = before !== after;
  const report = {
    command: "dry-run",
    issue: item.id,
    githubIssue: item.issue,
    sessionId: outcome.run.sessionId,
    exitCode: outcome.run.exitCode,
    promptChars: outcome.promptChars,
    attempts: outcome.run.attempts,
    report: outcome.report,
    workingTreeChanged: dirty,
    blocker: outcome.run.exitCode === 0 && !dirty ? "" : (outcome.run.stderr || "").slice(0, 500),
    next_action: dryRunNextAction({
      dirty,
      exitCode: outcome.run.exitCode,
      proved: Boolean(loadProof(root)?.proved),
    }),
  };
  emit(report);
  if (dirty || outcome.run.exitCode !== 0) process.exitCode = 1;
}

function publishReview({ pr, report, sessionId }) {
  const body = [
    "Independent review from a separate agent process.",
    `session: ${sessionId}`,
    "```json",
    JSON.stringify({
      head: report.head,
      defects: report.defects || [],
      improvements: report.improvements || [],
      human_decision: report.human_decision === true,
      external_dependency: report.external_dependency === true,
      spec_ambiguity: report.spec_ambiguity === true,
    }),
    "```",
  ].join("\n");
  const comment = spawnSync(
    "gh",
    ["pr", "comment", String(pr), "--repo", config.repo, "--body", body],
    { cwd: root, encoding: "utf8" },
  );
  if (comment.status !== 0) {
    throw new Error((comment.stderr || "Could not record the independent review").slice(0, 500));
  }
}

async function runOnce(commandName, { only, workspace, maxItems }) {
  const proof = loadProof(root);
  if (!proof?.proved) {
    emit({
      command: commandName,
      status: "refused",
      reason: "Fresh-context proof is missing. Run prove-fresh before implementation.",
    });
    process.exitCode = 3;
    return;
  }
  if (only && !/^MVP-\d+$/.test(only)) {
    emit({ command: commandName, status: "refused", reason: "--only must be an MVP id" });
    process.exitCode = 2;
    return;
  }
  const resolvedWorkspace = workspace ? path.resolve(workspace) : root;
  if (only && resolvedWorkspace === root) {
    emit({
      command: commandName,
      status: "refused",
      reason: "A single-issue trial needs --workspace pointing at a clean worktree of main.",
    });
    process.exitCode = 2;
    return;
  }
  if (workspace) {
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: resolvedWorkspace, encoding: "utf8" });
    const main = spawnSync("git", ["rev-parse", "main"], { cwd: root, encoding: "utf8" });
    const porcelain = spawnSync("git", ["status", "--porcelain"], { cwd: resolvedWorkspace, encoding: "utf8" });
    if (head.stdout.trim() !== main.stdout.trim() || porcelain.stdout.trim() !== "") {
      emit({
        command: commandName,
        status: "refused",
        reason: "Trial workspace must be a clean checkout of local main.",
      });
      process.exitCode = 2;
      return;
    }
  }
  const control = loadControl(root);
  if (control.mode === "running" && pidAlive(control.pid)) {
    emit({ command: commandName, status: "refused", reason: `Orchestrator already running as pid ${control.pid}` });
    process.exitCode = 1;
    return;
  }
  const catalog = loadCatalog();
  if (catalog.conflicts.length > 0) {
    emit({ command: commandName, status: "blocked", conflicts: catalog.conflicts });
    process.exitCode = 1;
    return;
  }
  saveControl(root, "running", process.pid);
  const byId = new Map(catalog.liveItems.map((item) => [item.id, item]));
  try {
    const result = await runImplementationLoop({
      items: catalog.liveItems,
      state: loadState(root),
      readControl: () => loadControl(root),
      runner: makeRunner(resolvedWorkspace),
      only,
      maxItems,
      waitForChecks: ({ pr }) => waitForRequiredChecks(pr),
      publishReview,
      loadGateFacts: (input) =>
        loadGateFacts({
          ...input,
          dependenciesMerged: input.item.dependencies.every((id) => byId.get(id)?.execution === "MERGED"),
        }),
      merge: (args) => {
        const merged = spawnSync("gh", args, { cwd: resolvedWorkspace, encoding: "utf8" });
        if (merged.status !== 0) {
          throw new Error((merged.stderr || "merge failed").slice(0, 500));
        }
      },
    });
    saveState(root, result.state);
    emit({ command: commandName, stopped: result.stopped, results: result.results });
    if (result.results.some((item) => item.status !== "merged")) process.exitCode = 1;
  } finally {
    if (loadControl(root).mode === "running") saveControl(root, "stopped", null);
  }
}

function start() {
  emit({
    command: "start",
    status: "refused",
    reason: "The continuous loop is disabled. Use once --only MVP-011 --workspace <clean main worktree>.",
  });
  process.exitCode = 3;
}

async function once() {
  if (flag("--only") !== "MVP-011") {
    emit({ command: "once", status: "refused", reason: "This trial accepts only --only MVP-011." });
    process.exitCode = 2;
    return;
  }
  await runOnce("once", { only: "MVP-011", workspace: flag("--workspace"), maxItems: 1 });
}

const actions = {
  status() {
    emit(statusReport());
  },
  "prove-fresh": prove,
  "dry-run": dryRun,
  once,
  start,
  pause() {
    saveControl(root, "paused", null);
    emit({ command: "pause", status: "paused", effect: "Takes effect before the next agent execution. The current execution is left running." });
  },
  stop() {
    saveControl(root, "stopped", null);
    emit({ command: "stop", status: "stopped", effect: "Takes effect before the next agent execution. Existing branches and pull requests are kept." });
  },
  help() {
    emit({
      command: "help",
      usage: [
        "node tools/orchestrator/cli.mjs status",
        "node tools/orchestrator/cli.mjs prove-fresh",
        "node tools/orchestrator/cli.mjs dry-run",
        "node tools/orchestrator/cli.mjs once --only MVP-011 --workspace <clean main worktree>",
        "node tools/orchestrator/cli.mjs start",
        "node tools/orchestrator/cli.mjs pause",
        "node tools/orchestrator/cli.mjs stop",
      ],
    });
  },
};

const action = actions[command];
if (!action) {
  emit({ command, status: "refused", reason: "Unknown command" });
  process.exit(2);
}
Promise.resolve(action()).catch((error) => {
  emit({ command, status: "error", reason: error.message });
  process.exitCode = 1;
});
