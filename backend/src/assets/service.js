const pool = require("../../db/db");
const { authorize, ASSET_UPLOAD } = require("../authorization/authorize");
const { validateIdempotencyKey, executeIdempotent } = require("../infrastructure/idempotency");
const { enqueueOutboxMessage } = require("../infrastructure/outbox");
const limits = require("./limits");
const storage = require("./storage");
const repository = require("./repository");
const { assessObjectPrefix } = require("./content-inspect");
const { scanObject } = require("./scanner");

const CREATE_FIELDS = new Set([
  "purpose",
  "declared_size_bytes",
  "filename",
  "declared_mime_type",
  "project_id",
  "client_checksum",
]);
const COMPLETE_FIELDS = new Set(["client_checksum"]);
const PROJECT_ID_PATTERN = /^prj_[0-9a-f]{20}$/;

let derivativeProcessor = async () => null;

function setDerivativeProcessorForTests(next) {
  derivativeProcessor = next || (async () => null);
}

function configuredTtlSeconds() {
  const raw = process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS;
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function fail(status, error, code, commit = false) {
  return { status, body: { error, code }, commit };
}

function normalizeFilename(name) {
  if (typeof name !== "string" || name.length === 0 || name.length > 255) {
    return null;
  }
  const base = name.normalize("NFKC").split(/[/\\]/).pop();
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === ".." || cleaned.length > 200) {
    return null;
  }
  return cleaned;
}

function extensionOf(filename) {
  const index = filename.lastIndexOf(".");
  if (index <= 0 || index === filename.length - 1) {
    return null;
  }
  return filename.slice(index + 1).toLowerCase();
}

function unknownField(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be an object";
  }
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return "Request contains an unknown field";
    }
  }
  return null;
}

function sessionView(row) {
  return {
    external_id: row.external_id,
    asset_external_id: row.asset_external_id,
    purpose: row.purpose,
    method: row.method,
    state: row.state,
    asset_state: row.asset_state,
    max_size_bytes: row.max_size_bytes,
    declared_size_bytes: row.declared_size_bytes,
    expires_at: row.expires_at,
    size_bytes: row.size_bytes,
    detected_mime_type: row.detected_mime_type,
    malware_scan_status: row.malware_scan_status,
    width: row.width,
    height: row.height,
  };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    if (result.commit === false || (result.status >= 400 && result.commit !== true)) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
    return { status: result.status, body: result.body };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The original error is the one the caller needs.
    }
    throw error;
  } finally {
    client.release();
  }
}

function mimeAgrees(detected, declared, extension) {
  if (detected === "image/png") {
    return declared === "image/png" && extension === "png";
  }
  if (detected === "image/jpeg") {
    return declared === "image/jpeg" && (extension === "jpg" || extension === "jpeg");
  }
  return true;
}

