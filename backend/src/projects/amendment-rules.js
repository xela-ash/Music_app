const POSTGRES_INT_MAX = 2147483647;
const AMENDMENT_EXTERNAL_ID_PATTERN = /^amd_[0-9a-f]{20}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const EXPIRES_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

const ALLOWED_FIELDS = ["brief", "due_at", "revision_limit", "service_snapshot", "start_at", "title"];
const ALLOWED = new Set(ALLOWED_FIELDS);

// Money, catalogs, and milestone facts have no amendment validator in this item.
// INT-PROJECTS-023 and milestone snapshots are not available. Reject the patch.
const POLICY_FIELDS = new Set([
  "amount",
  "currency",
  "currency_exponent",
  "deliverable",
  "deliverable_definition",
  "delivery_days",
  "engagement_model",
  "genre_ids",
  "milestone",
  "milestones",
  "price",
  "price_amount",
  "revision_allowance",
  "skill_ids",
  "total_amount",
]);

const PRE_ACCEPTANCE_STATES = new Set([
  "draft",
  "proposed",
  "seller_invited",
  "seller_declined",
  "awaiting_seller",
]);

const HELD_STATES = new Set(["disputed", "suspended"]);

const COMMANDS = {
  accept: { actor: "counterparty", to: "accepted" },
  reject: { actor: "counterparty", to: "rejected" },
  withdraw: { actor: "proposer", to: "withdrawn" },
  expire: { actor: "system", to: "expired" },
};

const AMENDMENT_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
  "superseded",
];

function invalid(error, status = 400) {
  return { ok: false, error, status };
}

function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function parseExpectedVersion(value, name) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return invalid(`${name} must be a positive integer`);
  }
  return { ok: true, value };
}

function parseTimestamp(value, name, { allowNull = false } = {}) {
  if (allowNull && value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string" || !EXPIRES_AT_PATTERN.test(value)) {
    return invalid(`${name} must be an ISO-8601 UTC timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return invalid(`${name} must be an ISO-8601 UTC timestamp`);
  }
  return { ok: true, value: parsed.toISOString() };
}

function parseChanges(changes) {
  if (!isPlainObject(changes)) {
    return invalid("changes must be an object");
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    return invalid("Amendment changes are not allowed", 422);
  }
  for (const key of keys) {
    if (!ALLOWED.has(key) || POLICY_FIELDS.has(key)) {
      return invalid("Amendment changes are not allowed", 422);
    }
  }
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(changes, "title")) {
    if (typeof changes.title !== "string" || changes.title.length < 1) {
      return invalid("title must be a non-empty string");
    }
    patch.title = changes.title;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "brief")) {
    if (typeof changes.brief !== "string" || changes.brief.length < 1) {
      return invalid("brief must be a non-empty string");
    }
    patch.brief = changes.brief;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "revision_limit")) {
    if (
      typeof changes.revision_limit !== "number"
      || !Number.isSafeInteger(changes.revision_limit)
      || changes.revision_limit < 0
      || changes.revision_limit > POSTGRES_INT_MAX
    ) {
      return invalid("revision_limit must be a nonnegative integer");
    }
    patch.revision_limit = changes.revision_limit;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "start_at")) {
    const start = parseTimestamp(changes.start_at, "start_at", { allowNull: true });
    if (!start.ok) {
      return start;
    }
    patch.start_at = start.value;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "due_at")) {
    const due = parseTimestamp(changes.due_at, "due_at", { allowNull: true });
    if (!due.ok) {
      return due;
    }
    patch.due_at = due.value;
  }
  if (Object.prototype.hasOwnProperty.call(changes, "service_snapshot")) {
    if (!isPlainObject(changes.service_snapshot)) {
      return invalid("service_snapshot must be an object");
    }
    patch.service_snapshot = changes.service_snapshot;
  }
  return { ok: true, value: patch };
}

function parseProposeBody(body) {
  const source = body ?? {};
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  const expires = parseTimestamp(source.expires_at, "expires_at");
  if (!expires.ok) {
    return expires;
  }
  const changes = parseChanges(source.changes);
  if (!changes.ok) {
    return changes;
  }
  return {
    ok: true,
    value: {
      expectedVersion: version.value,
      expiresAt: expires.value,
      changes: changes.value,
    },
  };
}

function parseAcceptBody(body) {
  const source = body ?? {};
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  if (typeof source.expected_hash !== "string" || !HASH_PATTERN.test(source.expected_hash)) {
    return invalid("expected_hash must be a sha256 hex digest");
  }
  return {
    ok: true,
    value: {
      expectedVersion: version.value,
      expectedHash: source.expected_hash,
    },
  };
}

function parseDecisionBody(body) {
  const source = body ?? {};
  const version = parseExpectedVersion(source.expected_version, "expected_version");
  if (!version.ok) {
    return version;
  }
  return { ok: true, value: { expectedVersion: version.value } };
}

function projectGate(project) {
  if (HELD_STATES.has(project.state)) {
    return { status: 409, error: "Project is held" };
  }
  if (!project.agreed_term_version || PRE_ACCEPTANCE_STATES.has(project.state)) {
    return { status: 409, error: "Project is not accepted" };
  }
  return null;
}

function amendmentTransition(from, action, actor) {
  const command = COMMANDS[action];
  if (!command || from !== "proposed" || actor !== command.actor) {
    return null;
  }
  return command.to;
}

function amendmentExternalIdIsValid(value) {
  return typeof value === "string" && AMENDMENT_EXTERNAL_ID_PATTERN.test(value);
}

module.exports = {
  ALLOWED_FIELDS,
  AMENDMENT_STATUSES,
  COMMANDS,
  HELD_STATES,
  POLICY_FIELDS,
  PRE_ACCEPTANCE_STATES,
  amendmentExternalIdIsValid,
  amendmentTransition,
  parseAcceptBody,
  parseDecisionBody,
  parseProposeBody,
  projectGate,
};
