import { randomBytes } from "node:crypto";
import { config } from "../config.mjs";
import { buildAgentArgs } from "./argv.mjs";
import { evaluateGates, mergeCommand } from "./gates.mjs";
import {
  dryRunPrompt,
  implementPrompt,
  proofPromptA,
  proofPromptB,
  repairPrompt,
  reviewPrompt,
} from "./prompts.mjs";
import { selectNext } from "./queue.mjs";
import { withRetries } from "./retry.mjs";
import { extractReport } from "./runner.mjs";
import { recordItem } from "./state.mjs";

function attemptRecord(role, run) {
  return {
    role,
    sessionId: run.sessionId || null,
    exitCode: run.exitCode,
    at: new Date().toISOString(),
  };
}

async function freshRun(runner, invocation) {
  return withRetries(() => runner(invocation));
}

export async function proveFreshContext(runner) {
  const nonce = `orch-${randomBytes(4).toString("hex")}`;
  const firstPrompt = proofPromptA(nonce);
  const secondPrompt = proofPromptB();
  if (secondPrompt.includes(nonce)) {
    throw new Error("Freshness prompt leaked the check code into the second execution");
  }
  const proofRun = { mode: "ask", force: false, sandbox: "enabled", timeoutMs: 120000 };
  const first = await freshRun(runner, { ...proofRun, role: "proof-a", prompt: firstPrompt });
  const second = await freshRun(runner, { ...proofRun, role: "proof-b", prompt: secondPrompt });
  if (first.exitCode !== 0 || second.exitCode !== 0) {
    return {
      proved: false,
      reason: first.stderr || second.stderr || "Agent process failed",
      sessionA: first.sessionId || null,
      sessionB: second.sessionId || null,
    };
  }
  const firstReport = extractReport(first.result?.result);
  const secondReport = extractReport(second.result?.result);
  const secondText = `${second.result?.result || ""}`;
  const proved =
    first.sessionId &&
    second.sessionId &&
    first.sessionId !== second.sessionId &&
    firstReport?.result === "ACK" &&
    secondReport?.result === "NO_PRIOR_CONTEXT" &&
    !secondText.includes(nonce);
  return {
    proved,
    reason: proved ? "Two agent processes returned different session ids and no shared check code" : "Fresh-context check did not hold",
    sessionA: first.sessionId,
    sessionB: second.sessionId,
    checkedAt: new Date().toISOString(),
  };
}

export function dryRunNextAction({ dirty, exitCode, proved }) {
  if (dirty) return "Inspect the working tree. A read-only dry run must not change files.";
  if (exitCode !== 0) return "Authenticate the Cursor agent CLI, then repeat the dry run.";
  if (proved) return "Fresh-context proof is already recorded. A single-issue once command can run.";
  return "Fresh-context proof is still required before start.";
}

export async function runDryItem(runner, item) {
  const prompt = dryRunPrompt(item);
  const run = await freshRun(runner, {
    role: "dry-run",
    mode: "ask",
    force: false,
    sandbox: "enabled",
    prompt,
    timeoutMs: 8 * 60 * 1000,
  });
  return { item: item.id, promptChars: prompt.length, run, report: extractReport(run.result?.result) };
}

