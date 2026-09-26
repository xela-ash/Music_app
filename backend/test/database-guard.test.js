const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { assertIsolatedDatabase } = require("./database-guard");

const isolated = {
  DB_NAME: "musicapp_mvp001",
  DB_PORT: "5433",
  JWT_SECRET: "test-secret",
};

describe("MVP-002 isolated database guard", () => {
  it("accepts the isolated database name and a non-default port", () => {
    assert.doesNotThrow(() => assertIsolatedDatabase(isolated));
  });

  it("refuses the shared development database name", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, DB_NAME: "musicapp" }),
      /musicapp_mvp001/
    );
  });

  it("refuses an omitted database name", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, DB_NAME: undefined }),
      /musicapp_mvp001/
    );
  });

  it("refuses the shared development port 5432", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, DB_PORT: "5432" }),
      /5432/
    );
  });

  it("refuses an omitted database port", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, DB_PORT: undefined }),
      /DB_PORT/
    );
  });

  it("refuses a blank database port", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, DB_PORT: "   " }),
      /DB_PORT/
    );
  });

  it("refuses a missing JWT secret", () => {
    assert.throws(
      () => assertIsolatedDatabase({ ...isolated, JWT_SECRET: "  " }),
      /JWT_SECRET/
    );
  });
});