async function createUploadSession(body, actorId, idempotencyKey) {
  const unknown = unknownField(body, CREATE_FIELDS);
  if (unknown) {
    return { status: 400, body: { error: unknown } };
  }
  const key = validateIdempotencyKey(idempotencyKey);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  const ttlSeconds = configuredTtlSeconds();
  if (ttlSeconds === null) {
    return fail(503, "Upload session duration is not configured", "session_ttl_unconfigured");
  }
  const storageReady = storage.readiness();
  if (!storageReady.ok) {
    return fail(503, "Asset storage is not configured", "storage_unconfigured");
  }
  const policy = limits.purposePolicy(body.purpose);
  if (!policy) {
    return fail(422, "This purpose has no approved upload limit", "purpose_not_approved");
  }
  const declared = limits.toByteBigInt(body.declared_size_bytes);
  if (declared === null || declared < 1n) {
    return { status: 400, body: { error: "declared_size_bytes must be a positive integer" } };
  }
  if (limits.exceedsByteLimit(declared, policy.maxBytes)) {
    return fail(413, "File exceeds the purpose byte limit", "purpose_byte_limit");
  }
  const filename = normalizeFilename(body.filename);
  if (!filename) {
    return { status: 400, body: { error: "filename is required" } };
  }
  if (typeof body.declared_mime_type !== "string" || body.declared_mime_type.length === 0 || body.declared_mime_type.length > 255) {
    return { status: 400, body: { error: "declared_mime_type is required" } };
  }
  if (body.client_checksum !== undefined && (typeof body.client_checksum !== "string" || !/^[0-9a-f]{64}$/.test(body.client_checksum))) {
    return { status: 400, body: { error: "client_checksum must be a sha256 hex digest" } };
  }
  if (policy.binding === "project") {
    if (typeof body.project_id !== "string" || !PROJECT_ID_PATTERN.test(body.project_id)) {
      return { status: 400, body: { error: "project_id must be the project external id" } };
    }
  } else if (body.project_id !== undefined) {
    return { status: 400, body: { error: "Profile uploads do not take a project_id" } };
  }

  return withTransaction(async (client) => {
    let profile = null;
    let project = null;
    if (policy.binding === "profile") {
      profile = await repository.findProfileForUser(client, actorId);
      const decision = authorize({ id: actorId }, ASSET_UPLOAD, {
        binding: "profile",
        profileId: profile ? profile.id : null,
        profileUserId: profile ? profile.user_id : null,
      });
      if (!decision.allowed) {
        return fail(decision.status, decision.error, "forbidden");
      }
    } else {
      project = await repository.lockProjectByExternalId(client, body.project_id);
      const decision = authorize({ id: actorId }, ASSET_UPLOAD, project && {
        binding: "project",
        projectId: project.id,
        buyerUserId: project.buyer_user_id,
        activeSellerUserId: project.active_seller_user_id,
      });
      if (!decision.allowed) {
        return fail(decision.status, decision.error, "forbidden");
      }
      const reserved = await repository.projectReservedBytes(client, project.id);
      if (limits.quotaWouldExceed(reserved, declared)) {
        return fail(429, "Project storage quota would be exceeded", "project_quota");
      }
    }

    const request = {
      purpose: body.purpose,
      declared_size_bytes: declared.toString(),
      filename,
      declared_mime_type: body.declared_mime_type,
      project_id: body.project_id ?? null,
      client_checksum: body.client_checksum ?? null,
    };
    const outcome = await executeIdempotent(client, {
      actorType: "user",
      actorId,
      operation: "asset.create_upload_session",
      resourceRef: policy.binding === "project" ? project.id : profile.id,
      key: key.key,
      request,
    }, async () => {
      const reserved = await storage.reserveObject();
      const asset = await repository.insertOriginalAsset(client, {
        externalId: repository.newExternalId("ast"),
        ownerUserId: actorId,
        purpose: body.purpose,
        originalFilename: filename,
        normalizedFilename: filename,
        declaredMimeType: body.declared_mime_type,
        fileExtension: extensionOf(filename),
      });
      const session = await repository.insertSession(client, {
        externalId: repository.newExternalId("aus"),
        assetId: asset.id,
        uploaderUserId: actorId,
        purpose: body.purpose,
        bindingType: policy.binding,
        profileId: profile ? profile.id : null,
        projectId: project ? project.id : null,
        declaredSizeBytes: declared,
        maxSizeBytes: policy.maxBytes,
        method: policy.method,
        stagingKey: reserved.key,
        ttlSeconds,
      });
      await repository.insertStorageObject(client, {
        assetId: asset.id,
        objectRole: "staging",
        provider: reserved.provider,
        bucket: reserved.bucket,
        key: reserved.key,
        generation: reserved.generation,
        classification: "temporary_staging",
        sizeBytes: null,
        checksum: null,
      });
      if (project) {
        await repository.insertProjectBinding(client, {
          assetId: asset.id,
          projectId: project.id,
          purpose: body.purpose,
          userId: actorId,
        });
      }
      await repository.insertAudit(client, {
        eventType: "AUD-ASSET-001",
        assetId: asset.id,
        sessionId: session.id,
        actorType: "user",
        actorId,
        action: "asset.upload_initiated",
        outcome: "created",
        policyVersion: limits.POLICY_VERSION,
      });
      await enqueueOutboxMessage(client, {
        eventType: "AssetUploadInitiated",
        aggregateType: "asset_upload_session",
        aggregateId: session.external_id,
        aggregateVersion: 1,
        payload: {
          purpose: body.purpose,
          method: policy.method,
          max_size_bytes: policy.maxBytes.toString(),
          project_external_id: project ? project.external_id : null,
        },
      });
      const view = await repository.publicSession(client, session.id);
      return { status: 201, body: { upload_session: sessionView(view) } };
    });
    return { status: outcome.status, body: outcome.body, commit: outcome.status < 400 };
  });
}

