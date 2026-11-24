const crypto = require("crypto");
const pool = require("../../db/db");
const storage = require("../assets/storage");
const { PURPOSES } = require("../assets/limits");
const {
  VERIFICATION_SUBMIT,
  VERIFICATION_READ,
  VERIFICATION_DECIDE,
  authorize,
} = require("../authorization/authorize");
const repository = require("./repository");
const rules = require("./rules");

const IMAGE_BYTE_CEILING = PURPOSES.profile_avatar.maxBytes;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);
const SLOTS = new Set(["selfie:selfie", "government_id:front", "government_id:back"]);
const VERIFICATION_ID = /^pfv_[0-9a-f]{20}$/;
const DOCUMENT_ID = /^vdc_[0-9a-f]{20}$/;
const ASSET_ID = /^ast_[0-9a-f]{20}$/;
const TOKEN = /^[0-9a-f]{64}$/;
const PAGE_MAX = 100;

function failure(status, error) {
  return { status, body: { error } };
}

function configuredTtlSeconds() {
  const raw = process.env.VERIFICATION_ACCESS_TTL_SECONDS;
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function correlationId(header) {
  if (typeof header === "string" && repository.isUuid(header)) {
    return header;
  }
  return crypto.randomUUID();
}

function trimmed(value, max) {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  if (text.length < 1 || text.length > max) {
    return null;
  }
  return text;
}

function publicVerification(row, documents) {
  return {
    external_id: row.external_id,
    status: row.status,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    review_notes: row.review_notes,
    is_current: row.is_current,
    documents: documents.map((document) => ({
      external_id: document.external_id,
      doc_type: document.doc_type,
      doc_side: document.doc_side,
      country: document.country,
      id_type: document.id_type,
      file_mime_type: document.file_mime_type,
      status: document.status,
      rejection_reason: document.rejection_reason,
    })),
  };
}

async function activeRoles(client, actorId) {
  const result = await repository.listActivePlatformRoleNames(client, actorId);
  return result.rows.map((row) => row.name);
}

function parseDocuments(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: failure(400, "Request body is required") };
  }
  if (Object.prototype.hasOwnProperty.call(body, "user_id")) {
    return { error: failure(400, "user_id is assigned by the server") };
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    return { error: failure(400, "status is assigned by the server") };
  }
  if (!Array.isArray(body.documents) || body.documents.length < 1 || body.documents.length > 3) {
    return { error: failure(400, "At least one verification document is required") };
  }
  const documents = [];
  const seenSlots = new Set();
  const seenAssets = new Set();
  for (const source of body.documents) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return { error: failure(400, "A verification document is invalid") };
    }
    if (Object.prototype.hasOwnProperty.call(source, "user_id") || Object.prototype.hasOwnProperty.call(source, "status")) {
      return { error: failure(400, "Document owner and status are assigned by the server") };
    }
    const docType = source.doc_type;
    const docSide = source.doc_side;
    if (!SLOTS.has(`${docType}:${docSide}`)) {
      return { error: failure(400, "Document type and side are not allowed") };
    }
    if (seenSlots.has(`${docType}:${docSide}`)) {
      return { error: failure(400, "Only one current document is allowed for each side") };
    }
    seenSlots.add(`${docType}:${docSide}`);
    if (typeof source.asset_external_id !== "string" || !ASSET_ID.test(source.asset_external_id)) {
      return { error: failure(400, "asset_external_id is invalid") };
    }
    if (seenAssets.has(source.asset_external_id)) {
      return { error: failure(400, "Each document must use a distinct asset") };
    }
    seenAssets.add(source.asset_external_id);
    const country = trimmed(source.country, 80);
    if (!country) {
      return { error: failure(400, "country is required") };
    }
    let idType = null;
    if (source.id_type != null) {
      idType = trimmed(source.id_type, 80);
      if (!idType) {
        return { error: failure(400, "id_type is invalid") };
      }
    }
    if (docType === "selfie" && idType != null) {
      return { error: failure(400, "A selfie does not take an id_type") };
    }
    documents.push({
      docType,
      docSide,
      assetExternalId: source.asset_external_id,
      country,
      idType,
    });
  }
  return { documents };
}

async function rollback(client) {
  try {
    await client.query("ROLLBACK");
  } catch (_err) {
    // The original error is the one the caller needs.
  }
}

