const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_FILTER_LENGTH,
  MAX_PAGE_SIZE,
  MAX_OFFSET,
  escapeLike,
  parseProfileListQuery,
  buildProfileSearchWhere,
} = require("../src/profiles/search");

describe("MVP-013 profile search query", () => {
  it("treats a missing or blank filter as absent and defaults the page", () => {
    const parsed = parseProfileListQuery({ name: "  ", handle: "", city: "Chennai" });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.filters, { city: "Chennai" });
    assert.equal(parsed.limit, 100);
    assert.equal(parsed.offset, 0);
  });

  it("rejects a repeated filter, a non-integer page, and an overlong filter", () => {
    assert.deepEqual(parseProfileListQuery({ name: ["a", "b"] }), {
      ok: false,
      error: "name must be a single value",
    });
    assert.equal(parseProfileListQuery({ limit: "100.5" }).ok, false);
    assert.equal(parseProfileListQuery({ limit: "0" }).ok, false);
    assert.equal(parseProfileListQuery({ limit: String(MAX_PAGE_SIZE + 1) }).ok, false);
    assert.equal(parseProfileListQuery({ offset: "-1" }).ok, false);
    assert.equal(parseProfileListQuery({ offset: String(MAX_OFFSET + 1) }).ok, false);
    assert.equal(parseProfileListQuery({ genre: "x".repeat(MAX_FILTER_LENGTH + 1) }).ok, false);
  });

  it("escapes LIKE wildcards and binds them as parameters", () => {
    assert.equal(escapeLike("100%_a\\b"), "100\\%\\_a\\\\b");
    const built = buildProfileSearchWhere({
      name: "100%",
      handle: "needle_handle",
      genre: "jazz",
      city: "Chennai",
      country: "IN",
    });
    assert.equal(built.params.length, 5);
    assert.deepEqual(built.params, ["100\\%", "needle\\_handle", "jazz", "Chennai", "IN"]);
    assert.equal(built.whereSql.includes("OR"), true);
    assert.equal(built.whereSql.includes("100%"), false);
    assert.equal(built.whereSql.includes("display_name"), true);
    assert.equal(built.whereSql.includes("artist_name"), true);
    assert.equal(built.whereSql.includes("first_name"), false);
    assert.equal(built.whereSql.includes("last_name"), false);
    assert.match(built.whereSql, /\$1/);
    assert.match(built.whereSql, /unnest\(genres\)/);
    assert.equal(buildProfileSearchWhere({}).whereSql, "");
  });
});
