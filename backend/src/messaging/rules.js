const PROJECT_EXTERNAL_ID_PATTERN = /^prj_[0-9a-f]{20}$/;
const MESSAGE_EXTERNAL_ID_PATTERN = /^msg_[0-9a-f]{20}$/;
const MAX_MESSAGE_BODY_CHARACTERS = 500;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10000;

function characterLength(value) {
  return [...value].length;
}

function readSingle(query, key) {
  if (!Object.prototype.hasOwnProperty.call(query, key)) {
    return { ok: true, value: undefined };
  }
  const raw = query[key];
  if (Array.isArray(raw)) {
    return { ok: false, error: `${key} must be a single value` };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${key} must be a string` };
  }
  return { ok: true, value: raw };
}

function parseBoundedInteger(query, key, { defaultValue, min, max }) {
  const read = readSingle(query, key);
  if (!read.ok) return read;
  if (read.value === undefined || read.value.trim() === "") {
    return { ok: true, value: defaultValue };
  }
  if (!/^(0|[1-9][0-9]*)$/.test(read.value.trim())) {
    return { ok: false, error: `${key} must be an integer` };
  }
  const value = Number(read.value.trim());
  if (value < min || value > max) {
    return { ok: false, error: `${key} must be between ${min} and ${max}` };
  }
  return { ok: true, value };
}

function parseProjectExternalId(value) {
  if (typeof value !== "string" || !PROJECT_EXTERNAL_ID_PATTERN.test(value)) {
    return { ok: false, error: "Project id is invalid" };
  }
  return { ok: true, value };
}

function parseMessageExternalId(value) {
  if (typeof value !== "string" || !MESSAGE_EXTERNAL_ID_PATTERN.test(value)) {
    return { ok: false, error: "Message id is invalid" };
  }
  return { ok: true, value };
}

function parseMessageListQuery(query) {
  const source = query && typeof query === "object" ? query : {};
  const limit = parseBoundedInteger(source, "limit", {
    defaultValue: DEFAULT_PAGE_SIZE,
    min: 1,
    max: MAX_PAGE_SIZE,
  });
  if (!limit.ok) return limit;
  const offset = parseBoundedInteger(source, "offset", {
    defaultValue: 0,
    min: 0,
    max: MAX_OFFSET,
  });
  if (!offset.ok) return offset;
  return { ok: true, limit: limit.value, offset: offset.value };
}

function parseSendBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Message body must be a JSON object" };
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "attachments") ||
    Object.prototype.hasOwnProperty.call(body, "asset_version_ids") ||
    Object.prototype.hasOwnProperty.call(body, "asset_versions")
  ) {
    return { ok: false, error: "Message attachments are not accepted" };
  }
  if (typeof body.body !== "string") {
    return { ok: false, error: "Message body must be text" };
  }
  if (characterLength(body.body) > MAX_MESSAGE_BODY_CHARACTERS) {
    return { ok: false, error: "Message body must be at most 500 characters" };
  }
  return { ok: true, value: { body: body.body } };
}

module.exports = {
  MAX_MESSAGE_BODY_CHARACTERS,
  characterLength,
  parseProjectExternalId,
  parseMessageExternalId,
  parseMessageListQuery,
  parseSendBody,
};
