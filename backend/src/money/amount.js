// Integer minor units are authoritative. Display and parsing use the explicit
// currency exponent: amount_minor / 10^exponent. No floating-point arithmetic.

function assertExponent(exponent) {
  if (typeof exponent !== "number" || !Number.isInteger(exponent) || exponent < 0) {
    throw new TypeError("currency exponent must be a nonnegative integer");
  }
}

function toMinorBigInt(amountMinor) {
  if (typeof amountMinor === "bigint") {
    return amountMinor;
  }
  if (typeof amountMinor === "number") {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new TypeError("amount is not a safe integer");
    }
    return BigInt(amountMinor);
  }
  if (typeof amountMinor === "string" && /^-?\d+$/.test(amountMinor)) {
    return BigInt(amountMinor);
  }
  throw new TypeError("amount must be an integer minor-unit value");
}

function groupDigits(text) {
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatAmount(amountMinor, exponent) {
  assertExponent(exponent);
  const minor = toMinorBigInt(amountMinor);
  const negative = minor < 0n;
  const value = negative ? -minor : minor;
  const scale = 10n ** BigInt(exponent);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = exponent === 0 ? "" : `.${fraction.toString().padStart(exponent, "0")}`;
  return `${negative ? "-" : ""}${groupDigits(whole.toString())}${fractionText}`;
}

function parseMajorToMinor(input, exponent) {
  assertExponent(exponent);
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim().replace(/,/g, "");
  const pattern = exponent === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(\\.\\d{1,${exponent}})?$`);
  if (!pattern.test(trimmed)) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionalPart = ""] = unsigned.split(".");
  const scale = 10n ** BigInt(exponent);
  const fraction = fractionalPart.padEnd(exponent, "0");
  const minor = BigInt(wholePart) * scale + (fraction === "" ? 0n : BigInt(fraction));
  return negative ? -minor : minor;
}

module.exports = {
  formatAmount,
  parseMajorToMinor,
  toMinorBigInt,
};
