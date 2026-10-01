const crypto = require("crypto");

function makeLedgerExternalId() {
  return `led_${crypto.randomBytes(10).toString("hex")}`;
}

function lockEscrow(db, escrowId) {
  return db.query(
    `SELECT id, project_id, status, currency, currency_exponent,
            funded_amount, released_amount, refunded_amount, version
     FROM escrows
     WHERE id = $1
     FOR UPDATE`,
    [escrowId]
  );
}

function lockProject(db, projectId) {
  return db.query(
    `SELECT id FROM projects WHERE id = $1 FOR UPDATE`,
    [projectId]
  );
}

function lockAllocations(db, escrowId) {
  return db.query(
    `SELECT allocation.id
     FROM escrow_allocations allocation
     JOIN project_milestones milestone ON milestone.id = allocation.milestone_id
     WHERE allocation.escrow_id = $1
     ORDER BY milestone.milestone_no
     FOR UPDATE OF allocation`,
    [escrowId]
  );
}

function nextSequence(db, escrowId) {
  return db.query(
    `SELECT COALESCE(MAX(sequence), 0) AS sequence
     FROM escrow_ledger
     WHERE escrow_id = $1`,
    [escrowId]
  );
}

function insertEntry(db, values) {
  return db.query(
    `INSERT INTO escrow_ledger (
       external_id, journal_id, sequence, escrow_id, project_id,
       milestone_id, allocation_id, payment_id, entry_type, amount, currency,
       currency_exponent, source_account, destination_account, beneficiary_user_id,
       provider_reference, idempotency_key, correlation_id, actor_type, actor_id,
       source, reverses_entry_id, reason_code, metadata
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19, $20,
       $21, $22, $23, $24::jsonb
     )
     RETURNING external_id, journal_id, sequence, entry_type, amount, currency,
               currency_exponent, source_account, destination_account`,
    values
  );
}

function ledgerTotals(db, escrowId) {
  return db.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE entry_type = 'funded'), 0)
         - COALESCE(SUM(amount) FILTER (WHERE entry_type = 'funding_reversed'), 0) AS funded_amount,
       COALESCE(SUM(amount) FILTER (
         WHERE entry_type IN ('released_to_seller', 'platform_fee', 'escrow_fee')
           AND source_account = 'ESCROW_ALLOCATION'
       ), 0) AS released_amount,
       COALESCE(SUM(amount) FILTER (
         WHERE entry_type = 'refunded_to_buyer'
           AND source_account = 'ESCROW_ALLOCATION'
       ), 0) AS refunded_amount
     FROM escrow_ledger
     WHERE escrow_id = $1`,
    [escrowId]
  );
}

function writeProjections(db, escrowId, funded, released, refunded) {
  return db.query(
    `UPDATE escrows
     SET funded_amount = $2,
         released_amount = $3,
         refunded_amount = $4,
         version = version + 1
     WHERE id = $1
     RETURNING funded_amount, released_amount, refunded_amount, version, status`,
    [escrowId, funded, released, refunded]
  );
}

module.exports = {
  makeLedgerExternalId,
  lockEscrow,
  lockProject,
  lockAllocations,
  nextSequence,
  insertEntry,
  ledgerTotals,
  writeProjections,
};
