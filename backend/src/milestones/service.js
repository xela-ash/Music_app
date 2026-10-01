const pool = require("../../db/db");
const repository = require("./repository");
const { assertSnapshotReady, validateDeliverableDefinition } = require("./catalogue");
const projectsRepository = require("../projects/repository");
const { PROJECT_LOCK_MILESTONES, authorize } = require("../authorization/authorize");

// projects.price_amount and project_milestones.amount are PostgreSQL INTEGER
// columns — values above this would overflow the column at INSERT time
// (22003) instead of failing validation cleanly.
const POSTGRES_INT_MAX = 2147483647;

// Matches the canonical 8-4-4-4-12 hex form PostgreSQL's uuid type expects,
// rejecting malformed values before they can reach a query (avoids 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pure validation for the milestones array in a POST /projects body. Runs
// before any DB access so malformed input never reaches a query. Returns
// either { ok: true, milestones: <normalized array> } or { ok: false, error }.
function validateMilestonesInput(milestones) {
  if (milestones === undefined) {
    return { ok: false, error: "milestones is required" };
  }
  if (!Array.isArray(milestones)) {
    return { ok: false, error: "milestones must be an array" };
  }
  if (milestones.length === 0) {
    return { ok: false, error: "milestones must contain at least one item" };
  }

  const normalized = [];

  for (let i = 0; i < milestones.length; i++) {
    const item = milestones[i];

    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, error: "Each milestone must be an object" };
    }

    if (Object.prototype.hasOwnProperty.call(item, "currency") || Object.prototype.hasOwnProperty.call(item, "currency_exponent")) {
      return { ok: false, error: "Milestone currency is taken from the project" };
    }

    const { title, description, amount, due_at, revision_allowance, deliverable_definition } = item;

    if (typeof title !== "string" || !title.trim()) {
      return { ok: false, error: "Each milestone title is required and must be a non-empty string" };
    }

    let normalizedDescription = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return { ok: false, error: "Milestone description must be a string" };
      }
      normalizedDescription = description.trim() ? description.trim() : null;
    }

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > POSTGRES_INT_MAX
    ) {
      return {
        ok: false,
        error: `milestones[${i}].amount must be an integer between 1 and ${POSTGRES_INT_MAX}`,
      };
    }

    if (
      !Object.prototype.hasOwnProperty.call(item, "revision_allowance")
      || typeof revision_allowance !== "number"
      || !Number.isInteger(revision_allowance)
      || revision_allowance < 0
      || revision_allowance > POSTGRES_INT_MAX
    ) {
      return {
        ok: false,
        error: "Each milestone revision_allowance is required and must be a nonnegative integer",
      };
    }

    const deliverables = validateDeliverableDefinition(deliverable_definition);
    if (!deliverables.ok) {
      return { ok: false, error: deliverables.error };
    }

    let normalizedDueAt = null;
    if (due_at !== undefined && due_at !== null) {
      if (typeof due_at !== "string" || !due_at.trim()) {
        return { ok: false, error: "Milestone due_at must be a non-empty string if provided" };
      }
      const parsedDate = new Date(due_at);
      if (Number.isNaN(parsedDate.getTime())) {
        return { ok: false, error: "Milestone due_at must be a valid date" };
      }
      normalizedDueAt = due_at.trim();
    }

    normalized.push({
      title: title.trim(),
      description: normalizedDescription,
      amount,
      due_at: normalizedDueAt,
      revision_allowance,
      deliverable_definition: deliverables.value,
    });
  }

  return { ok: true, milestones: normalized };
}

// Locks a project's milestone plan: after this, the protect_locked_milestones
// trigger (migration 008) rejects any add/remove/commercial-field edit to
// this project's milestones. Does not touch escrow, funding, or work state —
// those are separate, later steps.
async function lockMilestones(projectId, actorUserId) {
  const client = await pool.connect();
  try {
    if (!UUID_PATTERN.test(projectId)) {
      return { status: 400, body: { error: "projectId must be a valid UUID" } };
    }

    await client.query("BEGIN");

    const projectResult = await projectsRepository.lockProjectForUpdate(client, projectId);
    const project = projectResult.rows[0];

    // Relationship, then already-locked, then draft. Same 404 for a missing
    // project and a project the actor does not buy. Decided by authorize()
    // while the row is locked (BR-AUTHZ-029).
    const lockDecision = authorize(
      { id: actorUserId },
      PROJECT_LOCK_MILESTONES,
      project ?? null
    );
    if (!lockDecision.allowed) {
      await client.query("ROLLBACK");
      return { status: lockDecision.status, body: { error: lockDecision.error } };
    }

    const milestonesResult = await repository.listMilestonesForProject(client, projectId);
    const milestones = milestonesResult.rows;

    if (milestones.length === 0) {
      await client.query("ROLLBACK");
      return { status: 400, body: { error: "Project must have at least one milestone before locking" } };
    }

    if (!assertSnapshotReady(milestones, project).ok) {
      await client.query("ROLLBACK");
      return {
        status: 400,
        body: { error: "Each milestone must include a revision allowance and a catalogue selection" },
      };
    }

    let milestoneTotal = 0;
    for (const milestone of milestones) {
      if (milestone.state !== "planned") {
        await client.query("ROLLBACK");
        return { status: 400, body: { error: "Only planned milestones can be locked" } };
      }
      if (milestone.currency !== project.currency) {
        await client.query("ROLLBACK");
        return { status: 400, body: { error: "All milestones must use the project currency" } };
      }
      milestoneTotal += milestone.amount;
    }

    if (milestoneTotal !== project.price_amount) {
      await client.query("ROLLBACK");
      return { status: 400, body: { error: "Milestone amounts must equal the project price" } };
    }

    const updateResult = await projectsRepository.lockProjectMilestones(client, projectId);

    await client.query("COMMIT");

    return { status: 200, body: { project: updateResult.rows[0], milestones } };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

module.exports = {
  POSTGRES_INT_MAX,
  validateMilestonesInput,
  lockMilestones,
};
