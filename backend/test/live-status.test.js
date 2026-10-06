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
const pool = require("../db/db");

let baseUrl = "";
let server;
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function request(method, requestPath, { token, body } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== undefined) {
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
  return {
    email,
    userId: created.json.user.id,
    token: loggedIn.json.token,
  };
}

async function setStatus(userId, status) {
  await pool.query("UPDATE users SET status = $2::user_status WHERE id = $1", [
    userId,
    status,
  ]);
}

const PROTECTED_REQUESTS = [
  ["GET", "/auth/me"],
  ["GET", "/profiles"],
  ["GET", "/projects"],
  ["POST", "/projects"],
  ["POST", "/projects/00000000-0000-4000-8000-000000000099/lock-milestones"],
  ["GET", "/notifications"],
  ["GET", "/notifications/ndl_00000000000000000000"],
  ["POST", "/notifications/ndl_00000000000000000000/mark-read"],
];

describe("MVP-006 live account status (SEC-AUTH-002)", { concurrency: 1, timeout: 30000 }, () => {
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

  for (const status of ["suspended", "deleted"]) {
    it(`rejects an existing JWT on every protected route after the account becomes ${status}`, async () => {
      const account = await signupAndLogin(nextId(status));
      const before = await request("GET", "/auth/me", { token: account.token });
      assert.equal(before.status, 200, before.text);

      await setStatus(account.userId, status);

      for (const [method, requestPath] of PROTECTED_REQUESTS) {
        const response = await request(method, requestPath, {
          token: account.token,
          body: method === "POST" ? {} : undefined,
        });
        assert.equal(response.status, 401, `${method} ${requestPath} ${response.text}`);
        assert.deepEqual(response.json, { error: "Unauthorized" });
      }
    });
  }

  it("still allows an active account through the protected reads", async () => {
    const account = await signupAndLogin(nextId("active"));
    for (const requestPath of ["/auth/me", "/profiles", "/projects"]) {
      const response = await request("GET", requestPath, { token: account.token });
      assert.equal(response.status, 200, `${requestPath} ${response.text}`);
    }
  });

  it("does not issue a new token to a suspended account (BR-AUTH-006)", async () => {
    const account = await signupAndLogin(nextId("login"));
    await setStatus(account.userId, "suspended");
    const response = await request("POST", "/auth/login", {
      body: { email: account.email, password: "password-1" },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(response.json, { error: "Invalid email or password" });
  });

  it("rejects a valid signature for a user row that does not exist", async () => {
    const token = jwt.sign(
      {
        sub: "00000000-0000-4000-8000-000000000000",
        external_id: "usr_missing",
        profile_id: "00000000-0000-4000-8000-000000000001",
        status: "active",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h", issuer: "musicapp-api", audience: "musicapp-web" }
    );
    const response = await request("GET", "/profiles", { token });
    assert.equal(response.status, 401);
    assert.deepEqual(response.json, { error: "Unauthorized" });
  });

  it("rejects a valid signature whose subject is not a user id", async () => {
    const token = jwt.sign(
      {
        sub: "not-a-uuid",
        external_id: "usr_bad",
        profile_id: "not-a-uuid",
        status: "active",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h", issuer: "musicapp-api", audience: "musicapp-web" }
    );
    const response = await request("GET", "/projects", { token });
    assert.equal(response.status, 401);
    assert.deepEqual(response.json, { error: "Unauthorized" });
  });

  it("leaves unauthenticated liveness available", async () => {
    const response = await request("GET", "/");
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { message: "Backend is alive" });
  });
});
