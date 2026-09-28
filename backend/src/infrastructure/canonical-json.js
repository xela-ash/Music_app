const crypto = require("crypto");

// Deterministic JSON used for idempotency request hashes: object keys are
// sorted, so two requests that differ only in key order hash the same.
// Only values a JSON request body can carry are accepted. Anything else
// (undefined array items, NaN, Infinity, BigInt, Date, functions, cycles)
// throws, because silently coercing it would let different requests share
// a hash.
function canonicalJson(value) {
  return serialize(value, new Set());
}

function serialize(value, ancestors) {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError("canonicalJson: numbers must be finite");
      }
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }

  if (ancestors.has(value)) {
    throw new TypeError("canonicalJson: circular structure");
  }
  ancestors.add(value);

  let out;
  if (Array.isArray(value)) {
    const items = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) {
        throw new TypeError("canonicalJson: arrays cannot contain undefined");
      }
      items.push(serialize(value[i], ancestors));
    }
    out = `[${items.join(",")}]`;
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError("canonicalJson: only plain objects are supported");
    }
    // An undefined property is absent, exactly as JSON.stringify and a
    // parsed request body would treat it.
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    const members = keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key], ancestors)}`);
    out = `{${members.join(",")}}`;
  }

  ancestors.delete(value);
  return out;
}

function hashRequest(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

module.exports = {
  canonicalJson,
  hashRequest,
};
