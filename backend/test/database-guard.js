// Refuses the shared development database before any pool or server is created.
// MVP-002's fixture uses this so a smoke run cannot migrate or truncate
// the database on port 5432, including when DB_PORT is omitted.

const ISOLATED_DB_NAME = "musicapp_mvp001";
const SHARED_DEV_PORT = "5432";

function assertIsolatedDatabase(env = process.env) {
  if (env.DB_NAME !== ISOLATED_DB_NAME) {
    throw new Error(
      `Refusing to run: DB_NAME must be the isolated database ${ISOLATED_DB_NAME}`
    );
  }

  const port = env.DB_PORT === undefined || env.DB_PORT === null ? "" : String(env.DB_PORT).trim();
  if (port === "" || port === SHARED_DEV_PORT) {
    throw new Error(
      "Refusing to run: DB_PORT must be set to an isolated port other than 5432"
    );
  }

  if (!env.JWT_SECRET || !String(env.JWT_SECRET).trim()) {
    throw new Error("JWT_SECRET is required for the test server");
  }
}

module.exports = {
  ISOLATED_DB_NAME,
  assertIsolatedDatabase,
};
