const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { canonicalJson, hashRequest } = require("../src/infrastructure/canonical-json");
const { validateIdempotencyKey } = require("../src/infrastructure/idempotency");
const { createRandom } = require("./random");

// MVP-003 unit and property tests for the request hash behind idempotency
// (BR-PROJECTS-026, REQ-ESCROW-018): the same request must always hash the
// same, and a different request must not.

const SEED = 20260927;
const CASES = 500;

function randomJson(random, depth = 0) {
  const kind = depth >= 3 ? random.int(0, 3) : random.int(0, 5);
  switch (kind) {
    case 0:
      return null;
    case 1:
      return random.next() < 0.5;
    case 2:
      return random.int(-1e9, 1e9) / (random.next() < 0.5 ? 1 : 100);
    case 3:
      return random.pick(["", "a", "B", "key", "मान", "emoji 🎵", 'q"uote', "back\\slash"]) + random.int(0, 9);
    case 4: {
      const length = random.int(0, 4);
      return Array.from({ length }, () => randomJson(random, depth + 1));
    }
    default: {
      const out = {};
      const size = random.int(0, 5);
      for (let i = 0; i < size; i++) {
        out[random.pick(["a", "b", "c", "amount", "currency", "z", "Z", "_"]) + random.int(0, 3)] = randomJson(
          random,
          depth + 1
        );
      }
      return out;
    }
  }
}

function reorderKeys(random, value) {
  if (Array.isArray(value)) {
    return value.map((item) => reorderKeys(random, item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of random.shuffle(Object.keys(value))) {
      out[key] = reorderKeys(random, value[key]);
    }
    return out;
  }
  return value;
}

// Returns a copy of value with exactly one leaf changed, or null if value has
// no leaf to change.
function mutateLeaf(random, value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const index = random.int(0, value.length - 1);
    const changed = mutateLeaf(random, value[index]);
    if (changed === null) return null;
    const out = value.slice();
    out[index] = changed.value;
    return { value: out };
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return null;
    const key = random.pick(keys);
    const changed = mutateLeaf(random, value[key]);
    if (changed === null) return null;
    return { value: { ...value, [key]: changed.value } };
  }
  if (typeof value === "number") return { value: value + 1 };
  if (typeof value === "string") return { value: `${value}x` };
  if (typeof value === "boolean") return { value: !value };
  return { value: 0 };
}

describe("canonicalJson", () => {
  it("sorts object keys at every depth", () => {
    assert.equal(
      canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } }),
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}'
    );
  });

  it("treats an undefined property as absent, as a JSON body would", () => {
    assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
  });

  it("rejects values a JSON request cannot carry", () => {
    const circular = {};
    circular.self = circular;
    for (const value of [NaN, Infinity, -Infinity, 1n, new Date(0), () => 1, Symbol("s"), [undefined], circular, new Map()]) {
      assert.throws(() => canonicalJson(value), TypeError);
    }
    assert.throws(() => canonicalJson(undefined), TypeError);
  });

  it("allows the same object twice when it is not a cycle", () => {
    const shared = { a: 1 };
    assert.equal(canonicalJson([shared, shared]), '[{"a":1},{"a":1}]');
  });

  it("property: key order never changes the canonical form or the hash", () => {
    const random = createRandom(SEED);
    for (let i = 0; i < CASES; i++) {
      const value = randomJson(random);
      const reordered = reorderKeys(random, value);
      assert.equal(canonicalJson(reordered), canonicalJson(value), `seed ${SEED} case ${i}`);
      assert.equal(hashRequest(reordered), hashRequest(value), `seed ${SEED} case ${i}`);
    }
  });

  it("property: the canonical form round-trips to an equal value", () => {
    const random = createRandom(SEED + 1);
    for (let i = 0; i < CASES; i++) {
      const value = randomJson(random);
      assert.deepEqual(JSON.parse(canonicalJson(value)), value, `seed ${SEED + 1} case ${i}`);
    }
  });

  it("property: changing any one leaf changes the hash", () => {
    const random = createRandom(SEED + 2);
    let compared = 0;
    for (let i = 0; i < CASES; i++) {
      const value = randomJson(random);
      const changed = mutateLeaf(random, value);
      if (changed === null) continue;
      compared += 1;
      assert.notEqual(hashRequest(changed.value), hashRequest(value), `seed ${SEED + 2} case ${i}`);
    }
    assert.ok(compared > CASES / 2, "enough mutated cases were generated");
  });

  it("hashes to lowercase SHA-256 hex", () => {
    assert.match(hashRequest({ amount: 100 }), /^[0-9a-f]{64}$/);
  });
});

describe("validateIdempotencyKey", () => {
  it("accepts 1 to 255 visible ASCII characters", () => {
    for (const key of ["a", "req-2026-09-27_01", "!~", "x".repeat(255)]) {
      assert.deepEqual(validateIdempotencyKey(key), { ok: true, key });
    }
  });

  it("rejects empty, oversized, whitespace, non-ASCII, and non-string keys", () => {
    for (const key of ["", "x".repeat(256), "has space", "tab\t", "ключ", undefined, null, 42, ["a"]]) {
      const result = validateIdempotencyKey(key);
      assert.equal(result.ok, false);
      assert.equal(typeof result.error, "string");
    }
  });
});
