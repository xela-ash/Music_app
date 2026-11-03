import { config } from "../config.mjs";

function mvpNumber(id) {
  return Number(id.slice(4));
}

export function isMerged(item, state) {
  if (!item) return false;
  return item.execution === "MERGED" || state.items?.[item.id]?.status === "merged";
}

export function dependencyReady(item, byId, state) {
  return item.dependencies.every((id) => isMerged(byId.get(id), state));
}

export function localBlock(item, state) {
  const record = state.items?.[item.id];
  if (!record) return null;
  if (record.status === "blocked" || record.status === "paused") return record;
  return null;
}

export function selectNext(items, state, preferred = config.preferred) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const candidates = items.filter((item) => {
    if (item.classification !== "AUTONOMOUS-READY") return false;
    if (item.execution === "BLOCKED" || item.execution === "MERGED") return false;
    if (isMerged(item, state)) return false;
    if (localBlock(item, state)) return false;
    return dependencyReady(item, byId, state);
  });
  candidates.sort((left, right) => {
    const leftPreferred = preferred.indexOf(left.id);
    const rightPreferred = preferred.indexOf(right.id);
    if (leftPreferred !== -1 || rightPreferred !== -1) {
      if (leftPreferred === -1) return 1;
      if (rightPreferred === -1) return -1;
      return leftPreferred - rightPreferred;
    }
    return mvpNumber(left.id) - mvpNumber(right.id);
  });
  return candidates[0] || null;
}

export function skippedReadyItems(items, state) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const skipped = [];
  for (const item of items) {
    if (item.classification === "AUTONOMOUS-READY") continue;
    if (isMerged(item, state)) continue;
    const visible = item.execution === "BLOCKED" || dependencyReady(item, byId, state);
    if (!visible) continue;
    skipped.push({
      id: item.id,
      issue: item.issue,
      classification: item.classification,
      reason:
        item.execution === "BLOCKED"
          ? "Blocked in the issue index. A human decision or external dependency still prevents it."
          : `${item.classification} is outside autonomous merge authority.`,
    });
  }
  return skipped;
}
