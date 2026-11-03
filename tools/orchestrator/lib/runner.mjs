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

export function extractReport(text) {
  const lines = String(text || "").split("\n");
  let report = null;
  for (const line of lines) {
    const trimmed = line.trim().replace(/^```(?:json)?/, "").replace(/```$/, "");
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value.role === "string") report = value;
    } catch {
      // Narrative lines are ignored. The contract is one JSON object.
    }
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
