export const config = {
  repo: "xela-ash/Music_app",
  baseline: "42f7570aed008a369fd63795b86df4d2544b456f",
  preferred: ["MVP-011", "MVP-012"],
  maxTransientRetries: 2,
  maxRepairRounds: 2,
  maxActiveAgents: 1,
  maxCloudDispatchesPerDay: 4,
  maxTrackedTokens: 2_000_000,
  cloudRepoUrl: "https://github.com/xela-ash/Music_app",
  requiredChecks: ["lint", "frontend-test", "backend-test", "migration-dry-run"],
  indexPath: "docs/19-implementation-planning/github-issue-index.md",
};
