const pool = require("../../db/db");
const repository = require("./repository");
const { parseProfileListQuery } = require("./search");

async function listProfiles(query) {
  const parsed = parseProfileListQuery(query);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  try {
    const result = await repository.listProfiles(pool, {
      filters: parsed.filters,
      limit: parsed.limit,
      offset: parsed.offset,
    });
    const profiles =
      result.rows.length > parsed.limit
        ? result.rows.slice(0, parsed.limit)
        : result.rows;
    return { status: 200, body: { profiles } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

module.exports = {
  listProfiles,
};
