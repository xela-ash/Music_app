import { spawnSync } from "node:child_process";
import { config } from "../config.mjs";
import { canonicalRepository } from "./cloud-api.mjs";
import { acceptanceMapped, secretOrEditorPath } from "./gates.mjs";

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
    acceptanceMapped: acceptanceMapped(body, item.id),
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

export function productAcceptanceCriteria(issueBody) {
  const source = String(issueBody || "");
  const start = source.search(/^# Acceptance Criteria\s*$/m);
  if (start < 0) return [];
  const section = source.slice(start).replace(/^# Acceptance Criteria\s*/, "").split(/\n# /)[0];
  const criteria = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^- \[[ xX]\]\s+(.+?)\s*$/);
    if (!match) continue;
    if (/mapped to at least one named test/i.test(match[1])) continue;
    criteria.push(match[1]);
  }
  return criteria;
}

export function verifiedAcceptanceEntries(criteria, entries, changedPaths) {
  if (!Array.isArray(criteria) || criteria.length === 0) return null;
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const allowed = new Set(criteria);
  const changed = new Set(changedPaths || []);
  const covered = new Set();
  const clean = [];
  for (const entry of entries) {
    if (!entry || typeof entry.criterion !== "string" || typeof entry.test !== "string") return null;
    if (!allowed.has(entry.criterion)) return null;
    if (!changed.has(entry.test) || !/^[\w./-]+\.test\.[A-Za-z0-9]+$/.test(entry.test)) return null;
    covered.add(entry.criterion);
    if (!clean.some((item) => item.criterion === entry.criterion && item.test === entry.test)) {
      clean.push({ criterion: entry.criterion, test: entry.test });
    }
  }
  if (criteria.some((criterion) => !covered.has(criterion))) return null;
  return clean;
}

export function recoveredPullRequestBody({ issue, branch, commit, entries }) {
  if (typeof issue !== "string" || !/^MVP-\d+$/.test(issue)) return null;
  if (!/^[0-9a-f]{40}$/i.test(commit || "") || !Array.isArray(entries) || entries.length === 0) return null;
  const lines = [
    issue,
    "",
    `Recovered from \`${branch}\` at \`${commit}\`.`,
    "",
    "## Acceptance",
  ];
  for (const entry of entries) {
    lines.push(`- ${entry.criterion}`);
    lines.push(`  Test: ${entry.test}`);
  }
  const body = lines.join("\n");
  if (!acceptanceMapped(body, issue)) return null;
  return body;
}

export function acceptanceCriteriaMapped(body, issue, criteria) {
  if (!acceptanceMapped(body, issue)) return false;
  if (!Array.isArray(criteria) || criteria.length === 0) return false;
  return criteria.every((criterion) => {
    const index = String(body).indexOf(criterion);
    if (index < 0) return false;
    const after = String(body).slice(index, index + criterion.length + 240);
    return /\b[\w./-]+\.test\.[A-Za-z0-9]+\b/.test(after);
  });
}

export function verifyRecoveredPullRequest(pr, expected) {
  const repo = canonicalRepository(expected?.repoUrl);
  if (!repo || !pr || typeof pr !== "object") return false;
  const prUrl = pr.url || "";
  if (canonicalRepository(prUrl) !== repo) return false;
  if (pr.headRefName !== expected.branch) return false;
  if (!/^[0-9a-f]{40}$/i.test(expected.commit || "")) return false;
  if (String(pr.headRefOid || "").toLowerCase() !== String(expected.commit).toLowerCase()) return false;
  if (typeof expected.issue !== "string" || !expected.issue || !`${pr.title || ""}\n${pr.body || ""}`.includes(expected.issue)) {
    return false;
  }
  return Number.isInteger(pr.number) && pr.number > 0;
}

