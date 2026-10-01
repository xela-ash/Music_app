const test = require("node:test");
const assert = require("node:assert/strict");
const r2 = require("../src/assets/r2-storage");
const storage = require("../src/assets/storage");

const SECRET = "r2-secret-value-not-a-credential";

function withR2Env(fn) {
  const previous = {
    ASSET_STORAGE_PROVIDER: process.env.ASSET_STORAGE_PROVIDER,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      r2.setTransportForTests(null);
    });
}

test("local storage stays ready without R2 credentials", () => {
  delete process.env.ASSET_STORAGE_PROVIDER;
  const ready = storage.readiness();
  assert.equal(ready.ok, true);
  assert.equal(ready.provider, "local-mock");
});

test("R2 selection without credentials fails closed and does not call the network", async () => {
  await withR2Env(async () => {
    process.env.ASSET_STORAGE_PROVIDER = "r2";
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    let calls = 0;
    r2.setTransportForTests(async () => {
      calls += 1;
      throw new Error("transport must not be called");
    });
    const ready = storage.readiness();
    assert.equal(ready.ok, false);
    assert.deepEqual(ready.missing, r2.REQUIRED_ENV);
    await assert.rejects(() => r2.reserveObject(), { code: "storage_unconfigured" });
    assert.equal(calls, 0);
  });
});

test("a configured R2 part grant is a direct URL and does not contain the secret", async () => {
  await withR2Env(async () => {
    process.env.ASSET_STORAGE_PROVIDER = "r2";
    process.env.R2_ACCOUNT_ID = "account-id";
    process.env.R2_ACCESS_KEY_ID = "access-key";
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    process.env.R2_BUCKET = "musicapp-assets";
    const grant = storage.presignPart({
      key: "a".repeat(32),
      uploadId: "upload-id",
      partNumber: 1,
      expiresSeconds: 3600,
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    assert.equal(grant.expires_in, 3600);
    assert.match(grant.url, /X-Amz-Expires=3600/);
    assert.equal(grant.method, "PUT");
    assert.match(grant.url, /^https:\/\/account-id\.r2\.cloudflarestorage\.com\/musicapp-assets\/a{32}\?/);
    assert.throws(() => storage.presignPart({
      key: "a".repeat(32),
      uploadId: "upload-id",
      partNumber: 1,
      now: new Date("2026-10-01T00:00:00.000Z"),
    }), { code: "presign_lifetime" });
    assert.match(grant.url, /X-Amz-Signature=[0-9a-f]{64}$/);
    assert.equal(grant.url.includes(SECRET), false);
    assert.equal(JSON.stringify(grant.headers).includes(SECRET), false);
  });
});

test("R2 reservation uses the stub transport and ignores the response secret channel", async () => {
  await withR2Env(async () => {
    process.env.R2_ACCOUNT_ID = "account-id";
    process.env.R2_ACCESS_KEY_ID = "access-key";
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    process.env.R2_BUCKET = "musicapp-assets";
    let seen = null;
    r2.setTransportForTests(async (request) => {
      seen = request;
      return {
        ok: true,
        async text() {
          return "<InitiateMultipartUploadResult><UploadId>upload-id</UploadId></InitiateMultipartUploadResult>";
        },
      };
    });
    const reserved = await r2.reserveObject(new Date("2026-10-01T00:00:00.000Z"));
    assert.equal(reserved.provider, "cloudflare-r2");
    assert.equal(reserved.bucket, "musicapp-assets");
    assert.equal(reserved.generation, "upload-id");
    assert.match(reserved.key, /^[a-f0-9]{32}$/);
    assert.equal(seen.method, "POST");
    assert.equal(seen.url.includes(SECRET), false);
    assert.equal(seen.headers.Authorization.includes(SECRET), false);
    assert.match(seen.url, /uploads=/);
  });
});

test("the R2 adapter refuses to accept a file body", async () => {
  const written = await r2.writePart();
  assert.equal(written.ok, false);
  assert.equal(written.consumed, false);
  assert.equal(written.code, "direct_upload_required");
});
