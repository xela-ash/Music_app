import { createHash } from "node:crypto";
import { config } from "../config.mjs";
import { createOrRecover, interpretCloudRun, pushedBranch, usageTokens } from "./cloud-api.mjs";
import { extractCompletedWithoutPullRequest, extractReport } from "./runner.mjs";
import { recordItem } from "./state.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_MS = 20 * 60 * 1000;

export function agentIdFor(issue, role, attempt) {
  const hex = createHash("sha256").update(`musicapp:${issue}:${role}:${attempt}`).digest("hex");
  return `bc-${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function recentDispatches(state, now) {
  return (state.dispatches || []).filter((row) => now - Date.parse(row.at) < DAY_MS);
}

function halt(state, mode, cancel) {
  return { state, effect: { type: "halt", mode, cancel } };
}

export function reduceCloudTick({
  state,
  control,
  observation = null,
  usageTokens = null,
  item = null,
  gates = null,
  allowMerge = false,
  now = Date.now(),
  controllerRunId,
  action = "tick",
}) {
  const current = {
    version: 2,
    ...state,
    items: { ...(state.items || {}) },
    dispatches: [...(state.dispatches || [])],
  };
  if (!controllerRunId) {
    return { state: current, effect: { type: "blocked", reason: "missing controller run id" } };
  }
  if (action === "stop" || control?.mode === "stopped" || control?.mode === "paused") {
    return halt(
      { ...current, dispatch: null },
      action === "stop" ? "stopped" : control.mode,
      Boolean(current.dispatch?.runId),
    );
  }
  if (current.lock && current.lock.runId !== controllerRunId && Date.parse(current.lock.until) > now) {
    return { state: current, effect: { type: "blocked", reason: "another controller run holds the lock" } };
  }
  const locked = {
    ...current,
    lock: { runId: controllerRunId, until: new Date(now + LOCK_MS).toISOString() },
  };
  if ((locked.usageTokens || 0) >= config.maxTrackedTokens) {
    return { state: locked, effect: { type: "blocked", reason: "tracked token ceiling reached" } };
  }
  if (locked.dispatch && !locked.dispatch.runId) {
    return { state: locked, effect: { type: "create", dispatch: locked.dispatch } };
  }
  if (locked.dispatch) return observeDispatch(locked, observation, usageTokens);
  const pendingRecovery = item && locked.items?.[item.id]?.phase === "recover-pr" && locked.items[item.id].status !== "blocked";
  if (action !== "prove" && pendingRecovery) return createForItem(locked, item, now, gates, allowMerge);
  if (recentDispatches(locked, now).length >= config.maxCloudDispatchesPerDay) {
    return { state: locked, effect: { type: "blocked", reason: "daily cloud dispatch limit reached" } };
  }
  if (action === "prove") return createEffect(locked, { issue: "proof", role: "proof", attempt: locked.dispatches.length + 1 }, now);
  if (!item) return { state: locked, effect: { type: "idle", reason: "cloud product trial is not enabled" } };
  return createForItem(locked, item, now, gates, allowMerge);
}

function observeDispatch(state, observation, usageTokens) {
  if (!observation) return { state, effect: { type: "poll", dispatch: state.dispatch } };
  if (observation.disposition === "pending") return { state, effect: { type: "wait", dispatch: state.dispatch } };
  if (observation.disposition !== "finished") {
    const reason = observation.reason || "cloud run failed";
    return {
      state: recordItem({ ...state, dispatch: null }, state.dispatch.issue, { status: "blocked", blocker: reason }),
      effect: { type: "blocked", reason },
    };
  }
  if (usageTokens == null) {
    return { state, effect: { type: "blocked", reason: "missing usage" } };
  }
  const report = extractReport(observation.result);
  const pending = report ? null : extractCompletedWithoutPullRequest(observation.result);
  const accepted = report || (pending && pending.issue === state.dispatch.issue ? pending : null);
  if (!accepted || !acceptsRole(state.dispatch.role, accepted.role)) {
    return {
      state: recordItem(
        { ...state, usageTokens: (state.usageTokens || 0) + usageTokens, dispatch: null },
        state.dispatch.issue,
        { status: "blocked", blocker: "malformed response" },
      ),
      effect: { type: "blocked", reason: "malformed response" },
    };
  }
  const finished = {
    ...state,
    usageTokens: (state.usageTokens || 0) + usageTokens,
    dispatch: null,
  };
  if (pending) return recoverMissingPullRequest(state, finished, pending, observation.git);
  if (state.dispatch.role === "proof") {
    return { state: { ...finished, proof: { result: report.result, agentId: state.dispatch.agentId } }, effect: { type: "idle", reason: "proof recorded" } };
  }
  if (state.dispatch.role === "implementer" || state.dispatch.role === "repair") {
    if (!Number.isInteger(report.pr)) {
      return { state: recordItem(finished, state.dispatch.issue, { status: "blocked", blocker: "malformed response" }), effect: { type: "blocked", reason: "malformed response" } };
    }
    return {
      state: recordItem(finished, state.dispatch.issue, {
        status: "implemented",
        phase: "review",
        pr: report.pr,
        head: report.head,
        attempt: { role: state.dispatch.role, sessionId: state.dispatch.agentId, exitCode: 0, at: new Date().toISOString() },
      }),
      effect: { type: "advanced", phase: "review" },
    };
  }
  if (report.human_decision !== false || report.external_dependency !== false || report.spec_ambiguity !== false) {
    return {
      state: recordItem(finished, state.dispatch.issue, { status: "blocked", phase: "escalation", blocker: "review flag is not explicitly clear" }),
      effect: { type: "blocked", reason: "review flag is not explicitly clear" },
    };
  }
  if (report.defects.length > 0) {
    return {
      state: recordItem(finished, state.dispatch.issue, {
        status: "implemented",
        phase: "repair",
        pr: report.pr,
        head: report.head,
        review: report,
        attempt: { role: "reviewer", sessionId: state.dispatch.agentId, exitCode: 0, at: new Date().toISOString() },
      }),
      effect: { type: "advanced", phase: "repair" },
    };
  }
  return {
    state: recordItem(finished, state.dispatch.issue, {
      status: "implemented",
      phase: "gates",
      pr: report.pr,
      head: report.head,
      review: report,
      attempt: { role: "reviewer", sessionId: state.dispatch.agentId, exitCode: 0, at: new Date().toISOString() },
    }),
    effect: { type: "advanced", phase: "gates" },
  };
}

function acceptsRole(dispatchRole, reportRole) {
  if (dispatchRole === "proof") return reportRole === "proof";
  if (dispatchRole === "reviewer") return reportRole === "reviewer";
  return reportRole === "implementer" || reportRole === "repair";
}

function createForItem(state, item, now, gates, allowMerge) {
  const record = state.items?.[item.id];
  const phase = record?.phase || "implement";
  if (phase === "recover-pr") {
    if (record?.status === "blocked" || !recoveryBranch(record?.branch)) {
      return { state, effect: { type: "blocked", reason: record?.blocker || "completed without pull request" } };
    }
    return {
      state,
      effect: {
        type: "open-pr",
        issue: item.id,
        branch: record.branch,
        head: record.head || null,
        commit: record.commit || null,
        candidate: record.candidate || null,
        allowCreate: record.allowCreate === true,
        acceptance: record.acceptance || [],
      },
    };
  }
  if (phase === "gates") {
    if (!gates) return { state, effect: { type: "blocked", reason: "missing CI evidence" } };
    if (!gates.passed) return { state: recordItem(state, item.id, { status: "blocked", blocker: "merge gates failed" }), effect: { type: "blocked", reason: "merge gates failed" } };
    if (!allowMerge) return { state, effect: { type: "blocked", reason: "unattended merge is disabled" } };
    const implementSession = (record.attempts || []).find((attempt) => attempt.role === "implementer")?.sessionId;
    const reviewSession = [...(record.attempts || [])].reverse().find((attempt) => attempt.role === "reviewer")?.sessionId;
    if (!implementSession || !reviewSession || implementSession === reviewSession) {
      return { state: recordItem(state, item.id, { status: "blocked", blocker: "reviewer session is not independent" }), effect: { type: "blocked", reason: "reviewer session is not independent" } };
    }
    return { state, effect: { type: "merge", pr: record.pr } };
  }
  if (phase === "repair") {
    const repairs = (record.attempts || []).filter((attempt) => attempt.role === "repair").length;
    if (repairs >= config.maxRepairRounds) {
      return { state: recordItem(state, item.id, { status: "blocked", blocker: "repair limit reached" }), effect: { type: "blocked", reason: "repair limit reached" } };
    }
    return createEffect(state, { issue: item.id, role: "repair", attempt: repairs + 1 }, now);
  }
  if (phase === "review") {
    const reviews = (record?.attempts || []).filter((attempt) => attempt.role === "reviewer").length;
    return createEffect(state, { issue: item.id, role: "reviewer", attempt: reviews + 1 }, now);
  }
  return createEffect(state, { issue: item.id, role: "implementer", attempt: 1 }, now);
}

export async function executeCloudTick({ client, promptFor, openPullRequest, ...input }) {
  const planned = reduceCloudTick(input);
  if (planned.effect.type === "poll") {
    let run;
    let usage;
    try {
      run = await client.getRun(planned.effect.dispatch.agentId, planned.effect.dispatch.runId);
      usage = usageTokens(await client.getUsage(planned.effect.dispatch.agentId));
    } catch {
      return { state: planned.state, effect: { type: "blocked", reason: "API error" } };
    }
    return reduceCloudTick({
      ...input,
      state: planned.state,
      observation: interpretCloudRun(run),
      usageTokens: usage,
    });
  }
  if (planned.effect.type === "open-pr") return openRecoveredPullRequest(planned, openPullRequest);
  if (planned.effect.type === "create") {
    const prompt = promptFor(planned.effect.dispatch);
    if (!prompt || prompt.startsWith("-")) {
      return { state: planned.state, effect: { type: "blocked", reason: "malformed response" } };
    }
    const body = {
      agentId: planned.effect.dispatch.agentId,
      name: `musicapp ${planned.effect.dispatch.issue} ${planned.effect.dispatch.role}`.slice(0, 100),
      mode: planned.effect.dispatch.role === "implementer" || planned.effect.dispatch.role === "repair" ? "agent" : "plan",
      autoCreatePR: planned.effect.dispatch.role === "implementer",
      workOnCurrentBranch: false,
      prompt: { text: prompt },
      repos: [{ url: config.cloudRepoUrl, ...(planned.effect.dispatch.prUrl ? { prUrl: planned.effect.dispatch.prUrl } : { startingRef: "main" }) }],
    };
    try {
      const created = await createOrRecover(client, body);
      const dispatch = { ...planned.effect.dispatch, runId: created.run.id, status: created.run.status || "CREATING" };
      return { state: { ...planned.state, dispatch }, effect: { type: "dispatched", dispatch, recovered: Boolean(created.recovered) } };
    } catch {
      return { state: planned.state, effect: { type: "blocked", reason: "API error" } };
    }
  }
  if (planned.effect.type === "halt" && planned.effect.cancel && input.state.dispatch?.runId) {
    try {
      await client.cancelRun(input.state.dispatch.agentId, input.state.dispatch.runId);
    } catch {
      return { state: planned.state, effect: { type: "blocked", reason: "API error" } };
    }
  }
  return planned;
}

const SHA = /^[0-9a-f]{40}$/i;

function recoveryBranch(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return null;
  if (value === "main" || value === "cursor/branch" || value.startsWith("-") || value.includes("..")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) return null;
  return value;
}

function shaOrNull(value) {
  return typeof value === "string" && SHA.test(value) ? value : null;
}

function recoverMissingPullRequest(previous, finished, pending, git) {
  const issue = previous.dispatch.issue;
  const role = previous.dispatch.role;
  const pushed = pushedBranch(git, config.cloudRepoUrl);
  const recorded = finished.items?.[issue]?.pr;
  const attempt = {
    role,
    sessionId: previous.dispatch.agentId,
    exitCode: 0,
    at: new Date().toISOString(),
  };
  const head = shaOrNull(pending.head);
  const commit = shaOrNull(pending.commit);
  if (pending.blockers.length > 0) {
    return {
      state: recordItem(finished, issue, {
        status: "blocked",
        phase: "recover-pr",
        blocker: "completed without pull request",
        head,
        commit,
        attempt,
      }),
      effect: { type: "blocked", reason: "completed without pull request" },
    };
  }
  if (!head || !commit || head.toLowerCase() !== commit.toLowerCase()) {
    return blockedRecovery(finished, issue, "commit sha does not match", attempt, head, commit);
  }
  const reportedBranch = recoveryBranch(pending.branch);
  const branch = recoveryBranch(pushed?.branch);
  if (!branch || (reportedBranch && reportedBranch !== branch)) {
    const reason = role === "repair"
      ? "repair pull request was not found"
      : (pushed || reportedBranch ? "pull request identity does not match" : "completed without pull request");
    return blockedRecovery(finished, issue, reason, attempt, head, commit);
  }
  const candidate = role === "repair" && Number.isInteger(recorded) && recorded > 0 ? recorded : null;
  const acceptance = acceptanceEntries(pending.acceptance);
  return {
    state: recordItem(finished, issue, {
      status: "implemented",
      phase: "recover-pr",
      branch,
      head,
      commit,
      candidate,
      allowCreate: role === "implementer",
      acceptance,
      attempt,
    }),
    effect: {
      type: "open-pr",
      issue,
      branch,
      head,
      commit,
      candidate,
      allowCreate: role === "implementer",
      acceptance,
    },
  };
}

function acceptanceEntries(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const entry of value) {
    if (!entry || typeof entry.criterion !== "string" || typeof entry.test !== "string") return [];
    const criterion = entry.criterion.trim();
    const test = entry.test.trim();
    if (!criterion || !/^[\w./-]+\.test\.[A-Za-z0-9]+$/.test(test)) return [];
    entries.push({ criterion, test });
  }
  return entries;
}

function blockedRecovery(finished, issue, reason, attempt, head, commit) {
  return {
    state: recordItem(finished, issue, {
      status: "blocked",
      phase: "recover-pr",
      blocker: reason,
      head,
      commit,
      attempt,
    }),
    effect: { type: "blocked", reason },
  };
}

async function openRecoveredPullRequest(planned, openPullRequest) {
  if (typeof openPullRequest !== "function") {
    return { state: planned.state, effect: { type: "blocked", reason: "pull request recovery failed" } };
  }
  let pr;
  try {
    pr = await openPullRequest(planned.effect);
  } catch (error) {
    const clear = new Set([
      "repair pull request was not found",
      "acceptance mapping is missing",
      "commit sha does not match",
      "pull request identity does not match",
    ]);
    return { state: planned.state, effect: { type: "blocked", reason: clear.has(error?.message) ? error.message : "pull request recovery failed" } };
  }
  if (!Number.isInteger(pr) || pr <= 0) {
    return { state: planned.state, effect: { type: "blocked", reason: "pull request recovery failed" } };
  }
  return {
    state: recordItem(planned.state, planned.effect.issue, {
      status: "implemented",
      phase: "review",
      pr,
      head: planned.effect.head || planned.state.items?.[planned.effect.issue]?.head,
    }),
    effect: { type: "advanced", phase: "review", pr },
  };
}

function createEffect(state, target, now) {
  if (state.dispatch) return { state, effect: { type: "blocked", reason: "an agent is already active" } };
  const agentId = agentIdFor(target.issue, target.role, target.attempt);
  const pr = state.items?.[target.issue]?.pr;
  const prUrl = pr && target.role !== "implementer" && target.role !== "proof"
    ? `https://github.com/xela-ash/Music_app/pull/${pr}`
    : null;
  const dispatch = {
    ...target,
    prUrl,
    agentId,
    runId: null,
    status: "creating",
    at: new Date(now).toISOString(),
  };
  return {
    state: { ...state, dispatch, dispatches: [...state.dispatches, { issue: target.issue, role: target.role, at: dispatch.at }] },
    effect: { type: "create", dispatch },
  };
}
