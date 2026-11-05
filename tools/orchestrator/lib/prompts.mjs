const READING = {
  "MVP-011": [
    "AGENTS.md sections 2, 4, 5, and 5.1",
    "docs/19-implementation-planning/mvp-implementation-plan.md, the MVP-011 row only",
    "docs/03-identity-profiles-verification/assets-and-media.md sections 18 through 18.4, plus sections those sections cite for the same behavior",
    "docs/20-engineering/engineering-handbook.md section 13",
    "docs/20-engineering/engineering-build-record.md section 4.9 and the EDRs that section names",
    "GitHub issue 13 in xela-ash/Music_app, including its acceptance criteria",
  ],
  "MVP-012": [
    "AGENTS.md sections 2, 4, 5, and 5.1",
    "docs/19-implementation-planning/mvp-implementation-plan.md, the MVP-012 row only",
    "docs/03-identity-profiles-verification/verification.md, the sections issue 14 cites, plus sections those sections cite for the same behavior",
    "docs/20-engineering/engineering-handbook.md sections 7 and 11",
    "docs/20-engineering/engineering-build-record.md section 4.8 and the EDRs that section names",
    "GitHub issue 14 in xela-ash/Music_app, including its acceptance criteria",
  ],
};

function readingList(item) {
  const listed = READING[item.id] || [
    "AGENTS.md sections 2, 4, 5, and 5.1",
    `docs/19-implementation-planning/mvp-implementation-plan.md, the ${item.id} row only`,
    `GitHub issue ${item.issue} in xela-ash/Music_app`,
    "The handbook and build-record sections that apply to the repository areas named by that row",
  ];
  return listed.map((line) => `- ${line}`).join("\n");
}

function itemHeader(item) {
  return [
    `Issue: ${item.id} (#${item.issue}) ${item.title}`,
    `Classification: ${item.classification}`,
    `Dependencies: ${item.dependencies.join(", ") || "None"}`,
  ].join("\n");
}

const COMMON_LIMITS = [
  "Use a fresh context. There is no earlier conversation to recall.",
  "Do not ask for, resume, or summarize any previous agent transcript.",
  "Read only the documents listed below. If another document is required, stop and name it.",
  "Do not edit canonical specifications, AGENTS.md, or .vscode/.",
  "Do not force-push, bypass branch protection, or print credentials.",
  "Keep the final answer a single JSON object on one line.",
].join("\n");

export function proofPromptA(nonce) {
  return [
    "MusicApp orchestrator freshness check.",
    "Do not use tools. Do not read files.",
    `The check code is ${nonce}.`,
    'Reply with exactly this JSON and nothing else: {"role":"proof","result":"ACK"}',
  ].join("\n");
}

export function proofPromptB() {
  return [
    "MusicApp orchestrator freshness check.",
    "Do not use tools. Do not read files.",
    "If no check code was given in this message, you do not know one.",
    'Reply with exactly this JSON and nothing else: {"role":"proof","result":"NO_PRIOR_CONTEXT"}',
  ].join("\n");
}

export function dryRunPrompt(item) {
  return [
    "MusicApp stateless orchestrator, read-only dry run.",
    COMMON_LIMITS,
    "Do not edit files, commit, push, open a pull request, comment on GitHub, or merge.",
    itemHeader(item),
    "Read:",
    readingList(item),
    'Final JSON shape: {"role":"dry-run","issue":"MVP-NNN","dependencies_met":true,"files":["path"],"acceptance_checks":["test"],"blockers":[],"next_action":"short"}',
  ].join("\n");
}

export function implementPrompt(item) {
  return [
    "MusicApp stateless orchestrator, implementation run.",
    COMMON_LIMITS,
    "Follow AGENTS.md. Implement only this issue. Do not merge.",
    "Create one branch from origin/main. Commit, push, and open one pull request against main. Do not merge.",
    "The pull request body must contain the MVP id, an Acceptance section, and a test file path for every acceptance criterion.",
    "The body must also name an EDR id, or include the sentence \"No significant engineering decision\".",
    "Update docs/20-engineering/engineering-build-record.md when implementation reality changes.",
    "Do not change .vscode/ or tools/orchestrator/.",
    itemHeader(item),
    "Read:",
    readingList(item),
    'Final JSON shape: {"role":"implementer","issue":"MVP-NNN","pr":0,"head":"sha","commit":"sha","blockers":[],"next_action":"short"}',
  ].join("\n");
}

export function reviewPrompt(item, pr) {
  return [
    "MusicApp stateless orchestrator, independent review.",
    COMMON_LIMITS,
    "You did not implement this pull request. Review the current diff only.",
    "Do not edit files, push, or merge. A DEFECT blocks. An IMPROVEMENT does not.",
    "Set head to the current pull request head SHA.",
    "Set human_decision, external_dependency, or spec_ambiguity true only when AGENTS.md section 4 requires a stop.",
    itemHeader(item),
    `Pull request: #${pr}`,
    "Read the pull request body, diff, and the same documents listed for the implementer:",
    readingList(item),
    'Final JSON shape: {"role":"reviewer","issue":"MVP-NNN","pr":0,"head":"sha","defects":[],"improvements":[],"human_decision":false,"external_dependency":false,"spec_ambiguity":false,"next_action":"short"}',
  ].join("\n");
}

export function repairPrompt(item, pr, defects) {
  const lines = defects
    .slice(0, 8)
    .map((defect, index) => `${index + 1}. ${String(defect.summary || defect).slice(0, 400)}`);
  return [
    "MusicApp stateless orchestrator, repair run.",
    COMMON_LIMITS,
    "You are a new agent. The defect list below is the only prior outcome you receive.",
    "Do not merge. Push fixes to the existing pull request branch.",
    itemHeader(item),
    `Pull request: #${pr}`,
    "Defects:",
    lines.join("\n"),
    "Read:",
    readingList(item),
    'Final JSON shape: {"role":"implementer","issue":"MVP-NNN","pr":0,"head":"sha","commit":"sha","blockers":[],"next_action":"short"}',
  ].join("\n");
}

export function cloudProofPrompt() {
  return [
    "MusicApp cloud controller freshness check.",
    "Do not edit files, commit, push, open a pull request, or merge.",
    "Do not read secrets or print credentials.",
    'Reply with exactly this JSON and nothing else: {"role":"proof","result":"ACK"}',
  ].join("\n");
}
