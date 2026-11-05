import { createHash } from "node:crypto";
import { config } from "../config.mjs";
import { createOrRecover, interpretCloudRun, usageTokens } from "./cloud-api.mjs";
import { extractReport } from "./runner.mjs";
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
  if (!report || !acceptsRole(state.dispatch.role, report.role)) {
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

export async function executeCloudTick({ client, promptFor, ...input }) {
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
  if (planned.effect.type === "create") {
    const prompt = promptFor(planned.effect.dispatch);
    if (!prompt || prompt.startsWith("-")) {
      return { state: planned.state, effect: { type: "blocked", reason: "malformed response" } };
    }
    const body = {
      agentId: planned.effect.dispatch.agentId,
      name: `musicapp ${planned.effect.dispatch.issue} ${planned.effect.dispatch.role}`.slice(0, 100),
      mode: planned.effect.dispatch.role === "implementer" || planned.effect.dispatch.role === "repair" ? "agent" : "plan",
      autoCreatePR: false,
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
