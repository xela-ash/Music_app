import { spawnSync } from "node:child_process";
import { config } from "../config.mjs";
import { secretOrEditorPath } from "./gates.mjs";

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(`gh failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "gh failed").trim());
  }
  return result.stdout;
}

export function fetchOpenIssueSnapshot() {
  const stdout = runGh([
    "issue",
    "list",
    "--repo",
    config.repo,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "number,title,state,labels",
  ]);
  return JSON.parse(stdout);
}

const PENDING = /^(PENDING|QUEUED|IN_PROGRESS|WAITING|EXPECTED|REQUESTED|)$/i;

export function summarizeChecks(pr) {
  const pending = [];
  const failed = [];
  for (const name of config.requiredChecks) {
    const rollup = (pr.statusCheckRollup || []).find((item) => (item.name || item.context) === name);
    const conclusion = String(rollup?.conclusion || rollup?.state || "");
    if (!rollup || PENDING.test(conclusion)) {
      pending.push(name);
      continue;
    }
    if (conclusion !== "SUCCESS" && conclusion !== "success") failed.push(name);
  }
  return { pending, failed, passing: pending.length === 0 && failed.length === 0 };
}

export function gateFactsFromPullRequest({ item, review, pr, threadsUnresolved, dependenciesMerged }) {
  const checks = {};
  for (const rollup of pr.statusCheckRollup || []) {
    const name = rollup.name || rollup.context;
    if (!name) continue;
    const conclusion = rollup.conclusion || rollup.state;
    checks[name] = conclusion === "SUCCESS" || conclusion === "success" ? "passing" : "failing";
  }
  const changedPaths = (pr.files || []).map((file) => file.path);
  const codeChanged = changedPaths.some(
    (filePath) => filePath.startsWith("backend/") || filePath.startsWith("frontend/"),
  );
  const body = pr.body || "";
  const mismatchedCheck = (pr.statusCheckRollup || []).some((rollup) => {
    const sha = rollup.headSha || rollup.sha;
    return sha && sha !== pr.headRefOid;
  });
  const decisionRecorded = /EDR-\d+|No significant engineering decision/i.test(body);
  const recordsPresent = !codeChanged || changedPaths.includes("docs/20-engineering/engineering-build-record.md");
  const governancePath = (filePath) =>
    filePath.startsWith("tools/orchestrator/") || filePath === ".github/workflows/orchestrator.yml";
  const allowedPath = (filePath) => !secretOrEditorPath(filePath) && !governancePath(filePath);
  return {
    classification: item.classification,
    dependenciesMerged,
    acceptanceMapped:
      body.includes(item.id) && /acceptance/i.test(body) && /\b[\w./-]+\.test\.[A-Za-z0-9]+\b/.test(body),
    checks,
    unresolvedDefects: (review?.defects || []).length,
    revalidatedHead: Boolean(review?.head) && review.head === pr.headRefOid && !mismatchedCheck,
    basedOnCurrentMain:
      pr.baseRefName === "main" && pr.mergeStateStatus !== "BEHIND" && pr.mergeStateStatus !== "DIRTY",
    mergeable: pr.mergeable,
    unresolvedThreads: threadsUnresolved,
    humanDecision: review?.human_decision,
    externalDependency: review?.external_dependency,
    specAmbiguity: review?.spec_ambiguity,
    engineeringRecords: recordsPresent && decisionRecorded,
    changedPaths,
    scopeOk: changedPaths.every(allowedPath),
    protectionAllowsMerge: pr.mergeable === "MERGEABLE" && pr.mergeStateStatus === "CLEAN",
  };
}

export function waitForRequiredChecks(prNumber, { attempts = 80, intervalMs = 30000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), load } = {}) {
  const read = load || (() => JSON.parse(runGh([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    config.repo,
    "--json",
    "statusCheckRollup",
  ])));
  return (async () => {
    let last = { pending: [...config.requiredChecks], failed: [], passing: false };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = summarizeChecks(read());
      if (last.pending.length === 0) return last;
      if (attempt < attempts - 1) await sleep(intervalMs);
    }
    return last;
  })();
}

export function loadGateFacts({ item, pr, review, dependenciesMerged }) {
  const view = JSON.parse(
    runGh([
      "pr",
      "view",
      String(pr),
      "--repo",
      config.repo,
      "--json",
      "mergeable,mergeStateStatus,baseRefName,headRefOid,statusCheckRollup,files,body",
    ]),
  );
  const threads = JSON.parse(
    runGh([
      "api",
      "graphql",
      "-f",
      "owner=xela-ash",
      "-f",
      "name=Music_app",
      "-F",
      `number=${pr}`,
      "-f",
      "query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}}}}}",
    ]),
  );
  const nodes = threads.data.repository.pullRequest.reviewThreads.nodes || [];
  const threadsUnresolved = nodes.filter((node) => node.isResolved === false).length;
  return gateFactsFromPullRequest({
    item,
    review,
    pr: view,
    threadsUnresolved,
    dependenciesMerged,
  });
}
