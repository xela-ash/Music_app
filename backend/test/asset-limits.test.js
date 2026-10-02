const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MB,
  GB,
  IMAGE_MAX_PIXELS,
  PROJECT_QUOTA_BYTES,
  AUDIO_DURATION_CEILING_MS,
  VIDEO_DURATION_CEILING_MS,
  PURPOSES,
  exceedsByteLimit,
  exceedsPixelLimit,
  pixelCount,
  durationExceedsCeiling,
  quotaWouldExceed,
} = require("../src/assets/limits");
const { assessImage, assessObjectPrefix, crc32 } = require("../src/assets/content-inspect");

function pngHeader(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 2;
  const typeAndData = Buffer.concat([Buffer.from("IHDR"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  return Buffer.concat([signature, length, typeAndData, crc]);
}

describe("asset upload limits", () => {
  it("defines MB and GB as decimal integers", () => {
    assert.equal(MB, 1000000n);
    assert.equal(GB, 1000000000n);
    assert.equal(PURPOSES.profile_avatar.maxBytes, 20n * MB);
    assert.equal(PURPOSES.profile_cover.maxBytes, 20000000n);
    assert.equal(PURPOSES.audio_preview_reference.maxBytes, 500000000n);
    assert.equal(PURPOSES.final_audio_deliverable.maxBytes, 2000000000n);
    assert.equal(PURPOSES.stem_or_individual_track.maxBytes, 2000000000n);
    assert.equal(PURPOSES.video_reference_media.maxBytes, 5000000000n);
    assert.equal(PURPOSES.daw_project_archive.maxBytes, 10000000000n);
    assert.equal(PURPOSES.other_project_file.maxBytes, 10000000000n);
    assert.equal(PROJECT_QUOTA_BYTES, 50000000000n);
    assert.equal(IMAGE_MAX_PIXELS, 25000000n);
  });

  it("accepts a size equal to the class maximum and rejects one byte over", () => {
    for (const policy of Object.values(PURPOSES)) {
      assert.equal(exceedsByteLimit(policy.maxBytes, policy.maxBytes), false);
      assert.equal(exceedsByteLimit(policy.maxBytes + 1n, policy.maxBytes), true);
    }
    assert.equal(exceedsByteLimit(20000000, PURPOSES.profile_avatar.maxBytes), false);
    assert.equal(exceedsByteLimit(20000001, PURPOSES.profile_avatar.maxBytes), true);
    assert.equal(exceedsByteLimit("10000000000", PURPOSES.daw_project_archive.maxBytes), false);
    assert.equal(exceedsByteLimit("10000000001", PURPOSES.daw_project_archive.maxBytes), true);
  });

  it("treats 25000000 pixels as the image boundary", () => {
    assert.equal(pixelCount(5000, 5000), 25000000n);
    assert.equal(exceedsPixelLimit(5000, 5000), false);
    assert.equal(exceedsPixelLimit(5000, 5001), true);
    assert.equal(exceedsPixelLimit(1, 25000000), false);
    assert.equal(exceedsPixelLimit(1, 25000001), true);
    const atLimit = assessImage(pngHeader(5000, 5000));
    const overLimit = assessImage(pngHeader(5000, 5001));
    assert.equal(atLimit.ok, true);
    assert.equal(atLimit.pixels, 25000000n);
    assert.equal(overLimit.ok, false);
    assert.equal(overLimit.code, "pixel_limit");
  });

  it("has no audio or video duration ceiling", () => {
    assert.equal(AUDIO_DURATION_CEILING_MS, null);
    assert.equal(VIDEO_DURATION_CEILING_MS, null);
    assert.equal(durationExceedsCeiling(0), false);
    assert.equal(durationExceedsCeiling(1), false);
    assert.equal(durationExceedsCeiling("999999999999"), false);
    assert.equal(durationExceedsCeiling(999999999999n, VIDEO_DURATION_CEILING_MS), false);
  });

  it("accepts a project total equal to 50 GB and rejects one byte over", () => {
    assert.equal(quotaWouldExceed(0n, PROJECT_QUOTA_BYTES), false);
    assert.equal(quotaWouldExceed(PROJECT_QUOTA_BYTES, 0n), false);
    assert.equal(quotaWouldExceed(PROJECT_QUOTA_BYTES, 1n), true);
    assert.equal(quotaWouldExceed(40000000000n, 10000000000n), false);
    assert.equal(quotaWouldExceed(40000000000n, 10000000001n), true);
  });

  it("rejects active content and non-DAW archives without imposing a duration", () => {
    const executable = assessObjectPrefix(Buffer.from("MZ-not-audio"), { allowArchive: false });
    assert.equal(executable.code, "active_content");
    const archive = assessObjectPrefix(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), { allowArchive: false });
    assert.equal(archive.code, "archive_not_allowed");
    const daw = assessObjectPrefix(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]), { allowArchive: true });
    assert.equal(daw.ok, true);
    const pdf = assessObjectPrefix(Buffer.from("%PDF-1.7"), { allowArchive: false });
    assert.equal(pdf.ok, false);
    assert.equal(pdf.code, "active_content");
    const office = assessObjectPrefix(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), { allowArchive: false });
    assert.equal(office.ok, false);
    const macho = assessObjectPrefix(Buffer.from([0xfe, 0xed, 0xfa, 0xce]), { allowArchive: false });
    assert.equal(macho.ok, false);
    assert.equal(durationExceedsCeiling(86_400_000), false);
  });
});
