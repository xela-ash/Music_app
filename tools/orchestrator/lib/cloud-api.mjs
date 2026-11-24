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

export function pushedBranch(git, repoUrl) {
  const branches = Array.isArray(git?.branches) ? git.branches : [];
  const ownerRepo = String(repoUrl || "").replace(/\.git$/, "").split("/").slice(-2).join("/");
  const rows = branches.filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (!row.repoUrl || !ownerRepo) return true;
    return String(row.repoUrl).replace(/\.git$/, "").endsWith(ownerRepo);
  });
  let adopted = null;
  let branch = null;
  for (const row of rows) {
    const pr = pullNumber(row.prUrl);
    if (pr && !adopted) adopted = pr;
    if (!branch && typeof row.branch === "string" && row.branch.length > 0 && row.branch !== "main") {
      branch = row.branch;
    }
  }
  if (adopted) return { branch, pr: adopted };
  if (!branch) return null;
  return { branch, pr: null };
}

export function usageTokens(usage) {
  const total = usage?.totalUsage?.totalTokens;
  if (!Number.isFinite(total) || total < 0) return null;
  return total;
}
