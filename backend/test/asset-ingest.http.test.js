const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { withMilestoneTerms } = require("./milestone-fixture");
const { setScannerForTests } = require("../src/assets/scanner");
const { setDerivativeProcessorForTests } = require("../src/assets/service");
const { crc32 } = require("../src/assets/content-inspect");
const { PROJECT_QUOTA_BYTES, PURPOSES } = require("../src/assets/limits");

let baseUrl = "";
let server;
let sequence = 0;
let storageDir = "";

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function futureIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function request(method, requestPath, { token, body, idempotencyKey, raw } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (idempotencyKey) {
    headers["idempotency-key"] = idempotencyKey;
  }
  let payload;
  if (raw !== undefined) {
    headers["content-type"] = "application/octet-stream";
    payload = raw;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text };
}

function profileInput(tag) {
  return {
    handle: `${tag}-handle`,
    first_name: "Ada",
    last_name: "Lovelace",
    artist_name: `${tag} Artist`,
    display_name: `${tag} Display`,
    genres: ["classical"],
    city: "Chennai",
    country: "IN",
  };
}

async function signupAndLogin(tag) {
  const email = `${tag}@example.com`;
  const created = await request("POST", "/auth/signup", {
    body: { email, password: "password-1", ...profileInput(tag) },
  });
  assert.equal(created.status, 201, created.text);
  const loggedIn = await request("POST", "/auth/login", {
    body: { email, password: "password-1" },
  });
  assert.equal(loggedIn.status, 200, loggedIn.text);
  return { userId: created.json.user.id, token: loggedIn.json.token };
}

async function createProject() {
  const buyer = await signupAndLogin(nextId("buyer"));
  const seller = await signupAndLogin(nextId("seller"));
  const created = await request("POST", "/projects", {
    token: buyer.token,
    body: {
      seller_user_id: seller.userId,
      title: "Stems",
      requirements: "Files",
      price_amount: 100000,
      delivery_days: 7,
      milestones: [withMilestoneTerms({ title: "Mix", amount: 100000, due_at: futureIso(30) })],
    },
  });
  assert.equal(created.status, 201, created.text);
  return { buyer, seller, project: created.json.project };
}

