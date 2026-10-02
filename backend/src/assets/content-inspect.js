const { exceedsPixelLimit, pixelCount } = require("./limits");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (~c) >>> 0;
}

function looksLikeDeniedDocument(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return true;
  }
  if (buffer.length >= 8
    && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return true;
  }
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0);
    if (magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcafebabe
      || magic === 0xcefaedfe || magic === 0xcffaedfe) {
      return true;
    }
  }
  return false;
}

function looksLikeZip(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

function looksLikeActiveContent(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return true;
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return true;
  }
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    return true;
  }
  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<html") || head.startsWith("<!doctype html") || head.startsWith("<?xml");
}

function looksLikeHeif(buffer) {
  if (buffer.length < 12) {
    return false;
  }
  if (buffer.toString("ascii", 4, 8) !== "ftyp") {
    return false;
  }
  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  return brand === "heic" || brand === "heif" || brand === "mif1" || brand === "msf1" || brand.startsWith("hei");
}

function parsePng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  const length = buffer.readUInt32BE(8);
  const type = buffer.toString("ascii", 12, 16);
  if (type !== "IHDR" || length !== 13 || buffer.length < 29) {
    return { mime: "image/png", malformed: true };
  }
  const chunk = buffer.subarray(12, 29);
  const expected = buffer.readUInt32BE(29);
  if (crc32(chunk) !== expected) {
    return { mime: "image/png", malformed: true };
  }
  return {
    mime: "image/png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return { mime: "image/jpeg", malformed: true };
    }
    while (buffer[offset] === 0xff && offset < buffer.length) {
      offset += 1;
    }
    if (offset >= buffer.length) {
      break;
    }
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > buffer.length) {
      return { mime: "image/jpeg", malformed: true };
    }
    const size = buffer.readUInt16BE(offset);
    if (size < 2 || offset + size > buffer.length) {
      return { mime: "image/jpeg", malformed: true };
    }
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (size < 7) {
        return { mime: "image/jpeg", malformed: true };
      }
      return {
        mime: "image/jpeg",
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += size;
  }
  return { mime: "image/jpeg", malformed: true };
}

function assessImage(buffer) {
  const png = parsePng(buffer);
  const jpeg = png ? null : parseJpeg(buffer);
  const parsed = png || jpeg;
  if (!parsed) {
    if (looksLikeHeif(buffer)) {
      return { ok: false, code: "unverified_image_dimensions", error: "Image dimensions could not be verified" };
    }
    return null;
  }
  if (parsed.malformed || !parsed.width || !parsed.height) {
    return { ok: false, code: "malformed_image", error: "Image could not be read" };
  }
  if (exceedsPixelLimit(parsed.width, parsed.height)) {
    return { ok: false, code: "pixel_limit", error: "Image exceeds the pixel limit" };
  }
  return {
    ok: true,
    mime: parsed.mime,
    width: parsed.width,
    height: parsed.height,
    pixels: pixelCount(parsed.width, parsed.height),
  };
}

function assessObjectPrefix(buffer, { allowArchive }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, code: "malformed_object", error: "Upload is empty" };
  }
  if (looksLikeActiveContent(buffer) || looksLikeDeniedDocument(buffer)) {
    return { ok: false, code: "active_content", error: "This file type is not allowed" };
  }
  const image = assessImage(buffer);
  if (image && !image.ok) {
    return image;
  }
  if (image && image.ok) {
    return { ok: true, mime: image.mime, width: image.width, height: image.height, pixels: image.pixels };
  }
  if (looksLikeZip(buffer)) {
    if (!allowArchive) {
      return { ok: false, code: "archive_not_allowed", error: "Archive uploads are not allowed for this purpose" };
    }
    return { ok: true, mime: "application/octet-stream", opaqueArchive: true };
  }
  return { ok: true, mime: "application/octet-stream" };
}

module.exports = {
  crc32,
  assessImage,
  assessObjectPrefix,
  PNG_SIGNATURE,
};
