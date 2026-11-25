const ACTIVE = new Set(["CREATING", "RUNNING", "WAITING_FOR_BACKGROUND_WORK"]);
const FAILED = new Set(["ERROR", "CANCELLED", "EXPIRED"]);

export function createCloudClient({ fetchImpl, apiKey, baseUrl = "https://api.cursor.com" }) {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("CURSOR_API_KEY is required");
  }
  async function request(method, requestPath, body) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${requestPath}`, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const wrapped = new Error("Cloud Agents API request failed");
      wrapped.cause = error;
      wrapped.retryable = true;
      throw wrapped;
    }
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        const error = new Error("Cloud Agents API returned malformed JSON");
        error.status = response.status;
        throw error;
      }
    }
    if (!response.ok) {
      const error = new Error(`Cloud Agents API ${response.status}`);
      error.status = response.status;
      error.body = parsed;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Cloud Agents API returned malformed JSON");
    }
    return parsed;
  }

  return {
    createAgent(body) {
      return request("POST", "/v1/agents", body);
    },
    getAgent(agentId) {
      return request("GET", `/v1/agents/${encodeURIComponent(agentId)}`);
    },
    getRun(agentId, runId) {
      return request("GET", `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`);
    },
    cancelRun(agentId, runId) {
      return request("POST", `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`);
    },
    getUsage(agentId) {
      return request("GET", `/v1/agents/${encodeURIComponent(agentId)}/usage`);
    },
  };
}

export async function createOrRecover(client, body) {
  try {
    const created = await client.createAgent(body);
    if (!created?.agent?.id || !created?.run?.id) {
      throw new Error("missing agent status");
    }
    return created;
  } catch (error) {
    if (error.status !== 409 || !body.agentId) throw error;
    const agent = await client.getAgent(body.agentId);
    if (!agent?.id || !agent?.latestRunId) throw new Error("missing agent status");
    return { agent, run: { id: agent.latestRunId, agentId: agent.id, status: agent.status || "CREATING" }, recovered: true };
  }
}

export function interpretCloudRun(run) {
  if (!run || typeof run !== "object" || typeof run.status !== "string") {
    return { disposition: "invalid", reason: "missing agent status" };
  }
  if (ACTIVE.has(run.status)) return { disposition: "pending", status: run.status };
  if (run.status === "FINISHED") {
    if (typeof run.result !== "string" || run.result.length === 0) {
      return { disposition: "invalid", reason: "malformed response" };
    }
    return { disposition: "finished", status: run.status, result: run.result, git: run.git || null };
  }
  if (FAILED.has(run.status)) return { disposition: "failed", reason: `run ${run.status}`, status: run.status };
  return { disposition: "invalid", reason: "missing agent status" };
}

function pullNumber(url) {
  const match = String(url || "").match(/\/pull\/(\d+)(?:\/|\s|$)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function canonicalRepository(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  let owner;
  let repo;
  const scp = text.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (scp) {
    owner = scp[1];
    repo = scp[2];
  } else {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    owner = parts[0];
    repo = parts[1];
  }
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return `https://github.com/${owner}/${repo}`;
}

export function pushedBranch(git, repoUrl) {
  const expected = canonicalRepository(repoUrl);
  if (!expected) return null;
  const branches = Array.isArray(git?.branches) ? git.branches : [];
  let branch = null;
  let pr = null;
  for (const row of branches) {
    if (!row || typeof row !== "object") continue;
    if (canonicalRepository(row.repoUrl) !== expected) continue;
    if (typeof row.branch !== "string" || row.branch.length === 0 || row.branch === "main") continue;
    if (!branch) branch = row.branch;
    if (row.branch !== branch) continue;
    const number = pullNumber(row.prUrl);
    if (number && canonicalRepository(row.prUrl) === expected && !pr) pr = number;
  }
  if (!branch) return null;
  return { branch, pr };
}

export function usageTokens(usage) {
  const total = usage?.totalUsage?.totalTokens;
  if (!Number.isFinite(total) || total < 0) return null;
  return total;
}
