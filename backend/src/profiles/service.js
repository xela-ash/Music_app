const pool = require("../../db/db");
const repository = require("./repository");
const { parseProfileListQuery } = require("./search");

async function createProfile(body) {
  try {
    const {
      external_id,
      user_id,
      handle,
      first_name,
      last_name = null,
      artist_name,
      artist_name_is_legal_name = false,
      display_name,
      genres = [],
      city,
      country,
      bio = null,
      profile_photo_asset_id = null,
      dob = null,
    } = body;

    if (!user_id) return { status: 400, body: { error: "user_id is required" } };
    if (!handle) return { status: 400, body: { error: "handle is required" } };
    if (!first_name) return { status: 400, body: { error: "first_name is required" } };
    if (!artist_name) return { status: 400, body: { error: "artist_name is required" } };
    if (!display_name) return { status: 400, body: { error: "display_name is required" } };
    if (!city) return { status: 400, body: { error: "city is required" } };
    if (!country) return { status: 400, body: { error: "country is required" } };

    const extId = external_id || repository.makeProfileExternalId();

    const result = await repository.insertProfile(pool, [
      extId,
      user_id,
      handle,
      first_name,
      last_name,
      artist_name,
      artist_name_is_legal_name,
      display_name,
      genres,
      city,
      country,
      bio,
      profile_photo_asset_id,
      dob,
    ]);

    return { status: 201, body: result.rows[0] };
  } catch (err) {
    if (err.code === "23505") {
      return { status: 409, body: { error: "Unique constraint violation", detail: err.detail } };
    }
    if (err.code === "23503") {
      return { status: 400, body: { error: "Foreign key violation", detail: err.detail } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

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
  createProfile,
  listProfiles,
};