async function submitVerification(actorId, body, requestCorrelationId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  const parsed = parseDocuments(body);
  if (parsed.error) {
    return parsed.error;
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const submitDecision = authorize({ id: actorId }, VERIFICATION_SUBMIT, { ownerUserId: actorId });
    if (!submitDecision.allowed) {
      await rollback(client);
      return failure(submitDecision.status, submitDecision.error);
    }
    const current = await repository.lockCurrentVerification(client, actorId);
    const currentRow = current.rows[0] ?? null;
    const allowed = rules.submitAllowed(currentRow ? currentRow.status : null);
    if (!allowed.ok) {
      await rollback(client);
      return failure(allowed.status, allowed.error);
    }

    const assets = await repository.lockAssets(
      client,
      parsed.documents.map((document) => document.assetExternalId)
    );
    const byExternalId = new Map(assets.rows.map((row) => [row.external_id, row]));
    const resolved = [];
    for (const document of parsed.documents) {
      const asset = byExternalId.get(document.assetExternalId);
      if (!asset || asset.owner_user_id !== actorId) {
        await rollback(client);
        return failure(404, "Asset not found");
      }
      if (asset.state !== "ready") {
        await rollback(client);
        return failure(409, "Asset is not ready");
      }
      if (!ALLOWED_MIME.has(asset.detected_mime_type)) {
        await rollback(client);
        return failure(400, "Document type is not allowed");
      }
      if (asset.size_bytes == null || BigInt(asset.size_bytes) > IMAGE_BYTE_CEILING) {
        await rollback(client);
        return failure(400, "Document exceeds the image size limit");
      }
      resolved.push({ ...document, asset });
    }

    await repository.enableTransition(client);
    let priorStatus = null;
    let verification;
    if (!currentRow) {
      const inserted = await repository.insertSubmittedVerification(
        client,
        repository.makeExternalId("pfv"),
        actorId
      );
      verification = inserted.rows[0];
    } else if (currentRow.status === "not_started") {
      priorStatus = "not_started";
      const edge = rules.transition("not_started", "submitted");
      if (!edge.ok) {
        await rollback(client);
        return failure(edge.status, edge.error);
      }
      const updated = await repository.markSubmitted(client, currentRow.id);
      verification = updated.rows[0];
    } else {
      await repository.clearCurrentDocuments(client, currentRow.id);
      await repository.clearCurrent(client, currentRow.id);
      const inserted = await repository.insertSubmittedVerification(
        client,
        repository.makeExternalId("pfv"),
        actorId
      );
      verification = inserted.rows[0];
    }

    if (!verification) {
      await rollback(client);
      return failure(409, "Verification cannot make that transition");
    }

    for (const document of resolved) {
      await repository.insertDocument(client, [
        repository.makeExternalId("vdc"),
        actorId,
        verification.id,
        document.docType,
        document.docSide,
        document.country,
        document.idType,
        document.asset.id,
        document.asset.detected_mime_type,
      ]);
    }
    await repository.insertAudit(client, [
      repository.makeExternalId("vae"),
      "AUD-IDENTITY-001",
      verification.id,
      actorId,
      actorId,
      null,
      priorStatus,
      "submitted",
      null,
      correlationId(requestCorrelationId),
    ]);
    const documents = await repository.listDocuments(client, verification.id);
    await client.query("COMMIT");
    return {
      status: 201,
      body: { verification: publicVerification(verification, documents.rows) },
    };
  } catch (err) {
    await rollback(client);
    console.error(err);
    if (err && err.code === "23505") {
      return failure(409, "Verification cannot make that transition");
    }
    if (err && (err.code === "23514" || err.code === "22P02")) {
      return failure(400, "Verification document is invalid");
    }
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

function parseDecision(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: failure(400, "Request body is required") };
  }
  if (Object.prototype.hasOwnProperty.call(body, "user_id") || Object.prototype.hasOwnProperty.call(body, "reviewed_by")) {
    return { error: failure(400, "The deciding actor is assigned by the server") };
  }
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return { error: failure(400, "decision must be approved or rejected") };
  }
  let reason = null;
  if (body.reason != null) {
    reason = trimmed(body.reason, 2000);
    if (!reason) {
      return { error: failure(400, "reason is invalid") };
    }
  }
  if (body.decision === "rejected" && !reason) {
    return { error: failure(400, "A rejection reason is required") };
  }
  return { decision: body.decision, reason };
}

