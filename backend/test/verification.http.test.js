const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const pool = require("../db/db");
const local = require("../src/assets/local-storage");
const roles = require("../src/roles/service");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");

let baseUrl = "";
let server;
let storageDir;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function request(method, requestPath, { token, body, raw = false } = {}) {
  const headers = {};
  if (!raw) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");
  let json = null;
  if (!raw && text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text, buffer, headers: response.headers };
}

async function signupAndLogin(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: {
      email,
      password: "password-1",
      handle: `${tag}-handle`,
      first_name: "Ada",
      last_name: "Lovelace",
      artist_name: `${tag} Artist`,
      display_name: `${tag} Display`,
      genres: ["classical"],
      city: "Chennai",
      country: "IN",
    },
  });
  assert.equal(created.status, 201, created.text);
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token, email };
}

async function readyImage(userId, bytes) {
  const reserved = local.reserveObject();
  const written = await local.writePart(reserved.key, 1, Readable.from(bytes), 20000000);
  assert.equal(written.ok, true, written.error || written.code || "write failed");
  const completed = local.completeMultipart(reserved.key);
  assert.equal(completed.ok, true, completed.error || completed.code || "complete failed");
  const externalId = `ast_${crypto.randomBytes(10).toString("hex")}`;
  const asset = await pool.query(
    `INSERT INTO assets (
       external_id, owner_user_id, purpose, visibility, state,
       original_filename, normalized_filename, detected_mime_type, file_extension,
       size_bytes, checksum_algorithm, checksum, uploaded_by_user_id,
       malware_scan_status, ready_at
     ) VALUES (
       $1, $2, 'profile_avatar', 'relationship_restricted', 'ready',
       'id.png', 'id.png', 'image/png', 'png',
       $3, 'sha256', $4, $2,
       'clean', clock_timestamp()
     )
     RETURNING id, external_id`,
    [externalId, userId, bytes.length, completed.checksum]
  );
  await pool.query(
    `INSERT INTO asset_storage_objects (
       external_id, asset_id, object_role, storage_provider, storage_bucket,
       storage_key, object_generation, classification, size_bytes, checksum
     ) VALUES ($1, $2, 'primary', $3, $4, $5, $6, 'private_original', $7, $8)`,
    [
      `aso_${crypto.randomBytes(10).toString("hex")}`,
      asset.rows[0].id,
      reserved.provider,
      reserved.bucket,
      reserved.key,
      reserved.generation,
      bytes.length,
      completed.checksum,
    ]
  );
  return asset.rows[0];
}

function submission(assetExternalId, slot = "front") {
  const side = slot === "selfie" ? "selfie" : slot;
  const docType = slot === "selfie" ? "selfie" : "government_id";
  return {
    documents: [
      {
        doc_type: docType,
        doc_side: side,
        country: "IN",
        id_type: docType === "selfie" ? undefined : "passport",
        asset_external_id: assetExternalId,
      },
    ],
  };
}

async function grantRole(userId, roleName, grantedBy) {
  const role = await pool.query("SELECT id FROM platform_roles WHERE name = $1", [roleName]);
  await pool.query(
    `INSERT INTO role_assignments (
       external_id, user_id, role_id, state, grant_source, granted_by
     ) VALUES ($1, $2, $3, 'active', 'administrator', $4)`,
    [`ras_${crypto.randomBytes(10).toString("hex")}`, userId, role.rows[0].id, grantedBy]
  );
}