function discardStream(source) {
  if (!source || typeof source.resume !== "function") {
    return Promise.resolve();
  }
  source.resume();
  if (source.readableEnded) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    source.on("end", resolve);
    source.on("error", resolve);
    source.on("close", resolve);
  });
}

async function writeSessionBytes(externalId, actorId, partNumber, source) {
  const opened = await withTransaction(async (client) => {
    const session = await repository.lockSession(client, externalId);
    if (!session || session.uploader_user_id !== actorId) {
      return fail(404, "Upload session not found", "not_found");
    }
    if (session.expires_at <= new Date()) {
      return fail(409, "Session is expired", "session_expired");
    }
    if (session.state === "sealed" || session.state === "expired" || session.state === "aborted") {
      return fail(409, "Session is closed", "session_closed");
    }
    if (partNumber === null && session.method !== "server_stream") {
      return fail(409, "This session uses direct multipart upload", "method_mismatch");
    }
    if (partNumber !== null && session.method !== "direct_multipart") {
      return fail(409, "This session uses server-mediated upload", "method_mismatch");
    }
    const number = partNumber === null ? 1 : partNumber;
    const already = await storage.reservedPartBytes(session.staging_key, number);
    const declared = BigInt(session.declared_size_bytes);
    if (already >= declared) {
      return fail(413, "File exceeds the purpose byte limit", "purpose_byte_limit");
    }
    const budget = declared - already;
    storage.claimPartBudget(session.staging_key, number, budget);
    await repository.markUploading(client, session.id, session.asset_id);
    return {
      status: 200,
      body: {
        key: session.staging_key,
        partNumber: number,
        budget,
      },
      commit: true,
    };
  });
  if (opened.status !== 200 || !opened.body.key) {
    await discardStream(source);
    return opened;
  }
  const written = await storage.writePart(opened.body.key, opened.body.partNumber, source, opened.body.budget);
  if (!written.ok) {
    if (!written.consumed) {
      await discardStream(source);
    }
    const status = written.code === "part_number" ? 422 : written.code === "direct_upload_required" ? 409 : 413;
    return { status, body: { error: written.error, code: written.code } };
  }
  return { status: 200, body: { part_number: opened.body.partNumber, size_bytes: written.size.toString() } };
}

