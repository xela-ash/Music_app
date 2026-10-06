const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  ensureMigrated,
  resetApplicationData,
  startServer,
  closeServer,
  stopPool,
} = require("./harness");
const pool = require("../db/db");
const { withMilestoneTerms } = require("./milestone-fixture");

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
    userId: created.json.user.id,
    token: loggedIn.json.token,
  };
}

function projectBody(sellerUserId, extra) {
  return {
    seller_user_id: sellerUserId,
    title: "Session",
    requirements: "Stems",
    price_amount: 100,
    delivery_days: 7,
    milestones: [withMilestoneTerms({ title: "Only", amount: 100 })],
    ...extra,
  };
}

describe("MVP-007 authorization on existing routes", { concurrency: 1, timeout: 30000 }, () => {
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

  it("keeps the buyer server-derived when the body names someone else", async () => {
    const buyer = await signupAndLogin(nextId("buyer"));
    const seller = await signupAndLogin(nextId("seller"));
    const outsider = await signupAndLogin(nextId("outsider"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId, { buyer_user_id: outsider.userId }),
    });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.json.project.buyer_user_id, buyer.userId);
    assert.equal(created.json.project.seller_user_id, seller.userId);
  });

  it("returns Seller not found when the named seller is suspended", async () => {
    const buyer = await signupAndLogin(nextId("buyer-sus"));
    const seller = await signupAndLogin(nextId("seller-sus"));
    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [
      seller.userId,
    ]);
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId),
    });
    assert.equal(created.status, 404);
    assert.deepEqual(created.json, { error: "Seller not found" });
  });

  it("returns the existing non-draft lock error for the buyer", async () => {
    const buyer = await signupAndLogin(nextId("buyer-state"));
    const seller = await signupAndLogin(nextId("seller-state"));
    const created = await request("POST", "/projects", {
      token: buyer.token,
      body: projectBody(seller.userId),
    });
    assert.equal(created.status, 201, created.text);
    await pool.query("UPDATE projects SET state = 'accepted'::project_state WHERE id = $1", [
      created.json.project.id,
    ]);
    const locked = await request("POST", `/projects/${created.json.project.id}/lock-milestones`, {
      token: buyer.token,
    });
    assert.equal(locked.status, 400);
    assert.deepEqual(locked.json, { error: "Only draft projects can lock milestones" });
  });
});
