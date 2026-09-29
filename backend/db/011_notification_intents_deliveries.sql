BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Notification Intent and in-app Delivery Attempt (MVP-041).
-- Notifications §§6, 10, and 14. Preferences stay in User Settings.
-- This migration does not copy any business fact into these tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_mandatory_class') THEN
    CREATE TYPE notification_mandatory_class AS ENUM ('MANDATORY', 'CONFIGURABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_delivery_status') THEN
    CREATE TYPE notification_delivery_status AS ENUM (
      'PENDING',
      'SENT',
      'DELIVERED',
      'FAILED',
      'SUPPRESSED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  recipient_user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  mandatory_class notification_mandatory_class NOT NULL,
  source_domain TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  template_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notification_intents_external_id_unique UNIQUE (external_id),
  CONSTRAINT notification_intents_external_id_format
    CHECK (external_id ~ '^ntf_[0-9a-f]{20}$'),
  CONSTRAINT notification_intents_recipient_fk
    FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT notification_intents_dedupe_key_unique UNIQUE (dedupe_key),
  CONSTRAINT notification_intents_dedupe_key_format
    CHECK (dedupe_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notification_intents_source_event_unique
    UNIQUE (recipient_user_id, topic, source_event_id),
  CONSTRAINT notification_intents_topic_known
    CHECK (topic IN (
      'Security-critical account event',
      'Project invitation/status',
      'Project terms changed / locked / accepted',
      'Milestone deadline/status',
      'Milestone Review Overdue, platform intervention, non-response authorization',
      'Deliverable submitted / revision requested / resubmitted',
      'Escrow/payment transactional (funding required/confirmed, release, payout status, refund)',
      'Dispute opened / response required / resolved',
      'New message',
      'Verification decision/action required',
      'Marketplace recommendation',
      'Product update/marketing',
      'Moderation/safety action'
    )),
  CONSTRAINT notification_intents_source_domain_known
    CHECK (source_domain IN (
      'Authentication',
      'Projects',
      'Milestones',
      'Deliverables',
      'Escrow',
      'Payments',
      'Disputes',
      'Messaging',
      'Ratings',
      'Identity Verification',
      'Marketplace',
      'Platform',
      'Moderation'
    )),
  CONSTRAINT notification_intents_source_event_present
    CHECK (char_length(source_event_id) BETWEEN 1 AND 200),
  CONSTRAINT notification_intents_template_reference_present
    CHECK (char_length(template_reference) BETWEEN 1 AND 300)
);

CREATE INDEX IF NOT EXISTS notification_intents_recipient_created_idx
  ON notification_intents (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  intent_id UUID NOT NULL,
  channel notification_channel NOT NULL,
  status notification_delivery_status NOT NULL,
  provider_reference TEXT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ NULL,
  next_retry_at TIMESTAMPTZ NULL,
  read_at TIMESTAMPTZ NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notification_deliveries_external_id_unique UNIQUE (external_id),
  CONSTRAINT notification_deliveries_external_id_format
    CHECK (external_id ~ '^ndl_[0-9a-f]{20}$'),
  CONSTRAINT notification_deliveries_intent_fk
    FOREIGN KEY (intent_id) REFERENCES notification_intents (id) ON DELETE RESTRICT,
  CONSTRAINT notification_deliveries_intent_channel_unique
    UNIQUE (intent_id, channel),
  CONSTRAINT notification_deliveries_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT notification_deliveries_idempotency_key_present
    CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  CONSTRAINT notification_deliveries_attempt_count_non_negative
    CHECK (attempt_count >= 0),
  CONSTRAINT notification_deliveries_read_at_in_app
    CHECK (read_at IS NULL OR channel = 'IN_APP'),
  CONSTRAINT notification_deliveries_provider_reference_present
    CHECK (provider_reference IS NULL OR char_length(provider_reference) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_intent_idx
  ON notification_deliveries (intent_id);

CREATE TABLE IF NOT EXISTS notification_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  recipient_user_id UUID NOT NULL,
  topic TEXT NULL,
  channel notification_channel NULL,
  intent_external_id TEXT NOT NULL,
  delivery_external_id TEXT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  change_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT notification_audit_events_external_id_unique UNIQUE (external_id),
  CONSTRAINT notification_audit_events_external_id_format
    CHECK (external_id ~ '^nau_[0-9a-f]{20}$'),
  CONSTRAINT notification_audit_events_recipient_fk
    FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT notification_audit_events_event_type
    CHECK (event_type IN ('AUD-NOTIFICATIONS-001', 'AUD-NOTIFICATIONS-002')),
  CONSTRAINT notification_audit_events_actor_type
    CHECK (actor_type IN ('user', 'system')),
  CONSTRAINT notification_audit_events_actor_id_present
    CHECK (char_length(actor_id) BETWEEN 1 AND 255),
  CONSTRAINT notification_audit_events_change_hash
    CHECK (change_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notification_audit_events_intent_external_id
    CHECK (intent_external_id ~ '^ntf_[0-9a-f]{20}$'),
  CONSTRAINT notification_audit_events_delivery_external_id
    CHECK (delivery_external_id IS NULL OR delivery_external_id ~ '^ndl_[0-9a-f]{20}$')
);

CREATE INDEX IF NOT EXISTS notification_audit_events_recipient_time_idx
  ON notification_audit_events (recipient_user_id, created_at);

CREATE OR REPLACE FUNCTION reject_notification_intent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'notification_intents are append-only'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS notification_intents_no_update ON notification_intents;
CREATE TRIGGER notification_intents_no_update
  BEFORE UPDATE ON notification_intents
  FOR EACH ROW
  EXECUTE FUNCTION reject_notification_intent_mutation();

DROP TRIGGER IF EXISTS notification_intents_no_delete ON notification_intents;
CREATE TRIGGER notification_intents_no_delete
  BEFORE DELETE ON notification_intents
  FOR EACH ROW
  EXECUTE FUNCTION reject_notification_intent_mutation();

CREATE OR REPLACE FUNCTION notification_deliveries_guard_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  class text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT mandatory_class::text INTO class
    FROM notification_intents
    WHERE id = OLD.intent_id;
    IF class = 'MANDATORY' AND OLD.channel = 'IN_APP' THEN
      RAISE EXCEPTION 'mandatory in-app record cannot be removed'
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.external_id IS DISTINCT FROM OLD.external_id
       OR NEW.intent_id IS DISTINCT FROM OLD.intent_id
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'notification delivery identity is immutable'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
      RAISE EXCEPTION 'read_at is set once'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.provider_reference IS NOT NULL
       AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    THEN
      RAISE EXCEPTION 'provider_reference is set once'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.attempt_count < OLD.attempt_count THEN
      RAISE EXCEPTION 'attempt_count cannot decrease'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'PENDING' AND NEW.status IN ('SENT', 'SUPPRESSED'))
        OR (OLD.status = 'SENT' AND NEW.status IN ('DELIVERED', 'FAILED'))
        OR (OLD.status = 'FAILED' AND NEW.status = 'PENDING')
      ) THEN
        RAISE EXCEPTION 'notification delivery transition is not allowed'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NEW.read_at IS NOT NULL AND NEW.channel <> 'IN_APP' THEN
    RAISE EXCEPTION 'read_at is in-app only'
      USING ERRCODE = '23514';
  END IF;

  SELECT mandatory_class::text INTO class
  FROM notification_intents
  WHERE id = NEW.intent_id;

  IF class = 'MANDATORY' AND NEW.channel = 'IN_APP' AND NEW.status = 'SUPPRESSED' THEN
    RAISE EXCEPTION 'mandatory in-app record cannot be suppressed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_deliveries_guard_insert ON notification_deliveries;
CREATE TRIGGER notification_deliveries_guard_insert
  BEFORE INSERT ON notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION notification_deliveries_guard_write();

DROP TRIGGER IF EXISTS notification_deliveries_guard_update ON notification_deliveries;
CREATE TRIGGER notification_deliveries_guard_update
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION notification_deliveries_guard_write();

DROP TRIGGER IF EXISTS notification_deliveries_guard_delete ON notification_deliveries;
CREATE TRIGGER notification_deliveries_guard_delete
  BEFORE DELETE ON notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION notification_deliveries_guard_write();

CREATE OR REPLACE FUNCTION reject_notification_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'notification_audit_events are append-only'
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS notification_audit_events_no_update ON notification_audit_events;
CREATE TRIGGER notification_audit_events_no_update
  BEFORE UPDATE ON notification_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_notification_audit_mutation();

DROP TRIGGER IF EXISTS notification_audit_events_no_delete ON notification_audit_events;
CREATE TRIGGER notification_audit_events_no_delete
  BEFORE DELETE ON notification_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_notification_audit_mutation();

COMMIT;
