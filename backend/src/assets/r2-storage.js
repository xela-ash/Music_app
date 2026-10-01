const crypto = require("crypto");

const PROVIDER_KEY = "cloudflare-r2";
const REQUIRED_ENV = Object.freeze([
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
]);
const REGION = "auto";
const SERVICE = "s3";
const PRESIGN_SECONDS = 900;

let transport = defaultTransport;

function defaultTransport(request) {
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

function setTransportForTests(next) {
  transport = next || defaultTransport;
}

function readConfig() {
  const values = {};
  const missing = [];
  for (const name of REQUIRED_ENV) {
    const value = process.env[name];
    if (typeof value !== "string" || value.length === 0) {
      missing.push(name);
    } else {
      values[name] = value;
    }
  }
  return { ok: missing.length === 0, missing, values };
}

function readiness() {
  const current = readConfig();
  if (!current.ok) {
    return { ok: false, provider: PROVIDER_KEY, missing: current.missing };
  }
  return { ok: true, provider: PROVIDER_KEY, missing: [] };
}

function unconfigured() {
  const error = new Error("Cloudflare R2 storage is not configured");
  error.code = "storage_unconfigured";
  return error;
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signingKey(secret, dateStamp) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), REGION), SERVICE), "aws4_request");
}

function amzTimestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(entries) {
  return entries
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : left[1] < right[1] ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function endpoint(accountId) {
  return `${accountId}.r2.cloudflarestorage.com`;
}

function objectUri(bucket, key) {
  return `/${bucket}/${key}`;
}

function signedRequest({ method, canonicalUri, queryEntries, body, now }) {
  const current = readConfig();
  if (!current.ok) {
    throw unconfigured();
  }
  const payload = body || "";
  const host = endpoint(current.values.R2_ACCOUNT_ID);
  const stamp = amzTimestamp(now);
  const dateStamp = stamp.slice(0, 8);
  const query = canonicalQuery(queryEntries);
  const payloadHash = sha256Hex(payload);
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${stamp}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(current.values.R2_SECRET_ACCESS_KEY, dateStamp))
    .update(stringToSign)
    .digest("hex");
  const url = `https://${host}${canonicalUri}${query ? `?${query}` : ""}`;
  return {
    method,
    url,
    body: payload,
    headers: {
      Host: host,
      "x-amz-date": stamp,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${current.values.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function presignPart({ key, uploadId, partNumber, now = new Date() }) {
  const current = readConfig();
  if (!current.ok) {
    throw unconfigured();
  }
  if (typeof key !== "string" || !/^[a-f0-9]{32}$/.test(key)) {
    throw new TypeError("storage key must be 32 hex characters");
  }
  if (typeof uploadId !== "string" || uploadId.length === 0) {
    throw new TypeError("upload id is required");
  }
  if (!Number.isInteger(partNumber) || partNumber < 1) {
    const error = new Error("Part number is outside the adapter range");
    error.code = "part_number";
    throw error;
  }
  const host = endpoint(current.values.R2_ACCOUNT_ID);
  const stamp = amzTimestamp(now);
  const dateStamp = stamp.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const credential = `${current.values.R2_ACCESS_KEY_ID}/${scope}`;
  const query = canonicalQuery([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(PRESIGN_SECONDS)],
    ["X-Amz-SignedHeaders", "host"],
    ["partNumber", String(partNumber)],
    ["uploadId", uploadId],
  ]);
  const canonicalUri = objectUri(current.values.R2_BUCKET, key);
  const canonicalRequest = ["PUT", canonicalUri, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(current.values.R2_SECRET_ACCESS_KEY, dateStamp))
    .update(stringToSign)
    .digest("hex");
  return {
    provider: PROVIDER_KEY,
    method: "PUT",
    url: `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`,
    headers: {},
    expires_in: PRESIGN_SECONDS,
  };
}

async function reserveObject(now = new Date()) {
  const current = readConfig();
  if (!current.ok) {
    throw unconfigured();
  }
  const key = crypto.randomBytes(16).toString("hex");
  const request = signedRequest({
    method: "POST",
    canonicalUri: objectUri(current.values.R2_BUCKET, key),
    queryEntries: [["uploads", ""]],
    body: "",
    now,
  });
  const response = await transport(request);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error("Cloudflare R2 rejected the multipart reservation");
    error.code = "storage_provider_rejected";
    throw error;
  }
  const match = text.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) {
    const error = new Error("Cloudflare R2 did not return an upload id");
    error.code = "storage_provider_rejected";
    throw error;
  }
  return {
    provider: PROVIDER_KEY,
    bucket: current.values.R2_BUCKET,
    key,
    generation: match[1],
  };
}

function writePart() {
  return Promise.resolve({
    ok: false,
    consumed: false,
    code: "direct_upload_required",
    error: "This object accepts part bytes only through a direct upload grant",
  });
}

function reservedPartBytes() {
  return 0n;
}

function assemblyReady() {
  return false;
}

function completeMultipart() {
  return { ok: false, code: "direct_upload_required", error: "Direct part completion is verified by the provider upload id" };
}

function inspect() {
  return null;
}

function readPrefix() {
  const error = new Error("Cloudflare R2 prefix inspection is not available without a completed object");
  error.code = "storage_provider_rejected";
  throw error;
}

function abortObject() {
  return undefined;
}

module.exports = {
  PROVIDER_KEY,
  REQUIRED_ENV,
  readiness,
  presignPart,
  reserveObject,
  writePart,
  reservedPartBytes,
  assemblyReady,
  completeMultipart,
  inspect,
  readPrefix,
  abortObject,
  setTransportForTests,
};