async function completeUploadSession(externalId, body, actorId, idempotencyKey) {
  const unknown = unknownField(body ?? {}, COMPLETE_FIELDS);
  if (unknown) {
    return { status: 400, body: { error: unknown } };
  }
  const key = validateIdempotencyKey(idempotencyKey);
  if (!key.ok) {
    return { status: 400, body: { error: key.error } };
  }
  const clientChecksum = body && body.client_checksum;
  if (clientChecksum !== undefined && (typeof clientChecksum !== "string" || !/^[0-9a-f]{64}$/.test(clientChecksum))) {
    return { status: 400, body: { error: "client_checksum must be a sha256 hex digest" } };
  }

  return withTransaction(async (client) => {
    const session = await repository.lockSession(client, externalId);
    if (!session || session.uploader_user_id !== actorId) {
      return fail(404, "Upload session not found", "not_found");
    }
    const request = { client_checksum: clientChecksum ?? null };
    if (session.state !== "sealed" && !await storage.assemblyReady(session.staging_key)) {
      return fail(422, "Upload is incomplete", "upload_incomplete");
    }
    const outcome = await executeIdempotent(client, {
      actorType: "user",
      actorId,
      operation: "asset.complete_upload_session",
      resourceRef: session.id,
      key: key.key,
      request,
    }, async () => {
      if (session.expires_at <= new Date() && session.state !== "sealed") {
        return { status: 409, body: { error: "Session is expired", code: "session_expired" } };
      }
      if (session.state === "sealed") {
        const view = await repository.publicSession(client, session.id);
        return { status: 200, body: { upload_session: sessionView(view) } };
      }
      const relationship = await liveUploadDecision(client, session, actorId);
      if (!relationship.allowed) {
        return { status: relationship.status, body: { error: relationship.error, code: "binding_stale" } };
      }
      const assembled = await storage.completeMultipart(session.staging_key);
      if (!assembled.ok) {
        return { status: 422, body: { error: assembled.error, code: assembled.code } };
      }
      const policy = limits.purposePolicy(session.purpose);
      if (limits.exceedsByteLimit(assembled.size, session.max_size_bytes) || limits.exceedsByteLimit(assembled.size, session.declared_size_bytes)) {
        await persistOutcome(client, session, actorId, {
          state: "rejected",
          observedSize: assembled.size,
          checksum: assembled.checksum,
          detectedMime: "application/octet-stream",
          scanStatus: "pending",
          quarantineReason: null,
          reason: "purpose_byte_limit",
          width: null,
          height: null,
        });
        const view = await repository.publicSession(client, session.id);
        return { status: 413, body: { error: "File exceeds the purpose byte limit", code: "purpose_byte_limit", upload_session: sessionView(view) } };
      }
      if (clientChecksum && clientChecksum !== assembled.checksum) {
        await persistOutcome(client, session, actorId, {
          state: "rejected",
          observedSize: assembled.size,
          checksum: assembled.checksum,
          detectedMime: "application/octet-stream",
          scanStatus: "pending",
          quarantineReason: null,
          reason: "checksum_mismatch",
          width: null,
          height: null,
        });
        const view = await repository.publicSession(client, session.id);
        return { status: 422, body: { error: "Checksum does not match the stored bytes", code: "checksum_mismatch", upload_session: sessionView(view) } };
      }
      const prefix = await storage.readPrefix(session.staging_key, 65536);
      const inspected = assessObjectPrefix(prefix, { allowArchive: session.purpose === "daw_project_archive" });
      const profileImage = session.purpose === "profile_avatar" || session.purpose === "profile_cover";
      const mediaPurpose = session.purpose === "audio_preview_reference"
        || session.purpose === "final_audio_deliverable"
        || session.purpose === "stem_or_individual_track"
        || session.purpose === "video_reference_media";
      if (inspected.ok && mediaPurpose && !inspected.opaqueArchive && inspected.mime === "application/octet-stream") {
        inspected.ok = false;
        inspected.code = "unrecognized_media";
        inspected.error = "File type could not be verified";
      }
      if (inspected.ok && profileImage && (inspected.mime !== "image/png" && inspected.mime !== "image/jpeg" || !inspected.width || !inspected.height)) {
        inspected.ok = false;
        inspected.code = "unverified_image_dimensions";
        inspected.error = "Image dimensions could not be verified";
      }
      if (!inspected.ok) {
        await persistOutcome(client, session, actorId, {
          state: "rejected",
          observedSize: assembled.size,
          checksum: assembled.checksum,
          detectedMime: inspected.mime || "application/octet-stream",
          scanStatus: "pending",
          quarantineReason: null,
          reason: inspected.code,
          width: null,
          height: null,
        });
        const view = await repository.publicSession(client, session.id);
        const status = inspected.code === "pixel_limit" || inspected.code === "unverified_image_dimensions" ? 422 : 415;
        return { status, body: { error: inspected.error, code: inspected.code, upload_session: sessionView(view) } };
      }
      const assetRow = await clientQueryAsset(client, session.asset_id);
      if (!mimeAgrees(inspected.mime, assetRow.declared_mime_type, assetRow.file_extension) && inspected.mime.startsWith("image/")) {
        await persistOutcome(client, session, actorId, {
          state: "rejected",
          observedSize: assembled.size,
          checksum: assembled.checksum,
          detectedMime: inspected.mime,
          scanStatus: "pending",
          quarantineReason: null,
          reason: "mime_mismatch",
          width: inspected.width ?? null,
          height: inspected.height ?? null,
        });
        const view = await repository.publicSession(client, session.id);
        return { status: 415, body: { error: "Detected type does not match the declaration", code: "mime_mismatch", upload_session: sessionView(view) } };
      }
      let scan;
      try {
        scan = await scanObject();
      } catch {
        scan = { status: "failed", engine: "mock-scanner", signatureVersion: "mvp-010" };
      }
      if (!scan || scan.status !== "clean") {
        await persistOutcome(client, session, actorId, {
          state: "quarantined",
          observedSize: assembled.size,
          checksum: assembled.checksum,
          detectedMime: inspected.mime,
          scanStatus: scan && scan.status === "suspicious" ? "suspicious" : "failed",
          quarantineReason: scan && scan.status === "suspicious" ? "malware_suspicious" : "scan_unavailable",
          reason: scan && scan.status === "suspicious" ? "malware_suspicious" : "scan_unavailable",
          width: inspected.width ?? null,
          height: inspected.height ?? null,
        });
        const view = await repository.publicSession(client, session.id);
        return { status: 200, body: { upload_session: sessionView(view) } };
      }
      await persistOutcome(client, session, actorId, {
        state: "ready",
        observedSize: assembled.size,
        checksum: assembled.checksum,
        detectedMime: inspected.mime,
        scanStatus: "clean",
        quarantineReason: null,
        reason: null,
        width: inspected.width ?? null,
        height: inspected.height ?? null,
      });
      await repository.insertStorageObject(client, {
        assetId: session.asset_id,
        objectRole: "primary",
        provider: assembled.provider,
        bucket: assembled.bucket,
        key: assembled.key,
        generation: `${assembled.generation}-final`,
        classification: "private_original",
        sizeBytes: assembled.size,
        checksum: assembled.checksum,
      });
      const derived = await derivativeProcessor({
        purpose: session.purpose,
        mime: inspected.mime,
        checksum: assembled.checksum,
      });
      if (derived && derived.bytes) {
        await storeDerivative(client, session, actorId, derived);
      }
      const view = await repository.publicSession(client, session.id);
      return { status: 200, body: { upload_session: sessionView(view) } };
    });
    return {
      status: outcome.status,
      body: outcome.body,
      commit: outcome.status < 500,
    };
  });
}

