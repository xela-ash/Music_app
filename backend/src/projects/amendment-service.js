const pool = require("../../db/db");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const { hashRequest } = require("../infrastructure/canonical-json");
const amendments = require("./amendment-repository");
const {
  amendmentExternalIdIsValid,
  parseAcceptBody,
  parseDecisionBody,
  parseProposeBody,
  projectGate,
} = require("./amendment-rules");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function concealed() {
  return { status: 404, body: { error: "Project not found" } };
}

function amendmentConcealed() {
  return { status: 404, body: { error: "Amendment not found" } };
}

function fail(status, error) {
  return { status, body: { error } };
}

function publicAmendment(row, project) {
  return {
    external_id: row.external_id,
    project_id: row.project_id,
    project_external_id: project.external_id,
    proposer_user_id: row.proposer_user_id,
    counterparty_user_id: row.counterparty_user_id,
    base_project_version: row.base_project_version,
    base_term_version: row.base_term_version,
    current_term_version: row.current_term_version,
    patch: row.patch,
    old_snapshot_hash: row.old_snapshot_hash,
    new_snapshot_hash: row.new_snapshot_hash,
    status: row.status,
    expires_at: row.expires_at,
    decided_at: row.decided_at,
    decided_by_user_id: row.decided_by_user_id,
    version: row.version,
    project_version: project.version,
    project_state: project.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicTerm(row) {
  return {
    version_number: row.version_number,
    represented_state: row.represented_state,
    content_hash: row.content_hash,
  };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(rollbackErr);
    }
    if (err && err.status && err.body) {
      return { status: err.status, body: err.body };
    }
    if (err && err.code === "23505") {
      return fail(409, "A pending amendment already exists");
    }
    if (err && err.code === "23514") {
      return fail(400, "Constraint violation");
    }
    console.error(err);
    return fail(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function writeAudit(client, { project, amendment, actorType, actorId, relationship, action, outcome, sourceState, idempotencyKey }) {
  const affected = amendment && amendment.patch ? Object.keys(amendment.patch).sort() : [];
  const changeHash = hashRequest({
    action,
    affected_fields: affected,
    amendment_external_id: amendment ? amendment.external_id : null,
    new_snapshot_hash: amendment ? amendment.new_snapshot_hash : null,
    old_snapshot_hash: amendment ? amendment.old_snapshot_hash : null,
    outcome,
    project_external_id: project.external_id,
  });
  await amendments.insertAuditEvent(client, [
    amendments.makeAuditExternalId(),
    project.id,
    "AUD-PROJECTS-004",
    actorType,
    actorId,
    relationship,
    action,
    outcome,
    null,
    sourceState,
    outcome,
    project.version,
    null,
    idempotencyKey,
    changeHash,
  ]);
}

async function resolveParty(client, project, actorUserId) {
  const seller = await amendments.findActiveSeller(client, project.id);
  const sellerUserId = seller.rows[0] ? seller.rows[0].user_id : null;
  if (actorUserId === project.buyer_user_id) {
    return { relationship: "buyer", counterpartyUserId: sellerUserId };
  }
  if (sellerUserId && sellerUserId === actorUserId) {
    return { relationship: "seller", counterpartyUserId: project.buyer_user_id };
  }
  return null;
}

async function expireIfDue(client, project, amendment, idempotencyKey) {
  if (!amendment || amendment.status !== "proposed") {
    return amendment;
  }
  const due = await amendments.expiryIsPast(client, amendment.expires_at);
  if (!due.rows[0].due) {
    return amendment;
  }
  const marked = await amendments.decideAmendment(client, {
    id: amendment.id,
    status: "expired",
    decidedBy: null,
    currentTermVersion: null,
  });
  const expired = marked.rows[0];
  await writeAudit(client, {
    project,
    amendment: expired,
    actorType: "system",
    actorId: "system",
    relationship: "system",
    action: "expire",
    outcome: "expired",
    sourceState: "proposed",
    idempotencyKey,
  });
  return expired;
}

function throwResult(result) {
  const error = new Error("amendment rejected");
  error.status = result.status;
  error.body = result.body;
  throw error;
}

async function proposeAmendment(projectId, body, actorUserId, idempotencyKeyHeader) {
  if (!UUID_PATTERN.test(projectId)) {
    return fail(400, "projectId must be a valid UUID");
  }
  const parsed = parseProposeBody(body);
  if (!parsed.ok) {
    return fail(parsed.status, parsed.error);
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return fail(400, key.error);
  }
  const command = parsed.value;

  return withTransaction(async (client) => {
    const locked = await amendments.lockProjectById(client, projectId);
    const project = locked.rows[0];
    if (!project) {
      return concealed();
    }
    const party = await resolveParty(client, project, actorUserId);
    if (!party) {
      return concealed();
    }
    const pendingResult = await amendments.lockPendingAmendment(client, project.id);
    const pending = await expireIfDue(client, project, pendingResult.rows[0] || null, key.key);

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation: "project.propose_amendment",
        resourceRef: project.id,
        key: key.key,
        request: command,
      },
      async () => {
        const gate = projectGate(project);
        if (gate) {
          return fail(gate.status, gate.error);
        }
        if (!party.counterpartyUserId) {
          return fail(409, "Project is not accepted");
        }
        if (project.version !== command.expectedVersion) {
          await writeAudit(client, {
            project,
            amendment: null,
            actorType: "user",
            actorId: actorUserId,
            relationship: party.relationship,
            action: "propose",
            outcome: "stale_version",
            sourceState: project.state,
            idempotencyKey: key.key,
          });
          return fail(409, "Project version is stale");
        }
        if (pending && pending.status === "proposed") {
          return fail(409, "A pending amendment already exists");
        }
        const expiry = await amendments.expiryIsPast(client, command.expiresAt);
        if (expiry.rows[0].due) {
          return fail(400, "expires_at must be in the future");
        }
        const hashed = await amendments.hashPatchedTerms(
          client,
          project.id,
          project.agreed_term_version,
          command.changes
        );
        if (hashed.rows.length !== 1) {
          return fail(409, "Project is not accepted");
        }
        if (hashed.rows[0].new_hash === hashed.rows[0].old_hash) {
          return fail(422, "Amendment does not change the agreed terms");
        }
        const inserted = await amendments.insertAmendment(client, [
          amendments.makeAmendmentExternalId(),
          project.id,
          actorUserId,
          party.counterpartyUserId,
          project.version,
          project.agreed_term_version,
          JSON.stringify(command.changes),
          hashed.rows[0].old_hash,
          hashed.rows[0].new_hash,
          command.expiresAt,
        ]);
        const amendment = inserted.rows[0];
        await writeAudit(client, {
          project,
          amendment,
          actorType: "user",
          actorId: actorUserId,
          relationship: party.relationship,
          action: "propose",
          outcome: "proposed",
          sourceState: null,
          idempotencyKey: key.key,
        });
        return { status: 201, body: { amendment: publicAmendment(amendment, project) } };
      }
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

function sameTerminal(commandName, status) {
  return (
    (commandName === "accept" && status === "accepted") ||
    (commandName === "reject" && status === "rejected") ||
    (commandName === "withdraw" && status === "withdrawn")
  );
}

async function establishedResult(client, project, amendment) {
  const body = { amendment: publicAmendment(amendment, project) };
  if (amendment.status === "accepted" && amendment.current_term_version) {
    const term = await amendments.termVersionRow(client, project.id, amendment.current_term_version);
    body.term_version = publicTerm(term.rows[0]);
  }
  return { status: 200, body };
}

async function decide(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader, commandName) {
  if (!UUID_PATTERN.test(projectId)) {
    return fail(400, "projectId must be a valid UUID");
  }
  if (!amendmentExternalIdIsValid(amendmentExternalId)) {
    return fail(400, "amendmentId must be a valid amendment id");
  }
  const parsed = commandName === "accept" ? parseAcceptBody(body) : parseDecisionBody(body);
  if (!parsed.ok) {
    return fail(parsed.status, parsed.error);
  }
  const key = validateIdempotencyKey(idempotencyKeyHeader);
  if (!key.ok) {
    return fail(400, key.error);
  }
  const command = parsed.value;
  const operation = commandName === "accept"
    ? "project.accept_amendment"
    : commandName === "reject"
      ? "project.reject_amendment"
      : "project.withdraw_amendment";

  return withTransaction(async (client) => {
    const locked = await amendments.lockProjectById(client, projectId);
    const project = locked.rows[0];
    if (!project) {
      return concealed();
    }
    const party = await resolveParty(client, project, actorUserId);
    if (!party) {
      return concealed();
    }
    const found = await amendments.lockAmendment(client, project.id, amendmentExternalId);
    const loaded = found.rows[0];
    if (!loaded) {
      return amendmentConcealed();
    }
    const allowed = commandName === "withdraw"
      ? loaded.proposer_user_id === actorUserId
      : loaded.counterparty_user_id === actorUserId;
    if (!allowed) {
      return amendmentConcealed();
    }
    const amendment = await expireIfDue(client, project, loaded, key.key);

    const idempotent = await executeIdempotent(
      client,
      {
        actorType: "user",
        actorId: actorUserId,
        operation,
        resourceRef: amendment.id,
        key: key.key,
        request: command,
      },
      async () => applyDecision(client, {
        project,
        amendment,
        command,
        commandName,
        actorUserId,
        relationship: party.relationship,
        idempotencyKey: key.key,
      })
    );
    return { status: idempotent.status, body: idempotent.body };
  });
}

async function applyDecision(client, { project, amendment, command, commandName, actorUserId, relationship, idempotencyKey }) {
  if (sameTerminal(commandName, amendment.status)) {
    return establishedResult(client, project, amendment);
  }
  if (amendment.status !== "proposed") {
    await writeAudit(client, {
      project,
      amendment,
      actorType: "user",
      actorId: actorUserId,
      relationship,
      action: commandName,
      outcome: amendment.status === "expired" ? "expired" : "competing",
      sourceState: amendment.status,
      idempotencyKey,
    });
    return fail(409, amendment.status === "expired" ? "Amendment has expired" : "Amendment is no longer proposed");
  }
  if (project.version !== command.expectedVersion) {
    await writeAudit(client, {
      project,
      amendment,
      actorType: "user",
      actorId: actorUserId,
      relationship,
      action: commandName,
      outcome: "stale_version",
      sourceState: "proposed",
      idempotencyKey,
    });
    return fail(409, "Project version is stale");
  }
  const gate = projectGate(project);
  if (gate) {
    return fail(gate.status, gate.error);
  }

  if (commandName === "accept") {
    return acceptAmendment(client, { project, amendment, command, actorUserId, relationship, idempotencyKey });
  }

  const marked = await amendments.decideAmendment(client, {
    id: amendment.id,
    status: commandName === "reject" ? "rejected" : "withdrawn",
    decidedBy: actorUserId,
    currentTermVersion: null,
  });
  const decided = marked.rows[0];
  await writeAudit(client, {
    project,
    amendment: decided,
    actorType: "user",
    actorId: actorUserId,
    relationship,
    action: commandName,
    outcome: decided.status,
    sourceState: "proposed",
    idempotencyKey,
  });
  return { status: 200, body: { amendment: publicAmendment(decided, project) } };
}

async function acceptAmendment(client, { project, amendment, command, actorUserId, relationship, idempotencyKey }) {
  if (project.version !== amendment.base_project_version || project.agreed_term_version !== amendment.base_term_version) {
    await writeAudit(client, {
      project,
      amendment,
      actorType: "user",
      actorId: actorUserId,
      relationship,
      action: "accept",
      outcome: "stale_base",
      sourceState: "proposed",
      idempotencyKey,
    });
    return fail(409, "Amendment base is stale");
  }
  if (command.expectedHash !== amendment.new_snapshot_hash) {
    await writeAudit(client, {
      project,
      amendment,
      actorType: "user",
      actorId: actorUserId,
      relationship,
      action: "accept",
      outcome: "hash_mismatch",
      sourceState: "proposed",
      idempotencyKey,
    });
    return fail(409, "Amendment hash does not match");
  }
  const recomputed = await amendments.hashPatchedTerms(
    client,
    project.id,
    amendment.base_term_version,
    amendment.patch
  );
  if (recomputed.rows.length !== 1 || recomputed.rows[0].new_hash !== amendment.new_snapshot_hash) {
    throwResult(fail(409, "Amendment hash does not match"));
  }
  const inserted = await amendments.insertPatchedAgreedVersion(
    client,
    project.id,
    amendments.makeTermExternalId(),
    amendment.base_term_version,
    amendment.patch
  );
  if (inserted.rows.length !== 1 || inserted.rows[0].content_hash !== amendment.new_snapshot_hash) {
    throwResult(fail(409, "Amendment hash does not match"));
  }
  const term = inserted.rows[0];
  const updated = await amendments.applyAcceptedTerms(
    client,
    project.id,
    project.version,
    amendment.patch,
    term.version_number
  );
  if (updated.rows.length !== 1) {
    throwResult(fail(409, "Project version is stale"));
  }
  const nextProject = { ...project, ...updated.rows[0] };
  const marked = await amendments.decideAmendment(client, {
    id: amendment.id,
    status: "accepted",
    decidedBy: actorUserId,
    currentTermVersion: term.version_number,
  });
  const decided = marked.rows[0];
  await writeAudit(client, {
    project: nextProject,
    amendment: decided,
    actorType: "user",
    actorId: actorUserId,
    relationship,
    action: "accept",
    outcome: "accepted",
    sourceState: "proposed",
    idempotencyKey,
  });
  await enqueueOutboxMessage(client, {
    eventType: "ProjectTermsChanged",
    eventVersion: 1,
    aggregateType: "project",
    aggregateId: nextProject.external_id,
    aggregateVersion: nextProject.version,
    payload: {
      affected_field_codes: Object.keys(decided.patch).sort(),
      amendment_external_id: decided.external_id,
      new_snapshot_hash: decided.new_snapshot_hash,
      new_term_version: term.version_number,
      old_snapshot_hash: decided.old_snapshot_hash,
      old_term_version: decided.base_term_version,
      project_external_id: nextProject.external_id,
    },
  });
  return {
    status: 200,
    body: {
      amendment: publicAmendment(decided, nextProject),
      term_version: publicTerm(term),
    },
  };
}

function acceptAmendmentCommand(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader) {
  return decide(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader, "accept");
}

function rejectAmendment(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader) {
  return decide(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader, "reject");
}

function withdrawAmendment(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader) {
  return decide(projectId, amendmentExternalId, body, actorUserId, idempotencyKeyHeader, "withdraw");
}

module.exports = {
  proposeAmendment,
  acceptAmendment: acceptAmendmentCommand,
  rejectAmendment,
  withdrawAmendment,
};
