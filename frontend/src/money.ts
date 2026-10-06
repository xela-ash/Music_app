// Integer minor units with an explicit exponent. 125050 and exponent 2
// display as 1,250.50. The exponent is supplied by the backend; this module
// does not infer it from a currency code.

export function formatAmount(amountMinor: number, exponent: number): string {
  if (!Number.isInteger(exponent) || exponent < 0) {
    throw new TypeError("currency exponent must be a nonnegative integer");
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError("amount is not a safe integer");
  }
  const negative = amountMinor < 0;
  const value = BigInt(negative ? -amountMinor : amountMinor);
  const scale = 10n ** BigInt(exponent);
  const whole = value / scale;
  const fraction = value % scale;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractionText = exponent === 0 ? "" : `.${fraction.toString().padStart(exponent, "0")}`;
  return `${negative ? "-" : ""}${wholeText}${fractionText}`;
}

export function formatMoney(amountMinor: number, currency: string, exponent: number): string {
  return `${formatAmount(amountMinor, exponent)} ${currency}`;
}

export function parseMajorToMinor(input: string, exponent: number): number | null {
  if (!Number.isInteger(exponent) || exponent < 0) {
    return null;
  }
  const trimmed = input.trim().replace(/,/g, "");
  const pattern = exponent === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${exponent}})?$`);
  if (!pattern.test(trimmed)) {
    return null;
  }
  const [wholePart, fractionalPart = ""] = trimmed.split(".");
  const fraction = fractionalPart.padEnd(exponent, "0");
  const minor = BigInt(wholePart) * (10n ** BigInt(exponent)) + BigInt(fraction === "" ? "0" : fraction);
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(minor);
}
