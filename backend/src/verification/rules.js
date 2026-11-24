// Identity verification transitions on the schema's four statuses.
// users.md §8.2 maps Pending and Under Review onto `submitted`.
// Approved and Rejected are reached only by an Administrator decision.
// Expiry and revocation are not edges: the validity period is open.

const STATUSES = Object.freeze(["not_started", "submitted", "approved", "rejected"]);

const DECISIONS = Object.freeze(["approved", "rejected"]);

const EDGES = Object.freeze({
  not_started: Object.freeze({ submitted: "submit" }),
  submitted: Object.freeze({ approved: "decide", rejected: "decide" }),
  approved: Object.freeze({}),
  rejected: Object.freeze({}),
});

function transition(fromStatus, toStatus) {
  const command = EDGES[fromStatus] && EDGES[fromStatus][toStatus];
  if (!command) {
    return {
      ok: false,
      status: 409,
      error: "Verification cannot make that transition",
    };
  }
  return { ok: true, command };
}

function submitAllowed(currentStatus) {
  if (currentStatus == null || currentStatus === "not_started" || currentStatus === "rejected") {
    return { ok: true };
  }
  if (currentStatus === "submitted") {
    return {
      ok: false,
      status: 409,
      error: "A verification attempt is already open",
    };
  }
  return {
    ok: false,
    status: 409,
    error: "Verification cannot be submitted from its current status",
  };
}

module.exports = {
  STATUSES,
  DECISIONS,
  EDGES,
  transition,
  submitAllowed,
};
