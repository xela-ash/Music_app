// Decimal SI units, Assets §7.3 (Decision 2026-10-01).
// 1 MB = 10^6 bytes. 1 GB = 10^9 bytes. Not IEC mebibytes or gibibytes.
const MB = 1000000n;
const GB = 1000000000n;

const POLICY_VERSION = "2026-10-01";
const IMAGE_MAX_PIXELS = 25000000n;
const PROJECT_QUOTA_BYTES = 50n * GB;

// Null is the approved MVP decision: there is no duration ceiling.
const AUDIO_DURATION_CEILING_MS = null;
const VIDEO_DURATION_CEILING_MS = null;

const PURPOSES = Object.freeze({
  profile_avatar: Object.freeze({
    limitClass: "profile_image",
    maxBytes: 20n * MB,
    binding: "profile",
    method: "server_stream",
    label: "Profile Avatar",
  }),
  profile_cover: Object.freeze({
    limitClass: "profile_image",
    maxBytes: 20n * MB,
    binding: "profile",
    method: "server_stream",
    label: "Profile cover",
  }),
  audio_preview_reference: Object.freeze({
    limitClass: "audio_preview_reference",
    maxBytes: 500n * MB,
    binding: "project",
    method: "direct_multipart",
    label: "Audio preview/reference",
  }),
  final_audio_deliverable: Object.freeze({
    limitClass: "final_audio_deliverable",
    maxBytes: 2n * GB,
    binding: "project",
    method: "direct_multipart",
    label: "Final audio deliverable",
  }),
  stem_or_individual_track: Object.freeze({
    limitClass: "stem_or_individual_track",
    maxBytes: 2n * GB,
    binding: "project",
    method: "direct_multipart",
    label: "Stem or individual audio track",
  }),
  video_reference_media: Object.freeze({
    limitClass: "video_reference_media",
    maxBytes: 5n * GB,
    binding: "project",
    method: "direct_multipart",
    label: "Video/reference media",
  }),
  daw_project_archive: Object.freeze({
    limitClass: "daw_project_archive",
    maxBytes: 10n * GB,
    binding: "project",
    method: "direct_multipart",
    label: "DAW project/session/archive",
  }),
  other_project_file: Object.freeze({
    limitClass: "other_project_file",
    maxBytes: 10n * GB,
    binding: "project",
    method: "direct_multipart",
    label: "Other project file",
  }),
});

function purposePolicy(purpose) {
  if (typeof purpose !== "string") {
    return null;
  }
  return PURPOSES[purpose] ?? null;
}

function toByteBigInt(value) {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      return null;
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function exceedsByteLimit(size, maximum) {
  const observed = toByteBigInt(size);
  const limit = toByteBigInt(maximum);
  if (observed === null || limit === null) {
    return true;
  }
  return observed > limit;
}

function exceedsPixelLimit(width, height) {
  const w = toByteBigInt(width);
  const h = toByteBigInt(height);
  if (w === null || h === null || w < 1n || h < 1n) {
    return true;
  }
  return w * h > IMAGE_MAX_PIXELS;
}

function pixelCount(width, height) {
  return toByteBigInt(width) * toByteBigInt(height);
}

// A null ceiling means every nonnegative duration is inside policy.
function durationExceedsCeiling(durationMs, ceiling = AUDIO_DURATION_CEILING_MS) {
  if (ceiling === null || ceiling === undefined) {
    return false;
  }
  const duration = toByteBigInt(durationMs);
  const limit = toByteBigInt(ceiling);
  if (duration === null || limit === null) {
    return true;
  }
  return duration > limit;
}

function quotaWouldExceed(reservedBytes, incomingBytes, quota = PROJECT_QUOTA_BYTES) {
  const reserved = toByteBigInt(reservedBytes);
  const incoming = toByteBigInt(incomingBytes);
  const limit = toByteBigInt(quota);
  if (reserved === null || incoming === null || limit === null) {
    return true;
  }
  if (reserved < 0n || incoming < 0n) {
    return true;
  }
  return reserved + incoming > limit;
}

module.exports = {
  MB,
  GB,
  POLICY_VERSION,
  IMAGE_MAX_PIXELS,
  PROJECT_QUOTA_BYTES,
  AUDIO_DURATION_CEILING_MS,
  VIDEO_DURATION_CEILING_MS,
  PURPOSES,
  purposePolicy,
  toByteBigInt,
  exceedsByteLimit,
  exceedsPixelLimit,
  pixelCount,
  durationExceedsCeiling,
  quotaWouldExceed,
};
