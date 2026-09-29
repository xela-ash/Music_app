const { SOURCE_DOMAINS, topicRecord, UNCLASSIFIED_TOPICS } = require("./topics");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY_EXTERNAL_ID_PATTERN = /^ndl_[0-9a-f]{20}$/;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10000;

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

function parseNotificationListQuery(query) {
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

function parseVerifiedEvent(input) {
  const source = input && typeof input === "object" ? input : {};
  if (typeof source.recipientUserId !== "string" || !UUID_PATTERN.test(source.recipientUserId)) {
    return { ok: false, error: "Recipient is invalid" };
  }
  if (typeof source.topic !== "string" || topicRecord(source.topic) == null) {
    if (UNCLASSIFIED_TOPICS.includes(source.topic)) {
      return { ok: false, error: "Topic classification is not defined" };
    }
    return { ok: false, error: "Topic is not classified" };
  }
  if (typeof source.sourceDomain !== "string" || !SOURCE_DOMAINS.includes(source.sourceDomain)) {
    return { ok: false, error: "Source domain is invalid" };
  }
  if (
    typeof source.sourceEventId !== "string" ||
    source.sourceEventId.length < 1 ||
    source.sourceEventId.length > 200
  ) {
    return { ok: false, error: "Source event id is invalid" };
  }
  return {
    ok: true,
    value: {
      recipientUserId: source.recipientUserId,
      topic: source.topic,
      sourceDomain: source.sourceDomain,
      sourceEventId: source.sourceEventId,
    },
  };
}

function deliveryExternalIdIsValid(value) {
  return typeof value === "string" && DELIVERY_EXTERNAL_ID_PATTERN.test(value);
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_OFFSET,
  parseNotificationListQuery,
  parseVerifiedEvent,
  deliveryExternalIdIsValid,
};
