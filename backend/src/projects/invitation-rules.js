const { hashRequest } = require("../infrastructure/canonical-json");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITATION_EXTERNAL_ID_PATTERN = /^inv_[0-9a-f]{20}$/;
const EXPIRES_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const TERMINAL_STATUSES = new Set([
  "accepted",
  "declined",
  "withdrawn",
  "expired",
  "superseded",
]);

function invalid(error) {
  return { ok: false, error };
}

function parseExpectedVersion(value, name) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return invalid(`${name} must be a positive integer`);
  }
  return { ok: true, value };
}

function parseInviteBody(body) {
  const source = body ?? {};
  if (typeof source.invitee_user_id !== "string" || !UUID_PATTERN.test(source.invitee_user_id)) {
    return invalid("invitee_user_id must be a valid UUID");
  }
  if (typeof source.expires_at !== "string" || !EXPIRES_AT_PATTERN.test(source.expires_at)) {
    return invalid("expires_at must be an ISO-8601 UTC timestamp");
  }
  const expiresAt = new Date(source.expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    return invalid("expires_at must be an ISO-8601 UTC timestamp");
  }
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  return {
    ok: true,
    value: {
      inviteeUserId: source.invitee_user_id,
      expiresAt: expiresAt.toISOString(),
      expectedVersion: version.value,
    },
  };
}

function parseResponseBody(body) {
  const source = body ?? {};
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  const proposal = parseExpectedVersion(source.expected_proposal_version, "expected_proposal_version");
  if (!proposal.ok) {
    return proposal;
  }
  return {
    ok: true,
    value: {
      expectedVersion: version.value,
      expectedProposalVersion: proposal.value,
    },
  };
}

function parseWithdrawBody(body) {
  const source = body ?? {};
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  return { ok: true, value: { expectedVersion: version.value } };
}

function timestampToIso(value) {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function proposalDocument(project, milestones) {
  return {
    currency: project.currency,
    delivery_days: project.delivery_days,
    milestones: milestones.map((milestone) => ({
      amount: Number(milestone.amount),
      currency: milestone.currency,
      currency_exponent: milestone.currency_exponent === null || milestone.currency_exponent === undefined
        ? null
        : Number(milestone.currency_exponent),
      deliverable_definition: milestone.deliverable_definition,
      description: milestone.description,
      due_at: timestampToIso(milestone.due_at),
      milestone_no: milestone.milestone_no,
      revision_allowance: milestone.revision_allowance === null || milestone.revision_allowance === undefined
        ? null
        : Number(milestone.revision_allowance),
      title: milestone.title,
    })),
    price_amount: project.price_amount,
    requirements: project.requirements,
    revision_limit: project.revision_limit,
    title: project.title,
  };
}

function proposalHash(project, milestones) {
  return hashRequest(proposalDocument(project, milestones));
}

function invitationExternalIdIsValid(value) {
  return typeof value === "string" && INVITATION_EXTERNAL_ID_PATTERN.test(value);
}

module.exports = {
  TERMINAL_STATUSES,
  invitationExternalIdIsValid,
  parseInviteBody,
  parseResponseBody,
  parseWithdrawBody,
  proposalDocument,
  proposalHash,
};
