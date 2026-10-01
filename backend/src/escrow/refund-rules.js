const { toMinorBigInt } = require("../money/amount");

const AUTHORIZED_SOURCES = new Set([
  "projects_cancellation_resolution",
  "dispute_award",
  "verified_funding_exception",
  "administrator",
]);

function nonnegativeMinor(value) {
  const amount = toMinorBigInt(value);
  if (amount < 0n) {
    throw new TypeError("amount must be nonnegative");
  }
  return amount;
}

function positiveMinor(value) {
  const amount = toMinorBigInt(value);
  if (amount <= 0n) {
    throw new TypeError("amount must be positive");
  }
  return amount;
}

// Refundable protected funds for one allocation or for the escrow.
// held is part of the formula. The refund service passes 0 because no hold
// store exists yet.
function refundableMinor(funded, released, refunded, held) {
  const available = nonnegativeMinor(funded)
    - nonnegativeMinor(released)
    - nonnegativeMinor(refunded)
    - nonnegativeMinor(held);
  return available > 0n ? available : 0n;
}

function exceedsCapturedFunding(captured, alreadyRefunded, amount) {
  return nonnegativeMinor(alreadyRefunded) + positiveMinor(amount) > nonnegativeMinor(captured);
}

module.exports = {
  AUTHORIZED_SOURCES,
  refundableMinor,
  exceedsCapturedFunding,
};
