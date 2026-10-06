// Local in-app channel adapter (Notifications §7.2).
// There is no external provider. The provider reference is the delivery's
// own external id, which is the record the recipient reads.

function sendInApp({ recipientUserId, deliveryExternalId, idempotencyKey }) {
  if (
    typeof recipientUserId !== "string" ||
    recipientUserId.length === 0 ||
    typeof deliveryExternalId !== "string" ||
    typeof idempotencyKey !== "string" ||
    idempotencyKey.length === 0
  ) {
    return { ok: false, failure: "in-app destination is incomplete" };
  }
  return { ok: true, providerReference: deliveryExternalId };
}

module.exports = {
  sendInApp,
};
