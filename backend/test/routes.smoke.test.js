const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");

// MVP-002 smoke suite for the twelve currently implemented routes.
// Assertions preserve the MVP-001 request/response snapshot.

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_ID_PATTERN = /^(usr|prf|prj|mls)_[0-9a-f]{20}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

let baseUrl = "";
let server;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = normalize(child);
    }
    return out;
  }
  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) return "<uuid>";
    if (EXTERNAL_ID_PATTERN.test(value)) return "<external_id>";
    if (TIMESTAMP_PATTERN.test(value)) return "<timestamp>";
    if (value.split(".").length === 3 && value.startsWith("eyJ")) return "<jwt>";
  }
  return value;
}

async function request(method, requestPath, { token, body, raw } = {}) {
  const headers = {};
  let payload;
  if (token) {
    headers.authorization = token;
  }
  if (raw !== undefined) {
    headers["content-type"] = "application/json";
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
  return {
    status: response.status,
    json,
    text,
    contentType: response.headers.get("content-type"),
  };
}

function profileInput(tag, extra = {}) {
  return {
    handle: `${tag}-handle`,
    first_name: "Ada",
    last_name: "Lovelace",
    artist_name: `${tag} Artist`,
    display_name: `${tag} Display`,
    genres: ["classical"],
    city: "Chennai",
    country: "IN",
    bio: "characterization",
    ...extra,
  };
}

async function signup(tag) {
  const email = `${tag}@example.com`;
  const response = await request("POST", "/auth/signup", {
    body: {
      email,
      password: "password-1",
      ...profileInput(tag),
    },
  });
  assert.equal(response.status, 201, response.text);
  return { email, ...response.json };
}

async function login(email, password = "password-1") {
  const response = await request("POST", "/auth/login", {
    body: { email, password },
  });
  assert.equal(response.status, 200, response.text);
  return response.json;
}

describe("MVP-002 implemented route smoke suite", { concurrency: 1, timeout: 30000 }, () => {
  before(async () => {
    ensureMigrated();
    await resetApplicationData();
    const started = await startServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    try {
      if (server) {
        await closeServer(server);
      }
      await resetApplicationData();
    } finally {
      await stopPool();
    }
  });

  it("GET / returns the liveness payload", async () => {
    const response = await request("GET", "/");
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { message: "Backend is alive" });
  });

  it("GET /db-health returns the connectivity payload", async () => {
    const response = await request("GET", "/db-health");
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { db: "connected", result: { ok: 1 } });
  });

  it("POST /users rejects a body with neither email nor phone", async () => {
    const response = await request("POST", "/users", { body: {} });
    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: "Either email or phone_e164 is required" });
  });

  it("POST /users rejects a missing JSON body", async () => {
    const response = await request("POST", "/users");
    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { error: "Internal server error" });
  });

  it("POST /users rejects malformed JSON without the application error shape", async () => {
    const response = await request("POST", "/users", { raw: "{" });
    assert.equal(response.status, 400);
    assert.equal(response.json, null);
    assert.match(response.contentType, /text\/html/);
  });

  it("POST /users and GET /users keep the current user payload", async () => {
    const email = `${nextId("user")}@example.com`;
    const created = await request("POST", "/users", {
      body: { email, phone_e164: null, status: "active" },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(normalize(created.json), {
      id: "<uuid>",
      external_id: "<external_id>",
      email,
      phone_e164: null,
      status: "active",
      created_at: "<timestamp>",
    });
    assert.match(created.json.external_id, /^usr_[0-9a-f]{20}$/);

    const duplicate = await request("POST", "/users", { body: { email } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, "Unique constraint violation");
    assert.equal(typeof duplicate.json.detail, "string");

    const listed = await request("GET", "/users");
    assert.equal(listed.status, 200);
    assert.ok(Array.isArray(listed.json.users));
    assert.equal(listed.json.users[0].email, email);
    assert.deepEqual(Object.keys(listed.json), ["users"]);
  });

  it("POST /profiles validates required fields and returns the inserted row", async () => {
    const missing = await request("POST", "/profiles", { body: {} });
    assert.equal(missing.status, 400);
    assert.deepEqual(missing.json, { error: "user_id is required" });

    const email = `${nextId("profile-user")}@example.com`;
    const user = await request("POST", "/users", { body: { email } });
    assert.equal(user.status, 201);
    const tag = nextId("profile");
    const created = await request("POST", "/profiles", {
      body: { user_id: user.json.id, ...profileInput(tag) },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(normalize(created.json), {
      id: "<uuid>",
      external_id: "<external_id>",
      user_id: "<uuid>",
      handle: `${tag}-handle`,
      first_name: "Ada",
      last_name: "Lovelace",
      artist_name: `${tag} Artist`,
      artist_name_is_legal_name: false,
      display_name: `${tag} Display`,
      genres: ["classical"],
      city: "Chennai",
      country: "IN",
      bio: "characterization",
      profile_photo_asset_id: null,
      dob: null,
      created_at: "<timestamp>",
      updated_at: "<timestamp>",
    });
    assert.match(created.json.external_id, /^prf_[0-9a-f]{20}$/);

    const unknownUser = await request("POST", "/profiles", {
      body: {
        user_id: "00000000-0000-4000-8000-000000000000",
        ...profileInput(nextId("missing-user")),
      },
    });
    assert.equal(unknownUser.status, 400);
    assert.equal(unknownUser.json.error, "Foreign key violation");
    assert.equal(typeof unknownUser.json.detail, "string");
  });

  it("POST /auth/signup validates input and returns user plus profile", async () => {
    const missingContact = await request("POST", "/auth/signup", {
      body: { password: "password-1" },
    });
    assert.equal(missingContact.status, 400);
    assert.deepEqual(missingContact.json, {
      error: "Either email or phone_e164 is required",
    });

    const shortPassword = await request("POST", "/auth/signup", {
      body: { email: `${nextId("short")}@example.com`, password: "short" },
    });
    assert.equal(shortPassword.status, 400);
    assert.deepEqual(shortPassword.json, {
      error: "password must be at least 8 characters",
    });

    const tag = nextId("signup");
    const email = `${tag}@example.com`;
    const created = await request("POST", "/auth/signup", {
      body: { email, password: "password-1", ...profileInput(tag) },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(normalize(created.json), {
      user: {
        id: "<uuid>",
        external_id: "<external_id>",
        email,
        phone_e164: null,
        status: "active",
        created_at: "<timestamp>",
      },
      profile: {
        id: "<uuid>",
        external_id: "<external_id>",
        user_id: "<uuid>",
        handle: `${tag}-handle`,
        first_name: "Ada",
        last_name: "Lovelace",
        artist_name: `${tag} Artist`,
        artist_name_is_legal_name: false,
        display_name: `${tag} Display`,
        genres: ["classical"],
        city: "Chennai",
        country: "IN",
        bio: "characterization",
        profile_photo_asset_id: null,
        dob: null,
        created_at: "<timestamp>",
        updated_at: "<timestamp>",
      },
    });
    assert.equal(created.json.profile.user_id, created.json.user.id);
    assert.equal(Object.hasOwn(created.json, "token"), false);
    assert.equal(Object.hasOwn(created.json.user, "password_hash"), false);

    const duplicate = await request("POST", "/auth/signup", {
      body: { email, password: "password-1", ...profileInput(nextId("dup")) },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, "Unique constraint violation");
    assert.equal(typeof duplicate.json.detail, "string");
  });

  it("POST /auth/login and GET /auth/me keep credential and token behavior", async () => {
    const tag = nextId("login");
    const signedUp = await signup(tag);

    const missingEmail = await request("POST", "/auth/login", {
      body: { password: "password-1" },
    });
    assert.equal(missingEmail.status, 400);
    assert.deepEqual(missingEmail.json, {
      error: "email is required and must be a non-empty string",
    });

    const wrongPassword = await request("POST", "/auth/login", {
      body: { email: signedUp.email, password: "wrong-password" },
    });
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.json, { error: "Invalid email or password" });

    const unknown = await request("POST", "/auth/login", {
      body: { email: `${nextId("nobody")}@example.com`, password: "password-1" },
    });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.json, { error: "Invalid email or password" });

    const session = await login(signedUp.email);
    assert.deepEqual(normalize(session), {
      token: "<jwt>",
      user: {
        id: "<uuid>",
        external_id: "<external_id>",
        email: signedUp.email,
        phone_e164: null,
        status: "active",
        created_at: "<timestamp>",
      },
      profile: {
        id: "<uuid>",
        external_id: "<external_id>",
        user_id: "<uuid>",
        handle: `${tag}-handle`,
        first_name: "Ada",
        last_name: "Lovelace",
        artist_name: `${tag} Artist`,
        artist_name_is_legal_name: false,
        display_name: `${tag} Display`,
        genres: ["classical"],
        city: "Chennai",
        country: "IN",
        bio: "characterization",
        profile_photo_asset_id: null,
        dob: null,
        created_at: "<timestamp>",
        updated_at: "<timestamp>",
      },
    });
    assert.equal(session.user.id, signedUp.user.id);
    assert.equal(session.profile.id, signedUp.profile.id);

    const decoded = jwt.decode(session.token);
    assert.equal(decoded.sub, signedUp.user.id);
    assert.equal(decoded.external_id, signedUp.user.external_id);
    assert.equal(decoded.profile_id, signedUp.profile.id);
    assert.equal(decoded.status, "active");
    assert.equal(decoded.iss, "musicapp-api");
    assert.equal(decoded.aud, "musicapp-web");

    const missing = await request("GET", "/auth/me");
    assert.equal(missing.status, 401);
    assert.deepEqual(missing.json, { error: "Unauthorized" });

    const malformed = await request("GET", "/auth/me", { token: "Token abc" });
    assert.equal(malformed.status, 401);
    assert.deepEqual(malformed.json, { error: "Unauthorized" });

    const forged = jwt.sign({ sub: signedUp.user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
      issuer: "other-issuer",
      audience: "musicapp-web",
    });
    const rejected = await request("GET", "/auth/me", { token: `Bearer ${forged}` });
    assert.equal(rejected.status, 401);
    assert.deepEqual(rejected.json, { error: "Unauthorized" });

    const me = await request("GET", "/auth/me", { token: `Bearer ${session.token}` });
    assert.equal(me.status, 200);
    assert.deepEqual(normalize(me.json), {
      user: normalize(session.user),
      profile: normalize(session.profile),
    });
    assert.equal(me.json.user.id, signedUp.user.id);
  });

  it("GET /profiles requires authentication and returns the discovery shape", async () => {
    const anonymous = await request("GET", "/profiles");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.json, { error: "Unauthorized" });

    const tag = nextId("discover");
    const signedUp = await signup(tag);
    const session = await login(signedUp.email);
    const listed = await request("GET", "/profiles", {
      token: `Bearer ${session.token}`,
    });
    assert.equal(listed.status, 200);
    assert.deepEqual(Object.keys(listed.json), ["profiles"]);
    const mine = listed.json.profiles.find((profile) => profile.id === signedUp.profile.id);
    assert.ok(mine);
    assert.deepEqual(normalize(mine), {
      id: "<uuid>",
      external_id: "<external_id>",
      user_id: "<uuid>",
      handle: `${tag}-handle`,
      first_name: "Ada",
      last_name: "Lovelace",
      artist_name: `${tag} Artist`,
      artist_name_is_legal_name: false,
      display_name: `${tag} Display`,
      genres: ["classical"],
      city: "Chennai",
      country: "IN",
      bio: "characterization",
      profile_photo_asset_id: null,
      created_at: "<timestamp>",
      updated_at: "<timestamp>",
    });
    assert.equal(Object.hasOwn(mine, "dob"), false);
  });

  it("POST /projects and GET /projects keep validation, party scope, and shapes", async () => {
    const buyer = await signup(nextId("buyer"));
    const seller = await signup(nextId("seller"));
    const outsider = await signup(nextId("outsider"));
    const buyerSession = await login(buyer.email);
    const sellerSession = await login(seller.email);
    const outsiderSession = await login(outsider.email);
    const buyerToken = `Bearer ${buyerSession.token}`;

    const anonymous = await request("POST", "/projects", { body: {} });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.json, { error: "Unauthorized" });

    const missingSeller = await request("POST", "/projects", {
      token: buyerToken,
      body: {},
    });
    assert.equal(missingSeller.status, 400);
    assert.deepEqual(missingSeller.json, {
      error: "seller_user_id is required and must be a non-empty string",
    });

    const self = await request("POST", "/projects", {
      token: buyerToken,
      body: {
        seller_user_id: buyer.user.id,
        title: "Self",
        requirements: "None",
        price_amount: 100,
        delivery_days: 7,
        milestones: [{ title: "Only", amount: 100 }],
      },
    });
    assert.equal(self.status, 400);
    assert.deepEqual(self.json, { error: "You cannot start a project with yourself" });

    const absentSeller = await request("POST", "/projects", {
      token: buyerToken,
      body: {
        seller_user_id: "00000000-0000-4000-8000-000000000000",
        title: "Missing seller",
        requirements: "None",
        price_amount: 100,
        delivery_days: 7,
        milestones: [{ title: "Only", amount: 100 }],
      },
    });
    assert.equal(absentSeller.status, 404);
    assert.deepEqual(absentSeller.json, { error: "Seller not found" });

    const mismatched = await request("POST", "/projects", {
      token: buyerToken,
      body: {
        seller_user_id: seller.user.id,
        title: "Mismatch",
        requirements: "None",
        price_amount: 100,
        delivery_days: 7,
        milestones: [{ title: "Only", amount: 40 }],
      },
    });
    assert.equal(mismatched.status, 400);
    assert.deepEqual(mismatched.json, {
      error: "Milestone amounts must equal the project price",
    });

    const created = await request("POST", "/projects", {
      token: buyerToken,
      body: {
        seller_user_id: seller.user.id,
        title: "  Recording  ",
        requirements: "  Deliver stems  ",
        price_amount: 150,
        delivery_days: 14,
        milestones: [
          { title: " Demo ", description: "  rough  ", amount: 50, due_at: "2026-10-01T00:00:00.000Z" },
          { title: "Final", description: "   ", amount: 100 },
        ],
      },
    });
    assert.equal(created.status, 201);
    assert.deepEqual(normalize(created.json), {
      project: {
        id: "<uuid>",
        external_id: "<external_id>",
        buyer_user_id: "<uuid>",
        seller_user_id: "<uuid>",
        title: "Recording",
        requirements: "Deliver stems",
        price_amount: 150,
        currency: "INR",
        delivery_days: 14,
        revision_limit: 0,
        state: "draft",
        accepted_at: null,
        delivered_at: null,
        completed_at: null,
        milestones_locked_at: null,
        created_at: "<timestamp>",
        updated_at: "<timestamp>",
      },
      milestones: [
        {
          id: "<uuid>",
          external_id: "<external_id>",
          project_id: "<uuid>",
          milestone_no: 1,
          title: "Demo",
          description: "rough",
          amount: 50,
          currency: "INR",
          due_at: "<timestamp>",
          state: "planned",
          created_at: "<timestamp>",
          updated_at: "<timestamp>",
        },
        {
          id: "<uuid>",
          external_id: "<external_id>",
          project_id: "<uuid>",
          milestone_no: 2,
          title: "Final",
          description: null,
          amount: 100,
          currency: "INR",
          due_at: null,
          state: "planned",
          created_at: "<timestamp>",
          updated_at: "<timestamp>",
        },
      ],
    });
    assert.equal(created.json.project.buyer_user_id, buyer.user.id);
    assert.equal(created.json.project.seller_user_id, seller.user.id);
    assert.match(created.json.project.external_id, /^prj_[0-9a-f]{20}$/);
    assert.match(created.json.milestones[0].external_id, /^mls_[0-9a-f]{20}$/);

    const buyerList = await request("GET", "/projects", { token: buyerToken });
    assert.equal(buyerList.status, 200);
    assert.equal(buyerList.json.projects.length, 1);
    assert.deepEqual(normalize(buyerList.json.projects[0]), {
      id: "<uuid>",
      external_id: "<external_id>",
      buyer_user_id: "<uuid>",
      seller_user_id: "<uuid>",
      title: "Recording",
      requirements: "Deliver stems",
      price_amount: 150,
      currency: "INR",
      delivery_days: 14,
      revision_limit: 0,
      state: "draft",
      accepted_at: null,
      delivered_at: null,
      completed_at: null,
      milestones_locked_at: null,
      created_at: "<timestamp>",
      updated_at: "<timestamp>",
      buyer_profile: {
        user_id: "<uuid>",
        display_name: buyer.profile.display_name,
        handle: buyer.profile.handle,
        artist_name: buyer.profile.artist_name,
      },
      seller_profile: {
        user_id: "<uuid>",
        display_name: seller.profile.display_name,
        handle: seller.profile.handle,
        artist_name: seller.profile.artist_name,
      },
    });

    const sellerList = await request("GET", "/projects", {
      token: `Bearer ${sellerSession.token}`,
    });
    assert.equal(sellerList.status, 200);
    assert.equal(sellerList.json.projects.length, 1);
    assert.equal(sellerList.json.projects[0].id, created.json.project.id);

    const outsiderList = await request("GET", "/projects", {
      token: `Bearer ${outsiderSession.token}`,
    });
    assert.equal(outsiderList.status, 200);
    assert.deepEqual(outsiderList.json, { projects: [] });
  });

  it("POST /projects/:projectId/lock-milestones keeps buyer, seller, and repeat behavior", async () => {
    const buyer = await signup(nextId("lock-buyer"));
    const seller = await signup(nextId("lock-seller"));
    const buyerSession = await login(buyer.email);
    const sellerSession = await login(seller.email);
    const buyerToken = `Bearer ${buyerSession.token}`;

    const created = await request("POST", "/projects", {
      token: buyerToken,
      body: {
        seller_user_id: seller.user.id,
        title: "Lock me",
        requirements: "One pass",
        price_amount: 80,
        delivery_days: 3,
        milestones: [{ title: "Pass", amount: 80 }],
      },
    });
    assert.equal(created.status, 201);
    const projectId = created.json.project.id;

    const badId = await request("POST", `/projects/not-a-uuid/lock-milestones`, {
      token: buyerToken,
    });
    assert.equal(badId.status, 400);
    assert.deepEqual(badId.json, { error: "projectId must be a valid UUID" });

    const sellerLock = await request("POST", `/projects/${projectId}/lock-milestones`, {
      token: `Bearer ${sellerSession.token}`,
    });
    assert.equal(sellerLock.status, 404);
    assert.deepEqual(sellerLock.json, { error: "Project not found" });

    const missing = await request(
      "POST",
      "/projects/00000000-0000-4000-8000-000000000000/lock-milestones",
      { token: buyerToken }
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, { error: "Project not found" });

    const locked = await request("POST", `/projects/${projectId}/lock-milestones`, {
      token: buyerToken,
    });
    assert.equal(locked.status, 200);
    assert.equal(locked.json.project.id, projectId);
    assert.equal(locked.json.project.state, "draft");
    assert.match(locked.json.project.milestones_locked_at, TIMESTAMP_PATTERN);
    assert.equal(locked.json.milestones.length, 1);
    assert.equal(locked.json.milestones[0].title, "Pass");
    assert.equal(locked.json.milestones[0].state, "planned");
    assert.deepEqual(Object.keys(locked.json).sort(), ["milestones", "project"]);

    const again = await request("POST", `/projects/${projectId}/lock-milestones`, {
      token: buyerToken,
    });
    assert.equal(again.status, 409);
    assert.deepEqual(again.json, { error: "Project milestones are already locked" });
  });
});
