import { config } from "../config.mjs";
import { containsIssueId } from "./github.mjs";
import { selectNext, skippedReadyItems } from "./queue.mjs";
import { recordItem } from "./state.mjs";

const CLASSIFICATION_LABEL = {
  "AUTONOMOUS-READY": "autonomous-ready",
  "HUMAN-DECISION-REQUIRED": "human-decision-required",
  "EXTERNAL-DEPENDENCY": "external-dependency",
};

const RESUME_PHASES = new Set(["review", "repair", "gates", "recover-pr"]);

function labelNames(issue) {
  return (issue.labels || []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function copyState(state) {
  return {
    ...(state || {}),
    items: { ...(state?.items || {}) },
    dispatches: [...(state?.dispatches || [])],
  };
}

function unavailable(state, reason) {
  return {
    ok: false,
    conflicts: [reason],
    items: [],
    state: copyState(state),
    corrections: [],
    selection: null,
    intendedAction: "stop",
    reasons: [reason],
    blockers: [],
    activeDispatch: state?.dispatch || null,
  };
}

function stopped(state, conflicts, items = []) {
  return {
    ok: false,
    conflicts,
    items,
    state: copyState(state),
    corrections: [],
    selection: null,
    intendedAction: "stop",
    reasons: conflicts,
    blockers: [],
    activeDispatch: state?.dispatch || null,
  };
}

function pullProblem(pull) {
  if (!pull || !Number.isInteger(pull.number) || pull.number <= 0) return "pull request snapshot row has no number";
  if (typeof pull.title !== "string" || typeof pull.state !== "string" || typeof pull.baseRefName !== "string") {
    return `pull request #${pull.number} is missing title, state, or base`;
  }
  if (typeof pull.isDraft !== "boolean") return `pull request #${pull.number} has no draft flag`;
  if (pull.state === "MERGED") {
    if (typeof pull.mergedAt !== "string" || pull.mergedAt.length === 0) {
      return `pull request #${pull.number} is merged without a merge timestamp`;
    }
  } else if (pull.mergedAt) {
    return `pull request #${pull.number} has a merge timestamp but is ${pull.state}`;
  }
  return null;
}

function matchingIds(title, items) {
  return items.filter((item) => containsIssueId(title, item.id)).map((item) => item.id);
}

function pushGroup(map, id, pull) {
  const list = map.get(id) || [];
  list.push(pull);
  map.set(id, list);
}

export function assessQueue({ items, issues, pulls, state, issueLimit = config.issueSnapshotLimit, pullLimit = config.pullSnapshotLimit }) {
  if (!Array.isArray(items) || !Array.isArray(issues) || !Array.isArray(pulls)) {
    return unavailable(state, "authoritative GitHub data is unavailable");
  }
  const conflicts = [];
  if (issues.length >= issueLimit) conflicts.push("issue snapshot is incomplete");
  if (pulls.length >= pullLimit) conflicts.push("pull request snapshot is incomplete");
  const seenIssues = new Set();
  const byNumber = new Map();
  for (const issue of issues) {
    if (!issue || !Number.isInteger(issue.number)) {
      conflicts.push("issue snapshot row has no number");
      continue;
    }
    if (seenIssues.has(issue.number)) conflicts.push(`GitHub issue #${issue.number} appears more than once`);
    seenIssues.add(issue.number);
    if (issue.state !== "OPEN" && issue.state !== "CLOSED") {
      conflicts.push(`GitHub issue #${issue.number} has state ${issue.state || "missing"}`);
    }
    byNumber.set(issue.number, issue);
  }
  const mergedById = new Map();
  const openById = new Map();
  const seenPulls = new Set();
  for (const pull of pulls) {
    const problem = pullProblem(pull);
    if (problem) {
      conflicts.push(problem);
      continue;
    }
    if (seenPulls.has(pull.number)) conflicts.push(`pull request #${pull.number} appears more than once`);
    seenPulls.add(pull.number);
    const ids = matchingIds(pull.title, items);
    if (ids.length > 1) {
      const unsettled = ids.filter((id) => {
        const item = items.find((candidate) => candidate.id === id);
        const live = byNumber.get(item?.issue);
        return pull.state === "OPEN" || item?.execution !== "MERGED" || live?.state !== "CLOSED";
      });
      if (unsettled.length > 0) {
        conflicts.push(`pull request #${pull.number} title matches more than one MVP id`);
      }
      continue;
    }
    if (ids.length !== 1) continue;
    if (pull.baseRefName !== "main") {
      conflicts.push(`${ids[0]} pull request #${pull.number} is not based on main`);
      continue;
    }
    if (pull.state === "MERGED") pushGroup(mergedById, ids[0], pull);
    else if (pull.state === "OPEN") pushGroup(openById, ids[0], pull);
  }
  for (const [id, list] of openById) {
    if (list.length > 1) conflicts.push(`${id} has more than one open implementation pull request`);
    if (mergedById.has(id)) conflicts.push(`${id} has a merged pull request and an open implementation pull request`);
  }
  const reconciled = [];
  for (const item of items) {
    const live = byNumber.get(item.issue);
    if (!live) {
      conflicts.push(`${item.id} GitHub issue #${item.issue} is missing from the issue snapshot`);
      reconciled.push(item);
      continue;
    }
    const labels = labelNames(live);
    const expected = CLASSIFICATION_LABEL[item.classification];
    if (!expected || !labels.includes(expected)) {
      conflicts.push(`${item.id} classification ${item.classification} is not confirmed by GitHub labels`);
    }
    const foreign = Object.entries(CLASSIFICATION_LABEL).filter(([, label]) => label !== expected && labels.includes(label));
    if (foreign.length > 0) conflicts.push(`${item.id} GitHub labels contradict ${item.classification}`);
    const verified = mergedById.get(item.id) || [];
    const issueClosed = live.state === "CLOSED";
    if (item.execution === "MERGED" && !issueClosed && verified.length === 0) {
      conflicts.push(`${item.id} is MERGED in the issue index, but GitHub issue #${item.issue} is open and no merged pull request verifies it`);
    }
    if (item.execution !== "MERGED" && issueClosed && verified.length === 0) {
      conflicts.push(`${item.id} is ${item.execution} in the issue index, but GitHub issue #${item.issue} is closed and no merged pull request verifies it`);
    }
    let execution = item.execution;
    if (verified.length > 0) execution = "MERGED";
    else if (labels.includes("blocked") && !issueClosed) execution = "BLOCKED";
    else if (item.execution === "MERGED" && issueClosed) execution = "MERGED";
    const evidence = verified.length > 0
      ? [...verified].sort((left, right) => right.number - left.number)[0]
      : null;
    reconciled.push({
      ...item,
      title: live.title || item.title,
      indexExecution: item.execution,
      execution,
      labels,
      evidence: evidence ? { pr: evidence.number, mergedAt: evidence.mergedAt } : null,
    });
  }
  if (conflicts.length > 0) return stopped(state, conflicts, reconciled);

  const corrections = [];
  let nextState = copyState(state);
  const holds = [];
  const resumed = [];
  for (const item of reconciled) {
    const record = nextState.items?.[item.id];
    const open = (openById.get(item.id) || [])[0] || null;
    const merged = item.evidence;
    if (record?.status === "merged" && item.execution !== "MERGED") {
      return stopped(state, [`${item.id} controller state says merged without a merged pull request`], reconciled);
    }
    if (item.execution === "MERGED") {
      const pr = merged?.pr || record?.pr;
      const matches = Boolean(record)
        && record.status === "merged"
        && record.phase === "merged"
        && (!merged || record.pr === merged.pr);
      const indexWasStale = Boolean(merged) && item.indexExecution !== "MERGED";
      const recordIsStale = Boolean(record) && !matches;
      if (!matches && (indexWasStale || recordIsStale)) {
        corrections.push({
          id: item.id,
          from: record ? `${record.status || "unset"}/${record.phase || "unset"}` : item.indexExecution,
          to: "merged",
          pr: pr || null,
          reason: merged
            ? `pull request #${merged.pr} is merged into main`
            : "issue index and GitHub issue are both merged",
        });
        nextState = recordItem(nextState, item.id, {
          status: "merged",
          phase: "merged",
          ...(pr ? { pr } : {}),
          blocker: "",
        });
      }
      continue;
    }
    if (!open && record && ["review", "repair", "gates"].includes(record.phase) && !record.pr) {
      holds.push({ item, reason: `${item.id} is in ${record.phase} without a pull request` });
      continue;
    }
    if (record?.pr && !open) {
      const recorded = pulls.find((pull) => pull.number === record.pr);
      if (!recorded) {
        return stopped(state, [`${item.id} records pull request #${record.pr}, which is absent from the GitHub snapshot`], reconciled);
      }
      if (recorded.state === "CLOSED") {
        holds.push({ item, reason: `pull request #${record.pr} is closed and not merged` });
        continue;
      }
      return stopped(state, [`${item.id} records pull request #${record.pr}, which is not an open or merged implementation`], reconciled);
    }
    if (!open) continue;
    if (record?.pr && record.pr !== open.number) {
      return stopped(state, [`${item.id} records pull request #${record.pr} but GitHub open pull request is #${open.number}`], reconciled);
    }
    if (item.classification !== "AUTONOMOUS-READY" || open.isDraft || record?.status === "blocked" || record?.status === "paused") {
      const reason = item.classification !== "AUTONOMOUS-READY"
        ? `${item.id} has open pull request #${open.number} and is ${item.classification}`
        : open.isDraft
          ? `pull request #${open.number} is a draft and is not resumed`
          : (record.blocker || `${item.id} is ${record.status}`);
      holds.push({ item, reason, pr: open.number });
      continue;
    }
    const phase = RESUME_PHASES.has(record?.phase) ? record.phase : "review";
    if (!record || record.phase !== phase || record.pr !== open.number || record.status !== "implemented") {
      corrections.push({
        id: item.id,
        from: record ? `${record.status || "unset"}/${record.phase || "unset"}` : "absent",
        to: phase,
        pr: open.number,
        reason: `open pull request #${open.number} is resumed at ${phase}`,
      });
      nextState = recordItem(nextState, item.id, {
        status: "implemented",
        phase,
        pr: open.number,
        blocker: "",
      });
    }
    resumed.push({ item, action: phase, pr: open.number });
  }
  if (holds.length > 1 || resumed.length > 1 || (holds.length > 0 && resumed.length > 0)) {
    const reasons = [
      ...holds.map((hold) => hold.reason),
      ...resumed.map((resume) => `${resume.item.id} has open pull request #${resume.pr}`),
    ];
    return stopped(state, reasons.length > 0 ? reasons : ["more than one implementation pull request is active"], reconciled);
  }

  const activeDispatch = nextState.dispatch || null;
  const blockers = skippedReadyItems(reconciled, nextState);
  if (resumed.length === 1) {
    const resume = resumed[0];
    const reasons = [
      `${resume.item.id} has open pull request #${resume.pr}`,
      `resume ${resume.action} instead of starting another implementation`,
    ];
    if (activeDispatch) reasons.unshift(`active ${activeDispatch.role} agent for ${activeDispatch.issue} is still recorded`);
    return finish({
      items: reconciled,
      state: nextState,
      corrections,
      selection: { item: resume.item, action: resume.action, reasons },
      intendedAction: activeDispatch ? "poll" : resume.action,
      reasons,
      blockers,
      activeDispatch,
    });
  }
  if (holds.length === 1) {
    const hold = holds[0];
    const held = {
      ...nextState,
      items: { ...nextState.items },
    };
    held.items[hold.item.id] = {
      ...(held.items[hold.item.id] || { attempts: [] }),
      phase: "escalate",
      pr: hold.pr || held.items[hold.item.id]?.pr,
      blocker: hold.reason,
    };
    if (held.items[hold.item.id].phase !== nextState.items?.[hold.item.id]?.phase
      || held.items[hold.item.id].blocker !== nextState.items?.[hold.item.id]?.blocker) {
      corrections.push({
        id: hold.item.id,
        from: nextState.items?.[hold.item.id]?.phase || "absent",
        to: "escalate",
        pr: hold.pr || nextState.items?.[hold.item.id]?.pr || null,
        reason: hold.reason,
      });
    }
    return finish({
      items: reconciled,
      state: held,
      corrections,
      selection: { item: hold.item, action: "escalate", reasons: [hold.reason] },
      intendedAction: activeDispatch ? "poll" : "escalate",
      reasons: activeDispatch
        ? [`active ${activeDispatch.role} agent for ${activeDispatch.issue} is still recorded`, hold.reason]
        : [hold.reason],
      blockers,
      activeDispatch,
    });
  }

  const chosen = selectNext(reconciled, nextState);
  if (!chosen) {
    return finish({
      items: reconciled,
      state: nextState,
      corrections,
      selection: null,
      intendedAction: activeDispatch ? "poll" : "idle",
      reasons: activeDispatch
        ? [`active ${activeDispatch.role} agent for ${activeDispatch.issue} is still recorded`, "no dependency-ready AUTONOMOUS-READY issue"]
        : ["no dependency-ready AUTONOMOUS-READY issue"],
      blockers,
      activeDispatch,
    });
  }
  const record = nextState.items?.[chosen.id];
  const action = RESUME_PHASES.has(record?.phase) ? record.phase : "implement";
  const dependencyText = chosen.dependencies.length > 0
    ? `dependencies merged: ${chosen.dependencies.join(", ")}`
    : "no dependencies";
  const reasons = [
    `${chosen.id} is ${chosen.classification}`,
    dependencyText,
    action === "implement"
      ? "no merged pull request and no open implementation pull request"
      : `controller phase ${action} is resumed`,
    "earlier dependency-ready AUTONOMOUS-READY items are merged, blocked, or not eligible",
  ];
  if (activeDispatch) reasons.unshift(`active ${activeDispatch.role} agent for ${activeDispatch.issue} is still recorded`);
  return finish({
    items: reconciled,
    state: nextState,
    corrections,
    selection: { item: chosen, action, reasons },
    intendedAction: activeDispatch ? "poll" : action,
    reasons,
    blockers,
    activeDispatch,
  });
}

function finish(result) {
  return { ok: true, conflicts: [], ...result };
}

export function queueDryRunReport({ queue, controlMode, mergeEnabled = false }) {
  const selected = queue.selection?.item || null;
  return {
    command: "queue-dry-run",
    mode: "read-only",
    control: controlMode,
    armed: controlMode === "running",
    mergeEnabled: mergeEnabled === true,
    agentsCreated: 0,
    pullRequestsCreated: 0,
    github: queue.github || (queue.ok ? "checked" : "unavailable"),
    next: selected
      ? {
        id: selected.id,
        issue: selected.issue,
        title: selected.title,
        classification: selected.classification,
      }
      : null,
    intendedAction: queue.intendedAction,
    reasons: queue.reasons,
    corrections: queue.corrections,
    blockers: queue.blockers,
    conflicts: queue.conflicts,
    activeDispatch: queue.activeDispatch
      ? { issue: queue.activeDispatch.issue, role: queue.activeDispatch.role }
      : null,
  };
}