export function selectRecoveredPullRequest(candidates, expected, { allowCreate, entries, changedPaths } = {}) {
  const identity = (candidates || []).filter((pr) => verifyRecoveredPullRequest(pr, expected));
  if (expected?.candidate && identity.some((pr) => pr.number !== expected.candidate)) {
    return { error: "pull request identity does not match" };
  }
  const matched = expected?.candidate ? identity.filter((pr) => pr.number === expected.candidate) : identity;
  if (matched.length > 1) return { error: "pull request identity does not match" };
  if (matched.length === 1) {
    if (acceptanceCriteriaMapped(matched[0].body || "", expected.issue, expected.criteria)) {
      return { number: matched[0].number };
    }
    const verified = verifiedAcceptanceEntries(expected.criteria, entries, changedPaths);
    const body = verified && recoveredPullRequestBody({
      issue: expected.issue,
      branch: expected.branch,
      commit: expected.commit,
      entries: verified,
    });
    if (!body) return { error: "acceptance mapping is missing" };
    return { update: matched[0].number, body };
  }
  if (allowCreate !== true) return { error: "repair pull request was not found" };
  const verified = verifiedAcceptanceEntries(expected.criteria, entries, changedPaths);
  const body = verified && recoveredPullRequestBody({
    issue: expected.issue,
    branch: expected.branch,
    commit: expected.commit,
    entries: verified,
  });
  if (!body) return { error: "acceptance mapping is missing" };
  return { create: true, body };
}

function pullRequestUrl(number) {
  return `https://github.com/${config.repo}/pull/${number}`;
}

export function ensurePullRequest(effect, dependencies = {}) {
  const exec = dependencies.runGh || runGh;
  if (!effect || (effect.allowCreate !== true && effect.allowCreate !== false)) {
    throw new Error("pull request recovery failed");
  }
  if (!/^[0-9a-f]{40}$/i.test(effect.commit || "")) throw new Error("commit sha does not match");
  if (typeof effect.branch !== "string" || effect.branch === "main" || effect.branch.startsWith("-") || effect.branch.includes("..")) {
    throw new Error("pull request identity does not match");
  }
  if (!Number.isInteger(effect.issueNumber) || effect.issueNumber <= 0) {
    throw new Error("acceptance mapping is missing");
  }
  const issue = JSON.parse(exec([
    "issue",
    "view",
    String(effect.issueNumber),
    "--repo",
    config.repo,
    "--json",
    "body",
  ]));
  const criteria = productAcceptanceCriteria(issue.body);
  const listed = JSON.parse(exec([
    "pr",
    "list",
    "--repo",
    config.repo,
    "--head",
    effect.branch,
    "--state",
    "open",
    "--json",
    "number,title,body,headRefOid,headRefName,url",
  ])).map((pr) => ({ ...pr, url: pr.url || pullRequestUrl(pr.number) }));
  let changedPaths = [];
  if (Array.isArray(effect.acceptance) && effect.acceptance.length > 0) {
    const compare = JSON.parse(exec([
      "api",
      `repos/${config.repo}/compare/main...${effect.commit}`,
    ]));
    changedPaths = (compare.files || []).map((file) => file.filename).filter(Boolean);
  }
  const selected = selectRecoveredPullRequest(listed, {
    repoUrl: config.cloudRepoUrl,
    branch: effect.branch,
    commit: effect.commit,
    issue: effect.issue,
    criteria,
    candidate: effect.candidate || null,
  }, {
    allowCreate: effect.allowCreate === true,
    entries: effect.acceptance || [],
    changedPaths,
  });
  if (selected.error) throw new Error(selected.error);
  if (selected.number) return selected.number;
  if (selected.update) {
    exec(["pr", "edit", String(selected.update), "--repo", config.repo, "--body", selected.body]);
    return selected.update;
  }
  if (selected.create !== true || effect.allowCreate !== true) {
    throw new Error("repair pull request was not found");
  }
  const url = exec([
    "pr",
    "create",
    "--repo",
    config.repo,
    "--base",
    "main",
    "--head",
    effect.branch,
    "--title",
    `${effect.issue} recovered implementation`,
    "--body",
    selected.body,
  ]).trim();
  const match = url.match(/\/pull\/(\d+)\s*$/);
  if (!match) throw new Error("pull request recovery failed");
  const number = Number(match[1]);
  const viewed = JSON.parse(exec([
    "pr",
    "view",
    String(number),
    "--repo",
    config.repo,
    "--json",
    "number,title,body,headRefOid,headRefName,url",
  ]));
  viewed.url = viewed.url || pullRequestUrl(number);
  if (!verifyRecoveredPullRequest(viewed, {
    repoUrl: config.cloudRepoUrl,
    branch: effect.branch,
    commit: effect.commit,
    issue: effect.issue,
  })) {
    throw new Error("pull request identity does not match");
  }
  if (!acceptanceCriteriaMapped(viewed.body, effect.issue, criteria)) {
    throw new Error("acceptance mapping is missing");
  }
  return number;
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