function pngHeader(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  const typeAndData = Buffer.concat([Buffer.from("IHDR"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  return Buffer.concat([signature, length, typeAndData, crc]);
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openSession(token, body, key = nextId("session")) {
  return request("POST", "/asset-upload-sessions", {
    token,
    idempotencyKey: key,
    body,
  });
}

describe("asset ingest", () => {
  before(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "musicapp-assets-"));
    process.env.ASSET_LOCAL_STORAGE_ROOT = storageDir;
    process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS = "3600";
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    setScannerForTests(null);
    setDerivativeProcessorForTests(null);
    delete process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS;
    if (server) {
      await closeServer(server);
    }
    await stopPool();
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("requires authentication and the server-configured session duration", async () => {
    const missing = await request("POST", "/asset-upload-sessions", {
      idempotencyKey: nextId("noauth"),
      body: { purpose: "profile_avatar" },
    });
    assert.equal(missing.status, 401);
    const previous = process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS;
    delete process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS;
    const user = await signupAndLogin(nextId("ttl"));
    const unconfigured = await openSession(user.token, {
      purpose: "profile_avatar",
      declared_size_bytes: 10,
      filename: "a.png",
      declared_mime_type: "image/png",
    });
    process.env.ASSET_UPLOAD_SESSION_TTL_SECONDS = previous;
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.json.code, "session_ttl_unconfigured");
  });

  it("accepts a declared size at each purpose maximum and rejects one byte over", async () => {
    const { buyer, project } = await createProject();
    const user = await signupAndLogin(nextId("limits"));
    const cases = [
      ["profile_avatar", null, user.token],
      ["profile_cover", null, user.token],
      ["audio_preview_reference", project.external_id, buyer.token],
      ["final_audio_deliverable", project.external_id, buyer.token],
      ["stem_or_individual_track", project.external_id, buyer.token],
      ["video_reference_media", project.external_id, buyer.token],
      ["daw_project_archive", project.external_id, buyer.token],
      ["other_project_file", project.external_id, buyer.token],
    ];
    for (const [purpose, projectId, token] of cases) {
      const max = PURPOSES[purpose].maxBytes;
      const atLimit = await openSession(token, {
        purpose,
        declared_size_bytes: max.toString(),
        filename: purpose === "profile_avatar" || purpose === "profile_cover" ? "cover.png" : "take.bin",
        declared_mime_type: purpose.startsWith("profile") ? "image/png" : "application/octet-stream",
        ...(projectId ? { project_id: projectId } : {}),
      });
      assert.equal(atLimit.status, 201, `${purpose} ${atLimit.text}`);
      assert.equal(atLimit.json.upload_session.max_size_bytes, max.toString());
      assert.equal(atLimit.json.upload_session.declared_size_bytes, max.toString());
      const over = await openSession(token, {
        purpose,
        declared_size_bytes: (max + 1n).toString(),
        filename: "over.bin",
        declared_mime_type: "application/octet-stream",
        ...(projectId ? { project_id: projectId } : {}),
      });
      assert.equal(over.status, 413, purpose);
      assert.equal(over.json.code, "purpose_byte_limit");
    }
  });

  it("keeps the project quota at exactly 50 GB", async () => {
    const { buyer, seller, project } = await createProject();
    const outsider = await signupAndLogin(nextId("outsider"));
    const denied = await openSession(outsider.token, {
      purpose: "other_project_file",
      declared_size_bytes: 1,
      filename: "nope.bin",
      declared_mime_type: "application/octet-stream",
      project_id: project.external_id,
    });
    assert.equal(denied.status, 404);
    const namedSeller = await openSession(seller.token, {
      purpose: "other_project_file",
      declared_size_bytes: 1,
      filename: "early.bin",
      declared_mime_type: "application/octet-stream",
      project_id: project.external_id,
    });
    assert.equal(namedSeller.status, 404);

    const slice = PURPOSES.daw_project_archive.maxBytes;
    assert.equal(slice * 5n, PROJECT_QUOTA_BYTES);
    for (let index = 0; index < 5; index += 1) {
      const opened = await openSession(buyer.token, {
        purpose: "daw_project_archive",
        declared_size_bytes: slice.toString(),
        filename: `session-${index}.zip`,
        declared_mime_type: "application/octet-stream",
        project_id: project.external_id,
      });
      assert.equal(opened.status, 201, opened.text);
    }
    const overQuota = await openSession(buyer.token, {
      purpose: "other_project_file",
      declared_size_bytes: 1,
      filename: "one-more.bin",
      declared_mime_type: "application/octet-stream",
      project_id: project.external_id,
    });
    assert.equal(overQuota.status, 429);
    assert.equal(overQuota.json.code, "project_quota");
  });

  it("makes a scanned file Ready and does not apply a duration ceiling", async () => {
    const { buyer, project } = await createProject();
    const bytes = Buffer.from("lyrics and chords\n");
    const opened = await openSession(buyer.token, {
      purpose: "other_project_file",
      declared_size_bytes: bytes.length,
      filename: "lyrics.txt",
      declared_mime_type: "text/plain",
      project_id: project.external_id,
    });
    assert.equal(opened.status, 201, opened.text);
    assert.equal(opened.json.upload_session.method, "direct_multipart");
    const sessionId = opened.json.upload_session.external_id;
    const wrongMethod = await request("PUT", `/asset-upload-sessions/${sessionId}/content`, {
      token: buyer.token,
      raw: bytes,
    });
    assert.equal(wrongMethod.status, 409);
    const part = await request("PUT", `/asset-upload-sessions/${sessionId}/parts/1`, {
      token: buyer.token,
      raw: bytes,
    });
    assert.equal(part.status, 200, part.text);
    const extra = await request("PUT", `/asset-upload-sessions/${sessionId}/parts/1`, {
      token: buyer.token,
      raw: Buffer.concat([bytes, Buffer.from("x")]),
    });
    assert.equal(extra.status, 413);
    const replayPart = await request("PUT", `/asset-upload-sessions/${sessionId}/parts/1`, {
      token: buyer.token,
      raw: bytes,
    });
    assert.equal(replayPart.status, 200, replayPart.text);
    const completed = await request("POST", `/asset-upload-sessions/${sessionId}/complete`, {
      token: buyer.token,
      idempotencyKey: nextId("complete"),
      body: {},
    });
    assert.equal(completed.status, 200, completed.text);
    assert.equal(completed.json.upload_session.asset_state, "ready");
    assert.equal(completed.json.upload_session.size_bytes, String(bytes.length));
    assert.equal(completed.json.upload_session.malware_scan_status, "clean");
    const stored = await pool.query(
      `SELECT duration_ms, state, size_bytes::text AS size_bytes
       FROM assets WHERE external_id = $1`,
      [completed.json.upload_session.asset_external_id]
    );
    assert.equal(stored.rows[0].state, "ready");
    assert.equal(stored.rows[0].duration_ms, null);
    assert.equal(stored.rows[0].size_bytes, String(bytes.length));
    const outsider = await signupAndLogin(nextId("reader"));
    const hidden = await request("GET", `/asset-upload-sessions/${sessionId}`, { token: outsider.token });
    assert.equal(hidden.status, 404);
  });

  it("rejects an image over 25000000 pixels and accepts the exact boundary", async () => {
    const user = await signupAndLogin(nextId("pixels"));
    const atLimit = pngHeader(5000, 5000);
    const over = pngHeader(5000, 5001);
    assert.equal(5000 * 5000, 25000000);
    assert.equal(5000 * 5001, 25005000);
    const opened = await openSession(user.token, {
      purpose: "profile_avatar",
      declared_size_bytes: atLimit.length,
      filename: "exact.png",
      declared_mime_type: "image/png",
    });
    assert.equal(opened.status, 201, opened.text);
    assert.equal(opened.json.upload_session.method, "server_stream");
    const sessionId = opened.json.upload_session.external_id;
    const uploaded = await request("PUT", `/asset-upload-sessions/${sessionId}/content`, {
      token: user.token,
      raw: atLimit,
    });
    assert.equal(uploaded.status, 200, uploaded.text);
    const completed = await request("POST", `/asset-upload-sessions/${sessionId}/complete`, {
      token: user.token,
      idempotencyKey: nextId("pixels-ok"),
      body: {},
    });
    assert.equal(completed.status, 200, completed.text);
    assert.equal(completed.json.upload_session.asset_state, "ready");
    assert.equal(completed.json.upload_session.width, 5000);
    assert.equal(completed.json.upload_session.height, 5000);

    const tooWide = await openSession(user.token, {
      purpose: "profile_cover",
      declared_size_bytes: over.length,
      filename: "over.png",
      declared_mime_type: "image/png",
    });
    const overId = tooWide.json.upload_session.external_id;
    await request("PUT", `/asset-upload-sessions/${overId}/content`, { token: user.token, raw: over });
    const rejected = await request("POST", `/asset-upload-sessions/${overId}/complete`, {
      token: user.token,
      idempotencyKey: nextId("pixels-over"),
      body: {},
    });
    assert.equal(rejected.status, 422);
    assert.equal(rejected.json.code, "pixel_limit");
    assert.equal(rejected.json.upload_session.asset_state, "rejected");
  });

  it("fails closed when the scanner is not clean and can record a derivative", async () => {
    const user = await signupAndLogin(nextId("scan"));
    setScannerForTests(async () => ({ status: "suspicious", engine: "mock-scanner", signatureVersion: "mvp-010" }));
    const opened = await openSession(user.token, {
      purpose: "profile_avatar",
      declared_size_bytes: PNG_1X1.length,
      filename: "one.png",
      declared_mime_type: "image/png",
    });
    const sessionId = opened.json.upload_session.external_id;
    await request("PUT", `/asset-upload-sessions/${sessionId}/content`, { token: user.token, raw: PNG_1X1 });
    const quarantined = await request("POST", `/asset-upload-sessions/${sessionId}/complete`, {
      token: user.token,
      idempotencyKey: nextId("scan"),
      body: {},
    });
    assert.equal(quarantined.status, 200, quarantined.text);
    assert.equal(quarantined.json.upload_session.asset_state, "quarantined");
    assert.notEqual(quarantined.json.upload_session.asset_state, "ready");
    setScannerForTests(null);

    setDerivativeProcessorForTests(async () => ({
      bytes: PNG_1X1,
      mime: "image/png",
      checksum: "abc",
      variantType: "validated_image",
      recipeName: "mvp-identity",
      recipeVersion: "1",
      parametersHash: "none",
    }));
    const second = await openSession(user.token, {
      purpose: "profile_avatar",
      declared_size_bytes: PNG_1X1.length,
      filename: "two.png",
      declared_mime_type: "image/png",
    });
    const secondId = second.json.upload_session.external_id;
    await request("PUT", `/asset-upload-sessions/${secondId}/content`, { token: user.token, raw: PNG_1X1 });
    const ready = await request("POST", `/asset-upload-sessions/${secondId}/complete`, {
      token: user.token,
      idempotencyKey: nextId("derive"),
      body: {},
    });
    assert.equal(ready.status, 200, ready.text);
    assert.equal(ready.json.upload_session.asset_state, "ready");
    const variants = await pool.query(
      `SELECT variant_type FROM asset_variants v
       JOIN assets parent ON parent.id = v.parent_asset_id
       WHERE parent.external_id = $1`,
      [ready.json.upload_session.asset_external_id]
    );
    assert.equal(variants.rows.length, 1);
    assert.equal(variants.rows[0].variant_type, "validated_image");
    setDerivativeProcessorForTests(null);
  });

  it("replays the same create and rejects a conflicting body", async () => {
    const user = await signupAndLogin(nextId("idem"));
    const key = nextId("same");
    const body = {
      purpose: "profile_avatar",
      declared_size_bytes: PNG_1X1.length,
      filename: "same.png",
      declared_mime_type: "image/png",
    };
    const first = await openSession(user.token, body, key);
    const second = await openSession(user.token, body, key);
    assert.equal(first.status, 201, first.text);
    assert.equal(second.status, 201, second.text);
    assert.equal(second.json.upload_session.external_id, first.json.upload_session.external_id);
    const conflict = await openSession(user.token, { ...body, filename: "other.png" }, key);
    assert.equal(conflict.status, 409);
  });

  it("rejects an unapproved purpose and does not invent a portfolio limit", async () => {
    const user = await signupAndLogin(nextId("purpose"));
    const denied = await openSession(user.token, {
      purpose: "portfolio_audio",
      declared_size_bytes: 100,
      filename: "song.bin",
      declared_mime_type: "application/octet-stream",
    });
    assert.equal(denied.status, 422);
    assert.equal(denied.json.code, "purpose_not_approved");
  });
});