describe("MVP-012 identity verification routes", { concurrency: 1, timeout: 30000 }, () => {
  let owner;
  let administrator;
  let outsider;
  let image;

  before(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "musicapp-verify-"));
    process.env.ASSET_LOCAL_STORAGE_ROOT = storageDir;
    process.env.VERIFICATION_ACCESS_TTL_SECONDS = "120";
    process.env.ASSET_STORAGE_PROVIDER = "local";
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
    owner = await signupAndLogin(nextId("owner"));
    administrator = await signupAndLogin(nextId("admin"));
    outsider = await signupAndLogin(nextId("outsider"));
    const boot = await roles.bootstrapFirstAdministrator(administrator.userId);
    assert.equal(boot.status, 201, JSON.stringify(boot.body));
    image = Buffer.from("verification-document-bytes");
  });

  after(async () => {
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      fs.rmSync(storageDir, { recursive: true, force: true });
      await stopPool();
    }
  });

  it("reaches approved only through an Administrator, with an audit row", async () => {
    const asset = await readyImage(owner.userId, image);
    const submitted = await request("POST", "/verifications", {
      token: owner.token,
      body: submission(asset.external_id),
    });
    assert.equal(submitted.status, 201, submitted.text);
    assert.equal(submitted.json.verification.status, "submitted");
    assert.equal(submitted.json.verification.reviewed_by, null);
    const verificationId = submitted.json.verification.external_id;
    const documentId = submitted.json.verification.documents[0].external_id;

    const ownerDecision = await request("POST", `/verifications/${verificationId}/decision`, {
      token: owner.token,
      body: { decision: "approved", reason: "owner" },
    });
    assert.equal(ownerDecision.status, 403, ownerDecision.text);
    const outsiderDecision = await request("POST", `/verifications/${verificationId}/decision`, {
      token: outsider.token,
      body: { decision: "approved", reason: "outsider" },
    });
    assert.equal(outsiderDecision.status, 403, outsiderDecision.text);

    const moderator = await signupAndLogin(nextId("mod"));
    await grantRole(moderator.userId, "moderator", administrator.userId);
    const moderatorDecision = await request("POST", `/verifications/${verificationId}/decision`, {
      token: moderator.token,
      body: { decision: "approved", reason: "moderator" },
    });
    assert.equal(moderatorDecision.status, 403, moderatorDecision.text);

    const stillSubmitted = await request("GET", `/verifications/${verificationId}`, { token: owner.token });
    assert.equal(stillSubmitted.status, 200, stillSubmitted.text);
    assert.equal(stillSubmitted.json.verification.status, "submitted");

    const missing = await request("POST", `/verifications/${verificationId}/decision`, {
      token: administrator.token,
      body: { decision: "rejected" },
    });
    assert.equal(missing.status, 400, missing.text);

    const approved = await request("POST", `/verifications/${verificationId}/decision`, {
      token: administrator.token,
      body: { decision: "approved", reason: "documents match" },
    });
    assert.equal(approved.status, 200, approved.text);
    assert.equal(approved.json.verification.status, "approved");
    assert.equal(approved.json.verification.reviewed_by, administrator.userId);
    assert.equal(approved.json.verification.documents[0].status, "approved");

    const repeat = await request("POST", `/verifications/${verificationId}/decision`, {
      token: administrator.token,
      body: { decision: "rejected", reason: "too late" },
    });
    assert.equal(repeat.status, 409, repeat.text);

    const audit = await pool.query(
      `SELECT event_type, actor_user_id, prior_status, new_status, reason
       FROM verification_audit_events event
       JOIN profile_verifications verification ON verification.id = event.verification_id
       WHERE verification.external_id = $1
       ORDER BY event.created_at ASC`,
      [verificationId]
    );
    assert.deepEqual(
      audit.rows.map((row) => row.new_status),
      ["submitted", "approved"]
    );
    assert.equal(audit.rows[1].event_type, "AUD-IDENTITY-001");
    assert.equal(audit.rows[1].actor_user_id, administrator.userId);
    assert.equal(audit.rows[1].prior_status, "submitted");
    assert.equal(audit.rows[1].reason, "documents match");

    const hidden = await request("GET", `/verifications/${verificationId}`, { token: outsider.token });
    assert.equal(hidden.status, 404, hidden.text);
    const queueDenied = await request("GET", "/verifications", { token: owner.token });
    assert.equal(queueDenied.status, 403, queueDenied.text);

    const unauthenticated = await request("POST", `/verifications/${verificationId}/decision`, {
      body: { decision: "rejected", reason: "no" },
    });
    assert.equal(unauthenticated.status, 401, unauthenticated.text);

    const accessDenied = await request(
      "POST",
      `/verifications/${verificationId}/documents/${documentId}/access`,
      { token: outsider.token }
    );
    assert.equal(accessDenied.status, 404, accessDenied.text);
    const access = await request(
      "POST",
      `/verifications/${verificationId}/documents/${documentId}/access`,
      { token: owner.token }
    );
    assert.equal(access.status, 201, access.text);
    assert.match(access.json.access.path, /^\/verifications\/access\/[0-9a-f]{64}$/);
    const downloaded = await request("GET", access.json.access.path, { token: owner.token, raw: true });
    assert.equal(downloaded.status, 200, downloaded.text);
    assert.equal(downloaded.headers.get("content-type"), "image/png");
    assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(downloaded.buffer, image);
    const replay = await request("GET", access.json.access.path, { token: owner.token, raw: true });
    assert.equal(replay.status, 404, replay.text);
    const accessAudit = await pool.query(
      `SELECT event_type, actor_user_id
       FROM verification_audit_events event
       JOIN verification_documents document ON document.id = event.document_id
       WHERE document.external_id = $1 AND event.event_type = 'AUD-IDENTITY-003'`,
      [documentId]
    );
    assert.equal(accessAudit.rowCount, 1);
    assert.equal(accessAudit.rows[0].actor_user_id, owner.userId);
  });

  it("reaches rejected only through an Administrator and keeps the prior attempt", async () => {
    const subject = await signupAndLogin(nextId("reject"));
    const asset = await readyImage(subject.userId, Buffer.from("second-document"));
    const submitted = await request("POST", "/verifications", {
      token: subject.token,
      body: submission(asset.external_id, "back"),
    });
    assert.equal(submitted.status, 201, submitted.text);
    const verificationId = submitted.json.verification.external_id;
    const openAgain = await request("POST", "/verifications", {
      token: subject.token,
      body: submission(asset.external_id, "back"),
    });
    assert.equal(openAgain.status, 409, openAgain.text);

    const rejected = await request("POST", `/verifications/${verificationId}/decision`, {
      token: administrator.token,
      body: { decision: "rejected", reason: "unreadable" },
    });
    assert.equal(rejected.status, 200, rejected.text);
    assert.equal(rejected.json.verification.status, "rejected");
    assert.equal(rejected.json.verification.reviewed_by, administrator.userId);
    assert.equal(rejected.json.verification.review_notes, "unreadable");
    assert.equal(rejected.json.verification.documents[0].status, "rejected");

    const replacementAsset = await readyImage(subject.userId, Buffer.from("replacement"));
    const resubmitted = await request("POST", "/verifications", {
      token: subject.token,
      body: submission(replacementAsset.external_id, "front"),
    });
    assert.equal(resubmitted.status, 201, resubmitted.text);
    assert.notEqual(resubmitted.json.verification.external_id, verificationId);
    assert.equal(resubmitted.json.verification.status, "submitted");
    const preserved = await pool.query(
      `SELECT status, is_current FROM profile_verifications WHERE external_id = $1`,
      [verificationId]
    );
    assert.equal(preserved.rows[0].status, "rejected");
    assert.equal(preserved.rows[0].is_current, false);

    const approvedBlock = await request("POST", "/verifications", {
      token: owner.token,
      body: submission((await readyImage(owner.userId, Buffer.from("again"))).external_id, "selfie"),
    });
    assert.equal(approvedBlock.status, 409, approvedBlock.text);
  });

  it("denies an inactive account and a client-supplied owner", async () => {
    const suspended = await signupAndLogin(nextId("suspended"));
    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [suspended.userId]);
    const denied = await request("POST", "/verifications", {
      token: suspended.token,
      body: { documents: [] },
    });
    assert.equal(denied.status, 401, denied.text);

    const asset = await readyImage(outsider.userId, Buffer.from("outsider-doc"));
    const supplied = await request("POST", "/verifications", {
      token: outsider.token,
      body: { user_id: owner.userId, ...submission(asset.external_id) },
    });
    assert.equal(supplied.status, 400, supplied.text);

    const foreign = await request("POST", "/verifications", {
      token: outsider.token,
      body: submission((await readyImage(owner.userId, Buffer.from("not-yours"))).external_id),
    });
    assert.equal(foreign.status, 404, foreign.text);

    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [administrator.userId]);
    const adminDenied = await request("GET", "/verifications", { token: administrator.token });
    assert.equal(adminDenied.status, 401, adminDenied.text);
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [administrator.userId]);
  });

  it("lists only submitted attempts for an Administrator and refuses an unconfigured access lifetime", async () => {
    const queued = await request("GET", "/verifications?limit=1&offset=0", { token: administrator.token });
    assert.equal(queued.status, 200, queued.text);
    assert.equal(queued.json.verifications.length, 1);
    assert.equal(queued.json.verifications[0].status, "submitted");
    assert.equal(queued.json.limit, 1);

    const documentId = queued.json.verifications[0].documents[0].external_id;
    const verificationId = queued.json.verifications[0].external_id;
    const previous = process.env.VERIFICATION_ACCESS_TTL_SECONDS;
    delete process.env.VERIFICATION_ACCESS_TTL_SECONDS;
    const unconfigured = await request(
      "POST",
      `/verifications/${verificationId}/documents/${documentId}/access`,
      { token: administrator.token }
    );
    process.env.VERIFICATION_ACCESS_TTL_SECONDS = previous;
    assert.equal(unconfigured.status, 503, unconfigured.text);

    const adminAccess = await request(
      "POST",
      `/verifications/${verificationId}/documents/${documentId}/access`,
      { token: administrator.token }
    );
    assert.equal(adminAccess.status, 201, adminAccess.text);
    const stolen = await request("GET", adminAccess.json.access.path, { token: outsider.token, raw: true });
    assert.equal(stolen.status, 404, stolen.text);
  });

  it("refuses a document-access grant after it expires", async () => {
    const subject = await signupAndLogin(nextId("expired-grant"));
    const asset = await readyImage(subject.userId, Buffer.from("expired-grant-bytes"));
    const submitted = await request("POST", "/verifications", {
      token: subject.token,
      body: submission(asset.external_id, "front"),
    });
    assert.equal(submitted.status, 201, submitted.text);
    const verificationId = submitted.json.verification.external_id;
    const documentId = submitted.json.verification.documents[0].external_id;
    const previous = process.env.VERIFICATION_ACCESS_TTL_SECONDS;
    process.env.VERIFICATION_ACCESS_TTL_SECONDS = "1";
    const access = await request(
      "POST",
      `/verifications/${verificationId}/documents/${documentId}/access`,
      { token: subject.token }
    );
    process.env.VERIFICATION_ACCESS_TTL_SECONDS = previous;
    assert.equal(access.status, 201, access.text);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const expired = await request("GET", access.json.access.path, { token: subject.token, raw: true });
    assert.equal(expired.status, 404, expired.text);
    const token = access.json.access.path.split("/").pop();
    const grant = await pool.query(
      `SELECT used_at FROM verification_access_grants WHERE token_hash = $1`,
      [crypto.createHash("sha256").update(token).digest("hex")]
    );
    assert.equal(grant.rowCount, 1);
    assert.equal(grant.rows[0].used_at, null);
    const audit = await pool.query(
      `SELECT event.id
       FROM verification_audit_events event
       JOIN verification_documents document ON document.id = event.document_id
       WHERE document.external_id = $1 AND event.event_type = 'AUD-IDENTITY-003'`,
      [documentId]
    );
    assert.equal(audit.rowCount, 0);
  });
});
