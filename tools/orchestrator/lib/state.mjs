import fs from "node:fs";
import path from "node:path";
import { config } from "../config.mjs";

export function orchestratorPaths(root) {
  const dir = path.join(root, ".orchestrator");
  return {
    dir,
    control: path.join(dir, "control.json"),
    state: path.join(dir, "state.json"),
    proof: path.join(dir, "fresh-context-proof.json"),
    runs: path.join(dir, "runs"),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function emptyState() {
  return {
    version: 1,
    baseline: config.baseline,
    items: {},
    updatedAt: null,
  };
}

export function loadState(root) {
  return readJson(orchestratorPaths(root).state, emptyState());
}

export function saveState(root, state) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  writeJson(orchestratorPaths(root).state, next);
  return next;
}

export function loadControl(root) {
  return readJson(orchestratorPaths(root).control, {
    version: 1,
    mode: "stopped",
    pid: null,
    updatedAt: null,
  });
}

export function saveControl(root, mode, pid = null) {
  const control = {
    version: 1,
    mode,
    pid,
    updatedAt: new Date().toISOString(),
  };
  writeJson(orchestratorPaths(root).control, control);
  return control;
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function recordItem(state, id, patch) {
  const current = state.items[id] || { attempts: [] };
  const { attempt, ...rest } = patch;
  const attempts = attempt ? [...(current.attempts || []), attempt] : current.attempts || [];
  return {
    ...state,
    items: {
      ...state.items,
      [id]: {
        ...current,
        ...rest,
        attempts,
      },
    },
  };
}

export function loadProof(root) {
  const filePath = orchestratorPaths(root).proof;
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function saveProof(root, proof) {
  writeJson(orchestratorPaths(root).proof, proof);
  return proof;
}
