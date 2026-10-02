const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROVIDER_KEY = "local-mock";
const BUCKET = "local-staging";
// Local inode guard only. It is not a product file-count or byte quota.
const LOCAL_ADAPTER_MAX_PARTS = 10000;

function storageRoot() {
  const configured = process.env.ASSET_LOCAL_STORAGE_ROOT;
  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }
  return path.join(require("os").tmpdir(), "musicapp-assets");
}

function assertKey(key) {
  if (typeof key !== "string" || !/^[a-f0-9]{32}$/.test(key)) {
    throw new TypeError("storage key must be 32 hex characters");
  }
}

function objectDir(key) {
  assertKey(key);
  return path.join(storageRoot(), "objects", key);
}

function manifestPath(key) {
  return path.join(objectDir(key), "manifest.json");
}

function readManifest(key) {
  const raw = fs.readFileSync(manifestPath(key), "utf8");
  return JSON.parse(raw);
}

function writeManifest(key, manifest) {
  fs.writeFileSync(manifestPath(key), JSON.stringify(manifest));
}

function reserveObject() {
  const key = crypto.randomBytes(16).toString("hex");
  const generation = crypto.randomBytes(8).toString("hex");
  fs.mkdirSync(objectDir(key), { recursive: true });
  writeManifest(key, { generation, parts: {}, claims: {}, final: null });
  return {
    provider: PROVIDER_KEY,
    bucket: BUCKET,
    key,
    generation,
  };
}

function partPath(key, partNumber) {
  return path.join(objectDir(key), `part-${String(partNumber).padStart(5, "0")}`);
}

function reservedPartBytes(key, exceptPartNumber) {
  const manifest = readManifest(key);
  const claims = manifest.claims || {};
  let total = 0n;
  const parts = new Set([
    ...Object.keys(manifest.parts),
    ...Object.keys(claims),
  ]);
  for (const part of parts) {
    if (Number(part) === exceptPartNumber) {
      continue;
    }
    if (manifest.parts[part]) {
      total += BigInt(manifest.parts[part].size);
    } else {
      total += BigInt(claims[part]);
    }
  }
  return total;
}

function claimPartBudget(key, partNumber, budget) {
  const manifest = readManifest(key);
  manifest.claims = manifest.claims || {};
  manifest.claims[String(partNumber)] = budget.toString();
  writeManifest(key, manifest);
}

function releaseClaim(key, partNumber) {
  const manifest = readManifest(key);
  if (!manifest.claims || manifest.claims[String(partNumber)] === undefined) {
    return;
  }
  delete manifest.claims[String(partNumber)];
  writeManifest(key, manifest);
}

function writePart(key, partNumber, source, maxPartBytes) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > LOCAL_ADAPTER_MAX_PARTS) {
    return Promise.resolve({
      ok: false,
      code: "part_number",
      error: "Part number is outside the local adapter range",
    });
  }
  const limit = BigInt(maxPartBytes);
  const destination = partPath(key, partNumber);
  const partial = `${destination}.partial`;
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const file = fs.createWriteStream(partial);
    let total = 0n;
    let overflow = false;
    let settled = false;
    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    }
    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      file.destroy();
      fs.rm(partial, { force: true }, () => reject(error));
    }
    source.on("data", (chunk) => {
      if (overflow) {
        return;
      }
      const size = BigInt(chunk.length);
      if (total + size > limit) {
        overflow = true;
        return;
      }
      total += size;
      hash.update(chunk);
      if (!file.write(chunk)) {
        source.pause();
        file.once("drain", () => source.resume());
      }
    });
    source.on("end", () => {
      if (overflow) {
        file.removeAllListeners("error");
        file.destroy();
        fs.rm(partial, { force: true }, () => {
          releaseClaim(key, partNumber);
          finish({ ok: false, code: "purpose_byte_limit", error: "File exceeds the purpose byte limit" });
        });
        return;
      }
      file.end(() => {
        fs.renameSync(partial, destination);
        const manifest = readManifest(key);
        manifest.parts[String(partNumber)] = {
          size: total.toString(),
          checksum: hash.digest("hex"),
        };
        if (manifest.claims) {
          delete manifest.claims[String(partNumber)];
        }
        manifest.final = null;
        writeManifest(key, manifest);
        finish({ ok: true, size: total, checksum: manifest.parts[String(partNumber)].checksum });
      });
    });
    source.on("error", fail);
    file.on("error", fail);
  });
}

function assemblyReady(key) {
  let manifest;
  try {
    manifest = readManifest(key);
  } catch {
    return false;
  }
  const numbers = Object.keys(manifest.parts).map((value) => Number(value)).sort((a, b) => a - b);
  if (numbers.length === 0 || numbers[0] !== 1) {
    return false;
  }
  for (let index = 0; index < numbers.length; index += 1) {
    if (numbers[index] !== index + 1) {
      return false;
    }
  }
  return true;
}

function completeMultipart(key) {
  const manifest = readManifest(key);
  const numbers = Object.keys(manifest.parts).map((value) => Number(value)).sort((a, b) => a - b);
  if (numbers.length === 0 || numbers[0] !== 1) {
    return { ok: false, code: "upload_incomplete", error: "Upload is incomplete" };
  }
  for (let index = 0; index < numbers.length; index += 1) {
    if (numbers[index] !== index + 1) {
      return { ok: false, code: "upload_incomplete", error: "Upload is incomplete" };
    }
  }
  const finalPath = path.join(objectDir(key), "final");
  fs.rmSync(finalPath, { force: true });
  const hash = crypto.createHash("sha256");
  let total = 0n;
  for (const partNumber of numbers) {
    const bytes = fs.readFileSync(partPath(key, partNumber));
    hash.update(bytes);
    fs.appendFileSync(finalPath, bytes);
    total += BigInt(bytes.length);
  }
  manifest.final = { size: total.toString(), checksum: hash.digest("hex") };
  writeManifest(key, manifest);
  return {
    ok: true,
    size: total,
    checksum: manifest.final.checksum,
    generation: manifest.generation,
    provider: PROVIDER_KEY,
    bucket: BUCKET,
    key,
  };
}

function inspect(key) {
  const manifest = readManifest(key);
  if (!manifest.final) {
    return null;
  }
  return {
    provider: PROVIDER_KEY,
    bucket: BUCKET,
    key,
    generation: manifest.generation,
    size: BigInt(manifest.final.size),
    checksum: manifest.final.checksum,
  };
}

function readPrefix(key, length) {
  const finalPath = path.join(objectDir(key), "final");
  const stat = fs.statSync(finalPath);
  const take = Math.min(length, stat.size);
  const fd = fs.openSync(finalPath, "r");
  try {
    const buffer = Buffer.alloc(take);
    fs.readSync(fd, buffer, 0, take, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function abortObject(key) {
  fs.rmSync(objectDir(key), { recursive: true, force: true });
}

module.exports = {
  PROVIDER_KEY,
  BUCKET,
  LOCAL_ADAPTER_MAX_PARTS,
  storageRoot,
  reserveObject,
  reservedPartBytes,
  claimPartBudget,
  assemblyReady,
  writePart,
  completeMultipart,
  inspect,
  readPrefix,
  abortObject,
};
