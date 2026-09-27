BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared idempotency, outbox, and inbox infrastructure (MVP-003).
-- Projects §24/§26, Milestones §24, Escrow §22, and Payments §14 require
-- these mechanisms and leave the physical model to engineering (EDR-004).
-- No domain table references these tables, and they reference none.

-- =========================
-- 1) IDEMPOTENCY KEYS
-- =========================

-- One row per (actor, operation, resource, key). The request hash is the
-- SHA-256 of the canonical JSON request, so the same key with a different
-- request is detectable. A row is written and completed inside the caller's
-- own transaction, together with the state change it guards.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  resource_ref TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  response_status INTEGER NULL,
  response_body JSONB NULL,
  -- Retention for idempotency and financial records is an open Legal
  -- decision (Escrow Question EQ11). Null means "retain"; nothing purges.
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,

  CONSTRAINT idempotency_keys_scope_unique
    UNIQUE (actor_type, actor_id, operation, resource_ref, idempotency_key),
  CONSTRAINT idempotency_keys_actor_type_allowed
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT idempotency_keys_actor_id_present
    CHECK (length(actor_id) BETWEEN 1 AND 255),
  CONSTRAINT idempotency_keys_operation_present
    CHECK (length(operation) BETWEEN 1 AND 255),
  CONSTRAINT idempotency_keys_resource_ref_bounded
    CHECK (length(resource_ref) <= 255),
  CONSTRAINT idempotency_keys_key_format
    CHECK (idempotency_key ~ '^[!-~]{1,255}$'),
  CONSTRAINT idempotency_keys_request_hash_sha256
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT idempotency_keys_status_allowed
    CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT idempotency_keys_completed_has_response
    CHECK (
      (status = 'in_progress' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
      OR (status = 'completed' AND response_status BETWEEN 100 AND 599 AND completed_at IS NOT NULL)
    ),
  CONSTRAINT idempotency_keys_completed_after_created
    CHECK (completed_at IS NULL OR completed_at >= created_at),
  CONSTRAINT idempotency_keys_expires_after_created
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- The scope, key, and request hash never change. The only permitted update
-- is the single in_progress -> completed step that records the response.
-- Rows are never deleted: a deleted key would let a replay repeat its effect.
CREATE OR REPLACE FUNCTION protect_idempotency_keys() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'idempotency_keys rows cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.actor_type IS DISTINCT FROM OLD.actor_type
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.operation IS DISTINCT FROM OLD.operation
    OR NEW.resource_ref IS DISTINCT FROM OLD.resource_ref
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'idempotency_keys identity columns are immutable';
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'completed idempotency_keys rows are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS idempotency_keys_protection ON idempotency_keys;

CREATE TRIGGER idempotency_keys_protection
  BEFORE UPDATE OR DELETE ON idempotency_keys
  FOR EACH ROW
  EXECUTE FUNCTION protect_idempotency_keys();

-- =========================
-- 2) OUTBOX MESSAGES
-- =========================

-- Written in the same transaction as the state change that produced the
-- event, and published only after commit. event_id is the immutable
-- identifier consumers deduplicate on. sequence gives a stable publication
-- order; it is not a commit order, so consumers still tolerate reordering.
CREATE TABLE IF NOT EXISTS outbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version BIGINT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT NULL,
  causation_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  published_at TIMESTAMPTZ NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT outbox_messages_event_id_unique UNIQUE (event_id),
  CONSTRAINT outbox_messages_sequence_unique UNIQUE (sequence),
  CONSTRAINT outbox_messages_event_type_present
    CHECK (length(event_type) BETWEEN 1 AND 255),
  CONSTRAINT outbox_messages_event_version_positive
    CHECK (event_version > 0),
  CONSTRAINT outbox_messages_aggregate_type_present
    CHECK (length(aggregate_type) BETWEEN 1 AND 255),
  CONSTRAINT outbox_messages_aggregate_id_present
    CHECK (length(aggregate_id) BETWEEN 1 AND 255),
  CONSTRAINT outbox_messages_aggregate_version_positive
    CHECK (aggregate_version IS NULL OR aggregate_version > 0),
  CONSTRAINT outbox_messages_payload_is_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT outbox_messages_correlation_bounded
    CHECK (correlation_id IS NULL OR length(correlation_id) BETWEEN 1 AND 255),
  CONSTRAINT outbox_messages_causation_bounded
    CHECK (causation_id IS NULL OR length(causation_id) BETWEEN 1 AND 255),
  CONSTRAINT outbox_messages_status_allowed
    CHECK (status IN ('pending', 'published', 'dead_letter')),
  CONSTRAINT outbox_messages_attempts_nonnegative
    CHECK (attempts >= 0),
  CONSTRAINT outbox_messages_published_consistent
    CHECK ((status = 'published') = (published_at IS NOT NULL)),
  CONSTRAINT outbox_messages_last_error_bounded
    CHECK (last_error IS NULL OR length(last_error) <= 500)
);

