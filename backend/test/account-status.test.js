const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { accountMayAuthenticate } = require("../src/auth/account-status");

describe("accountMayAuthenticate (BR-AUTH-006, Authentication §8.1)", () => {
  it("allows active, restricted, and email-verification-pending accounts", () => {
    for (const status of ["active", "restricted", "email_verification_pending"]) {
      assert.equal(accountMayAuthenticate(status), true, status);
    }
  });

  it("denies suspended, disabled, deleted, archived, and any other status", () => {
    for (const status of [
      "suspended",
      "disabled",
      "deleted",
      "archived",
      "pending_registration",
      "active ",
      "",
      null,
      undefined,
    ]) {
      assert.equal(accountMayAuthenticate(status), false, String(status));
    }
  });
});
