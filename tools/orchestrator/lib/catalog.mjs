import fs from "node:fs";

const MVP = /^MVP-\d+$/;

function splitRow(line) {
  if (!line.startsWith("|")) return null;
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  if (cells.length !== 7) return null;
  if (!MVP.test(cells[0])) return null;
  const issue = cells[1].match(/^\[#(\d+)\]/);
  if (!issue) return null;
  return { cells, issue: Number(issue[1]) };
}

export function parseDependencies(cell) {
  const value = cell.trim();
  if (value === "None" || value === "") return [];
  return [...value.matchAll(/MVP-\d+/g)].map((match) => match[0]);
}

export function normalizeExecution(cell) {
  const value = cell.trim();
  if (value.startsWith("MERGED")) return "MERGED";
  if (value.startsWith("READY")) return "READY";
  if (value.startsWith("WAITING")) return "WAITING-DEPENDENCY";
  if (value.startsWith("BLOCKED")) return "BLOCKED";
  return value;
}

export function parseIssueIndex(markdown) {
  const items = [];
  for (const line of markdown.split("\n")) {
    const row = splitRow(line);
    if (!row) continue;
    const [id, , title, stage, classification, dependencies, execution] = row.cells;
    items.push({
      id,
      issue: row.issue,
      title,
      stage: Number(stage),
      classification: classification.trim(),
      dependencies: parseDependencies(dependencies),
      execution: normalizeExecution(execution),
    });
  }
  return items;
}

export function loadIssueIndex(filePath) {
  return parseIssueIndex(fs.readFileSync(filePath, "utf8"));
}

export function applyGitHubIssues(items, issues) {
  const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
  return items.map((item) => {
    const live = byNumber.get(item.issue);
    if (!live) return item;
    const labels = (live.labels || []).map((label) =>
      typeof label === "string" ? label : label.name,
    );
    let execution = item.execution;
    if (live.state === "CLOSED") execution = "MERGED";
    else if (labels.includes("blocked")) execution = "BLOCKED";
    else if (item.execution === "MERGED") execution = "READY";
    return { ...item, title: live.title || item.title, execution, labels };
  });
}

export function findStatusConflicts(indexItems, liveItems) {
  const conflicts = [];
  const liveById = new Map(liveItems.map((item) => [item.id, item]));
  for (const item of indexItems) {
    const live = liveById.get(item.id);
    if (!live || live.execution === item.execution) continue;
    if (item.execution === "MERGED" && live.execution !== "MERGED") {
      conflicts.push(
        `${item.id} is MERGED in the issue index, but GitHub issue #${item.issue} is not closed`,
      );
    }
    if (item.execution !== "MERGED" && live.execution === "MERGED") {
      conflicts.push(
        `${item.id} is ${item.execution} in the issue index, but GitHub issue #${item.issue} is closed`,
      );
    }
  }
  return conflicts;
}
