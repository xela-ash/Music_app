const pool = require("../../db/db");
const repository = require("./repository");

async function createUser(body) {
  try {
    const { external_id, email = null, phone_e164 = null, status } = body;

    if (!email && !phone_e164) {
      return { status: 400, body: { error: "Either email or phone_e164 is required" } };
    }

    const extId = external_id || repository.makeExternalId();

    const result = await repository.insertUser(pool, extId, email, phone_e164, status);

    return { status: 201, body: result.rows[0] };
  } catch (err) {
    if (err.code === "23505") {
      return { status: 409, body: { error: "Unique constraint violation", detail: err.detail } };
    }
    if (err.code === "23514") {
      return { status: 400, body: { error: "Constraint violation", detail: err.detail } };
    }
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

async function listUsers() {
  try {
    const result = await repository.listUsers(pool);
    return { status: 200, body: { users: result.rows } };
  } catch (err) {
    console.error(err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}

module.exports = {
  createUser,
  listUsers,
};
