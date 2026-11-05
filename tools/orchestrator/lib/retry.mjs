import { config } from "../config.mjs";

const TRANSIENT = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|temporar|rate limit|429|502|503|504/i;

export function classifyAgentFailure({ exitCode, stderr = "", timedOut = false }) {
  if (exitCode === 0 && !timedOut) return { kind: "ok", retry: false };
  const text = String(stderr).slice(0, 2000);
  const transient = timedOut || TRANSIENT.test(text);
  return {
    kind: transient ? "transient" : "persistent",
    retry: transient,
    summary: timedOut ? "Agent execution timed out" : text.split("\n").find(Boolean) || `exit ${exitCode}`,
  };
}

export async function withRetries(operation, { max = config.maxTransientRetries, sleep = async () => {} } = {}) {
  let attempt = 0;
  let last = null;
  while (attempt <= max) {
    const outcome = await operation(attempt);
    last = outcome;
    const failure = classifyAgentFailure(outcome);
    if (!failure.retry) return { ...outcome, attempts: attempt + 1, failure };
    attempt += 1;
    if (attempt > max) return { ...outcome, attempts: attempt, failure: { ...failure, retry: false, kind: "persistent" } };
    await sleep(attempt * 5000);
  }
  return last;
}
