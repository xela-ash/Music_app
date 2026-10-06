const pool = require("../../db/db");
const repository = require("./repository");

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
  listUsers,
};
