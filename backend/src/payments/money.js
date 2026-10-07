const POSTGRES_INT_MAX = 2147483647n;

function minorToMajorDecimal(amountMinor, exponent) {
  if (typeof amountMinor !== "bigint" || amountMinor <= 0n) {
    throw new Error("amount must be a positive integer minor value");
  }
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 6) {
    throw new Error("currency exponent is not supported");
  }
  const scale = 10n ** BigInt(exponent);
  const whole = amountMinor / scale;
  const fraction = amountMinor % scale;
  if (exponent === 0) {
    return whole.toString();
  }
  return `${whole.toString()}.${fraction.toString().padStart(exponent, "0")}`;
}

function decimalTokenToMinor(token, exponent) {
  if (typeof token !== "string" || !/^\d+(\.\d+)?$/.test(token)) {
    return null;
  }
  if (!Number.isInteger(exponent) || exponent < 0) {
    return null;
  }
  const [whole, fraction = ""] = token.split(".");
  if (fraction.length > exponent) {
    return null;
  }
  const padded = fraction.padEnd(exponent, "0");
  const minor = BigInt(whole) * (10n ** BigInt(exponent)) + BigInt(padded || "0");
  if (minor > POSTGRES_INT_MAX) {
    return null;
  }
  return minor;
}

function rawJsonNumber(rawText, key) {
  const source = Buffer.isBuffer(rawText) ? rawText.toString("utf8") : String(rawText);
  const pattern = new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`);
  const match = source.match(pattern);
  return match ? match[1] : null;
}

module.exports = {
  POSTGRES_INT_MAX,
  minorToMajorDecimal,
  decimalTokenToMinor,
  rawJsonNumber,
};