async function decideVerification(actorId, externalId, body, requestCorrelationId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  if (typeof externalId !== "string" || !VERIFICATION_ID.test(externalId)) {
    return failure(404, "Verification not found");
  }
  const parsed = parseDecision(body);
  if (parsed.error) {
    return parsed.error;
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await repository.lockVerificationByExternalId(client, externalId);
    const row = locked.rows[0];
    if (!row) {
      await rollback(client);
      return failure(404, "Verification not found");
    }
    const roles = await activeRoles(client, actorId);
    const decision = authorize({ id: actorId }, VERIFICATION_DECIDE, { activePlatformRoles: roles });
    if (!decision.allowed) {
      await rollback(client);
      return failure(decision.status, decision.error);
    }
    const edge = rules.transition(row.status, parsed.decision);
    if (!edge.ok || edge.command !== "decide" || row.is_current !== true) {
      await rollback(client);
      return failure(409, "Verification cannot make that transition");
    }
    await repository.enableTransition(client);
    const updated = await repository.decideVerification(
      client,
      row.id,
      parsed.decision,
      actorId,
      parsed.reason
    );
    if (updated.rowCount !== 1) {
      await rollback(client);
      return failure(409, "Verification cannot make that transition");
    }
    const documents = await repository.decideDocuments(client, row.id, parsed.decision, parsed.reason);
    if (documents.rowCount < 1) {
      await rollback(client);
      return failure(409, "Verification cannot make that transition");
    }
    await repository.insertAudit(client, [
      repository.makeExternalId("vae"),
      "AUD-IDENTITY-001",
      row.id,
      row.user_id,
      actorId,
      null,
      row.status,
      parsed.decision,
      parsed.reason,
      correlationId(requestCorrelationId),
    ]);
    const listed = await repository.listDocuments(client, row.id);
    await client.query("COMMIT");
    return {
      status: 200,
      body: { verification: publicVerification(updated.rows[0], listed.rows) },
    };
  } catch (err) {
    await rollback(client);
    console.error(err);
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function readVerification(actorId, externalId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  if (typeof externalId !== "string" || !VERIFICATION_ID.test(externalId)) {
    return failure(404, "Verification not found");
  }
  const client = await db.connect();
  try {
    const locked = await repository.lockVerificationByExternalId(client, externalId);
    const row = locked.rows[0];
    if (!row) {
      return failure(404, "Verification not found");
    }
    const roles = await activeRoles(client, actorId);
    const decision = authorize({ id: actorId }, VERIFICATION_READ, {
      ownerUserId: row.user_id,
      activePlatformRoles: roles,
    });
    if (!decision.allowed) {
      return failure(decision.status, decision.error);
    }
    const documents = await repository.listDocuments(client, row.id);
    return {
      status: 200,
      body: { verification: publicVerification(row, documents.rows) },
    };
  } catch (err) {
    console.error(err);
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function readOwnVerification(actorId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  const client = await db.connect();
  try {
    const current = await repository.lockCurrentVerification(client, actorId);
    const row = current.rows[0];
    if (!row) {
      return failure(404, "Verification not found");
    }
    const documents = await repository.listDocuments(client, row.id);
    return {
      status: 200,
      body: { verification: publicVerification(row, documents.rows) },
    };
  } catch (err) {
    console.error(err);
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

function page(query) {
  const source = query || {};
  const limitRaw = source.limit == null || source.limit === "" ? "20" : String(source.limit);
  const offsetRaw = source.offset == null || source.offset === "" ? "0" : String(source.offset);
  if (!/^(?:0|[1-9][0-9]*)$/.test(limitRaw) || !/^(?:0|[1-9][0-9]*)$/.test(offsetRaw)) {
    return { error: failure(400, "limit and offset must be whole numbers") };
  }
  const limit = Number(limitRaw);
  const offset = Number(offsetRaw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_MAX) {
    return { error: failure(400, "limit must be from 1 to 100") };
  }
  if (!Number.isSafeInteger(offset)) {
    return { error: failure(400, "offset is invalid") };
  }
  return { limit, offset };
}

async function listReviewQueue(actorId, query, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  const parsed = page(query);
  if (parsed.error) {
    return parsed.error;
  }
  const client = await db.connect();
  try {
    const roles = await activeRoles(client, actorId);
    const decision = authorize({ id: actorId }, VERIFICATION_READ, {
      queue: true,
      activePlatformRoles: roles,
    });
    if (!decision.allowed) {
      return failure(decision.status, decision.error);
    }
    const rows = await repository.listSubmitted(client, parsed.limit, parsed.offset);
    const verifications = [];
    for (const row of rows.rows) {
      const documents = await repository.listDocuments(client, row.id);
      verifications.push(publicVerification(row, documents.rows));
    }
    return {
      status: 200,
      body: { verifications, limit: parsed.limit, offset: parsed.offset },
    };
  } catch (err) {
    console.error(err);
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function createDocumentAccess(actorId, externalId, documentExternalId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  if (typeof externalId !== "string" || !VERIFICATION_ID.test(externalId)) {
    return failure(404, "Verification not found");
  }
  if (typeof documentExternalId !== "string" || !DOCUMENT_ID.test(documentExternalId)) {
    return failure(404, "Verification document not found");
  }
  const ttl = configuredTtlSeconds();
  if (ttl == null) {
    return failure(503, "Verification access is not configured");
  }
  const provider = process.env.ASSET_STORAGE_PROVIDER || "local";
  if (provider !== "local" && provider !== "local-mock") {
    return failure(503, "Verification document retrieval is not available");
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const locked = await repository.lockVerificationByExternalId(client, externalId);
    const row = locked.rows[0];
    if (!row) {
      await rollback(client);
      return failure(404, "Verification not found");
    }
    const roles = await activeRoles(client, actorId);
    const decision = authorize({ id: actorId }, VERIFICATION_READ, {
      ownerUserId: row.user_id,
      activePlatformRoles: roles,
    });
    if (!decision.allowed) {
      await rollback(client);
      return failure(decision.status, decision.error);
    }
    const document = await repository.lockDocument(client, row.id, documentExternalId);
    if (document.rowCount !== 1) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    const token = crypto.randomBytes(32).toString("hex");
    const grant = await repository.insertGrant(client, [
      repository.makeExternalId("vag"),
      document.rows[0].id,
      actorId,
      repository.hashToken(token),
      ttl,
    ]);
    await client.query("COMMIT");
    return {
      status: 201,
      body: {
        access: {
          path: `/verifications/access/${token}`,
          expires_at: grant.rows[0].expires_at,
        },
      },
    };
  } catch (err) {
    await rollback(client);
    console.error(err);
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

async function redeemDocumentAccess(actorId, token, requestCorrelationId, db = pool) {
  if (!repository.isUuid(actorId)) {
    return failure(401, "Unauthorized");
  }
  if (typeof token !== "string" || !TOKEN.test(token)) {
    return failure(404, "Verification document not found");
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const grant = await repository.lockGrantByHash(client, repository.hashToken(token));
    const grantRow = grant.rows[0];
    if (!grantRow || grantRow.actor_user_id !== actorId || grantRow.used_at) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    const documentResult = await client.query(
      `SELECT document.id, document.verification_id, document.file_mime_type, document.asset_id,
              verification.user_id, verification.external_id
       FROM verification_documents document
       JOIN profile_verifications verification ON verification.id = document.verification_id
       WHERE document.id = $1`,
      [grantRow.document_id]
    );
    const document = documentResult.rows[0];
    if (!document || !ALLOWED_MIME.has(document.file_mime_type)) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    const roles = await activeRoles(client, actorId);
    const decision = authorize({ id: actorId }, VERIFICATION_READ, {
      ownerUserId: document.user_id,
      activePlatformRoles: roles,
    });
    if (!decision.allowed) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    const stored = await repository.primaryStorageObject(client, document.asset_id);
    const object = stored.rows[0];
    if (!object || object.storage_provider !== "local-mock") {
      await rollback(client);
      return failure(503, "Verification document retrieval is not available");
    }
    if (object.size_bytes != null && BigInt(object.size_bytes) > IMAGE_BYTE_CEILING) {
      await rollback(client);
      return failure(400, "Document exceeds the image size limit");
    }
    const bytes = storage.readObject(object.storage_key);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || BigInt(bytes.length) > IMAGE_BYTE_CEILING) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    await repository.enableGrantUse(client);
    const used = await repository.markGrantUsed(client, grantRow.id);
    if (used.rowCount !== 1) {
      await rollback(client);
      return failure(404, "Verification document not found");
    }
    await repository.insertAudit(client, [
      repository.makeExternalId("vae"),
      "AUD-IDENTITY-003",
      document.verification_id,
      document.user_id,
      actorId,
      document.id,
      null,
      null,
      null,
      correlationId(requestCorrelationId),
    ]);
    await client.query("COMMIT");
    return {
      status: 200,
      body: bytes,
      headers: {
        "content-type": document.file_mime_type,
        "content-disposition": 'attachment; filename="verification-document"',
        "cache-control": "private, no-store",
      },
    };
  } catch (err) {
    await rollback(client);
    console.error(err);
    if (err && err.code === "storage_provider_rejected") {
      return failure(503, "Verification document retrieval is not available");
    }
    return failure(500, "Internal server error");
  } finally {
    client.release();
  }
}

module.exports = {
  IMAGE_BYTE_CEILING,
  submitVerification,
  decideVerification,
  readVerification,
  readOwnVerification,
  listReviewQueue,
  createDocumentAccess,
  redeemDocumentAccess,
};
