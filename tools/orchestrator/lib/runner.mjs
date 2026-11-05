import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { assertFreshInvocation } from "./argv.mjs";
import { orchestratorPaths } from "./state.mjs";

export function resolveAgentBin() {
  if (process.env.CURSOR_AGENT_BIN) return process.env.CURSOR_AGENT_BIN;
  const local = path.join(os.homedir(), ".local/bin/agent");
  if (fs.existsSync(local)) return local;
  return "agent";
}

export function parseAgentResult(stdout) {
  const lines = String(stdout).split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith("{")) continue;
    try {
      const value = JSON.parse(lines[index]);
      if (value && value.type === "result" && value.session_id) return value;
    } catch {
      // Keep scanning. The CLI writes one JSON object on success.
    }
  }
  throw new Error("Agent stdout did not contain a result session");
}

function parseObjectAt(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.role === "proof") {
    return value.result === "ACK" || value.result === "NO_PRIOR_CONTEXT" ? value : null;
  }
  if (value.role === "implementer" || value.role === "repair") {
    if (typeof value.issue !== "string" || value.issue.length === 0) return null;
    if (!positiveInteger(value.pr)) return null;
    if (typeof value.head !== "string" || value.head.length === 0) return null;
    if (typeof value.commit !== "string" || value.commit.length === 0) return null;
    if (!Array.isArray(value.blockers)) return null;
    if (typeof value.next_action !== "string" || value.next_action.length === 0) return null;
    return value;
  }
  if (value.role === "reviewer") {
    if (typeof value.issue !== "string" || value.issue.length === 0) return null;
    if (!positiveInteger(value.pr)) return null;
    if (typeof value.head !== "string" || value.head.length === 0) return null;
    if (!Array.isArray(value.defects)) return null;
    if (value.defects.some((defect) => !defect || typeof defect.summary !== "string" || defect.summary.length === 0)) {
      return null;
    }
    if (!Array.isArray(value.improvements)) return null;
    if (typeof value.human_decision !== "boolean") return null;
    if (typeof value.external_dependency !== "boolean") return null;
    if (typeof value.spec_ambiguity !== "boolean") return null;
    if (typeof value.next_action !== "string" || value.next_action.length === 0) return null;
    return value;
  }
  return null;
}

export function extractReport(text) {
  const source = String(text || "");
  let report = null;
  let from = 0;
  while (from < source.length) {
    const start = source.indexOf("{\"role\"", from);
    if (start === -1) break;
    const value = validateReport(parseObjectAt(source, start));
    if (value) report = value;
    from = start + 8;
  }
  return report;
}

function clip(value, max = 500) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function summarizeRun(result) {
  const report = extractReport(result.result);
  return {
    sessionId: result.session_id,
    durationMs: result.duration_ms || null,
    report,
    text: clip(result.result, 1200),
  };
}

export function runAgent({ bin, args, cwd, timeoutMs, logDir }) {
  assertFreshInvocation(args);
  fs.mkdirSync(logDir, { recursive: true });
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}`, timedOut, sessionId: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let sessionId = null;
      let parsed = null;
      if (!timedOut && code === 0) {
        try {
          parsed = parseAgentResult(stdout);
          sessionId = parsed.session_id;
        } catch (error) {
          stderr += `\n${error.message}`;
        }
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logName = `${stamp}${sessionId ? `-${sessionId}` : ""}.log`;
      fs.writeFileSync(
        path.join(logDir, logName),
        JSON.stringify({ exitCode: code, timedOut, sessionId, stdout, stderr }, null, 2),
      );
      resolve({
        exitCode: parsed ? 0 : code || 1,
        stdout,
        stderr,
        timedOut,
        sessionId,
        result: parsed,
      });
    });
  });
}

export function agentLogDir(root) {
  return orchestratorPaths(root).runs;
}