export async function runImplementationLoop({
  items,
  state,
  readControl,
  runner,
  loadGateFacts,
  merge,
  maxItems = 1,
  only = null,
  waitForChecks = null,
  publishReview = null,
}) {
  const results = [];
  let current = state;
  while (results.length < maxItems) {
    const control = readControl();
    if (control.mode !== "running") {
      return { state: current, results, stopped: control.mode };
    }
    const visible = only ? items.filter((candidate) => candidate.id === only || candidate.execution === "MERGED") : items;
    const item = selectNext(visible, current);
    if (item && only && item.id !== only) return { state: current, results, stopped: "restricted" };
    if (!item) return { state: current, results, stopped: "idle" };
    current = recordItem(current, item.id, { status: "running", phase: "implement" });
    const implemented = await freshRun(runner, {
      role: "implementer",
      mode: "agent",
      force: true,
      sandbox: "disabled",
      prompt: implementPrompt(item),
      timeoutMs: 70 * 60 * 1000,
    });
    current = recordItem(current, item.id, {
      status: implemented.exitCode === 0 ? "implemented" : "blocked",
      phase: "implement",
      attempt: attemptRecord("implementer", implemented),
      blocker: implemented.exitCode === 0 ? "" : String(implemented.failure?.summary || implemented.stderr || "").slice(0, 500),
    });
    if (implemented.exitCode !== 0) {
      results.push({ issue: item.id, status: "blocked", phase: "implement" });
      continue;
    }
    const implementReport = extractReport(implemented.result?.result);
    if (!implementReport?.pr) {
      current = recordItem(current, item.id, {
        status: "blocked",
        blocker: "Implementer did not report a pull request number",
      });
      results.push({ issue: item.id, status: "blocked", phase: "implement" });
      continue;
    }
    const pr = implementReport.pr;
    let reviewReport = null;
    let repairs = 0;
    while (reviewReport === null) {
      const reviewRun = await freshRun(runner, {
        role: "reviewer",
        mode: "ask",
        force: false,
        sandbox: "disabled",
        prompt: reviewPrompt(item, pr),
        timeoutMs: 20 * 60 * 1000,
      });
      current = recordItem(current, item.id, {
        phase: "review",
        pr,
        attempt: attemptRecord("reviewer", reviewRun),
      });
      if (reviewRun.exitCode !== 0) {
        current = recordItem(current, item.id, { status: "blocked", blocker: "Review execution failed" });
        results.push({ issue: item.id, status: "blocked", phase: "review" });
        break;
      }
      const report = extractReport(reviewRun.result?.result);
      const defects = report?.defects || [];
      if (report && defects.length === 0) {
        const checks = waitForChecks ? await waitForChecks({ pr }) : { passing: true, failed: [], pending: [] };
        if (checks.failed.length > 0 && repairs < config.maxRepairRounds) {
          repairs += 1;
          const repairRun = await freshRun(runner, {
            role: "repair",
            mode: "agent",
            force: true,
            sandbox: "disabled",
            timeoutMs: 50 * 60 * 1000,
            prompt: repairPrompt(item, pr, [
              { summary: `Required CI checks failed: ${checks.failed.join(", ")}` },
            ]),
          });
          current = recordItem(current, item.id, {
            phase: "repair",
            pr,
            attempt: attemptRecord("repair", repairRun),
          });
          if (repairRun.exitCode !== 0) {
            current = recordItem(current, item.id, { status: "blocked", blocker: "Repair execution failed" });
            results.push({ issue: item.id, status: "blocked", phase: "repair" });
            break;
          }
          continue;
        }
        reviewReport = report;
        break;
      }
      if (repairs >= config.maxRepairRounds) {
        current = recordItem(current, item.id, {
          status: "blocked",
          blocker: "Repair limit reached with defects still open",
        });
        results.push({ issue: item.id, status: "blocked", phase: "repair-limit" });
        break;
      }
      repairs += 1;
      const repairRun = await freshRun(runner, {
        role: "repair",
        mode: "agent",
        force: true,
        sandbox: "disabled",
        timeoutMs: 50 * 60 * 1000,
        prompt: repairPrompt(item, pr, defects.length > 0 ? defects : [{ summary: "Reviewer returned no structured report" }]),
      });
      current = recordItem(current, item.id, {
        phase: "repair",
        pr,
        attempt: attemptRecord("repair", repairRun),
      });
      if (repairRun.exitCode !== 0) {
        current = recordItem(current, item.id, { status: "blocked", blocker: "Repair execution failed" });
        results.push({ issue: item.id, status: "blocked", phase: "repair" });
        break;
      }
    }
    if (!reviewReport) continue;
    const attempts = current.items[item.id]?.attempts || [];
    const implementSession = attempts.find((attempt) => attempt.role === "implementer")?.sessionId;
    const reviewSession = [...attempts].reverse().find((attempt) => attempt.role === "reviewer")?.sessionId;
    if (!implementSession || !reviewSession || implementSession === reviewSession) {
      current = recordItem(current, item.id, {
        status: "blocked",
        blocker: "Reviewer process did not have its own session",
      });
      results.push({ issue: item.id, pr, status: "blocked", phase: "review-session" });
      continue;
    }
    if (publishReview) await publishReview({ pr, report: reviewReport, sessionId: reviewSession });
    const facts = await loadGateFacts({ item, pr, review: reviewReport });
    const gates = evaluateGates(facts);
    if (!gates.passed) {
      current = recordItem(current, item.id, {
        status: "blocked",
        blocker: gates.failures.map((failure) => `${failure.id}: ${failure.reason}`).join("; ").slice(0, 500),
      });
      results.push({ issue: item.id, pr, status: "blocked", phase: "gates", failures: gates.failures });
      continue;
    }
    await merge(mergeCommand(pr));
    current = recordItem(current, item.id, { status: "merged", pr, blocker: "" });
    results.push({ issue: item.id, pr, status: "merged", phase: "merge" });
  }
  return { state: current, results, stopped: "max-items" };
}

export function invocationArgs(workspace, invocation) {
  return buildAgentArgs({
    mode: invocation.mode,
    workspace,
    force: invocation.force,
    sandbox: invocation.sandbox,
    prompt: invocation.prompt,
  });
}
