const pool = require("../../db/db");
const repository = require("./repository");
const milestonesRepository = require("../milestones/repository");
const { POSTGRES_INT_MAX, validateMilestonesInput } = require("../milestones/service");

// MusicApp launches India-first: every newly created project and milestone is
// stamped with this currency server-side. Clients cannot supply or override
// it. Existing historical rows created before this constant existed may still
// hold other currencies (e.g. USD) and are left as-is.
const PROJECT_CURRENCY = "INR";

// Matches the canonical 8-4-4-4-12 hex form PostgreSQL's uuid type expects,
// rejecting malformed values before they can reach a query (avoids 22P02).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function createProject(body, actorUserId) {
  const client = await pool.connect();
  try {
    const {
      seller_user_id,
      title,
      requirements,
      price_amount,
      delivery_days,
      revision_limit,
      milestones,
    } = body ?? {};

    if (typeof seller_user_id !== "string" || !seller_user_id.trim()) {
      return { status: 400, body: { error: "seller_user_id is required and must be a non-empty string" } };
    }
    if (!UUID_PATTERN.test(seller_user_id.trim())) {
      return { status: 400, body: { error: "seller_user_id must be a valid UUID" } };
    }
    if (typeof title !== "string" || !title.trim()) {
      return { status: 400, body: { error: "title is required and must be a non-empty string" } };
    }
    if (typeof requirements !== "string" || !requirements.trim()) {
      return { status: 400, body: { error: "requirements is required and must be a non-empty string" } };
    }
    if (
      typeof price_amount !== "number" ||
      !Number.isInteger(price_amount) ||
      price_amount <= 0 ||
      price_amount > POSTGRES_INT_MAX
    ) {
      return {
        status: 400,
        body: { error: `price_amount must be an integer between 1 and ${POSTGRES_INT_MAX}` },
      };
    }
    if (typeof delivery_days !== "number" || !Number.isInteger(delivery_days) || delivery_days <= 0) {
      return { status: 400, body: { error: "delivery_days must be an integer greater than 0" } };
    }

    let revisionLimitValue = 0;
    if (revision_limit !== undefined) {
      if (typeof revision_limit !== "number" || !Number.isInteger(revision_limit) || revision_limit < 0) {
        return {
          status: 400,
          body: { error: "revision_limit must be an integer greater than or equal to 0" },
        };
      }
      revisionLimitValue = revision_limit;
    }

    const milestoneValidation = validateMilestonesInput(milestones);
    if (!milestoneValidation.ok) {
      return { status: 400, body: { error: milestoneValidation.error } };
    }
    const normalizedMilestones = milestoneValidation.milestones;

    let milestoneTotal = 0;
    for (const milestone of normalizedMilestones) {
      milestoneTotal += milestone.amount;
      if (milestoneTotal > Number.MAX_SAFE_INTEGER || milestoneTotal > POSTGRES_INT_MAX) {
        return { status: 400, body: { error: "Total milestone amount exceeds the supported project limit" } };
      }
    }
    if (milestoneTotal !== price_amount) {
      return { status: 400, body: { error: "Milestone amounts must equal the project price" } };
    }

    if (seller_user_id === actorUserId) {
      return { status: 400, body: { error: "You cannot start a project with yourself" } };
    }

    const sellerResult = await repository.findActiveSellerWithProfile(client, seller_user_id);

    if (sellerResult.rows.length === 0) {
      return { status: 404, body: { error: "Seller not found" } };
    }

    const externalId = repository.makeProjectExternalId();

    await client.query("BEGIN");

    const projectResult = await repository.insertProject(client, [
      externalId,
      actorUserId,
      seller_user_id,
      title.trim(),
      requirements.trim(),
      price_amount,
      PROJECT_CURRENCY,
      delivery_days,
      revisionLimitValue,
    ]);

    const project = projectResult.rows[0];
    const insertedMilestones = [];

    for (let i = 0; i < normalizedMilestones.length; i++) {
      const milestone = normalizedMilestones[i];
      const milestoneExternalId = milestonesRepository.makeMilestoneExternalId();

      const milestoneResult = await milestonesRepository.insertMilestone(client, [
        milestoneExternalId,
        project.id,
        i + 1,
        milestone.title,
        milestone.description,
        milestone.amount,
        PROJECT_CURRENCY,
        milestone.due_at,
      ]);

      insertedMilestones.push(milestoneResult.rows[0]);
    }

    await client.query("COMMIT");

    return { status: 201, body: { project, milestones: insertedMilestones } };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23503") {
      return { status: 400, body: { error: "Foreign key violation" } };
    }
    if (err.code === "23505") {
      return { status: 409, body: { error: "Unique constraint violation" } };
    }
    if (err.code === "23514") {
      return { status: 400, body: { error: "Constraint violation" } };
    }
    if (err.code === "23502") {
      return { status: 400, body: { error: "A required field is missing" } };
    }
    if (err.code === "22P02") {
      return { status: 400, body: { error: "Invalid value provided" } };
    }
    if (err.code === "22003") {
      return { status: 400, body: { error: "Amount exceeds the supported limit" } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  } finally {
    client.release();
  }
}

async function listProjects(actorUserId) {
  try {
    const result = await repository.listProjectsForParticipant(pool, actorUserId);

    const projects = result.rows.map((row) => ({
      id: row.id,
      external_id: row.external_id,
      buyer_user_id: row.buyer_user_id,
      seller_user_id: row.seller_user_id,
      title: row.title,
      requirements: row.requirements,
      price_amount: row.price_amount,
      currency: row.currency,
      delivery_days: row.delivery_days,
      revision_limit: row.revision_limit,
      state: row.state,
      accepted_at: row.accepted_at,
      delivered_at: row.delivered_at,
      completed_at: row.completed_at,
      milestones_locked_at: row.milestones_locked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      buyer_profile: {
        user_id: row.buyer_profile_user_id,
        display_name: row.buyer_profile_display_name,
        handle: row.buyer_profile_handle,
        artist_name: row.buyer_profile_artist_name,
      },
      seller_profile: {
        user_id: row.seller_profile_user_id,
        display_name: row.seller_profile_display_name,
        handle: row.seller_profile_handle,
        artist_name: row.seller_profile_artist_name,
      },
    }));

    return { status: 200, body: { projects } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

module.exports = {
  createProject,
  listProjects,
};