CREATE INDEX IF NOT EXISTS outbox_messages_pending_idx
  ON outbox_messages (available_at, sequence)
  WHERE status = 'pending';

-- The event itself is immutable once written. Only delivery bookkeeping
-- (status, attempts, schedule, last error, publication time) may change, a
-- published message is final, and rows are never deleted.
CREATE OR REPLACE FUNCTION protect_outbox_messages() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbox_messages rows cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.sequence IS DISTINCT FROM OLD.sequence
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.event_version IS DISTINCT FROM OLD.event_version
    OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
    OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
    OR NEW.aggregate_version IS DISTINCT FROM OLD.aggregate_version
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
    OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'outbox_messages event columns are immutable';
  END IF;

  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published outbox_messages rows are immutable';
  END IF;

  IF NEW.attempts < OLD.attempts THEN
    RAISE EXCEPTION 'outbox_messages attempts cannot decrease';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS outbox_messages_protection ON outbox_messages;

CREATE TRIGGER outbox_messages_protection
  BEFORE UPDATE OR DELETE ON outbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION protect_outbox_messages();

-- =========================
-- 3) INBOX EVENTS
-- =========================

-- One row per (consumer, source, event_id). A duplicate delivery conflicts
-- on this key and is acknowledged without reprocessing. For provider
-- webhooks, source is the provider and event_id the provider event ID, which
-- expresses Payments' (provider, provider_event_id) uniqueness
-- (DATA-ESCROW-008, BR-ESCROW-041). For outbox events, event_id is the
-- outbox event_id.
CREATE TABLE IF NOT EXISTS inbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer TEXT NOT NULL,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  result TEXT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,

  CONSTRAINT inbox_events_consumer_source_event_unique
    UNIQUE (consumer, source, event_id),
  CONSTRAINT inbox_events_consumer_present
    CHECK (length(consumer) BETWEEN 1 AND 255),
  CONSTRAINT inbox_events_source_present
    CHECK (length(source) BETWEEN 1 AND 255),
  CONSTRAINT inbox_events_event_id_present
    CHECK (length(event_id) BETWEEN 1 AND 255),
  CONSTRAINT inbox_events_event_type_present
    CHECK (length(event_type) BETWEEN 1 AND 255),
  CONSTRAINT inbox_events_result_allowed
    CHECK (result IS NULL OR result IN ('applied', 'ignored', 'quarantined')),
  CONSTRAINT inbox_events_result_with_processed_at
    CHECK ((result IS NULL) = (processed_at IS NULL)),
  CONSTRAINT inbox_events_processed_after_received
    CHECK (processed_at IS NULL OR processed_at >= received_at)
);

-- Identity is immutable, the processing result is recorded exactly once, and
-- rows are never deleted: a deleted row would let a redelivery reprocess.
CREATE OR REPLACE FUNCTION protect_inbox_events() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inbox_events rows cannot be deleted';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.consumer IS DISTINCT FROM OLD.consumer
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.received_at IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION 'inbox_events identity columns are immutable';
  END IF;

  IF OLD.processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'processed inbox_events rows are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inbox_events_protection ON inbox_events;

CREATE TRIGGER inbox_events_protection
  BEFORE UPDATE OR DELETE ON inbox_events
  FOR EACH ROW
  EXECUTE FUNCTION protect_inbox_events();

COMMIT;
