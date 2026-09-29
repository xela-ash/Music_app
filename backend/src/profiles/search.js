// Server-side Discover filters for GET /profiles (MVP-013).
// Query text is never interpolated into SQL. Callers bind the returned params.

const FILTER_NAMES = ["name", "handle", "genre", "city", "country"];
const MAX_FILTER_LENGTH = 200;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10000;

function escapeLike(value) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

function parseProfileListQuery(query) {
  const source = query && typeof query === "object" ? query : {};
  const filters = {};

  for (const name of FILTER_NAMES) {
    const read = readSingle(source, name);
    if (!read.ok) return read;
    if (read.value === undefined) continue;
    const trimmed = read.value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_FILTER_LENGTH) {
      return {
        ok: false,
        error: `${name} must be at most ${MAX_FILTER_LENGTH} characters`,
      };
    }
    filters[name] = trimmed;
  }

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

  return {
    ok: true,
    filters,
    limit: limit.value,
    offset: offset.value,
  };
}

function likePredicate(columnSql, paramIndex) {
  return `${columnSql} ILIKE ('%' || $${paramIndex} || '%') ESCAPE '\\'`;
}

function buildProfileSearchWhere(filters) {
  const clauses = [];
  const params = [];

  function bind(value) {
    params.push(escapeLike(value));
    return params.length;
  }

  if (filters.name) {
    const index = bind(filters.name);
    clauses.push(
      `(${likePredicate("display_name", index)} OR ${likePredicate("artist_name", index)})`
    );
  }
  if (filters.handle) {
    clauses.push(likePredicate("handle", bind(filters.handle)));
  }
  if (filters.genre) {
    const index = bind(filters.genre);
    clauses.push(
      `EXISTS (SELECT 1 FROM unnest(genres) AS genre_value WHERE ${likePredicate("genre_value", index)})`
    );
  }
  if (filters.city) {
    clauses.push(likePredicate("city", bind(filters.city)));
  }
  if (filters.country) {
    clauses.push(likePredicate("country", bind(filters.country)));
  }

  return {
    whereSql: clauses.length === 0 ? "" : `WHERE (${clauses.join(" OR ")})`,
    params,
  };
}

module.exports = {
  FILTER_NAMES,
  MAX_FILTER_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_OFFSET,
  escapeLike,
  parseProfileListQuery,
  buildProfileSearchWhere,
};
