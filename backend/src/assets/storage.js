const local = require("./local-storage");
const r2 = require("./r2-storage");

function providerName() {
  return process.env.ASSET_STORAGE_PROVIDER || "local";
}

function current() {
  const name = providerName();
  if (name === "local" || name === "local-mock") {
    return local;
  }
  if (name === "r2") {
    return r2;
  }
  const error = new Error("Asset storage provider is not configured");
  error.code = "storage_unconfigured";
  throw error;
}

function readiness() {
  const name = providerName();
  if (name === "local" || name === "local-mock") {
    return { ok: true, provider: local.PROVIDER_KEY, missing: [] };
  }
  if (name === "r2") {
    return r2.readiness();
  }
  return { ok: false, provider: name, missing: ["ASSET_STORAGE_PROVIDER"] };
}

function reserveObject() {
  return current().reserveObject();
}

function reservedPartBytes(key, exceptPartNumber) {
  return current().reservedPartBytes(key, exceptPartNumber);
}

function claimPartBudget(key, partNumber, budget) {
  if (typeof current().claimPartBudget === "function") {
    current().claimPartBudget(key, partNumber, budget);
  }
}

function assemblyReady(key) {
  return current().assemblyReady(key);
}

function writePart(key, partNumber, source, maxPartBytes) {
  return current().writePart(key, partNumber, source, maxPartBytes);
}

function completeMultipart(key) {
  return current().completeMultipart(key);
}

function inspect(key) {
  return current().inspect(key);
}

function readPrefix(key, length) {
  return current().readPrefix(key, length);
}

function abortObject(key) {
  return current().abortObject(key);
}

function presignPart(input) {
  if (providerName() !== "r2") {
    const error = new Error("This storage provider accepts part bytes on the upload route");
    error.code = "server_mediated";
    throw error;
  }
  return r2.presignPart(input);
}

module.exports = {
  readiness,
  reserveObject,
  reservedPartBytes,
  claimPartBudget,
  assemblyReady,
  writePart,
  completeMultipart,
  inspect,
  readPrefix,
  abortObject,
  presignPart,
};