async function liveUploadDecision(client, session, actorId) {
  if (session.binding_type === "profile") {
    const profile = await repository.findProfileForUser(client, actorId);
    if (!profile || profile.id !== session.profile_id) {
      return { allowed: false, status: 404, error: "Profile not found" };
    }
    return authorize({ id: actorId }, ASSET_UPLOAD, {
      binding: "profile",
      profileId: profile.id,
      profileUserId: profile.user_id,
    });
  }
  const project = await repository.lockProjectById(client, session.project_id);
  return authorize({ id: actorId }, ASSET_UPLOAD, project && {
    binding: "project",
    projectId: project.id,
    buyerUserId: project.buyer_user_id,
    activeSellerUserId: project.active_seller_user_id,
  });
}

async function clientQueryAsset(client, assetId) {
  const result = await client.query(
    `SELECT declared_mime_type, file_extension FROM assets WHERE id = $1`,
    [assetId]
  );
  return result.rows[0];
}

async function persistOutcome(client, session, actorId, outcome) {
  await repository.sealSession(client, {
    sessionId: session.id,
    assetId: session.asset_id,
    state: outcome.state,
    observedSize: outcome.observedSize,
    checksumAlgorithm: "sha256",
    checksum: outcome.checksum,
    detectedMime: outcome.detectedMime,
    width: outcome.width,
    height: outcome.height,
    scanStatus: outcome.scanStatus,
    quarantineReason: outcome.quarantineReason,
  });
  await repository.insertAudit(client, {
    eventType: "AUD-ASSET-001",
    assetId: session.asset_id,
    sessionId: session.id,
    actorType: "user",
    actorId,
    action: outcome.state === "ready" ? "asset.ready" : "asset.validation",
    outcome: outcome.state,
    reasonCode: outcome.reason,
    policyVersion: limits.POLICY_VERSION,
  });
  const eventType = outcome.state === "ready"
    ? "AssetReady"
    : outcome.state === "quarantined"
      ? "AssetQuarantined"
      : "AssetRejected";
  await enqueueOutboxMessage(client, {
    eventType,
    aggregateType: "asset",
    aggregateId: session.asset_external_id,
    aggregateVersion: session.row_version + 1,
    payload: {
      state: outcome.state,
      purpose: session.purpose,
      size_bytes: outcome.observedSize.toString(),
      reason: outcome.reason,
    },
  });
}

