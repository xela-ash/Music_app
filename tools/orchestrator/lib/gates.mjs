import { config } from "../config.mjs";

export const MERGE_GATES = [
  { id: 1, name: "AUTONOMOUS-READY" },
  { id: 2, name: "Dependencies merged" },
  { id: 3, name: "Acceptance criteria mapped to tests" },
  { id: 4, name: "Required validation checks pass" },
  { id: 5, name: "Independent review has no unresolved DEFECT" },
  { id: 6, name: "Blocking findings repaired and revalidated" },
  { id: 7, name: "Pull request is based on current main" },
  { id: 8, name: "No merge conflicts" },
  { id: 9, name: "No unresolved blocking review threads" },
  { id: 10, name: "No human-decision condition" },
  { id: 11, name: "No unresolved external dependency" },
  { id: 12, name: "No unresolved specification ambiguity" },
  { id: 13, name: "Required engineering records are included" },
  { id: 14, name: "Authorized scope only" },
  { id: 15, name: "Branch protection permits the merge" },
];

export function mergeCommand(prNumber) {
  const args = ["pr", "merge", String(prNumber), "--repo", config.repo, "--squash"];
  if (args.includes("--admin") || args.includes("--force")) {
    throw new Error("Refusing a merge command that bypasses repository rules");
  }
  return args;
}

export function secretOrEditorPath(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const base = normalized.split("/").pop() || "";
  if (normalized === ".vscode" || normalized.startsWith(".vscode/")) return true;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".p12")) return true;
  if (/credentials|service-account|secret/i.test(base)) return true;
  return false;
}

function fail(id, reason) {
  return { id, name: MERGE_GATES[id - 1].name, reason };
}

export function evaluateGates(facts) {
  const failures = [];
  if (facts.classification !== "AUTONOMOUS-READY") {
    failures.push(fail(1, `${facts.classification} requires Product Owner merge authority`));
  }
  if (!facts.dependenciesMerged) {
    failures.push(fail(2, "At least one dependency is not merged"));
  }
  if (!facts.acceptanceMapped) {
    failures.push(fail(3, "Pull request does not map acceptance criteria to tests"));
  }
  const missing = config.requiredChecks.filter((name) => facts.checks?.[name] !== "passing");
  if (missing.length > 0) {
    failures.push(fail(4, `Checks not passing: ${missing.join(", ")}`));
  }
  if (facts.unresolvedDefects !== 0) {
    failures.push(fail(5, "Independent review still has a DEFECT"));
  }
  if (!facts.revalidatedHead) {
    failures.push(fail(6, "Review or checks do not match the current head commit"));
  }
  if (!facts.basedOnCurrentMain) {
    failures.push(fail(7, "Pull request is not based on current main"));
  }
  if (facts.mergeable !== "MERGEABLE") {
    failures.push(fail(8, `GitHub mergeable state is ${facts.mergeable}`));
  }
  if (facts.unresolvedThreads !== 0) {
    failures.push(fail(9, "A blocking review thread is unresolved"));
  }
  if (facts.humanDecision !== false) {
    failures.push(fail(10, "Review did not explicitly clear the human-decision flag"));
  }
  if (facts.externalDependency !== false) {
    failures.push(fail(11, "Review did not explicitly clear the external-dependency flag"));
  }
  if (facts.specAmbiguity !== false) {
    failures.push(fail(12, "Review did not explicitly clear the specification-ambiguity flag"));
  }
  if (!facts.engineeringRecords) {
    failures.push(fail(13, "Build Record or required EDR update is missing"));
  }
  const forbidden = (facts.changedPaths || []).filter((filePath) => secretOrEditorPath(filePath));
  if (forbidden.length > 0 || facts.scopeOk === false) {
    failures.push(fail(14, "Diff contains forbidden or out-of-scope paths"));
  }
  if (!facts.protectionAllowsMerge) {
    failures.push(fail(15, "Branch protection does not permit this merge"));
  }
  return { passed: failures.length === 0, failures };
}
