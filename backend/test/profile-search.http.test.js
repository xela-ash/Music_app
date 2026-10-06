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

async function insertProfile({
  tag,
  createdAt,
  displayName,
  artistName,
  handle,
  firstName,
  lastName,
  genres,
  city,
  country,
}) {
  const user = await pool.query(
    `INSERT INTO users (external_id, email, status)
     VALUES ($1, $2, 'active')
     RETURNING id`,
    [`usr_${tag}`, `${tag}@example.com`]
  );
  const profile = await pool.query(
    `INSERT INTO profiles (
       external_id, user_id, handle, first_name, last_name, artist_name,
       artist_name_is_legal_name, display_name, genres, city, country, bio,
       created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, 'fixture', $11, $11)
     RETURNING id`,
    [
      `prf_${tag}`,
      user.rows[0].id,
      handle,
      firstName,
      lastName,
      artistName,
      displayName,
      genres,
      city,
      country,
      createdAt,
    ]
  );
  return profile.rows[0].id;
}

describe("MVP-013 server-side profile search", { concurrency: 1, timeout: 30000 }, () => {
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

  it("finds a profile outside the newest 100 and keeps the unfiltered page bounded (REQ-PROFILE-005, SEC-PROFILE-007, SEC-AUTHZ-006, BR-AUTHZ-023)", async () => {
    const viewer = await signupAndLogin(nextId("viewer"));
    await pool.query(
      `INSERT INTO users (external_id, email, status)
       SELECT 'usr_fill_' || i, 'fill-' || i || '-' || $1 || '@example.com', 'active'
       FROM generate_series(1, 100) AS i`,
      [nextId("batch")]
    );
    await pool.query(
      `INSERT INTO profiles (
         external_id, user_id, handle, first_name, last_name, artist_name,
         artist_name_is_legal_name, display_name, genres, city, country, bio
       )
       SELECT
         'prf_fill_' || i,
         u.id,
         'fillhandle' || i,
         'Filler',
         'Person',
         'Filler Artist ' || i,
         false,
         'Filler Display ' || i,
         ARRAY['filler']::text[],
         'FillerCity',
         'FillerLand',
         'fixture'
       FROM generate_series(1, 100) AS i
       JOIN users u ON u.external_id = 'usr_fill_' || i`
    );
    const oldId = await insertProfile({
      tag: nextId("old"),
      createdAt: "1999-01-01T00:00:00.000Z",
      displayName: "Needle Display",
      artistName: "Needle Artist",
      handle: "needlehandle",
      firstName: "Legalneedle",
      lastName: "Lastneedle",
      genres: ["needlegenre"],
      city: "Needlecity",
      country: "Needleland",
    });

    const unfiltered = await request("GET", "/profiles", { token: viewer.token });
    assert.equal(unfiltered.status, 200, unfiltered.text);
    assert.equal(unfiltered.json.profiles.length, 100);
    assert.equal(
      unfiltered.json.profiles.some((profile) => profile.id === oldId),
      false
    );
    assert.equal(Object.hasOwn(unfiltered.json.profiles[0], "dob"), false);

    const byName = await request("GET", "/profiles?name=needle%20display", {
      token: viewer.token,
    });
    assert.equal(byName.status, 200, byName.text);
    assert.deepEqual(
      byName.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const byArtist = await request("GET", "/profiles?name=NEEDLE%20ARTIST", {
      token: viewer.token,
    });
    assert.deepEqual(
      byArtist.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const byHandle = await request("GET", "/profiles?handle=NeedleHandle", {
      token: viewer.token,
    });
    assert.deepEqual(
      byHandle.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const byGenre = await request("GET", "/profiles?genre=NeedleGenre", {
      token: viewer.token,
    });
    assert.deepEqual(
      byGenre.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const byCity = await request("GET", "/profiles?city=needlecity", {
      token: viewer.token,
    });
    assert.deepEqual(
      byCity.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const byCountry = await request("GET", "/profiles?country=needleland", {
      token: viewer.token,
    });
    assert.deepEqual(
      byCountry.json.profiles.map((profile) => profile.id),
      [oldId]
    );

    const legalName = await request("GET", "/profiles?name=Legalneedle", {
      token: viewer.token,
    });
    assert.equal(legalName.status, 200, legalName.text);
    assert.deepEqual(legalName.json.profiles, []);

    const literalPercent = await insertProfile({
      tag: nextId("percent"),
      createdAt: "1998-01-01T00:00:00.000Z",
      displayName: "100% Ready",
      artistName: "Percent Artist",
      handle: "percenthandle",
      firstName: "Pat",
      lastName: "Cent",
      genres: ["percent"],
      city: "PercentCity",
      country: "PercentLand",
    });
    const wildcard = await request("GET", "/profiles?name=%25", { token: viewer.token });
    assert.equal(wildcard.status, 200, wildcard.text);
    assert.deepEqual(
      wildcard.json.profiles.map((profile) => profile.id),
      [literalPercent]
    );

    const injected = await request("GET", "/profiles?name=" + encodeURIComponent("' OR 1=1 --"), {
      token: viewer.token,
    });
    assert.equal(injected.status, 200, injected.text);
    assert.equal(injected.json.profiles.length, 0);
  });

  it("ORs supplied dimensions and pages the matches without exceeding 100 rows (SEC-AUTHZ-006)", async () => {
    const viewer = await signupAndLogin(nextId("pager"));
    const nameOnly = await insertProfile({
      tag: nextId("nameonly"),
      createdAt: "2010-01-01T00:00:00.000Z",
      displayName: "Onlyname Unique",
      artistName: "Plain Artist",
      handle: "onlynamehandle",
      firstName: "Nia",
      lastName: "Only",
      genres: ["plain"],
      city: "PlainCity",
      country: "PlainLand",
    });
    const cityOnly = await insertProfile({
      tag: nextId("cityonly"),
      createdAt: "2011-01-01T00:00:00.000Z",
      displayName: "Other Display",
      artistName: "Other Artist",
      handle: "otherhandle",
      firstName: "Cara",
      lastName: "City",
      genres: ["plain"],
      city: "Onlycity Unique",
      country: "PlainLand",
    });

    const either = await request(
      "GET",
      "/profiles?name=Onlyname%20Unique&city=Onlycity%20Unique",
      { token: viewer.token }
    );
    assert.equal(either.status, 200, either.text);
    assert.deepEqual(
      either.json.profiles.map((profile) => profile.id).sort(),
      [nameOnly, cityOnly].sort()
    );

    await pool.query(
      `INSERT INTO users (external_id, email, status)
       SELECT 'usr_page_' || i, 'page-' || i || '-' || $1 || '@example.com', 'active'
       FROM generate_series(1, 101) AS i`,
      [nextId("pagebatch")]
    );
    await pool.query(
      `INSERT INTO profiles (
         external_id, user_id, handle, first_name, last_name, artist_name,
         artist_name_is_legal_name, display_name, genres, city, country, bio,
         created_at, updated_at
       )
       SELECT
         'prf_page_' || i,
         u.id,
         'pagehandle' || i,
         'Page',
         'Person',
         'Page Artist ' || i,
         false,
         'Page Display ' || i,
         ARRAY['pagegenre']::text[],
         'PageCity',
         'PageLand',
         'fixture',
         TIMESTAMP '2020-01-01' + (i || ' seconds')::interval,
         TIMESTAMP '2020-01-01' + (i || ' seconds')::interval
       FROM generate_series(1, 101) AS i
       JOIN users u ON u.external_id = 'usr_page_' || i`
    );

    const firstPage = await request("GET", "/profiles?genre=pagegenre", { token: viewer.token });
    assert.equal(firstPage.status, 200, firstPage.text);
    assert.equal(firstPage.json.profiles.length, 100);
    assert.equal(firstPage.json.profiles[0].handle, "pagehandle101");

    const secondPage = await request("GET", "/profiles?genre=pagegenre&offset=100", {
      token: viewer.token,
    });
    assert.equal(secondPage.status, 200, secondPage.text);
    assert.equal(secondPage.json.profiles.length, 1);
    assert.equal(secondPage.json.profiles[0].handle, "pagehandle1");

    const tooLarge = await request("GET", "/profiles?limit=101", { token: viewer.token });
    assert.equal(tooLarge.status, 400);
    assert.deepEqual(tooLarge.json, { error: "limit must be between 1 and 100" });

    const repeated = await request("GET", "/profiles?name=a&name=b", { token: viewer.token });
    assert.equal(repeated.status, 400);
    assert.deepEqual(repeated.json, { error: "name must be a single value" });
  });

  it("allows an authenticated non-owner and denies anonymous and inactive accounts", async () => {
    const owner = await signupAndLogin(nextId("owner"));
    const other = await signupAndLogin(nextId("other"));
    const anonymous = await request("GET", `/profiles?name=${encodeURIComponent(owner.email)}`);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.json, { error: "Unauthorized" });

    const allowed = await request(
      "GET",
      `/profiles?handle=${encodeURIComponent(`${owner.email.split("@")[0]}-handle`)}`,
      { token: other.token }
    );
    assert.equal(allowed.status, 200, allowed.text);
    assert.equal(allowed.json.profiles.length, 1);
    assert.equal(allowed.json.profiles[0].user_id, owner.userId);
    assert.notEqual(allowed.json.profiles[0].user_id, other.userId);

    await pool.query("UPDATE users SET status = 'suspended'::user_status WHERE id = $1", [
      other.userId,
    ]);
    const suspended = await request("GET", "/profiles?name=owner", { token: other.token });
    assert.equal(suspended.status, 401);
    assert.deepEqual(suspended.json, { error: "Unauthorized" });
  });
});