async function storeDerivative(client, session, actorId, derived) {
  const child = await repository.insertOriginalAsset(client, {
    externalId: repository.newExternalId("ast"),
    ownerUserId: actorId,
    purpose: session.purpose,
    originalFilename: "derivative",
    normalizedFilename: "derivative",
    declaredMimeType: derived.mime || "application/octet-stream",
    fileExtension: null,
  });
  await client.query(
    `INSERT INTO asset_variants (
       derived_asset_id, parent_asset_id, variant_type, recipe_name, recipe_version, parameters_hash
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      child.id,
      session.asset_id,
      derived.variantType,
      derived.recipeName,
      derived.recipeVersion,
      derived.parametersHash,
    ]
  );
  await client.query(
    `UPDATE assets
     SET state = 'ready', size_bytes = $2, checksum_algorithm = 'sha256', checksum = $3,
         detected_mime_type = $4, malware_scan_status = 'clean', ready_at = clock_timestamp(),
         updated_at = clock_timestamp(), row_version = row_version + 1
     WHERE id = $1`,
    [child.id, String(derived.bytes.length), derived.checksum, derived.mime || "application/octet-stream"]
  );
}

async function grantPartUpload(externalId, actorId, partNumber) {
  if (!Number.isInteger(partNumber) || partNumber < 1) {
    return fail(400, "part number must be an integer", "part_number");
  }
  return withTransaction(async (client) => {
    const session = await repository.lockSession(client, externalId);
    if (!session || session.uploader_user_id !== actorId) {
      return fail(404, "Upload session not found", "not_found");
    }
    if (session.expires_at <= new Date()) {
      return fail(409, "Session is expired", "session_expired");
    }
    if (session.state === "sealed" || session.state === "expired" || session.state === "aborted") {
      return fail(409, "Session is closed", "session_closed");
    }
    if (session.method !== "direct_multipart") {
      return fail(409, "This session uses server-mediated upload", "method_mismatch");
    }
    if (session.storage_provider !== "cloudflare-r2") {
      return fail(409, "This session accepts part bytes on the upload route", "server_mediated");
    }
    let grant;
    try {
      const remainingSeconds = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
      if (remainingSeconds < 1) {
        return fail(409, "Session is expired", "session_expired");
      }
      grant = storage.presignPart({
        key: session.staging_key,
        uploadId: session.object_generation,
        partNumber,
        expiresSeconds: remainingSeconds,
      });
    } catch (error) {
      if (error.code === "storage_unconfigured") {
        return fail(503, "Asset storage is not configured", "storage_unconfigured");
      }
      throw error;
    }
    return {
      status: 200,
      body: {
        part_number: partNumber,
        upload: { method: grant.method, url: grant.url, expires_in: grant.expires_in },
      },
      commit: true,
    };
  });
}

async function readUploadSession(externalId, actorId) {
  return withTransaction(async (client) => {
    const session = await repository.lockSession(client, externalId);
    if (!session || session.uploader_user_id !== actorId) {
      return fail(404, "Upload session not found", "not_found");
    }
    const view = await repository.publicSession(client, session.id);
    return { status: 200, body: { upload_session: sessionView(view) }, commit: true };
  });
}

module.exports = {
  createUploadSession,
  writeSessionBytes,
  grantPartUpload,
  completeUploadSession,
  readUploadSession,
  setDerivativeProcessorForTests,
  configuredTtlSeconds,
};
