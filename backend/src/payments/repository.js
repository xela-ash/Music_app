const crypto = require("crypto");

function makePaymentExternalId() {
  return `pay_${crypto.randomBytes(10).toString("hex")}`;
}

function makeReceiptExternalId() {
  return `pwr_${crypto.randomBytes(10).toString("hex")}`;
}

function lockEscrowForProject(db, projectId) {
  return db.query(
    `SELECT id, external_id, project_id, status, buyer_user_id, seller_user_id, currency,
            currency_exponent, expected_amount, agreed_term_version, version
     FROM escrows
     WHERE project_id = $1 AND status <> 'cancelled'
     FOR UPDATE`,
    [projectId]
  );
}

function lockPaymentByKey(db, escrowId, idempotencyKey) {
  return db.query(
    `SELECT id, external_id, status, amount, currency, currency_exponent,
            provider, provider_payment_id, continuation, expires_at, idempotency_key,
            provider_event_at
     FROM payments
     WHERE escrow_id = $1 AND type = 'escrow_fund' AND idempotency_key = $2
     FOR UPDATE`,
    [escrowId, idempotencyKey]
  );
}

function lockOpenFundingPayment(db, escrowId) {
  return db.query(
    `SELECT id, external_id, status, expires_at, idempotency_key
     FROM payments
     WHERE escrow_id = $1
       AND type = 'escrow_fund'
       AND status NOT IN ('failed', 'cancelled')
     FOR UPDATE`,
    [escrowId]
  );
}

function insertFundingPayment(db, values) {
  return db.query(
    `INSERT INTO payments (
       external_id, project_id, escrow_id, payer_user_id, amount, currency,
       currency_exponent, provider, status, type, idempotency_key, continuation, expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'created', 'escrow_fund', $9, '{}'::jsonb, $10)
     RETURNING id, external_id, status, amount, currency, currency_exponent, provider,
               provider_payment_id, continuation, expires_at, idempotency_key`,
    values
  );
}

function storeProviderReference(db, paymentId, providerReference, continuation, status) {
  return db.query(
    `UPDATE payments
     SET provider_payment_id = $2,
         continuation = $3::jsonb,
         status = $4,
         updated_at = now()
     WHERE id = $1 AND status = 'created'
     RETURNING id, external_id, status, amount, currency, currency_exponent, provider,
               provider_payment_id, continuation, expires_at, idempotency_key`,
    [paymentId, providerReference, JSON.stringify(continuation), status]
  );
}

function cancelPayment(db, paymentId) {
  return db.query(
    `UPDATE payments
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND status IN ('created', 'requires_action', 'processing')
     RETURNING id, status`,
    [paymentId]
  );
}

function lockPaymentByProviderReference(db, provider, providerReference) {
  return db.query(
    `SELECT id, external_id, project_id, escrow_id, payer_user_id, amount, currency,
            currency_exponent, provider, provider_payment_id, status, expires_at,
            provider_event_at, idempotency_key
     FROM payments
     WHERE provider = $1 AND provider_payment_id = $2
     FOR UPDATE`,
    [provider, providerReference]
  );
}

function markPayment(db, paymentId, status, occurredAt) {
  return db.query(
    `UPDATE payments
     SET status = $2,
         provider_event_at = $3,
         updated_at = now()
     WHERE id = $1
     RETURNING id, external_id, status, amount, currency, escrow_id, project_id`,
    [paymentId, status, occurredAt]
  );
}

function insertReceipt(db, values) {
  return db.query(
    `INSERT INTO payment_webhook_receipts (
       external_id, provider, outcome, provider_event_id, payment_id
     )
     VALUES ($1, $2, $3, $4, $5)`,
    values
  );
}

function fundingAllocations(db, escrowId) {
  return db.query(
    `SELECT allocation.id AS allocation_id, allocation.allocated_amount,
            milestone.id AS milestone_id, milestone.external_id AS milestone_external_id,
            milestone.amount, milestone.currency, milestone.currency_exponent,
            milestone.current_term_version, milestone.version, milestone.state
     FROM escrow_allocations allocation
     JOIN project_milestones milestone ON milestone.id = allocation.milestone_id
     WHERE allocation.escrow_id = $1
     ORDER BY milestone.milestone_no ASC`,
    [escrowId]
  );
}

module.exports = {
  makePaymentExternalId,
  makeReceiptExternalId,
  lockEscrowForProject,
  lockPaymentByKey,
  lockOpenFundingPayment,
  insertFundingPayment,
  storeProviderReference,
  cancelPayment,
  lockPaymentByProviderReference,
  markPayment,
  insertReceipt,
  fundingAllocations,
};
